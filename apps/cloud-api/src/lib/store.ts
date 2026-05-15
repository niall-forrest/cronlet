import {
  type AuditEventListInput,
  type AuditEventRecord,
  type CallbackSigningSecretRecord,
  type CircuitBreakerListInput,
  type CircuitBreakerRecord,
  type BulkRunReplayInput,
  type BulkRunReplayResult,
  type BulkTaskCancelInput,
  type BulkTaskCancelResult,
  getTaskLimitForTier,
  PLAN_LIMITS,
  type ApiKeyCreateInput,
  type ApiKeyRecord,
  type ApiKeyRotateInput,
  type ApiKeyWithToken,
  formatYearMonth,
  type AlertCreateInput,
  type AlertRecord,
  type CreatedBy,
  type DispatchEventRecord,
  type DispatchInstruction,
  type DispatchJobStatus,
  type InternalDispatchCompleteInput,
  type InternalDispatchStartInput,
  type HandlerType,
  type InternalRunStatusInput,
  type OutboundPolicyPatchInput,
  type OutboundPolicyRecord,
  type PlanTier,
  type ReconciliationCompareInput,
  type ReconciliationCompareResult,
  type RunEventRecord,
  type RunRecord,
  type RunListInput,
  type RunReplayResult,
  type RunStatus,
  type RunAttemptRecord,
  type RetryPolicy,
  type ScheduleType,
  type SecretCreateInput,
  type SecretPatchInput,
  type SecretRecord,
  type TaskCreateInput,
  type TaskDispatchInput,
  type TaskEventRecord,
  type TaskListInput,
  type TaskPatchInput,
  type TaskRecord,
  type TaskCancelResult,
  type TimelineEntryRecord,
  type UsageSnapshot,
  parseDuration,
} from "@cronlet/shared";
import { ERROR_CODES } from "@cronlet/shared";
import { nanoid } from "nanoid";
import { randomBytes } from "node:crypto";
import { AppError } from "./errors.js";
import { computeNextRun, nowIso } from "./clock.js";
import type { CloudStore, EntitlementUpdateInput, OrganizationUpsertInput } from "./store-contract.js";
import { createApiKeyToken, hashApiKey, keyPreviewFromHash } from "./api-keys.js";
import { currentSecretKeyVersion, decryptSecretValue, encryptSecretValue } from "./secret-crypto.js";

interface OrgEntitlement {
  tier: PlanTier;
  delinquent: boolean;
  graceEndsAt: string | null;
}

interface InternalTaskRecord extends TaskRecord {
  kind: "scheduled" | "dispatch";
}

interface InternalSecretRecord extends SecretRecord {
  encryptedValue: string;
}

interface InternalDispatchJobRecord {
  id: string;
  orgId: string;
  taskId: string;
  runId: string;
  status: DispatchJobStatus;
  availableAt: string;
  leaseOwner: string | null;
  leasedUntil: string | null;
  attemptCount: number;
  maxAttempts: number;
  retryWindowEndsAt: string | null;
  lastError: string | null;
  destinationKey: string | null;
  createdAt: string;
  updatedAt: string;
}

const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_CONCURRENT_DISPATCHES_PER_ORG = 5;
const MAX_CONCURRENT_DISPATCHES_PER_DESTINATION = 2;

interface InternalOrganizationRecord {
  orgId: string;
  name?: string;
  slug?: string;
  callbackSigningSecret: string;
  callbackSigningSecretRotatedAt: string;
  outboundAllowedHosts: string[];
  createdAt: string;
  updatedAt: string;
}

function formatPlanLabel(tier: PlanTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function generateCallbackSigningSecret(): string {
  return `crsig_${randomBytes(32).toString("hex")}`;
}

function normalizeAllowedHosts(hosts: readonly string[]): string[] {
  return Array.from(new Set(
    hosts
      .map((host) => host.trim().toLowerCase().replace(/\.$/, ""))
      .filter((host) => host.length > 0),
  )).sort();
}

function isExpiredAt(expiresAt: string | null, nowMs = Date.now()): boolean {
  if (!expiresAt) {
    return false;
  }

  return new Date(expiresAt).getTime() <= nowMs;
}

function isMaxRunsReached(runCount: number, maxRuns: number | null): boolean {
  return maxRuns !== null && runCount >= maxRuns;
}

function isTerminalRunStatus(status: RunStatus): boolean {
  return [
    "success",
    "failure",
    "timeout",
    "cancelled",
    "dead_lettered",
    "terminal_client_error",
    "retry_window_expired",
  ].includes(status);
}

function retryPolicyForTask(task: {
  retryAttempts: number;
  retryBackoff: "linear" | "exponential";
  retryDelay: string;
  retryPolicy?: RetryPolicy;
}): RetryPolicy {
  return task.retryPolicy ?? {
    maxAttempts: Math.max(task.retryAttempts, 1),
    backoff: task.retryBackoff,
    initialDelay: task.retryDelay,
    maxDelay: "15m",
    jitter: true,
    retryWindow: "24h",
    retryOnStatusCodes: [],
    terminalStatusCodes: [],
  };
}

function computeRetryDelayMs(policy: RetryPolicy, attemptNumber: number): number {
  const initial = parseDuration(policy.initialDelay);
  const max = parseDuration(policy.maxDelay);
  const base = policy.backoff === "fixed"
    ? initial
    : policy.backoff === "linear"
      ? initial * attemptNumber
      : initial * Math.pow(2, Math.max(0, attemptNumber - 1));
  const bounded = Math.min(base, max);
  return policy.jitter ? Math.max(1000, Math.round(bounded * 0.75)) : bounded;
}

function metadataMatches(
  value: Record<string, unknown> | null | undefined,
  filter: Record<string, unknown> | undefined
): boolean {
  if (!filter) {
    return true;
  }
  if (!value) {
    return false;
  }

  return Object.entries(filter).every(([key, expected]) => JSON.stringify(value[key]) === JSON.stringify(expected));
}

function isWithinOptionalRange(
  value: string | null,
  range: {
    after?: string;
    before?: string;
  }
): boolean {
  if (!range.after && !range.before) {
    return true;
  }
  if (!value) {
    return false;
  }

  const timestamp = new Date(value).getTime();
  if (range.after && timestamp < new Date(range.after).getTime()) {
    return false;
  }
  if (range.before && timestamp > new Date(range.before).getTime()) {
    return false;
  }
  return true;
}

export class InMemoryCloudStore implements CloudStore {
  private readonly organizations = new Map<string, InternalOrganizationRecord>();
  private readonly tasks = new Map<string, InternalTaskRecord>();
  private readonly runs = new Map<string, RunRecord>();
  private readonly runAttempts = new Map<string, RunAttemptRecord>();
  private readonly dispatchJobs = new Map<string, InternalDispatchJobRecord>();
  private readonly taskEvents = new Map<string, TaskEventRecord>();
  private readonly runEvents = new Map<string, RunEventRecord>();
  private readonly dispatchEvents = new Map<string, DispatchEventRecord>();
  private readonly circuitBreakers = new Map<string, CircuitBreakerRecord>();
  private readonly secrets = new Map<string, InternalSecretRecord>();
  private readonly alerts = new Map<string, AlertRecord>();
  private readonly apiKeys = new Map<string, ApiKeyRecord & { keyHash: string }>();
  private readonly auditEvents = new Map<string, AuditEventRecord>();
  private readonly usage = new Map<string, number>();
  private readonly entitlements = new Map<string, OrgEntitlement>();

  private usageKey(orgId: string, yearMonth: string): string {
    return `${orgId}:${yearMonth}`;
  }

  private orgDestinationKey(orgId: string, destinationKey: string): string {
    return `${orgId}:${destinationKey}`;
  }

  private circuitBreakerKey(orgId: string, destinationKey: string): string {
    return `${orgId}:${destinationKey}`;
  }

  private getCircuitBreaker(orgId: string, destinationKey: string | null): CircuitBreakerRecord | null {
    if (!destinationKey) {
      return null;
    }
    return this.circuitBreakers.get(this.circuitBreakerKey(orgId, destinationKey)) ?? null;
  }

  private upsertCircuitBreaker(record: CircuitBreakerRecord): void {
    this.circuitBreakers.set(this.circuitBreakerKey(record.orgId, record.destinationKey), record);
  }

  private closeCircuitBreaker(orgId: string, destinationKey: string | null): void {
    if (!destinationKey) {
      return;
    }
    const existing = this.getCircuitBreaker(orgId, destinationKey);
    if (!existing) {
      return;
    }
    this.upsertCircuitBreaker({
      ...existing,
      state: "closed",
      consecutiveFailures: 0,
      openedAt: null,
      cooldownUntil: null,
      probeInFlight: false,
      updatedAt: nowIso(),
    });
  }

  private markCircuitBreakerFailure(
    orgId: string,
    destinationKey: string | null,
    reason: string,
  ): CircuitBreakerRecord | null {
    if (!destinationKey) {
      return null;
    }

    const existing = this.getCircuitBreaker(orgId, destinationKey);
    const now = nowIso();
    const shouldOpenImmediately = existing?.state === "half_open";
    const consecutiveFailures = shouldOpenImmediately
      ? existing?.consecutiveFailures ?? CIRCUIT_BREAKER_FAILURE_THRESHOLD
      : (existing?.consecutiveFailures ?? 0) + 1;
    const shouldOpen = shouldOpenImmediately || consecutiveFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD;
    const next: CircuitBreakerRecord = {
      orgId,
      destinationKey,
      state: shouldOpen ? "open" : "closed",
      consecutiveFailures,
      openedAt: shouldOpen ? now : existing?.openedAt ?? null,
      cooldownUntil: shouldOpen ? new Date(Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS).toISOString() : null,
      lastFailureAt: now,
      lastFailureReason: reason,
      probeInFlight: false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.upsertCircuitBreaker(next);
    return next;
  }

  private maybeEnterHalfOpen(orgId: string, destinationKey: string | null): CircuitBreakerRecord | null {
    if (!destinationKey) {
      return null;
    }
    const existing = this.getCircuitBreaker(orgId, destinationKey);
    if (!existing || existing.state !== "open" || !existing.cooldownUntil) {
      return existing;
    }
    if (new Date(existing.cooldownUntil).getTime() > Date.now()) {
      return existing;
    }

    const next: CircuitBreakerRecord = {
      ...existing,
      state: "half_open",
      probeInFlight: false,
      updatedAt: nowIso(),
    };
    this.upsertCircuitBreaker(next);
    return next;
  }

  private canLeaseForDestination(orgId: string, destinationKey: string | null): boolean {
    if (!destinationKey) {
      return true;
    }
    const breaker = this.maybeEnterHalfOpen(orgId, destinationKey);
    if (!breaker || breaker.state === "closed") {
      return true;
    }
    if (breaker.state === "open") {
      return false;
    }
    return !breaker.probeInFlight;
  }

  private recordCircuitBreakerTransition(
    job: Pick<InternalDispatchJobRecord, "id" | "orgId" | "runId" | "taskId" | "status" | "destinationKey">,
    previousState: CircuitBreakerRecord["state"] | null,
    nextState: CircuitBreakerRecord["state"] | null,
    reason: string,
    metadata?: Record<string, unknown> | null,
  ): void {
    if (previousState === nextState || !nextState) {
      return;
    }

    const action = nextState === "open"
      ? "dispatch.circuit_opened"
      : nextState === "half_open"
        ? "dispatch.circuit_half_open"
        : "dispatch.circuit_closed";

    this.appendDispatchEvent({
      orgId: job.orgId,
      dispatchJobId: job.id,
      action,
      previousState: previousState ?? "closed",
      nextState,
      reason,
      metadata: {
        runId: job.runId,
        taskId: job.taskId,
        destinationKey: job.destinationKey,
        ...(metadata ?? {}),
      },
    });
  }

  private markProbeInFlight(orgId: string, destinationKey: string | null): void {
    if (!destinationKey) {
      return;
    }
    const breaker = this.getCircuitBreaker(orgId, destinationKey);
    if (!breaker || breaker.state !== "half_open") {
      return;
    }
    this.upsertCircuitBreaker({
      ...breaker,
      probeInFlight: true,
      updatedAt: nowIso(),
    });
  }

  private deferDestinationJobs(orgId: string, destinationKey: string, availableAt: string): void {
    for (const [id, job] of this.dispatchJobs.entries()) {
      if (job.orgId !== orgId || job.destinationKey !== destinationKey) {
        continue;
      }
      if (job.status !== "pending" && job.status !== "retry_wait") {
        continue;
      }
      if (new Date(job.availableAt).getTime() >= new Date(availableAt).getTime()) {
        continue;
      }
      this.dispatchJobs.set(id, {
        ...job,
        availableAt,
        updatedAt: nowIso(),
      });
    }
  }

  private activeDispatchCounts(): {
    orgCounts: Map<string, number>;
    destinationCounts: Map<string, number>;
  } {
    const orgCounts = new Map<string, number>();
    const destinationCounts = new Map<string, number>();

    for (const job of this.dispatchJobs.values()) {
      if (job.status !== "leased" && job.status !== "running") {
        continue;
      }
      orgCounts.set(job.orgId, (orgCounts.get(job.orgId) ?? 0) + 1);
      if (job.destinationKey) {
        const destinationKey = this.orgDestinationKey(job.orgId, job.destinationKey);
        destinationCounts.set(destinationKey, (destinationCounts.get(destinationKey) ?? 0) + 1);
      }
    }

    return { orgCounts, destinationCounts };
  }

  private appendTaskEvent(input: Omit<TaskEventRecord, "id" | "createdAt"> & { createdAt?: string }): void {
    const id = nanoid();
    this.taskEvents.set(id, {
      id,
      createdAt: input.createdAt ?? nowIso(),
      ...input,
    });
  }

  private appendRunEvent(input: Omit<RunEventRecord, "id" | "createdAt"> & { createdAt?: string }): void {
    const id = nanoid();
    this.runEvents.set(id, {
      id,
      createdAt: input.createdAt ?? nowIso(),
      ...input,
    });
  }

  private appendDispatchEvent(input: Omit<DispatchEventRecord, "id" | "createdAt"> & { createdAt?: string }): void {
    const id = nanoid();
    this.dispatchEvents.set(id, {
      id,
      createdAt: input.createdAt ?? nowIso(),
      ...input,
    });
  }

  private toTimelineEntryFromTaskEvent(event: TaskEventRecord): TimelineEntryRecord {
    return {
      id: event.id,
      kind: "task_event",
      action: event.action,
      createdAt: event.createdAt,
      targetType: "task",
      targetId: event.taskId,
      previousState: event.previousState,
      nextState: event.nextState,
      reason: event.reason,
      metadata: event.metadata,
    };
  }

  private toTimelineEntryFromRunEvent(event: RunEventRecord): TimelineEntryRecord {
    return {
      id: event.id,
      kind: "run_event",
      action: event.action,
      createdAt: event.createdAt,
      targetType: "run",
      targetId: event.runId,
      previousState: event.previousState,
      nextState: event.nextState,
      reason: event.reason,
      metadata: event.metadata,
    };
  }

  private toTimelineEntryFromDispatchEvent(event: DispatchEventRecord): TimelineEntryRecord {
    return {
      id: event.id,
      kind: "dispatch_event",
      action: event.action,
      createdAt: event.createdAt,
      targetType: "dispatch",
      targetId: event.dispatchJobId,
      previousState: event.previousState,
      nextState: event.nextState,
      reason: event.reason,
      metadata: event.metadata,
    };
  }

  private toTimelineEntryFromAuditEvent(event: AuditEventRecord): TimelineEntryRecord {
    return {
      id: event.id,
      kind: "audit_event",
      action: event.action,
      createdAt: event.createdAt,
      targetType: "audit",
      targetId: event.id,
      previousState: null,
      nextState: null,
      reason: null,
      actorType: event.actorType,
      actorId: event.actorId,
      metadata: {
        targetType: event.targetType,
        targetId: event.targetId,
        payloadHash: event.payloadHash,
        ...(event.metadata ?? {}),
      },
    };
  }


  private getEntitlement(orgId: string): OrgEntitlement {
    const existing = this.entitlements.get(orgId);
    if (existing) {
      return existing;
    }

    const created: OrgEntitlement = {
      tier: "free",
      delinquent: false,
      graceEndsAt: null,
    };
    this.entitlements.set(orgId, created);
    return created;
  }

  private isGracePeriodActive(entitlement: OrgEntitlement, nowMs = Date.now()): boolean {
    if (!entitlement.delinquent) {
      return true;
    }

    if (!entitlement.graceEndsAt) {
      return false;
    }

    return new Date(entitlement.graceEndsAt).getTime() > nowMs;
  }

  private assertWritable(orgId: string): void {
    const entitlement = this.getEntitlement(orgId);
    if (this.isGracePeriodActive(entitlement)) {
      return;
    }

    throw new AppError(402, ERROR_CODES.DELINQUENT_ACCOUNT, "Billing delinquent: schedules are paused");
  }

  private assertWithinRunLimit(orgId: string): void {
    const entitlement = this.getEntitlement(orgId);
    const month = formatYearMonth();
    const usageKey = this.usageKey(orgId, month);
    const attempts = this.usage.get(usageKey) ?? 0;
    const limit = PLAN_LIMITS[entitlement.tier].runAttemptsPerMonth;

    if (attempts >= limit) {
      throw new AppError(402, ERROR_CODES.PLAN_LIMIT_EXCEEDED, "Monthly run-attempt limit reached", {
        limit,
        attempts,
      });
    }
  }

  private incrementUsage(orgId: string): void {
    const month = formatYearMonth();
    const key = this.usageKey(orgId, month);
    const current = this.usage.get(key) ?? 0;
    this.usage.set(key, current + 1);
  }

  private ensureOrganization(orgId: string, input?: { name?: string; slug?: string }): InternalOrganizationRecord {
    const existing = this.organizations.get(orgId);
    if (existing) {
      const updated: InternalOrganizationRecord = {
        ...existing,
        name: input?.name ?? existing.name,
        slug: input?.slug ?? existing.slug,
        callbackSigningSecret: existing.callbackSigningSecret || generateCallbackSigningSecret(),
        callbackSigningSecretRotatedAt: existing.callbackSigningSecretRotatedAt,
        outboundAllowedHosts: existing.outboundAllowedHosts,
        updatedAt: nowIso(),
      };
      this.organizations.set(orgId, updated);
      return updated;
    }

    const now = nowIso();
    const created: InternalOrganizationRecord = {
      orgId,
      name: input?.name,
      slug: input?.slug,
      callbackSigningSecret: generateCallbackSigningSecret(),
      callbackSigningSecretRotatedAt: now,
      outboundAllowedHosts: [],
      createdAt: now,
      updatedAt: now,
    };
    this.organizations.set(orgId, created);
    return created;
  }

  private getCallbackSigningSecretValue(orgId: string): string {
    return this.ensureOrganization(orgId).callbackSigningSecret;
  }

  private getOutboundAllowedHosts(orgId: string): string[] {
    return [...this.ensureOrganization(orgId).outboundAllowedHosts];
  }

  private toPublicTask(task: InternalTaskRecord): TaskRecord {
    const { kind: _kind, ...publicTask } = task;
    return publicTask;
  }

  private pauseTask(task: InternalTaskRecord): InternalTaskRecord {
    if (!task.active && task.nextRunAt === null) {
      return task;
    }

    const updated: InternalTaskRecord = {
      ...task,
      active: false,
      nextRunAt: null,
      updatedAt: nowIso(),
    };
    this.tasks.set(task.id, updated);
    return updated;
  }

  private normalizeScheduledTask(task: InternalTaskRecord, nowMs = Date.now()): InternalTaskRecord {
    if (task.kind !== "scheduled") {
      return task;
    }

    if (isMaxRunsReached(task.runCount, task.maxRuns) || isExpiredAt(task.expiresAt, nowMs)) {
      return this.pauseTask(task);
    }

    return task;
  }

  private buildScheduledTask(
    orgId: string,
    input: TaskCreateInput,
    createdBy?: CreatedBy
  ): InternalTaskRecord {
    this.ensureOrganization(orgId);

    const now = nowIso();
    const scheduleConfig = input.schedule;
    const handlerConfig = input.handler;
    const maxRuns = input.maxRuns ?? null;
    const expiresAt = input.expiresAt ?? null;
    const shouldStartActive = input.active !== false
      && !isMaxRunsReached(0, maxRuns)
      && !isExpiredAt(expiresAt);

    return {
      id: nanoid(),
      orgId,
      kind: "scheduled",
      name: input.name,
      description: input.description ?? null,
      externalId: input.externalId ?? null,
      handlerType: handlerConfig.type as HandlerType,
      handlerConfig,
      scheduleType: scheduleConfig.type as ScheduleType,
      scheduleConfig,
      timezone: input.timezone ?? "UTC",
      nextRunAt: shouldStartActive
        ? computeNextRun(scheduleConfig, input.timezone ?? "UTC")
        : null,
      retryAttempts: input.retryAttempts ?? 1,
      retryBackoff: input.retryBackoff ?? "linear",
      retryDelay: input.retryDelay ?? "1s",
      retryPolicy: {
        maxAttempts: input.retryMaxAttempts ?? input.retryAttempts ?? 10,
        backoff: input.retryBackoff ?? "exponential",
        initialDelay: input.retryInitialDelay ?? "10s",
        maxDelay: input.retryMaxDelay ?? "15m",
        jitter: input.retryJitter ?? true,
        retryWindow: input.retryWindow ?? "24h",
        retryOnStatusCodes: input.retryOnStatusCodes ?? [],
        terminalStatusCodes: input.terminalStatusCodes ?? [],
      },
      timeout: input.timeout ?? "30s",
      active: shouldStartActive,
      source: input.source ?? "dashboard",
      createdBy: createdBy ?? null,
      callbackUrl: input.callbackUrl ?? null,
      metadata: input.metadata ?? null,
      maxRuns,
      expiresAt,
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  private assertTaskAccessible(task: InternalTaskRecord | undefined, orgId: string): InternalTaskRecord {
    if (!task || task.orgId !== orgId || task.kind !== "scheduled") {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Task not found");
    }

    return this.normalizeScheduledTask(task);
  }

  private assertTaskRunnable(task: InternalTaskRecord): InternalTaskRecord {
    const normalized = this.normalizeScheduledTask(task);
    if (normalized.kind !== "scheduled") {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Task not found");
    }

    if (isMaxRunsReached(normalized.runCount, normalized.maxRuns)) {
      throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, "Task has reached its max run limit");
    }

    if (isExpiredAt(normalized.expiresAt)) {
      throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, "Task has expired");
    }

    return normalized;
  }

  private createDispatchForRun(task: InternalTaskRecord, run: RunRecord): InternalDispatchJobRecord {
    const policy = retryPolicyForTask(task);
    const now = nowIso();
    const dispatchJob: InternalDispatchJobRecord = {
      id: nanoid(),
      orgId: task.orgId,
      taskId: task.id,
      runId: run.id,
      status: "pending",
      availableAt: now,
      leaseOwner: null,
      leasedUntil: null,
      attemptCount: 0,
      maxAttempts: policy.maxAttempts,
      retryWindowEndsAt: new Date(Date.now() + parseDuration(policy.retryWindow)).toISOString(),
      lastError: null,
      destinationKey: task.handlerConfig.type === "webhook" ? new URL(task.handlerConfig.url).host : task.handlerType,
      createdAt: now,
      updatedAt: now,
    };
    this.dispatchJobs.set(dispatchJob.id, dispatchJob);
    this.appendDispatchEvent({
      orgId: task.orgId,
      dispatchJobId: dispatchJob.id,
      action: "dispatch.queued",
      previousState: null,
      nextState: "pending",
      reason: run.trigger === "schedule" ? "schedule_due" : run.trigger,
      metadata: {
        runId: run.id,
        taskId: task.id,
        attemptNumber: 1,
      },
    });

    const attempt: RunAttemptRecord = {
      id: nanoid(),
      orgId: task.orgId,
      runId: run.id,
      taskId: task.id,
      dispatchJobId: dispatchJob.id,
      attemptNumber: 1,
      status: "pending",
      startedAt: null,
      completedAt: null,
      durationMs: null,
      httpStatus: null,
      errorClass: null,
      errorMessage: null,
      responseBodyPreview: null,
      responseBodyHash: null,
      output: null,
      logs: null,
      createdAt: now,
    };
    this.runAttempts.set(attempt.id, attempt);
    return dispatchJob;
  }

  private instructionForDispatch(
    task: InternalTaskRecord,
    run: RunRecord,
    dispatchJob: InternalDispatchJobRecord,
    attempt: RunAttemptRecord,
  ): DispatchInstruction {
    const timeoutMs = parseDuration(task.timeout);
    return {
      dispatchJobId: dispatchJob.id,
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      runId: run.id,
      orgId: task.orgId,
      taskId: task.id,
      taskName: task.name,
      taskExternalId: task.externalId,
      handlerType: task.handlerType,
      handlerConfig: task.handlerConfig,
      timeoutMs,
      retryAttempts: task.retryAttempts,
      retryBackoff: task.retryBackoff,
      retryDelay: task.retryDelay,
      retryPolicy: retryPolicyForTask(task),
      callbackUrl: task.callbackUrl,
      callbackSigningSecret: task.callbackUrl
        ? this.getCallbackSigningSecretValue(task.orgId)
        : null,
      outboundAllowedHosts: this.getOutboundAllowedHosts(task.orgId),
      metadata: task.metadata,
      maxRuns: task.maxRuns,
      expiresAt: task.expiresAt,
      runCount: task.runCount,
    };
  }

  // ============================================
  // TASKS
  // ============================================

  listTasks(orgId: string, input: TaskListInput = {}): TaskRecord[] {
    return Array.from(this.tasks.values())
      .filter((task) => task.orgId === orgId && task.kind === "scheduled")
      .map((task) => this.normalizeScheduledTask(task))
      .filter((task) => {
        if (input.status === "active" && !task.active) {
          return false;
        }
        if (input.status === "paused" && task.active) {
          return false;
        }
        if (input.scheduleType && task.scheduleType !== input.scheduleType) {
          return false;
        }
        if (input.externalId && task.externalId !== input.externalId) {
          return false;
        }
        if (!metadataMatches(task.metadata, input.metadata)) {
          return false;
        }
        if (!isWithinOptionalRange(task.nextRunAt, {
          after: input.nextRunAfter,
          before: input.nextRunBefore,
        })) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, input.limit ?? 100)
      .map((task) => this.toPublicTask(task));
  }

  countTasks(orgId: string): number {
    return Array.from(this.tasks.values()).filter((task) => task.orgId === orgId && task.kind === "scheduled").length;
  }

  getTask(orgId: string, taskId: string): TaskRecord {
    return this.toPublicTask(this.assertTaskAccessible(this.tasks.get(taskId), orgId));
  }

  getTaskTimeline(orgId: string, taskId: string, limit = 100): TimelineEntryRecord[] {
    this.assertTaskAccessible(this.tasks.get(taskId), orgId);
    const runIds = Array.from(this.runs.values())
      .filter((run) => run.orgId === orgId && run.taskId === taskId)
      .map((run) => run.id);
    const dispatchJobIds = Array.from(this.dispatchJobs.values())
      .filter((job) => job.orgId === orgId && job.taskId === taskId)
      .map((job) => job.id);

    return [
      ...this.listTaskEvents(orgId, taskId, limit).map((event) => this.toTimelineEntryFromTaskEvent(event)),
      ...Array.from(this.runEvents.values())
        .filter((event) => event.orgId === orgId && runIds.includes(event.runId))
        .map((event) => this.toTimelineEntryFromRunEvent(event)),
      ...Array.from(this.dispatchEvents.values())
        .filter((event) => event.orgId === orgId && dispatchJobIds.includes(event.dispatchJobId))
        .map((event) => this.toTimelineEntryFromDispatchEvent(event)),
      ...this.listAuditEvents(orgId, { targetType: "task", targetId: taskId, limit })
        .map((event) => this.toTimelineEntryFromAuditEvent(event)),
      ...Array.from(this.auditEvents.values())
        .filter((event) => event.orgId === orgId && event.targetType === "run" && runIds.includes(event.targetId))
        .map((event) => this.toTimelineEntryFromAuditEvent(event)),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  createTask(orgId: string, input: TaskCreateInput, createdBy?: CreatedBy): TaskRecord {
    this.assertWritable(orgId);
    this.assertWithinTaskLimit(orgId);

    const task = this.buildScheduledTask(orgId, input, createdBy);
    this.tasks.set(task.id, task);
    this.appendTaskEvent({
      orgId,
      taskId: task.id,
      action: "task.created",
      previousState: null,
      nextState: task.active ? "active" : "paused",
      reason: "api_create",
      metadata: {
        scheduleType: task.scheduleType,
        handlerType: task.handlerType,
      },
    });
    return this.toPublicTask(task);
  }

  private assertWithinTaskLimit(orgId: string): void {
    const entitlement = this.getEntitlement(orgId);
    const currentCount = this.countTasks(orgId);
    const limit = getTaskLimitForTier(entitlement.tier);

    if (currentCount >= limit) {
      throw new AppError(
        403,
        ERROR_CODES.TASK_LIMIT_EXCEEDED,
        `Task limit reached (${limit} tasks on ${formatPlanLabel(entitlement.tier)} plan).`,
        {
          currentCount,
          limit,
          tier: entitlement.tier,
        }
      );
    }
  }

  patchTask(orgId: string, taskId: string, input: TaskPatchInput): TaskRecord {
    this.assertWritable(orgId);

    const task = this.assertTaskAccessible(this.tasks.get(taskId), orgId);

    const scheduleConfig = input.schedule ?? task.scheduleConfig;
    const handlerConfig = input.handler ?? task.handlerConfig;
    const timezone = input.timezone ?? task.timezone;
    const maxRuns = input.maxRuns === undefined ? task.maxRuns : input.maxRuns;
    const expiresAt = input.expiresAt === undefined ? task.expiresAt : input.expiresAt;
    const requestedActive = input.active ?? task.active;
    const active = requestedActive
      && !isMaxRunsReached(task.runCount, maxRuns)
      && !isExpiredAt(expiresAt);

    // Recompute nextRunAt if schedule, timezone, or active status changed
    const needsNextRunUpdate =
      input.schedule !== undefined ||
      input.timezone !== undefined ||
      input.active !== undefined ||
      input.maxRuns !== undefined ||
      input.expiresAt !== undefined;

    const nextRunAt = needsNextRunUpdate
      ? (active ? computeNextRun(scheduleConfig, timezone) : null)
      : task.nextRunAt;

    const updated: InternalTaskRecord = {
      ...task,
      name: input.name ?? task.name,
      description: input.description === null ? null : (input.description ?? task.description),
      externalId: input.externalId === undefined ? task.externalId : input.externalId,
      handlerType: handlerConfig.type as HandlerType,
      handlerConfig,
      scheduleType: scheduleConfig.type as ScheduleType,
      scheduleConfig,
      timezone,
      nextRunAt,
      retryAttempts: input.retryAttempts ?? task.retryAttempts,
      retryBackoff: input.retryBackoff ?? task.retryBackoff,
      retryDelay: input.retryDelay ?? task.retryDelay,
      retryPolicy: {
        maxAttempts: input.retryMaxAttempts ?? task.retryPolicy.maxAttempts,
        backoff: input.retryBackoff ?? task.retryPolicy.backoff,
        initialDelay: input.retryInitialDelay ?? task.retryPolicy.initialDelay,
        maxDelay: input.retryMaxDelay ?? task.retryPolicy.maxDelay,
        jitter: input.retryJitter ?? task.retryPolicy.jitter,
        retryWindow: input.retryWindow ?? task.retryPolicy.retryWindow,
        retryOnStatusCodes: input.retryOnStatusCodes ?? task.retryPolicy.retryOnStatusCodes,
        terminalStatusCodes: input.terminalStatusCodes ?? task.retryPolicy.terminalStatusCodes,
      },
      timeout: input.timeout ?? task.timeout,
      callbackUrl: input.callbackUrl === undefined ? task.callbackUrl : input.callbackUrl,
      metadata: input.metadata === undefined ? task.metadata : input.metadata,
      maxRuns,
      expiresAt,
      active,
      updatedAt: nowIso(),
    };

    this.tasks.set(taskId, updated);
    this.appendTaskEvent({
      orgId,
      taskId,
      action: "task.updated",
      previousState: task.active ? "active" : "paused",
      nextState: updated.active ? "active" : "paused",
      reason: "api_update",
      metadata: {
        nextRunAt: updated.nextRunAt,
      },
    });
    return this.toPublicTask(updated);
  }

  deleteTask(orgId: string, taskId: string): void {
    const task = this.assertTaskAccessible(this.tasks.get(taskId), orgId);
    this.appendTaskEvent({
      orgId,
      taskId,
      action: "task.deleted",
      previousState: task.active ? "active" : "paused",
      nextState: "deleted",
      reason: "api_delete",
      metadata: null,
    });
    this.tasks.delete(taskId);
  }

  cancelTask(orgId: string, taskId: string): TaskCancelResult {
    const task = this.assertTaskAccessible(this.tasks.get(taskId), orgId);
    const runningAttemptIds = Array.from(this.runAttempts.values())
      .filter((attempt) => attempt.taskId === taskId && attempt.status === "running")
      .map((attempt) => attempt.id);
    let cancelledDispatchJobs = 0;

    for (const [id, job] of this.dispatchJobs.entries()) {
      if (job.taskId !== taskId || job.orgId !== orgId) {
        continue;
      }
      if (job.status === "pending" || job.status === "retry_wait" || job.status === "leased") {
        this.dispatchJobs.set(id, {
          ...job,
          status: "cancelled",
          leasedUntil: null,
          updatedAt: nowIso(),
        });
        cancelledDispatchJobs += 1;
      }
    }

    this.tasks.set(task.id, {
      ...task,
      active: false,
      nextRunAt: null,
      updatedAt: nowIso(),
    });
    this.appendTaskEvent({
      orgId,
      taskId,
      action: "task.cancelled",
      previousState: task.active ? "active" : "paused",
      nextState: "paused",
      reason: "api_cancel",
      metadata: {
        cancelledDispatchJobs,
        runningAttemptIds,
      },
    });

    return {
      cancelled: true,
      taskId,
      cancelledDispatchJobs,
      runningAttemptIds,
      guarantee: "no-new-attempts",
      alreadyStarted: runningAttemptIds.length > 0,
    };
  }

  bulkCancelTasks(orgId: string, input: BulkTaskCancelInput): BulkTaskCancelResult {
    const limit = input.limit ?? 100;
    const selected = this.listTasks(orgId, {
      externalId: input.externalIds?.length === 1 ? input.externalIds[0] : undefined,
      metadata: input.metadata,
      limit,
    }).filter((task) => {
      if (input.taskIds?.length && !input.taskIds.includes(task.id)) {
        return false;
      }
      if (input.externalIds?.length && !(task.externalId && input.externalIds.includes(task.externalId))) {
        return false;
      }
      return true;
    });

    const results = selected.map((task) => this.cancelTask(orgId, task.id));
    return {
      count: results.length,
      results,
    };
  }

  triggerTask(orgId: string, taskId: string, trigger: "manual" | "api"): RunRecord {
    this.assertWritable(orgId);
    this.assertWithinRunLimit(orgId);

    const task = this.assertTaskRunnable(this.assertTaskAccessible(this.tasks.get(taskId), orgId));

    const now = nowIso();
    const run: RunRecord = {
      id: nanoid(),
      orgId,
      taskId: task.id,
      status: "queued",
      trigger,
      attempt: 1,
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      output: null,
      logs: null,
      errorMessage: null,
      createdAt: now,
    };

    this.runs.set(run.id, run);
    this.incrementUsage(orgId);
    this.createDispatchForRun(task, run);
    this.appendRunEvent({
      orgId,
      runId: run.id,
      action: "run.queued",
      previousState: null,
      nextState: "queued",
      reason: trigger,
      metadata: {
        taskId: task.id,
      },
    });

    return run;
  }

  dispatchTask(
    orgId: string,
    input: TaskDispatchInput,
    createdBy?: CreatedBy,
    trigger: "manual" | "api" = "api"
  ): RunRecord {
    this.assertWritable(orgId);
    this.assertWithinRunLimit(orgId);
    this.ensureOrganization(orgId);

    const now = nowIso();
    const task: InternalTaskRecord = {
      id: nanoid(),
      orgId,
      kind: "dispatch",
      name: input.name ?? "On-demand dispatch",
      description: null,
      externalId: null,
      handlerType: input.handler.type as HandlerType,
      handlerConfig: input.handler,
      scheduleType: "once",
      scheduleConfig: {
        type: "once",
        at: now,
      },
      timezone: "UTC",
      nextRunAt: null,
      retryAttempts: input.retryAttempts ?? 1,
      retryBackoff: input.retryBackoff ?? "linear",
      retryDelay: input.retryDelay ?? "1s",
      retryPolicy: {
        maxAttempts: input.retryMaxAttempts ?? input.retryAttempts ?? 10,
        backoff: input.retryBackoff ?? "exponential",
        initialDelay: input.retryInitialDelay ?? "10s",
        maxDelay: input.retryMaxDelay ?? "15m",
        jitter: input.retryJitter ?? true,
        retryWindow: input.retryWindow ?? "24h",
        retryOnStatusCodes: input.retryOnStatusCodes ?? [],
        terminalStatusCodes: input.terminalStatusCodes ?? [],
      },
      timeout: input.timeout ?? "30s",
      active: false,
      source: createdBy?.type === "agent" ? "mcp" : "sdk",
      createdBy: createdBy ?? null,
      callbackUrl: input.callbackUrl ?? null,
      metadata: input.metadata ?? null,
      maxRuns: null,
      expiresAt: null,
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);

    const run: RunRecord = {
      id: nanoid(),
      orgId,
      taskId: task.id,
      status: "queued",
      trigger,
      attempt: 1,
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      output: null,
      logs: null,
      errorMessage: null,
      createdAt: now,
    };

    this.runs.set(run.id, run);
    this.incrementUsage(orgId);
    this.createDispatchForRun(task, run);
    this.appendRunEvent({
      orgId,
      runId: run.id,
      action: "run.queued",
      previousState: null,
      nextState: "queued",
      reason: trigger,
      metadata: {
        taskId: task.id,
        kind: "dispatch",
      },
    });
    return run;
  }

  // ============================================
  // RUNS
  // ============================================

  listRuns(orgId: string, input: RunListInput = {}): RunRecord[] {
    return Array.from(this.runs.values())
      .filter((run) => run.orgId === orgId)
      .filter((run) => {
        if (input.taskId && run.taskId !== input.taskId) {
          return false;
        }
        if (input.status && run.status !== input.status) {
          return false;
        }
        if (!isWithinOptionalRange(run.scheduledAt, {
          after: input.scheduledAfter,
          before: input.scheduledBefore,
        })) {
          return false;
        }

        const task = this.tasks.get(run.taskId);
        if (input.externalId && task?.externalId !== input.externalId) {
          return false;
        }
        if (!metadataMatches(task?.metadata, input.metadata)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, input.limit ?? 100);
  }

  getRun(orgId: string, runId: string): RunRecord {
    const run = this.runs.get(runId);
    if (!run || run.orgId !== orgId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Run not found");
    }
    return run;
  }

  getRunTimeline(orgId: string, runId: string, limit = 100): TimelineEntryRecord[] {
    this.getRun(orgId, runId);
    const dispatchJobIds = Array.from(this.dispatchJobs.values())
      .filter((job) => job.orgId === orgId && job.runId === runId)
      .map((job) => job.id);

    return [
      ...this.listRunEvents(orgId, runId, limit).map((event) => this.toTimelineEntryFromRunEvent(event)),
      ...Array.from(this.dispatchEvents.values())
        .filter((event) => event.orgId === orgId && dispatchJobIds.includes(event.dispatchJobId))
        .map((event) => this.toTimelineEntryFromDispatchEvent(event)),
      ...this.listAuditEvents(orgId, { targetType: "run", targetId: runId, limit })
        .map((event) => this.toTimelineEntryFromAuditEvent(event)),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  replayRun(orgId: string, runId: string, trigger: "manual" | "api" = "manual"): RunReplayResult {
    const source = this.getRun(orgId, runId);
    const task = this.tasks.get(source.taskId);
    if (!task || task.orgId !== orgId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Task not found");
    }

    const now = nowIso();
    const run: RunRecord = {
      id: nanoid(),
      orgId,
      taskId: task.id,
      status: "queued",
      trigger,
      attempt: 1,
      scheduledAt: source.scheduledAt,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      output: null,
      logs: null,
      errorMessage: null,
      createdAt: now,
    };
    this.runs.set(run.id, run);
    this.createDispatchForRun(task, run);
    this.appendRunEvent({
      orgId,
      runId: run.id,
      action: "run.replayed",
      previousState: null,
      nextState: "queued",
      reason: trigger,
      metadata: {
        replayOfRunId: runId,
        taskId: task.id,
      },
    });
    return { run, replayOfRunId: runId };
  }

  bulkReplayRuns(
    orgId: string,
    input: BulkRunReplayInput,
    trigger: "manual" | "api" = "manual"
  ): BulkRunReplayResult {
    const selected: RunRecord[] = input.runIds?.length
      ? input.runIds.map((runId: string) => this.getRun(orgId, runId))
      : this.listRuns(orgId, {
        taskId: input.taskId,
        status: input.status,
        externalId: input.externalId,
        metadata: input.metadata,
        limit: input.limit ?? 100,
      });

    const results = selected.map((run: RunRecord) => this.replayRun(orgId, run.id, trigger));
    return {
      count: results.length,
      results,
    };
  }

  compareReconciliation(orgId: string, input: ReconciliationCompareInput): ReconciliationCompareResult {
    const limit = input.limit ?? 100;
    const scheduledTasks = Array.from(this.tasks.values())
      .filter((task) => task.orgId === orgId && task.kind === "scheduled")
      .map((task) => this.normalizeScheduledTask(task));
    const matchedTasks = scheduledTasks
      .filter((task) => {
        if (input.externalIds?.length && !input.externalIds.includes(task.externalId ?? "")) {
          return false;
        }
        return metadataMatches(task.metadata, input.metadata);
      })
      .slice(0, limit)
      .map((task) => this.toPublicTask(task));

    const missingExternalIds = (input.externalIds ?? []).filter(
      (externalId: string) => !scheduledTasks.some((task) => task.externalId === externalId),
    );

    const externalIdCounts = new Map<string, number>();
    for (const task of scheduledTasks) {
      if (!task.externalId) {
        continue;
      }
      externalIdCounts.set(task.externalId, (externalIdCounts.get(task.externalId) ?? 0) + 1);
    }
    const duplicateExternalIds = Array.from(externalIdCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([externalId]) => externalId);

    const pendingOneOffTasks = input.includePendingOnce === false
      ? []
      : scheduledTasks
        .filter((task) => task.scheduleType === "once" && task.nextRunAt !== null && task.active)
        .filter((task) => metadataMatches(task.metadata, input.metadata))
        .slice(0, limit)
        .map((task) => this.toPublicTask(task));

    const overdueTasks = input.includeOverdue === false
      ? []
      : scheduledTasks
        .filter((task) => task.nextRunAt !== null && new Date(task.nextRunAt).getTime() < Date.now())
        .filter((task) => metadataMatches(task.metadata, input.metadata))
        .slice(0, limit)
        .map((task) => this.toPublicTask(task));

    return {
      matchedTasks,
      missingExternalIds,
      duplicateExternalIds,
      pendingOneOffTasks,
      overdueTasks,
    };
  }

  updateRunStatus(runId: string, input: InternalRunStatusInput): RunRecord {
    const run = this.runs.get(runId);
    if (!run) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Run not found");
    }

    // Don't update if already in a terminal state
    if (isTerminalRunStatus(run.status)) {
      return run;
    }

    // Don't process old attempts
    if (input.attempt < run.attempt) {
      return run;
    }

    const now = nowIso();
    const isTerminal = isTerminalRunStatus(input.status);

    const updated: RunRecord = {
      ...run,
      status: input.status,
      attempt: input.attempt,
      startedAt: input.status === "running" && !run.startedAt ? now : run.startedAt,
      completedAt: isTerminal ? now : null,
      durationMs: input.durationMs ?? run.durationMs,
      output: input.output ?? run.output,
      logs: input.logs ?? run.logs,
      errorMessage: input.errorMessage ?? (input.status === "success" ? null : run.errorMessage),
    };

    this.runs.set(run.id, updated);
    this.appendRunEvent({
      orgId: run.orgId,
      runId: run.id,
      action: `run.${input.status}`,
      previousState: run.status,
      nextState: updated.status,
      reason: "internal_status_update",
      metadata: {
        attempt: input.attempt,
        durationMs: input.durationMs ?? null,
      },
    });

    if (isTerminal) {
      const task = this.tasks.get(run.taskId);
      if (task) {
        const nextRunCount = task.runCount + 1;
        const shouldPause = task.kind === "scheduled"
          && (isMaxRunsReached(nextRunCount, task.maxRuns) || isExpiredAt(task.expiresAt));

        this.tasks.set(task.id, {
          ...task,
          runCount: nextRunCount,
          active: shouldPause ? false : task.active,
          nextRunAt: shouldPause ? null : task.nextRunAt,
          updatedAt: nowIso(),
        });
      }
    }

    return updated;
  }

  // ============================================
  // SECRETS
  // ============================================

  listSecrets(orgId: string): SecretRecord[] {
    return Array.from(this.secrets.values())
      .filter((secret) => secret.orgId === orgId)
      .map(({ encryptedValue: _, ...record }) => record)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getSecretValue(orgId: string, name: string): string {
    const secret = Array.from(this.secrets.values()).find(
      (s) => s.orgId === orgId && s.name === name
    );
    if (!secret) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Secret '${name}' not found. Create it in Settings > Secrets.`);
    }
    return decryptSecretValue(secret.encryptedValue, secret.keyVersion).plaintext;
  }

  createSecret(orgId: string, input: SecretCreateInput): SecretRecord {
    this.assertWritable(orgId);

    const existing = Array.from(this.secrets.values()).find(
      (s) => s.orgId === orgId && s.name === input.name
    );
    if (existing) {
      throw new AppError(409, ERROR_CODES.VALIDATION_ERROR, "Secret with this name already exists");
    }

    const now = nowIso();
    const encrypted = encryptSecretValue(input.value, now);
    const secret: InternalSecretRecord = {
      id: nanoid(),
      orgId,
      name: input.name,
      encryptedValue: encrypted.encryptedValue,
      keyVersion: encrypted.keyVersion,
      lastRotatedAt: encrypted.rotatedAt,
      createdAt: now,
      updatedAt: now,
    };

    this.secrets.set(secret.id, secret);

    const { encryptedValue: _, ...record } = secret;
    return record;
  }

  patchSecret(orgId: string, name: string, input: SecretPatchInput): SecretRecord {
    this.assertWritable(orgId);

    const secret = Array.from(this.secrets.values()).find(
      (s) => s.orgId === orgId && s.name === name
    );
    if (!secret) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Secret '${name}' not found`);
    }

    const rotatedAt = nowIso();
    const encrypted = encryptSecretValue(input.value, rotatedAt);
    const updated: InternalSecretRecord = {
      ...secret,
      encryptedValue: encrypted.encryptedValue,
      keyVersion: encrypted.keyVersion,
      lastRotatedAt: encrypted.rotatedAt,
      updatedAt: rotatedAt,
    };

    this.secrets.set(secret.id, updated);

    const { encryptedValue: _, ...record } = updated;
    return record;
  }

  rotateSecret(orgId: string, name: string): SecretRecord {
    this.assertWritable(orgId);

    const secret = Array.from(this.secrets.values()).find(
      (s) => s.orgId === orgId && s.name === name
    );
    if (!secret) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Secret '${name}' not found`);
    }

    const activeVersion = currentSecretKeyVersion();
    if (secret.keyVersion === activeVersion && secret.encryptedValue.startsWith("enc:")) {
      return (({ encryptedValue: _, ...record }) => record)(secret);
    }

    const rotatedAt = nowIso();
    const plaintext = decryptSecretValue(secret.encryptedValue, secret.keyVersion).plaintext;
    const encrypted = encryptSecretValue(plaintext, rotatedAt);
    const updated: InternalSecretRecord = {
      ...secret,
      encryptedValue: encrypted.encryptedValue,
      keyVersion: encrypted.keyVersion,
      lastRotatedAt: encrypted.rotatedAt,
      updatedAt: rotatedAt,
    };

    this.secrets.set(secret.id, updated);
    const { encryptedValue: _, ...record } = updated;
    return record;
  }

  deleteSecret(orgId: string, name: string): void {
    const secret = Array.from(this.secrets.values()).find(
      (s) => s.orgId === orgId && s.name === name
    );
    if (!secret) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Secret '${name}' not found`);
    }
    this.secrets.delete(secret.id);
  }

  // ============================================
  // ALERTS
  // ============================================

  listAlerts(orgId: string): AlertRecord[] {
    return Array.from(this.alerts.values()).filter((item) => item.orgId === orgId);
  }

  createAlert(orgId: string, input: AlertCreateInput): AlertRecord {
    this.assertWritable(orgId);

    const now = nowIso();
    const created: AlertRecord = {
      id: nanoid(),
      orgId,
      channel: input.channel,
      destination: input.destination,
      onFailure: input.onFailure,
      onTimeout: input.onTimeout,
      createdAt: now,
      updatedAt: now,
    };

    this.alerts.set(created.id, created);
    return created;
  }

  // ============================================
  // API KEYS
  // ============================================

  listApiKeys(orgId: string): ApiKeyRecord[] {
    return Array.from(this.apiKeys.values())
      .filter((item) => item.orgId === orgId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ keyHash: _keyHash, ...key }) => key);
  }

  hasApiKeys(orgId: string): boolean {
    return Array.from(this.apiKeys.values()).some((item) => item.orgId === orgId);
  }

  createApiKey(orgId: string, input: ApiKeyCreateInput): ApiKeyWithToken {
    this.assertWritable(orgId);
    const now = nowIso();
    const token = createApiKeyToken();
    const keyHash = hashApiKey(token);
    const id = nanoid();

    const created: ApiKeyRecord & { keyHash: string } = {
      id,
      orgId,
      label: input.label,
      scopes: input.scopes,
      keyPreview: keyPreviewFromHash(keyHash),
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
      keyHash,
    };
    this.apiKeys.set(id, created);

    const { keyHash: _keyHash, ...apiKey } = created;
    return { apiKey, token };
  }

  rotateApiKey(orgId: string, keyId: string, input: ApiKeyRotateInput): ApiKeyWithToken {
    this.assertWritable(orgId);
    const existing = this.apiKeys.get(keyId);
    if (!existing || existing.orgId !== orgId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "API key not found");
    }

    const token = createApiKeyToken();
    const keyHash = hashApiKey(token);
    const next: ApiKeyRecord & { keyHash: string } = {
      ...existing,
      label: input.label ?? existing.label,
      scopes: input.scopes ?? existing.scopes,
      keyHash,
      keyPreview: keyPreviewFromHash(keyHash),
      updatedAt: nowIso(),
    };

    this.apiKeys.set(keyId, next);
    const { keyHash: _keyHash, ...apiKey } = next;
    return { apiKey, token };
  }

  revokeApiKey(orgId: string, keyId: string): void {
    const existing = this.apiKeys.get(keyId);
    if (!existing || existing.orgId !== orgId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "API key not found");
    }
    this.apiKeys.delete(keyId);
  }

  // ============================================
  // AUDIT EVENTS
  // ============================================

  listTaskEvents(orgId: string, taskId: string, limit = 100): TaskEventRecord[] {
    return Array.from(this.taskEvents.values())
      .filter((event) => event.orgId === orgId && event.taskId === taskId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  listRunEvents(orgId: string, runId: string, limit = 100): RunEventRecord[] {
    return Array.from(this.runEvents.values())
      .filter((event) => event.orgId === orgId && event.runId === runId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  listDispatchEvents(orgId: string, dispatchJobId: string, limit = 100): DispatchEventRecord[] {
    return Array.from(this.dispatchEvents.values())
      .filter((event) => event.orgId === orgId && event.dispatchJobId === dispatchJobId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  listCircuitBreakers(orgId: string, input: CircuitBreakerListInput = {}): CircuitBreakerRecord[] {
    return Array.from(this.circuitBreakers.values())
      .filter((breaker) => breaker.orgId === orgId)
      .filter((breaker) => {
        if (input.state && breaker.state !== input.state) {
          return false;
        }
        if (input.destinationKey && breaker.destinationKey !== input.destinationKey) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, input.limit ?? 100);
  }

  listAuditEvents(orgId: string, input: AuditEventListInput): AuditEventRecord[] {
    const fromTime = input.from ? new Date(input.from).getTime() : null;
    const toTime = input.to ? new Date(input.to).getTime() : null;
    const limit = input.limit ?? 100;

    return Array.from(this.auditEvents.values())
      .filter((event) => {
        if (event.orgId !== orgId) {
          return false;
        }

        if (input.actorType && event.actorType !== input.actorType) {
          return false;
        }

        if (input.action && event.action !== input.action) {
          return false;
        }

        if (input.actionPrefix && !event.action.startsWith(input.actionPrefix)) {
          return false;
        }

        if (input.targetType && event.targetType !== input.targetType) {
          return false;
        }

        if (input.targetId && event.targetId !== input.targetId) {
          return false;
        }

        const createdAtTime = new Date(event.createdAt).getTime();
        if (fromTime !== null && createdAtTime < fromTime) {
          return false;
        }
        if (toTime !== null && createdAtTime > toTime) {
          return false;
        }

        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  createAuditEvent(input: {
    organizationId: string;
    actorType?: string;
    actorId?: string;
    action: string;
    targetType: string;
    targetId: string;
    payloadHash?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt?: string;
  }): void {
    const id = nanoid();
    const createdAt = input.createdAt ?? nowIso();

    this.auditEvents.set(id, {
      id,
      orgId: input.organizationId,
      actorType: (input.actorType ?? "internal") as AuditEventRecord["actorType"],
      actorId: input.actorId ?? "system",
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      payloadHash: input.payloadHash ?? null,
      metadata: input.metadata ?? null,
      createdAt,
    });
  }

  // ============================================
  // USAGE & BILLING
  // ============================================

  getUsage(orgId: string): UsageSnapshot {
    const entitlement = this.getEntitlement(orgId);
    const month = formatYearMonth();
    const runAttempts = this.usage.get(this.usageKey(orgId, month)) ?? 0;
    const limits = PLAN_LIMITS[entitlement.tier];

    return {
      tier: entitlement.tier,
      month,
      runAttempts,
      runLimit: limits.runAttemptsPerMonth,
      retentionDays: limits.retentionDays,
      delinquent: entitlement.delinquent,
      graceEndsAt: entitlement.graceEndsAt,
    };
  }

  upsertOrganization(input: OrganizationUpsertInput): void {
    this.ensureOrganization(input.orgId, {
      name: input.name,
      slug: input.slug,
    });
  }

  upsertEntitlementForOrg(orgId: string, input: EntitlementUpdateInput): void {
    this.ensureOrganization(orgId);
    this.entitlements.set(orgId, {
      tier: input.tier,
      delinquent: input.delinquent,
      graceEndsAt: input.graceEndsAt,
    });
  }

  getCallbackSigningSecret(orgId: string): CallbackSigningSecretRecord {
    const organization = this.ensureOrganization(orgId);
    return {
      secret: organization.callbackSigningSecret,
      rotatedAt: organization.callbackSigningSecretRotatedAt,
    };
  }

  rotateCallbackSigningSecret(orgId: string): CallbackSigningSecretRecord {
    const organization = this.ensureOrganization(orgId);
    const rotatedAt = nowIso();
    const updated: InternalOrganizationRecord = {
      ...organization,
      callbackSigningSecret: generateCallbackSigningSecret(),
      callbackSigningSecretRotatedAt: rotatedAt,
      updatedAt: rotatedAt,
    };
    this.organizations.set(orgId, updated);
    return {
      secret: updated.callbackSigningSecret,
      rotatedAt,
    };
  }

  getOutboundPolicy(orgId: string): OutboundPolicyRecord {
    const organization = this.ensureOrganization(orgId);
    return {
      allowedHosts: [...organization.outboundAllowedHosts],
      updatedAt: organization.updatedAt,
    };
  }

  updateOutboundPolicy(orgId: string, input: OutboundPolicyPatchInput): OutboundPolicyRecord {
    const organization = this.ensureOrganization(orgId);
    const updated: InternalOrganizationRecord = {
      ...organization,
      outboundAllowedHosts: normalizeAllowedHosts(input.allowedHosts),
      updatedAt: nowIso(),
    };
    this.organizations.set(orgId, updated);
    return {
      allowedHosts: [...updated.outboundAllowedHosts],
      updatedAt: updated.updatedAt,
    };
  }

  // ============================================
  // WORKER DISPATCH
  // ============================================

  claimDueDispatches(limit = 100): DispatchInstruction[] {
    const now = new Date();
    this.reconcileDispatches(limit);

    for (const task of this.tasks.values()) {
      if (task.kind !== "scheduled") {
        continue;
      }

      const normalizedTask = this.normalizeScheduledTask(task, now.getTime());
      if (!normalizedTask.active || !normalizedTask.nextRunAt) {
        continue;
      }

      const dueAt = new Date(normalizedTask.nextRunAt);
      if (dueAt.getTime() > now.getTime()) {
        continue;
      }

      const entitlement = this.getEntitlement(normalizedTask.orgId);
      if (!this.isGracePeriodActive(entitlement, now.getTime())) {
        continue;
      }

      try {
        this.assertWithinRunLimit(normalizedTask.orgId);
      } catch (error) {
        if (error instanceof AppError && error.code === ERROR_CODES.PLAN_LIMIT_EXCEEDED) {
          continue;
        }
        throw error;
      }

      // Create the run
      const runNow = nowIso();
      const run: RunRecord = {
        id: nanoid(),
        orgId: normalizedTask.orgId,
        taskId: normalizedTask.id,
        status: "queued",
        trigger: "schedule",
        attempt: 1,
        scheduledAt: normalizedTask.nextRunAt,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        output: null,
        logs: null,
        errorMessage: null,
        createdAt: runNow,
      };
      this.runs.set(run.id, run);
      this.incrementUsage(normalizedTask.orgId);
      this.createDispatchForRun(normalizedTask, run);
      this.appendRunEvent({
        orgId: normalizedTask.orgId,
        runId: run.id,
        action: "run.queued",
        previousState: null,
        nextState: "queued",
        reason: "schedule_due",
        metadata: {
          taskId: normalizedTask.id,
          scheduledAt: normalizedTask.nextRunAt,
        },
      });
      this.appendTaskEvent({
        orgId: normalizedTask.orgId,
        taskId: normalizedTask.id,
        action: "task.dispatched",
        previousState: normalizedTask.active ? "active" : "paused",
        nextState: normalizedTask.active ? "active" : "paused",
        reason: "schedule_due",
        metadata: {
          runId: run.id,
        },
      });

      // Update next run time
      const nextRunAt = computeNextRun(normalizedTask.scheduleConfig, normalizedTask.timezone, now);
      this.tasks.set(normalizedTask.id, {
        ...normalizedTask,
        nextRunAt,
        updatedAt: nowIso(),
      });
    }

    const nowMs = Date.now();
    const { orgCounts, destinationCounts } = this.activeDispatchCounts();
    const dueJobs = Array.from(this.dispatchJobs.entries())
      .filter(([, job]) => (job.status === "pending" || job.status === "retry_wait") && new Date(job.availableAt).getTime() <= nowMs)
      .sort((a, b) => new Date(a[1].availableAt).getTime() - new Date(b[1].availableAt).getTime());
    const jobsByOrg = new Map<string, Array<[string, InternalDispatchJobRecord]>>();
    const orgOrder: string[] = [];

    for (const entry of dueJobs) {
      const [_, job] = entry;
      const existing = jobsByOrg.get(job.orgId);
      if (existing) {
        existing.push(entry);
      } else {
        jobsByOrg.set(job.orgId, [entry]);
        orgOrder.push(job.orgId);
      }
    }

    const instructions: DispatchInstruction[] = [];
    let pendingOrgOrder = orgOrder;
    while (instructions.length < limit && pendingOrgOrder.length > 0) {
      let claimedInRound = false;
      const nextOrgOrder: string[] = [];

      for (const orgId of pendingOrgOrder) {
        const queue = jobsByOrg.get(orgId);
        if (!queue || queue.length === 0) {
          continue;
        }
        if ((orgCounts.get(orgId) ?? 0) >= MAX_CONCURRENT_DISPATCHES_PER_ORG) {
          continue;
        }

        while (queue.length > 0) {
          const [id, job] = queue.shift()!;
          const breakerBefore = this.getCircuitBreaker(job.orgId, job.destinationKey);
          if (!this.canLeaseForDestination(job.orgId, job.destinationKey)) {
            continue;
          }
          const breakerAfterEligibility = this.getCircuitBreaker(job.orgId, job.destinationKey);
          this.recordCircuitBreakerTransition(
            job,
            breakerBefore?.state ?? null,
            breakerAfterEligibility?.state ?? null,
            "destination_probe_reenabled",
          );
          if (job.destinationKey) {
            const destinationCountKey = this.orgDestinationKey(job.orgId, job.destinationKey);
            if ((destinationCounts.get(destinationCountKey) ?? 0) >= MAX_CONCURRENT_DISPATCHES_PER_DESTINATION) {
              continue;
            }
          }

          const task = this.tasks.get(job.taskId);
          const run = this.runs.get(job.runId);
          if (!task || !run || !task.active && task.kind === "scheduled") {
            continue;
          }

          const attemptNumber = job.attemptCount + 1;
          const existingAttempt = Array.from(this.runAttempts.values()).find(
            (candidate) => candidate.dispatchJobId === job.id && candidate.attemptNumber === attemptNumber
          );
          const attempt: RunAttemptRecord = existingAttempt ?? {
            id: nanoid(),
            orgId: job.orgId,
            runId: job.runId,
            taskId: job.taskId,
            dispatchJobId: job.id,
            attemptNumber,
            status: "pending",
            startedAt: null,
            completedAt: null,
            durationMs: null,
            httpStatus: null,
            errorClass: null,
            errorMessage: null,
            responseBodyPreview: null,
            responseBodyHash: null,
            output: null,
            logs: null,
            createdAt: nowIso(),
          };
          this.runAttempts.set(attempt.id, attempt);
          this.dispatchJobs.set(id, {
            ...job,
            status: "leased",
            leaseOwner: "memory-worker",
            leasedUntil: new Date(Date.now() + parseDuration(task.timeout) + 30_000).toISOString(),
            attemptCount: attemptNumber,
            updatedAt: nowIso(),
          });
          this.runs.set(run.id, {
            ...run,
            status: "leased",
            attempt: attemptNumber,
          });
          this.markProbeInFlight(job.orgId, job.destinationKey);
          this.appendDispatchEvent({
            orgId: job.orgId,
            dispatchJobId: job.id,
            action: "dispatch.leased",
            previousState: job.status,
            nextState: "leased",
            reason: "worker_claim",
            metadata: {
              runId: job.runId,
              taskId: job.taskId,
              attemptId: attempt.id,
              attemptNumber,
            },
          });
          orgCounts.set(orgId, (orgCounts.get(orgId) ?? 0) + 1);
          if (job.destinationKey) {
            const destinationCountKey = this.orgDestinationKey(job.orgId, job.destinationKey);
            destinationCounts.set(destinationCountKey, (destinationCounts.get(destinationCountKey) ?? 0) + 1);
          }
          instructions.push(this.instructionForDispatch(task, run, this.dispatchJobs.get(id) ?? job, attempt));
          claimedInRound = true;

          if (
            instructions.length < limit
            && queue.length > 0
            && (orgCounts.get(orgId) ?? 0) < MAX_CONCURRENT_DISPATCHES_PER_ORG
          ) {
            nextOrgOrder.push(orgId);
          }
          break;
        }
      }

      if (!claimedInRound) {
        break;
      }
      pendingOrgOrder = nextOrgOrder;
    }

    return instructions;
  }

  startDispatchAttempt(input: InternalDispatchStartInput): void {
    const job = this.dispatchJobs.get(input.dispatchJobId);
    const attempt = this.runAttempts.get(input.attemptId);
    if (!job || !attempt) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Dispatch attempt not found");
    }
    const now = nowIso();
    this.dispatchJobs.set(job.id, {
      ...job,
      status: "running",
      updatedAt: now,
    });
    this.appendDispatchEvent({
      orgId: job.orgId,
      dispatchJobId: job.id,
      action: "dispatch.running",
      previousState: job.status,
      nextState: "running",
      reason: "worker_start",
      metadata: {
        attemptId: attempt.id,
        attemptNumber: input.attemptNumber,
      },
    });
    this.runAttempts.set(attempt.id, {
      ...attempt,
      status: "running",
      startedAt: now,
    });
    const run = this.runs.get(job.runId);
    if (run && !isTerminalRunStatus(run.status)) {
      this.runs.set(run.id, {
        ...run,
        status: "running",
        startedAt: run.startedAt ?? now,
        attempt: input.attemptNumber,
      });
      this.appendRunEvent({
        orgId: run.orgId,
        runId: run.id,
        action: "run.running",
        previousState: run.status,
        nextState: "running",
        reason: "worker_start",
        metadata: {
          attemptId: attempt.id,
          attemptNumber: input.attemptNumber,
        },
      });
    }
  }

  completeDispatchAttempt(input: InternalDispatchCompleteInput): void {
    const job = this.dispatchJobs.get(input.dispatchJobId);
    const attempt = this.runAttempts.get(input.attemptId);
    if (!job || !attempt) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Dispatch attempt not found");
    }
    const run = this.runs.get(job.runId);
    const task = this.tasks.get(job.taskId);
    if (!run || !task) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Run not found");
    }

    const now = nowIso();
    const terminalSuccess = input.status === "success";
    const attemptsExhausted = job.attemptCount >= job.maxAttempts;
    const retryWindowExpired = job.retryWindowEndsAt !== null && new Date(job.retryWindowEndsAt).getTime() <= Date.now();
    const shouldRetry = !terminalSuccess && input.status !== "terminal_client_error" && !attemptsExhausted && !retryWindowExpired;

    this.runAttempts.set(attempt.id, {
      ...attempt,
      status: input.status,
      completedAt: now,
      durationMs: input.durationMs,
      httpStatus: input.httpStatus ?? null,
      errorClass: input.errorClass ?? null,
      errorMessage: input.errorMessage ?? null,
      responseBodyPreview: input.responseBodyPreview ?? null,
      responseBodyHash: input.responseBodyHash ?? null,
      output: input.output ?? null,
      logs: input.logs ?? null,
    });

    if (shouldRetry) {
      const policy = retryPolicyForTask(task);
      const breakerBefore = this.getCircuitBreaker(job.orgId, job.destinationKey);
      const breaker = this.markCircuitBreakerFailure(
        job.orgId,
        job.destinationKey,
        input.errorMessage ?? input.errorClass ?? "delivery failed",
      );
      const nextAvailableAt = breaker?.state === "open" && breaker.cooldownUntil
        ? breaker.cooldownUntil
        : new Date(Date.now() + computeRetryDelayMs(policy, job.attemptCount)).toISOString();
      this.dispatchJobs.set(job.id, {
        ...job,
        status: "retry_wait",
        leaseOwner: null,
        leasedUntil: null,
        availableAt: nextAvailableAt,
        lastError: input.errorMessage ?? input.errorClass ?? "delivery failed",
        updatedAt: now,
      });
      if (breaker?.state === "open" && breaker.cooldownUntil) {
        this.deferDestinationJobs(job.orgId, breaker.destinationKey, breaker.cooldownUntil);
      }
      this.recordCircuitBreakerTransition(
        job,
        breakerBefore?.state ?? null,
        breaker?.state ?? null,
        breaker?.state === "open" ? "retryable_failure_threshold_reached" : "retryable_failure_recorded",
        {
          errorClass: input.errorClass ?? null,
          errorMessage: input.errorMessage ?? null,
        },
      );
      if (input.errorClass === "OutboundTargetError") {
        this.appendDispatchEvent({
          orgId: job.orgId,
          dispatchJobId: job.id,
          action: "dispatch.policy_blocked",
          previousState: job.status,
          nextState: "retry_wait",
          reason: "outbound_policy_blocked",
          metadata: {
            runId: job.runId,
            taskId: job.taskId,
            attemptId: attempt.id,
            attemptNumber: input.attemptNumber,
            destinationKey: job.destinationKey,
            errorMessage: input.errorMessage ?? null,
          },
        });
      }
      this.appendDispatchEvent({
        orgId: job.orgId,
        dispatchJobId: job.id,
        action: "dispatch.retry_wait",
        previousState: job.status,
        nextState: "retry_wait",
        reason: "delivery_retry_scheduled",
        metadata: {
          attemptId: attempt.id,
          attemptNumber: input.attemptNumber,
          httpStatus: input.httpStatus ?? null,
          errorClass: input.errorClass ?? null,
        },
      });
      this.runs.set(run.id, {
        ...run,
        status: "retry_wait",
        attempt: input.attemptNumber,
        durationMs: input.durationMs,
        errorMessage: input.errorMessage ?? run.errorMessage,
      });
      return;
    }

    const finalStatus: RunStatus = terminalSuccess
      ? "success"
      : input.status === "timeout"
        ? "timeout"
        : input.status === "terminal_client_error"
          ? "terminal_client_error"
          : retryWindowExpired
            ? "retry_window_expired"
            : "dead_lettered";

    this.dispatchJobs.set(job.id, {
      ...job,
      status: terminalSuccess ? "succeeded" : "dead_lettered",
      leaseOwner: null,
      leasedUntil: null,
      lastError: input.errorMessage ?? null,
      updatedAt: now,
    });
    if (terminalSuccess) {
      const breakerBefore = this.getCircuitBreaker(job.orgId, job.destinationKey);
      this.closeCircuitBreaker(job.orgId, job.destinationKey);
      const breakerAfter = this.getCircuitBreaker(job.orgId, job.destinationKey);
      this.recordCircuitBreakerTransition(
        job,
        breakerBefore?.state ?? null,
        breakerAfter?.state ?? null,
        "delivery_succeeded",
      );
    } else if (input.status !== "terminal_client_error") {
      const breakerBefore = this.getCircuitBreaker(job.orgId, job.destinationKey);
      const breaker = this.markCircuitBreakerFailure(
        job.orgId,
        job.destinationKey,
        input.errorMessage ?? input.errorClass ?? finalStatus,
      );
      if (breaker?.state === "open" && breaker.cooldownUntil) {
        this.deferDestinationJobs(job.orgId, breaker.destinationKey, breaker.cooldownUntil);
      }
      this.recordCircuitBreakerTransition(
        job,
        breakerBefore?.state ?? null,
        breaker?.state ?? null,
        breaker?.state === "open" ? "terminal_failure_threshold_reached" : finalStatus,
        {
          errorClass: input.errorClass ?? null,
          errorMessage: input.errorMessage ?? null,
        },
      );
      if (input.errorClass === "OutboundTargetError") {
        this.appendDispatchEvent({
          orgId: job.orgId,
          dispatchJobId: job.id,
          action: "dispatch.policy_blocked",
          previousState: job.status,
          nextState: "dead_lettered",
          reason: "outbound_policy_blocked",
          metadata: {
            runId: job.runId,
            taskId: job.taskId,
            attemptId: attempt.id,
            attemptNumber: input.attemptNumber,
            destinationKey: job.destinationKey,
            errorMessage: input.errorMessage ?? null,
          },
        });
      }
    } else if (this.getCircuitBreaker(job.orgId, job.destinationKey)?.state === "half_open") {
      const breakerBefore = this.getCircuitBreaker(job.orgId, job.destinationKey);
      this.closeCircuitBreaker(job.orgId, job.destinationKey);
      const breakerAfter = this.getCircuitBreaker(job.orgId, job.destinationKey);
      this.recordCircuitBreakerTransition(
        job,
        breakerBefore?.state ?? null,
        breakerAfter?.state ?? null,
        "terminal_client_error",
      );
      if (input.errorClass === "OutboundTargetError") {
        this.appendDispatchEvent({
          orgId: job.orgId,
          dispatchJobId: job.id,
          action: "dispatch.policy_blocked",
          previousState: job.status,
          nextState: "dead_lettered",
          reason: "outbound_policy_blocked",
          metadata: {
            runId: job.runId,
            taskId: job.taskId,
            attemptId: attempt.id,
            attemptNumber: input.attemptNumber,
            destinationKey: job.destinationKey,
            errorMessage: input.errorMessage ?? null,
          },
        });
      }
    } else if (input.errorClass === "OutboundTargetError") {
      this.appendDispatchEvent({
        orgId: job.orgId,
        dispatchJobId: job.id,
        action: "dispatch.policy_blocked",
        previousState: job.status,
        nextState: "dead_lettered",
        reason: "outbound_policy_blocked",
        metadata: {
          runId: job.runId,
          taskId: job.taskId,
          attemptId: attempt.id,
          attemptNumber: input.attemptNumber,
          destinationKey: job.destinationKey,
          errorMessage: input.errorMessage ?? null,
        },
      });
    }
    this.appendDispatchEvent({
      orgId: job.orgId,
      dispatchJobId: job.id,
      action: terminalSuccess ? "dispatch.succeeded" : "dispatch.dead_lettered",
      previousState: job.status,
      nextState: terminalSuccess ? "succeeded" : "dead_lettered",
      reason: terminalSuccess ? "delivery_succeeded" : finalStatus,
      metadata: {
        attemptId: attempt.id,
        attemptNumber: input.attemptNumber,
        httpStatus: input.httpStatus ?? null,
      },
    });
    this.updateRunStatus(run.id, {
      status: finalStatus,
      attempt: input.attemptNumber,
      durationMs: input.durationMs,
      output: input.output ?? null,
      logs: input.logs ?? null,
      errorMessage: input.errorMessage ?? undefined,
    });
  }

  reconcileDispatches(limit = 100): { repaired: number } {
    let repaired = 0;
    const nowMs = Date.now();
    for (const [id, job] of this.dispatchJobs.entries()) {
      if (repaired >= limit) {
        break;
      }
      if ((job.status === "leased" || job.status === "running") && job.leasedUntil && new Date(job.leasedUntil).getTime() <= nowMs) {
        this.dispatchJobs.set(id, {
          ...job,
          status: "retry_wait",
          leaseOwner: null,
          leasedUntil: null,
          availableAt: nowIso(),
          lastError: "lease expired",
          updatedAt: nowIso(),
        });
        this.appendDispatchEvent({
          orgId: job.orgId,
          dispatchJobId: job.id,
          action: "dispatch.reconciled",
          previousState: job.status,
          nextState: "retry_wait",
          reason: "lease_expired",
          metadata: {
            runId: job.runId,
            taskId: job.taskId,
          },
        });
        const run = this.runs.get(job.runId);
        if (run && !isTerminalRunStatus(run.status)) {
          this.runs.set(run.id, {
            ...run,
            status: "retry_wait",
            errorMessage: "Dispatch lease expired; retry scheduled.",
          });
        }
        repaired += 1;
      }
    }
    return { repaired };
  }
}
