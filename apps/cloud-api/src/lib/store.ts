import {
  type AuditEventListInput,
  type AuditEventRecord,
  type CallbackSigningSecretRecord,
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
  type DispatchInstruction,
  type DispatchJobStatus,
  type InternalDispatchCompleteInput,
  type InternalDispatchStartInput,
  type HandlerType,
  type InternalRunStatusInput,
  type PlanTier,
  type ReconciliationCompareInput,
  type ReconciliationCompareResult,
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
  type TaskListInput,
  type TaskPatchInput,
  type TaskRecord,
  type TaskCancelResult,
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

interface InternalOrganizationRecord {
  orgId: string;
  name?: string;
  slug?: string;
  callbackSigningSecret: string;
  createdAt: string;
  updatedAt: string;
}

function formatPlanLabel(tier: PlanTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function generateCallbackSigningSecret(): string {
  return `crsig_${randomBytes(32).toString("hex")}`;
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
  private readonly secrets = new Map<string, InternalSecretRecord>();
  private readonly alerts = new Map<string, AlertRecord>();
  private readonly apiKeys = new Map<string, ApiKeyRecord & { keyHash: string }>();
  private readonly auditEvents = new Map<string, AuditEventRecord>();
  private readonly usage = new Map<string, number>();
  private readonly entitlements = new Map<string, OrgEntitlement>();

  private usageKey(orgId: string, yearMonth: string): string {
    return `${orgId}:${yearMonth}`;
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
      createdAt: now,
      updatedAt: now,
    };
    this.organizations.set(orgId, created);
    return created;
  }

  private getCallbackSigningSecretValue(orgId: string): string {
    return this.ensureOrganization(orgId).callbackSigningSecret;
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

  createTask(orgId: string, input: TaskCreateInput, createdBy?: CreatedBy): TaskRecord {
    this.assertWritable(orgId);
    this.assertWithinTaskLimit(orgId);

    const task = this.buildScheduledTask(orgId, input, createdBy);
    this.tasks.set(task.id, task);
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
    return this.toPublicTask(updated);
  }

  deleteTask(orgId: string, taskId: string): void {
    this.assertTaskAccessible(this.tasks.get(taskId), orgId);
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
    // In real implementation, this would decrypt the value
    return secret.encryptedValue;
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
    const secret: InternalSecretRecord = {
      id: nanoid(),
      orgId,
      name: input.name,
      encryptedValue: input.value, // In real implementation, this would be encrypted
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

    const updated: InternalSecretRecord = {
      ...secret,
      encryptedValue: input.value, // In real implementation, this would be encrypted
      updatedAt: nowIso(),
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
    return {
      secret: this.getCallbackSigningSecretValue(orgId),
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

      // Update next run time
      const nextRunAt = computeNextRun(normalizedTask.scheduleConfig, normalizedTask.timezone, now);
      this.tasks.set(normalizedTask.id, {
        ...normalizedTask,
        nextRunAt,
        updatedAt: nowIso(),
      });
    }

    const nowMs = Date.now();
    const instructions: DispatchInstruction[] = [];
    for (const [id, job] of this.dispatchJobs.entries()) {
      if (instructions.length >= limit) {
        break;
      }
      if ((job.status !== "pending" && job.status !== "retry_wait") || new Date(job.availableAt).getTime() > nowMs) {
        continue;
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
      instructions.push(this.instructionForDispatch(task, run, this.dispatchJobs.get(id) ?? job, attempt));
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
      this.dispatchJobs.set(job.id, {
        ...job,
        status: "retry_wait",
        leaseOwner: null,
        leasedUntil: null,
        availableAt: new Date(Date.now() + computeRetryDelayMs(policy, job.attemptCount)).toISOString(),
        lastError: input.errorMessage ?? input.errorClass ?? "delivery failed",
        updatedAt: now,
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
