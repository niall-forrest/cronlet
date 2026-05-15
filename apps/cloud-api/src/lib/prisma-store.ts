import { Prisma, PrismaClient } from "@prisma/client";
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
  type PlanTier,
  type ApiKeyCreateInput,
  type ApiKeyRecord,
  type ApiKeyRotateInput,
  type ApiKeyWithToken,
  formatYearMonth,
  parseDuration,
  type AlertCreateInput,
  type AlertRecord,
  type CreatedBy,
  type DispatchInstruction,
  type HandlerConfig,
  type HandlerType,
  type InternalDispatchCompleteInput,
  type InternalDispatchStartInput,
  type InternalRunStatusInput,
  type ReconciliationCompareInput,
  type ReconciliationCompareResult,
  type RetryPolicy,
  type RunRecord,
  type RunListInput,
  type RunReplayResult,
  type RunStatus,
  type ScheduleConfig,
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
} from "@cronlet/shared";
import { ERROR_CODES } from "@cronlet/shared";
import { randomBytes } from "node:crypto";
import { AppError } from "./errors.js";
import { computeNextRun } from "./clock.js";
import type { CloudStore, EntitlementUpdateInput, OrganizationUpsertInput } from "./store-contract.js";
import { createApiKeyToken, hashApiKey, keyPreviewFromHash } from "./api-keys.js";

function iso(value: Date): string {
  return value.toISOString();
}

function isoNullable(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function slugify(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return normalized || "org";
}

function orgSlug(orgId: string, preferredSlug?: string): string {
  const base = slugify(preferredSlug ?? orgId).slice(0, 48);
  const suffix = slugify(orgId).slice(-8) || "org";
  return `${base}-${suffix}`;
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

function isTerminalRunStatus(status: string): boolean {
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
  retryBackoff: string;
  retryDelay: string;
  retryMaxAttempts?: number;
  retryInitialDelay?: string;
  retryMaxDelay?: string;
  retryJitter?: boolean;
  retryWindow?: string;
  retryOnStatusCodes?: number[];
  terminalStatusCodes?: number[];
}): RetryPolicy {
  return {
    maxAttempts: task.retryMaxAttempts ?? Math.max(task.retryAttempts, 1),
    backoff: (task.retryBackoff === "linear" || task.retryBackoff === "fixed") ? task.retryBackoff : "exponential",
    initialDelay: task.retryInitialDelay ?? task.retryDelay,
    maxDelay: task.retryMaxDelay ?? "15m",
    jitter: task.retryJitter ?? true,
    retryWindow: task.retryWindow ?? "24h",
    retryOnStatusCodes: task.retryOnStatusCodes ?? [],
    terminalStatusCodes: task.terminalStatusCodes ?? [],
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

function metadataWhereClauses(metadata: Record<string, unknown> | undefined): Prisma.TaskWhereInput[] {
  if (!metadata) {
    return [];
  }

  return Object.entries(metadata).map(([key, expected]) => ({
    metadata: {
      path: [key],
      equals: expected as Prisma.InputJsonValue,
    },
  }));
}

function toTaskRecord(value: {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  externalId?: string | null;
  handlerType: string;
  handlerConfig: unknown;
  scheduleType: string;
  scheduleConfig: unknown;
  timezone: string;
  nextRunAt: Date | null;
  retryAttempts: number;
  retryBackoff: string;
  retryDelay: string;
  retryMaxAttempts?: number;
  retryInitialDelay?: string;
  retryMaxDelay?: string;
  retryJitter?: boolean;
  retryWindow?: string;
  retryOnStatusCodes?: number[];
  terminalStatusCodes?: number[];
  timeout: string;
  active: boolean;
  source: string;
  createdBy: unknown;
  callbackUrl: string | null;
  metadata: unknown;
  maxRuns: number | null;
  expiresAt: Date | null;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}): TaskRecord {
  return {
    id: value.id,
    orgId: value.organizationId,
    name: value.name,
    description: value.description,
    externalId: value.externalId ?? null,
    handlerType: value.handlerType as HandlerType,
    handlerConfig: value.handlerConfig as HandlerConfig,
    scheduleType: value.scheduleType as ScheduleType,
    scheduleConfig: value.scheduleConfig as ScheduleConfig,
    timezone: value.timezone,
    nextRunAt: isoNullable(value.nextRunAt),
    retryAttempts: value.retryAttempts,
    retryBackoff: value.retryBackoff as "linear" | "exponential",
    retryDelay: value.retryDelay,
    retryPolicy: retryPolicyForTask(value),
    timeout: value.timeout,
    active: value.active,
    source: value.source as TaskRecord["source"],
    createdBy: value.createdBy as CreatedBy | null,
    callbackUrl: value.callbackUrl,
    metadata: value.metadata as Record<string, unknown> | null,
    maxRuns: value.maxRuns,
    expiresAt: isoNullable(value.expiresAt),
    runCount: value.runCount,
    createdAt: iso(value.createdAt),
    updatedAt: iso(value.updatedAt),
  };
}

function toRunRecord(value: {
  id: string;
  organizationId: string;
  taskId: string;
  status: string;
  trigger: string;
  attempt: number;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  output: unknown;
  logs: string | null;
  errorMessage: string | null;
  createdAt: Date;
}): RunRecord {
  return {
    id: value.id,
    orgId: value.organizationId,
    taskId: value.taskId,
    status: value.status as RunRecord["status"],
    trigger: value.trigger as RunRecord["trigger"],
    attempt: value.attempt,
    scheduledAt: isoNullable(value.scheduledAt),
    startedAt: isoNullable(value.startedAt),
    completedAt: isoNullable(value.completedAt),
    durationMs: value.durationMs,
    output: value.output as Record<string, unknown> | null,
    logs: value.logs,
    errorMessage: value.errorMessage,
    createdAt: iso(value.createdAt),
  };
}

function toSecretRecord(value: {
  id: string;
  organizationId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}): SecretRecord {
  return {
    id: value.id,
    orgId: value.organizationId,
    name: value.name,
    createdAt: iso(value.createdAt),
    updatedAt: iso(value.updatedAt),
  };
}

function toAlertRecord(value: {
  id: string;
  organizationId: string;
  channel: AlertRecord["channel"];
  destination: string;
  onFailure: boolean;
  onTimeout: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AlertRecord {
  return {
    id: value.id,
    orgId: value.organizationId,
    channel: value.channel,
    destination: value.destination,
    onFailure: value.onFailure,
    onTimeout: value.onTimeout,
    createdAt: iso(value.createdAt),
    updatedAt: iso(value.updatedAt),
  };
}

function toApiKeyRecord(value: {
  id: string;
  organizationId: string;
  label: string;
  scopes: string[];
  keyHash: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ApiKeyRecord {
  return {
    id: value.id,
    orgId: value.organizationId,
    label: value.label,
    scopes: value.scopes,
    keyPreview: keyPreviewFromHash(value.keyHash),
    lastUsedAt: isoNullable(value.lastUsedAt),
    createdAt: iso(value.createdAt),
    updatedAt: iso(value.updatedAt),
  };
}

function toAuditMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toAuditEventRecord(value: {
  id: string;
  organizationId: string;
  actorType: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  payloadHash: string | null;
  metadata: unknown;
  createdAt: Date;
}): AuditEventRecord {
  return {
    id: value.id,
    orgId: value.organizationId,
    actorType: (value.actorType ?? "internal") as AuditEventRecord["actorType"],
    actorId: value.actorId,
    action: value.action,
    targetType: value.targetType,
    targetId: value.targetId,
    payloadHash: value.payloadHash,
    metadata: toAuditMetadata(value.metadata),
    createdAt: iso(value.createdAt),
  };
}

interface BillingState {
  tier: UsageSnapshot["tier"];
  delinquent: boolean;
  graceEndsAt: string | null;
}

export class PrismaCloudStore implements CloudStore {
  private readonly claimLockId = "cronlet_claim_due_tasks";

  constructor(private readonly prisma: PrismaClient) {}

  private async tryClaimDispatchLock(): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(hashtext(${this.claimLockId})) AS locked
    `;
    return rows[0]?.locked === true;
  }

  private async releaseDispatchLock(): Promise<void> {
    await this.prisma.$executeRaw`
      SELECT pg_advisory_unlock(hashtext(${this.claimLockId}))
    `;
  }

  private isGracePeriodActive(graceEndsAt: string | null, now: Date): boolean {
    if (!graceEndsAt) {
      return false;
    }
    return new Date(graceEndsAt).getTime() > now.getTime();
  }

  private async ensureOrganization(orgId: string, name?: string, slug?: string): Promise<void> {
    await this.prisma.organization.upsert({
      where: { id: orgId },
      update: {
        ...(name ? { name } : {}),
        ...(slug ? { slug: orgSlug(orgId, slug) } : {}),
      },
      create: {
        id: orgId,
        clerkOrgId: orgId,
        name: name ?? `Organization ${orgId}`,
        slug: orgSlug(orgId, slug),
        callbackSigningSecret: generateCallbackSigningSecret(),
      },
    });
  }

  private async getBillingState(orgId: string): Promise<BillingState> {
    const entitlement = await this.prisma.billingEntitlement.findUnique({
      where: { organizationId: orgId },
      select: {
        tier: true,
        delinquent: true,
        graceEndsAt: true,
      },
    });

    if (!entitlement) {
      return {
        tier: "free",
        delinquent: false,
        graceEndsAt: null,
      };
    }

    return {
      tier: entitlement.tier,
      delinquent: entitlement.delinquent,
      graceEndsAt: isoNullable(entitlement.graceEndsAt),
    };
  }

  private async assertWritable(orgId: string): Promise<void> {
    const entitlement = await this.getBillingState(orgId);
    if (!entitlement.delinquent) {
      return;
    }

    const graceEndsAt = entitlement.graceEndsAt ? new Date(entitlement.graceEndsAt) : null;
    if (graceEndsAt && graceEndsAt.getTime() > Date.now()) {
      return;
    }

    throw new AppError(402, ERROR_CODES.DELINQUENT_ACCOUNT, "Billing delinquent: schedules are paused");
  }

  private async assertWithinRunLimit(orgId: string): Promise<void> {
    const entitlement = await this.getBillingState(orgId);
    const yearMonth = formatYearMonth();
    const usageCounter = await this.prisma.usageCounter.findUnique({
      where: {
        organizationId_yearMonth: {
          organizationId: orgId,
          yearMonth,
        },
      },
      select: { runAttempts: true },
    });
    const attempts = usageCounter?.runAttempts ?? 0;
    const limit = PLAN_LIMITS[entitlement.tier].runAttemptsPerMonth;

    if (attempts >= limit) {
      throw new AppError(402, ERROR_CODES.PLAN_LIMIT_EXCEEDED, "Monthly run-attempt limit reached", {
        limit,
        attempts,
      });
    }
  }

  private async assertWithinTaskLimit(orgId: string): Promise<void> {
    const entitlement = await this.getBillingState(orgId);
    const currentCount = await this.countTasks(orgId);
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

  private async incrementUsage(orgId: string): Promise<void> {
    const yearMonth = formatYearMonth();
    await this.prisma.usageCounter.upsert({
      where: {
        organizationId_yearMonth: {
          organizationId: orgId,
          yearMonth,
        },
      },
      update: {
        runAttempts: {
          increment: 1,
        },
      },
      create: {
        organizationId: orgId,
        yearMonth,
        runAttempts: 1,
      },
    });
  }

  private async getOrCreateCallbackSigningSecret(orgId: string): Promise<string> {
    await this.ensureOrganization(orgId);

    const organization = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { callbackSigningSecret: true },
    });

    if (organization?.callbackSigningSecret) {
      return organization.callbackSigningSecret;
    }

    const secret = generateCallbackSigningSecret();
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        callbackSigningSecret: secret,
      },
    });
    return secret;
  }

  private async createDispatchForRun(task: {
    id: string;
    organizationId: string;
    name: string;
    externalId?: string | null;
    handlerType: string;
    handlerConfig: unknown;
    timeout: string;
    retryAttempts: number;
    retryBackoff: string;
    retryDelay: string;
    retryMaxAttempts?: number;
    retryInitialDelay?: string;
    retryMaxDelay?: string;
    retryJitter?: boolean;
    retryWindow?: string;
    retryOnStatusCodes?: number[];
    terminalStatusCodes?: number[];
    callbackUrl: string | null;
    metadata: unknown;
    maxRuns: number | null;
    expiresAt: Date | null;
    runCount: number;
  }, run: { id: string }, tx: Prisma.TransactionClient | PrismaClient = this.prisma): Promise<void> {
    const policy = retryPolicyForTask(task);
    const destinationKey = (task.handlerConfig as HandlerConfig).type === "webhook"
      ? new URL(((task.handlerConfig as HandlerConfig) as { type: "webhook"; url: string }).url).host
      : task.handlerType;
    const dispatchJob = await tx.dispatchJob.create({
      data: {
        organizationId: task.organizationId,
        taskId: task.id,
        runId: run.id,
        status: "pending",
        availableAt: new Date(),
        maxAttempts: policy.maxAttempts,
        retryWindowEndsAt: new Date(Date.now() + parseDuration(policy.retryWindow)),
        destinationKey,
      },
    });
    await tx.runAttempt.create({
      data: {
        organizationId: task.organizationId,
        taskId: task.id,
        runId: run.id,
        dispatchJobId: dispatchJob.id,
        attemptNumber: 1,
        status: "pending",
      },
    });
  }

  private async instructionForDispatch(dispatchJobId: string): Promise<DispatchInstruction | null> {
    const job = await this.prisma.dispatchJob.findUnique({
      where: { id: dispatchJobId },
      include: {
        task: true,
        run: true,
        attempts: {
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
      },
    });
    if (!job || !job.task || !job.run) {
      return null;
    }
    const attempt = job.attempts[0];
    if (!attempt) {
      return null;
    }
    return {
      dispatchJobId: job.id,
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      runId: job.runId,
      orgId: job.organizationId,
      taskId: job.taskId,
      taskName: job.task.name,
      taskExternalId: job.task.externalId,
      handlerType: job.task.handlerType as HandlerType,
      handlerConfig: job.task.handlerConfig as unknown as HandlerConfig,
      timeoutMs: parseDuration(job.task.timeout),
      retryAttempts: job.task.retryAttempts,
      retryBackoff: job.task.retryBackoff as "linear" | "exponential",
      retryDelay: job.task.retryDelay,
      retryPolicy: retryPolicyForTask(job.task),
      callbackUrl: job.task.callbackUrl,
      callbackSigningSecret: job.task.callbackUrl
        ? await this.getOrCreateCallbackSigningSecret(job.organizationId)
        : null,
      metadata: job.task.metadata as Record<string, unknown> | null,
      maxRuns: job.task.maxRuns,
      expiresAt: isoNullable(job.task.expiresAt),
      runCount: job.task.runCount,
    };
  }

  // ============================================
  // TASKS
  // ============================================

  async listTasks(orgId: string, input: TaskListInput = {}): Promise<TaskRecord[]> {
    const where: Prisma.TaskWhereInput = {
      organizationId: orgId,
      kind: "scheduled",
      ...(input.status === "active" ? { active: true } : {}),
      ...(input.status === "paused" ? { active: false } : {}),
      ...(input.scheduleType ? { scheduleType: input.scheduleType } : {}),
      ...(input.externalId ? { externalId: input.externalId } : {}),
      ...(input.nextRunAfter || input.nextRunBefore
        ? {
          nextRunAt: {
            ...(input.nextRunAfter ? { gte: new Date(input.nextRunAfter) } : {}),
            ...(input.nextRunBefore ? { lte: new Date(input.nextRunBefore) } : {}),
          },
        }
        : {}),
      ...(input.metadata ? { AND: metadataWhereClauses(input.metadata) } : {}),
    };

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: input.limit ?? 100,
    });
    return tasks.map(toTaskRecord);
  }

  async countTasks(orgId: string): Promise<number> {
    return this.prisma.task.count({
      where: {
        organizationId: orgId,
        kind: "scheduled",
      },
    });
  }

  async getTask(orgId: string, taskId: string): Promise<TaskRecord> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        organizationId: orgId,
        kind: "scheduled",
      },
    });
    if (!task) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Task not found");
    }
    return toTaskRecord(task);
  }

  async createTask(orgId: string, input: TaskCreateInput, createdBy?: CreatedBy): Promise<TaskRecord> {
    await this.assertWritable(orgId);
    await this.assertWithinTaskLimit(orgId);
    await this.ensureOrganization(orgId);

    const scheduleConfig = input.schedule;
    const handlerConfig = input.handler;
    const maxRuns = input.maxRuns ?? null;
    const expiresAt = input.expiresAt ?? null;
    const active = input.active !== false
      && !isMaxRunsReached(0, maxRuns)
      && !isExpiredAt(expiresAt);

    const nextRunAt = active
      ? computeNextRun(scheduleConfig, input.timezone ?? "UTC")
      : null;

    const created = await this.prisma.task.create({
      data: {
        organizationId: orgId,
        kind: "scheduled",
        name: input.name,
        description: input.description ?? null,
        externalId: input.externalId ?? null,
        handlerType: handlerConfig.type,
        handlerConfig: handlerConfig as unknown as Prisma.InputJsonValue,
        scheduleType: scheduleConfig.type,
        scheduleConfig: scheduleConfig as unknown as Prisma.InputJsonValue,
        timezone: input.timezone ?? "UTC",
        nextRunAt: nextRunAt ? new Date(nextRunAt) : null,
        retryAttempts: input.retryAttempts ?? 1,
        retryBackoff: input.retryBackoff ?? "linear",
        retryDelay: input.retryDelay ?? "1s",
        retryMaxAttempts: input.retryMaxAttempts ?? input.retryAttempts ?? 10,
        retryInitialDelay: input.retryInitialDelay ?? "10s",
        retryMaxDelay: input.retryMaxDelay ?? "15m",
        retryJitter: input.retryJitter ?? true,
        retryWindow: input.retryWindow ?? "24h",
        retryOnStatusCodes: input.retryOnStatusCodes ?? [],
        terminalStatusCodes: input.terminalStatusCodes ?? [],
        timeout: input.timeout ?? "30s",
        active,
        source: input.source ?? "dashboard",
        createdBy: createdBy ? (createdBy as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        callbackUrl: input.callbackUrl ?? null,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        maxRuns,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    return toTaskRecord(created);
  }

  async patchTask(orgId: string, taskId: string, input: TaskPatchInput): Promise<TaskRecord> {
    await this.assertWritable(orgId);

    const existing = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        organizationId: orgId,
        kind: "scheduled",
      },
    });
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Task not found");
    }

    const scheduleConfig = input.schedule ?? (existing.scheduleConfig as unknown as ScheduleConfig);
    const handlerConfig = input.handler ?? (existing.handlerConfig as unknown as HandlerConfig);
    const timezone = input.timezone ?? existing.timezone;
    const maxRuns = input.maxRuns === undefined ? existing.maxRuns : input.maxRuns;
    const expiresAt = input.expiresAt === undefined ? isoNullable(existing.expiresAt) : input.expiresAt;
    const requestedActive = input.active ?? existing.active;
    const active = requestedActive
      && !isMaxRunsReached(existing.runCount, maxRuns)
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
      : isoNullable(existing.nextRunAt);

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        name: input.name ?? existing.name,
        description: input.description === null ? null : (input.description ?? existing.description),
        externalId: input.externalId === undefined ? existing.externalId : input.externalId,
        handlerType: handlerConfig.type,
        handlerConfig: handlerConfig as unknown as Prisma.InputJsonValue,
        scheduleType: scheduleConfig.type,
        scheduleConfig: scheduleConfig as unknown as Prisma.InputJsonValue,
        timezone,
        nextRunAt: nextRunAt ? new Date(nextRunAt) : null,
        retryAttempts: input.retryAttempts ?? existing.retryAttempts,
        retryBackoff: input.retryBackoff ?? existing.retryBackoff,
        retryDelay: input.retryDelay ?? existing.retryDelay,
        retryMaxAttempts: input.retryMaxAttempts ?? existing.retryMaxAttempts,
        retryInitialDelay: input.retryInitialDelay ?? existing.retryInitialDelay,
        retryMaxDelay: input.retryMaxDelay ?? existing.retryMaxDelay,
        retryJitter: input.retryJitter ?? existing.retryJitter,
        retryWindow: input.retryWindow ?? existing.retryWindow,
        retryOnStatusCodes: input.retryOnStatusCodes ?? existing.retryOnStatusCodes,
        terminalStatusCodes: input.terminalStatusCodes ?? existing.terminalStatusCodes,
        timeout: input.timeout ?? existing.timeout,
        callbackUrl: input.callbackUrl === undefined ? existing.callbackUrl : input.callbackUrl,
        metadata: input.metadata === undefined
          ? (
            existing.metadata === null
              ? Prisma.JsonNull
              : (existing.metadata as Prisma.InputJsonValue)
          )
          : input.metadata
            ? (input.metadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        maxRuns,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        active,
      },
    });

    return toTaskRecord(updated);
  }

  async deleteTask(orgId: string, taskId: string): Promise<void> {
    const existing = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        organizationId: orgId,
        kind: "scheduled",
      },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Task not found");
    }

    await this.prisma.task.delete({
      where: { id: taskId },
    });
  }

  async cancelTask(orgId: string, taskId: string): Promise<TaskCancelResult> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId: orgId, kind: "scheduled" },
      select: { id: true },
    });
    if (!task) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Task not found");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: {
          active: false,
          nextRunAt: null,
        },
      });
      const cancelled = await tx.dispatchJob.updateMany({
        where: {
          organizationId: orgId,
          taskId,
          status: { in: ["pending", "leased", "retry_wait"] },
        },
        data: {
          status: "cancelled",
          leaseOwner: null,
          leasedUntil: null,
        },
      });
      const runningAttempts = await tx.runAttempt.findMany({
        where: {
          organizationId: orgId,
          taskId,
          status: "running",
        },
        select: { id: true },
      });
      return { cancelledJobs: cancelled.count, runningAttemptIds: runningAttempts.map((attempt) => attempt.id) };
    });

    return {
      cancelled: true,
      taskId,
      cancelledDispatchJobs: result.cancelledJobs,
      runningAttemptIds: result.runningAttemptIds,
      guarantee: "no-new-attempts",
      alreadyStarted: result.runningAttemptIds.length > 0,
    };
  }

  async bulkCancelTasks(orgId: string, input: BulkTaskCancelInput): Promise<BulkTaskCancelResult> {
    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId: orgId,
        kind: "scheduled",
        ...(input.taskIds?.length ? { id: { in: input.taskIds } } : {}),
        ...(input.externalIds?.length ? { externalId: { in: input.externalIds } } : {}),
        ...(input.metadata ? { AND: metadataWhereClauses(input.metadata) } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: input.limit ?? 100,
      select: { id: true },
    });

    const results = await Promise.all(tasks.map((task) => this.cancelTask(orgId, task.id)));
    return {
      count: results.length,
      results,
    };
  }

  async triggerTask(orgId: string, taskId: string, trigger: "manual" | "api"): Promise<RunRecord> {
    await this.assertWritable(orgId);
    await this.assertWithinRunLimit(orgId);

    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        organizationId: orgId,
        kind: "scheduled",
      },
    });
    if (!task) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Task not found");
    }

    if (isMaxRunsReached(task.runCount, task.maxRuns)) {
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          active: false,
          nextRunAt: null,
        },
      });
      throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, "Task has reached its max run limit");
    }

    if (isExpiredAt(isoNullable(task.expiresAt))) {
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          active: false,
          nextRunAt: null,
        },
      });
      throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, "Task has expired");
    }

    await this.incrementUsage(orgId);

    const run = await this.prisma.run.create({
      data: {
        organizationId: orgId,
        taskId: task.id,
        status: "queued",
        trigger,
        attempt: 1,
      },
    });

    await this.createDispatchForRun(task, run);

    return toRunRecord(run);
  }

  async dispatchTask(
    orgId: string,
    input: TaskDispatchInput,
    createdBy?: CreatedBy,
    trigger: "manual" | "api" = "api"
  ): Promise<RunRecord> {
    await this.assertWritable(orgId);
    await this.assertWithinRunLimit(orgId);
    await this.ensureOrganization(orgId);

    const now = new Date();
    const task = await this.prisma.task.create({
      data: {
        organizationId: orgId,
        kind: "dispatch",
        name: input.name ?? "On-demand dispatch",
        description: null,
        externalId: null,
        handlerType: input.handler.type,
        handlerConfig: input.handler as unknown as Prisma.InputJsonValue,
        scheduleType: "once",
        scheduleConfig: {
          type: "once",
          at: now.toISOString(),
        } as unknown as Prisma.InputJsonValue,
        timezone: "UTC",
        nextRunAt: null,
        retryAttempts: input.retryAttempts ?? 1,
        retryBackoff: input.retryBackoff ?? "linear",
        retryDelay: input.retryDelay ?? "1s",
        retryMaxAttempts: input.retryMaxAttempts ?? input.retryAttempts ?? 10,
        retryInitialDelay: input.retryInitialDelay ?? "10s",
        retryMaxDelay: input.retryMaxDelay ?? "15m",
        retryJitter: input.retryJitter ?? true,
        retryWindow: input.retryWindow ?? "24h",
        retryOnStatusCodes: input.retryOnStatusCodes ?? [],
        terminalStatusCodes: input.terminalStatusCodes ?? [],
        timeout: input.timeout ?? "30s",
        active: false,
        source: createdBy?.type === "agent" ? "mcp" : "sdk",
        createdBy: createdBy ? (createdBy as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        callbackUrl: input.callbackUrl ?? null,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        maxRuns: null,
        expiresAt: null,
      },
    });

    await this.incrementUsage(orgId);

    const run = await this.prisma.run.create({
      data: {
        organizationId: orgId,
        taskId: task.id,
        status: "queued",
        trigger,
        attempt: 1,
      },
    });

    await this.createDispatchForRun(task, run);
    return toRunRecord(run);
  }

  // ============================================
  // RUNS
  // ============================================

  async listRuns(orgId: string, input: RunListInput = {}): Promise<RunRecord[]> {
    const runs = await this.prisma.run.findMany({
      where: {
        organizationId: orgId,
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.scheduledAfter || input.scheduledBefore
          ? {
            scheduledAt: {
              ...(input.scheduledAfter ? { gte: new Date(input.scheduledAfter) } : {}),
              ...(input.scheduledBefore ? { lte: new Date(input.scheduledBefore) } : {}),
            },
          }
          : {}),
        ...((input.externalId || input.metadata)
          ? {
            task: {
              ...(input.externalId ? { externalId: input.externalId } : {}),
              ...(input.metadata ? { AND: metadataWhereClauses(input.metadata) } : {}),
            },
          }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: input.limit ?? 100,
    });
    return runs.map(toRunRecord);
  }

  async getRun(orgId: string, runId: string): Promise<RunRecord> {
    const run = await this.prisma.run.findFirst({
      where: {
        id: runId,
        organizationId: orgId,
      },
    });
    if (!run) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Run not found");
    }
    return toRunRecord(run);
  }

  async replayRun(orgId: string, runId: string, trigger: "manual" | "api" = "manual"): Promise<RunReplayResult> {
    const existing = await this.prisma.run.findFirst({
      where: { id: runId, organizationId: orgId },
      include: { task: true },
    });
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Run not found");
    }

    const run = await this.prisma.run.create({
      data: {
        organizationId: orgId,
        taskId: existing.taskId,
        status: "queued",
        trigger,
        attempt: 1,
        scheduledAt: existing.scheduledAt,
      },
    });
    await this.createDispatchForRun(existing.task, run);
    return { run: toRunRecord(run), replayOfRunId: runId };
  }

  async bulkReplayRuns(
    orgId: string,
    input: BulkRunReplayInput,
    trigger: "manual" | "api" = "manual"
  ): Promise<BulkRunReplayResult> {
    const runs = await this.prisma.run.findMany({
      where: {
        organizationId: orgId,
        ...(input.runIds?.length ? { id: { in: input.runIds } } : {}),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...((input.externalId || input.metadata)
          ? {
            task: {
              ...(input.externalId ? { externalId: input.externalId } : {}),
              ...(input.metadata ? { AND: metadataWhereClauses(input.metadata) } : {}),
            },
          }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: input.limit ?? 100,
      select: { id: true },
    });

    const results = await Promise.all(runs.map((run) => this.replayRun(orgId, run.id, trigger)));
    return {
      count: results.length,
      results,
    };
  }

  async compareReconciliation(orgId: string, input: ReconciliationCompareInput): Promise<ReconciliationCompareResult> {
    const limit = input.limit ?? 100;
    const matchedTasks = await this.prisma.task.findMany({
      where: {
        organizationId: orgId,
        kind: "scheduled",
        ...(input.externalIds?.length ? { externalId: { in: input.externalIds } } : {}),
        ...(input.metadata ? { AND: metadataWhereClauses(input.metadata) } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const missingExternalIds = input.externalIds?.length
      ? input.externalIds.filter((externalId: string) => !matchedTasks.some((task) => task.externalId === externalId))
      : [];

    const duplicateRows = await this.prisma.task.groupBy({
      by: ["externalId"],
      where: {
        organizationId: orgId,
        kind: "scheduled",
        externalId: { not: null },
      },
      _count: { externalId: true },
      having: {
        externalId: {
          _count: {
            gt: 1,
          },
        },
      },
    });

    const pendingOneOffTasks = input.includePendingOnce === false
      ? []
      : await this.prisma.task.findMany({
        where: {
          organizationId: orgId,
          kind: "scheduled",
          active: true,
          scheduleType: "once",
          nextRunAt: { not: null },
          ...(input.metadata ? { AND: metadataWhereClauses(input.metadata) } : {}),
        },
        orderBy: { nextRunAt: "asc" },
        take: limit,
      });

    const overdueTasks = input.includeOverdue === false
      ? []
      : await this.prisma.task.findMany({
        where: {
          organizationId: orgId,
          kind: "scheduled",
          active: true,
          nextRunAt: { lt: new Date() },
          ...(input.metadata ? { AND: metadataWhereClauses(input.metadata) } : {}),
        },
        orderBy: { nextRunAt: "asc" },
        take: limit,
      });

    return {
      matchedTasks: matchedTasks.map(toTaskRecord),
      missingExternalIds,
      duplicateExternalIds: duplicateRows.map((row) => row.externalId).filter((value): value is string => Boolean(value)),
      pendingOneOffTasks: pendingOneOffTasks.map(toTaskRecord),
      overdueTasks: overdueTasks.map(toTaskRecord),
    };
  }

  async updateRunStatus(runId: string, input: InternalRunStatusInput): Promise<RunRecord> {
    const existing = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Run not found");
    }

    // Don't update if already in terminal state
    if (isTerminalRunStatus(existing.status)) {
      return toRunRecord(existing);
    }

    // Don't process old attempts
    if (input.attempt < existing.attempt) {
      return toRunRecord(existing);
    }

    const isTerminal = isTerminalRunStatus(input.status);

    const updated = await this.prisma.$transaction(async (tx) => {
      const run = await tx.run.update({
        where: { id: runId },
        data: {
          status: input.status,
          attempt: input.attempt,
          startedAt: input.status === "running" && !existing.startedAt ? new Date() : undefined,
          completedAt: isTerminal ? new Date() : undefined,
          durationMs: input.durationMs ?? undefined,
          output: input.output ? (input.output as Prisma.InputJsonValue) : undefined,
          logs: input.logs ?? undefined,
          errorMessage: input.errorMessage ?? (input.status === "success" ? null : undefined),
        },
      });

      if (isTerminal) {
        const task = await tx.task.findUnique({
          where: { id: existing.taskId },
          select: {
            id: true,
            kind: true,
            runCount: true,
            maxRuns: true,
            expiresAt: true,
            active: true,
            nextRunAt: true,
          },
        });

        if (task) {
          const nextRunCount = task.runCount + 1;
          const shouldPause = task.kind === "scheduled"
            && (isMaxRunsReached(nextRunCount, task.maxRuns) || isExpiredAt(isoNullable(task.expiresAt)));

          await tx.task.update({
            where: { id: task.id },
            data: {
              runCount: nextRunCount,
              active: shouldPause ? false : task.active,
              nextRunAt: shouldPause ? null : task.nextRunAt,
            },
          });
        }
      }

      return run;
    });

    return toRunRecord(updated);
  }

  // ============================================
  // SECRETS
  // ============================================

  async listSecrets(orgId: string): Promise<SecretRecord[]> {
    const secrets = await this.prisma.secret.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        organizationId: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return secrets.map(toSecretRecord);
  }

  async getSecretValue(orgId: string, name: string): Promise<string> {
    const secret = await this.prisma.secret.findFirst({
      where: {
        organizationId: orgId,
        name,
      },
      select: { encryptedValue: true },
    });
    if (!secret) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Secret '${name}' not found. Create it in Settings > Secrets.`);
    }
    // In real implementation, this would decrypt the value
    return secret.encryptedValue;
  }

  async createSecret(orgId: string, input: SecretCreateInput): Promise<SecretRecord> {
    await this.assertWritable(orgId);
    await this.ensureOrganization(orgId);

    try {
      const created = await this.prisma.secret.create({
        data: {
          organizationId: orgId,
          name: input.name,
          encryptedValue: input.value, // In real implementation, this would be encrypted
        },
        select: {
          id: true,
          organizationId: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return toSecretRecord(created);
    } catch {
      throw new AppError(409, ERROR_CODES.VALIDATION_ERROR, "Secret with this name already exists");
    }
  }

  async patchSecret(orgId: string, name: string, input: SecretPatchInput): Promise<SecretRecord> {
    await this.assertWritable(orgId);

    const existing = await this.prisma.secret.findFirst({
      where: {
        organizationId: orgId,
        name,
      },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Secret '${name}' not found`);
    }

    const updated = await this.prisma.secret.update({
      where: { id: existing.id },
      data: {
        encryptedValue: input.value, // In real implementation, this would be encrypted
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return toSecretRecord(updated);
  }

  async deleteSecret(orgId: string, name: string): Promise<void> {
    const existing = await this.prisma.secret.findFirst({
      where: {
        organizationId: orgId,
        name,
      },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Secret '${name}' not found`);
    }

    await this.prisma.secret.delete({
      where: { id: existing.id },
    });
  }

  // ============================================
  // ALERTS
  // ============================================

  async listAlerts(orgId: string): Promise<AlertRecord[]> {
    const alerts = await this.prisma.alert.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
    return alerts.map(toAlertRecord);
  }

  async createAlert(orgId: string, input: AlertCreateInput): Promise<AlertRecord> {
    await this.assertWritable(orgId);
    await this.ensureOrganization(orgId);

    const created = await this.prisma.alert.create({
      data: {
        organizationId: orgId,
        channel: input.channel,
        destination: input.destination,
        onFailure: input.onFailure,
        onTimeout: input.onTimeout,
      },
    });
    return toAlertRecord(created);
  }

  // ============================================
  // API KEYS
  // ============================================

  async listApiKeys(orgId: string): Promise<ApiKeyRecord[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
    return keys.map(toApiKeyRecord);
  }

  async hasApiKeys(orgId: string): Promise<boolean> {
    const count = await this.prisma.apiKey.count({
      where: { organizationId: orgId },
    });
    return count > 0;
  }

  async createApiKey(orgId: string, input: ApiKeyCreateInput): Promise<ApiKeyWithToken> {
    await this.assertWritable(orgId);
    await this.ensureOrganization(orgId);

    const token = createApiKeyToken();
    const keyHash = hashApiKey(token);
    const created = await this.prisma.apiKey.create({
      data: {
        organizationId: orgId,
        label: input.label,
        keyHash,
        scopes: input.scopes,
      },
    });

    return {
      apiKey: toApiKeyRecord(created),
      token,
    };
  }

  async rotateApiKey(orgId: string, keyId: string, input: ApiKeyRotateInput): Promise<ApiKeyWithToken> {
    await this.assertWritable(orgId);

    const existing = await this.prisma.apiKey.findFirst({
      where: {
        id: keyId,
        organizationId: orgId,
      },
    });
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "API key not found");
    }

    const token = createApiKeyToken();
    const keyHash = hashApiKey(token);
    const updated = await this.prisma.apiKey.update({
      where: { id: keyId },
      data: {
        keyHash,
        label: input.label ?? existing.label,
        scopes: input.scopes ?? existing.scopes,
      },
    });

    return {
      apiKey: toApiKeyRecord(updated),
      token,
    };
  }

  async revokeApiKey(orgId: string, keyId: string): Promise<void> {
    const existing = await this.prisma.apiKey.findFirst({
      where: {
        id: keyId,
        organizationId: orgId,
      },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "API key not found");
    }

    await this.prisma.apiKey.delete({
      where: { id: keyId },
    });
  }

  // ============================================
  // AUDIT EVENTS
  // ============================================

  async listAuditEvents(orgId: string, input: AuditEventListInput): Promise<AuditEventRecord[]> {
    const where = {
      organizationId: orgId,
      ...(input.actorType ? { actorType: input.actorType } : {}),
      ...(input.action ? { action: input.action } : {}),
      ...(input.actionPrefix ? { action: { startsWith: input.actionPrefix } } : {}),
      ...(input.from || input.to
        ? {
          createdAt: {
            ...(input.from ? { gte: new Date(input.from) } : {}),
            ...(input.to ? { lte: new Date(input.to) } : {}),
          },
        }
        : {}),
    };

    const events = await this.prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: input.limit ?? 100,
    });

    return events.map(toAuditEventRecord);
  }

  async createAuditEvent(input: {
    organizationId: string;
    actorType?: string;
    actorId?: string;
    action: string;
    targetType: string;
    targetId: string;
    payloadHash?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt?: string;
  }): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorType: input.actorType ?? "internal",
        actorId: input.actorId ?? "system",
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        payloadHash: input.payloadHash ?? null,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
        createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
      },
    });
  }

  // ============================================
  // USAGE & BILLING
  // ============================================

  async getUsage(orgId: string): Promise<UsageSnapshot> {
    const entitlement = await this.getBillingState(orgId);
    const month = formatYearMonth();
    const usageCounter = await this.prisma.usageCounter.findUnique({
      where: {
        organizationId_yearMonth: {
          organizationId: orgId,
          yearMonth: month,
        },
      },
      select: { runAttempts: true },
    });

    return {
      tier: entitlement.tier,
      month,
      runAttempts: usageCounter?.runAttempts ?? 0,
      runLimit: PLAN_LIMITS[entitlement.tier].runAttemptsPerMonth,
      retentionDays: PLAN_LIMITS[entitlement.tier].retentionDays,
      delinquent: entitlement.delinquent,
      graceEndsAt: entitlement.graceEndsAt,
    };
  }

  async upsertOrganization(input: OrganizationUpsertInput): Promise<void> {
    await this.ensureOrganization(input.orgId, input.name, input.slug);
  }

  async upsertEntitlementForOrg(orgId: string, input: EntitlementUpdateInput): Promise<void> {
    await this.ensureOrganization(orgId);
    await this.prisma.billingEntitlement.upsert({
      where: { organizationId: orgId },
      update: {
        tier: input.tier,
        delinquent: input.delinquent,
        graceEndsAt: input.graceEndsAt ? new Date(input.graceEndsAt) : null,
      },
      create: {
        organizationId: orgId,
        tier: input.tier,
        delinquent: input.delinquent,
        graceEndsAt: input.graceEndsAt ? new Date(input.graceEndsAt) : null,
      },
    });
  }

  async getCallbackSigningSecret(orgId: string): Promise<CallbackSigningSecretRecord> {
    return {
      secret: await this.getOrCreateCallbackSigningSecret(orgId),
    };
  }

  // ============================================
  // WORKER DISPATCH
  // ============================================

  async claimDueDispatches(limit = 100): Promise<DispatchInstruction[]> {
    const lockAcquired = await this.tryClaimDispatchLock();
    if (!lockAcquired) {
      return [];
    }

    try {
      await this.reconcileDispatches(limit);
      const now = new Date();
      const dueTasks = await this.prisma.task.findMany({
        where: {
          kind: "scheduled",
          active: true,
          nextRunAt: { lte: now },
        },
        orderBy: { nextRunAt: "asc" },
        take: limit,
      });

      for (const task of dueTasks) {
        if (isMaxRunsReached(task.runCount, task.maxRuns) || isExpiredAt(isoNullable(task.expiresAt), now.getTime())) {
          await this.prisma.task.update({
            where: { id: task.id },
            data: {
              active: false,
              nextRunAt: null,
            },
          });
          continue;
        }

        const entitlement = await this.getBillingState(task.organizationId);
        if (entitlement.delinquent && !this.isGracePeriodActive(entitlement.graceEndsAt, now)) {
          continue;
        }

        const scheduleConfig = task.scheduleConfig as unknown as ScheduleConfig;
        const nextRunAt = computeNextRun(scheduleConfig, task.timezone, now);

        await this.prisma.$transaction(async (tx) => {
          // Optimistic lock - only update if nextRunAt hasn't changed
          const cas = await tx.task.updateMany({
            where: {
              id: task.id,
              active: true,
              nextRunAt: task.nextRunAt,
            },
            data: {
              nextRunAt: nextRunAt ? new Date(nextRunAt) : null,
            },
          });
          if (cas.count === 0) {
            return;
          }

          // Check usage limit
          const billing = await tx.billingEntitlement.findUnique({
            where: { organizationId: task.organizationId },
            select: { tier: true },
          });
          const tier = billing?.tier ?? "free";
          const month = formatYearMonth(now);
          const usageCounter = await tx.usageCounter.findUnique({
            where: {
              organizationId_yearMonth: {
                organizationId: task.organizationId,
                yearMonth: month,
              },
            },
            select: { runAttempts: true },
          });
          if ((usageCounter?.runAttempts ?? 0) >= PLAN_LIMITS[tier].runAttemptsPerMonth) {
            return;
          }

          // Increment usage
          await tx.usageCounter.upsert({
            where: {
              organizationId_yearMonth: {
                organizationId: task.organizationId,
                yearMonth: month,
              },
            },
            update: {
              runAttempts: {
                increment: 1,
              },
            },
            create: {
              organizationId: task.organizationId,
              yearMonth: month,
              runAttempts: 1,
            },
          });

          const run = await tx.run.create({
            data: {
              organizationId: task.organizationId,
              taskId: task.id,
              status: "queued",
              trigger: "schedule",
              attempt: 1,
              scheduledAt: task.nextRunAt,
            },
          });
          await this.createDispatchForRun(task, run, tx);
          await tx.runEvent.create({
            data: {
              organizationId: task.organizationId,
              runId: run.id,
              action: "run.queued",
              nextState: "queued",
              reason: "schedule_due",
            },
          });
          await tx.taskEvent.create({
            data: {
              organizationId: task.organizationId,
              taskId: task.id,
              action: "task.dispatched",
              reason: "schedule_due",
              metadata: { runId: run.id } as Prisma.InputJsonValue,
            },
          });
        });
      }

      const jobs = await this.prisma.$transaction(async (tx) => {
        const candidates = await tx.dispatchJob.findMany({
          where: {
            status: { in: ["pending", "retry_wait"] },
            availableAt: { lte: now },
          },
          orderBy: { availableAt: "asc" },
          take: limit,
        });
        const leased: string[] = [];
        for (const job of candidates) {
          const attemptNumber = job.attemptCount + 1;
          let attempt = await tx.runAttempt.findFirst({
            where: {
              dispatchJobId: job.id,
              attemptNumber,
            },
          });
          if (!attempt) {
            attempt = await tx.runAttempt.create({
              data: {
                organizationId: job.organizationId,
                taskId: job.taskId,
                runId: job.runId,
                dispatchJobId: job.id,
                attemptNumber,
                status: "pending",
              },
            });
          }

          const update = await tx.dispatchJob.updateMany({
            where: {
              id: job.id,
              status: job.status,
            },
            data: {
              status: "leased",
              leaseOwner: "cloud-worker",
              leasedUntil: new Date(Date.now() + 5 * 60 * 1000),
              attemptCount: attemptNumber,
            },
          });
          if (update.count === 0) {
            continue;
          }
          await tx.run.update({
            where: { id: job.runId },
            data: {
              status: "leased",
              attempt: attemptNumber,
            },
          });
          await tx.dispatchEvent.create({
            data: {
              organizationId: job.organizationId,
              dispatchJobId: job.id,
              action: "dispatch.leased",
              previousState: job.status,
              nextState: "leased",
              metadata: { attemptId: attempt.id, attemptNumber } as Prisma.InputJsonValue,
            },
          });
          leased.push(job.id);
        }
        return leased;
      });

      const instructions: DispatchInstruction[] = [];
      for (const jobId of jobs) {
        const instruction = await this.instructionForDispatch(jobId);
        if (instruction) {
          instructions.push(instruction);
        }
      }
      return instructions;
    } finally {
      await this.releaseDispatchLock();
    }
  }

  async startDispatchAttempt(input: InternalDispatchStartInput): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const job = await tx.dispatchJob.findUnique({ where: { id: input.dispatchJobId } });
      if (!job) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Dispatch job not found");
      }
      await tx.dispatchJob.update({
        where: { id: input.dispatchJobId },
        data: {
          status: "running",
          leasedUntil: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
      await tx.runAttempt.update({
        where: { id: input.attemptId },
        data: {
          status: "running",
          startedAt: now,
        },
      });
      await tx.run.update({
        where: { id: job.runId },
        data: {
          status: "running",
          startedAt: now,
          attempt: input.attemptNumber,
        },
      });
    });
  }

  async completeDispatchAttempt(input: InternalDispatchCompleteInput): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const job = await tx.dispatchJob.findUnique({
        where: { id: input.dispatchJobId },
        include: { task: true, run: true },
      });
      if (!job) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Dispatch job not found");
      }
      const policy = retryPolicyForTask(job.task);
      const success = input.status === "success";
      const retryWindowExpired = job.retryWindowEndsAt !== null && job.retryWindowEndsAt.getTime() <= Date.now();
      const attemptsExhausted = job.attemptCount >= job.maxAttempts;
      const shouldRetry = !success && input.status !== "terminal_client_error" && !retryWindowExpired && !attemptsExhausted;

      await tx.runAttempt.update({
        where: { id: input.attemptId },
        data: {
          status: input.status,
          completedAt: now,
          durationMs: input.durationMs,
          httpStatus: input.httpStatus ?? null,
          errorClass: input.errorClass ?? null,
          errorMessage: input.errorMessage ?? null,
          responseBodyPreview: input.responseBodyPreview ?? null,
          responseBodyHash: input.responseBodyHash ?? null,
          output: input.output ? (input.output as Prisma.InputJsonValue) : Prisma.JsonNull,
          logs: input.logs ?? null,
        },
      });

      if (shouldRetry) {
        await tx.dispatchJob.update({
          where: { id: job.id },
          data: {
            status: "retry_wait",
            leaseOwner: null,
            leasedUntil: null,
            availableAt: new Date(Date.now() + computeRetryDelayMs(policy, job.attemptCount)),
            lastError: input.errorMessage ?? input.errorClass ?? "delivery failed",
          },
        });
        await tx.run.update({
          where: { id: job.runId },
          data: {
            status: "retry_wait",
            attempt: input.attemptNumber,
            durationMs: input.durationMs,
            errorMessage: input.errorMessage ?? undefined,
          },
        });
        return;
      }

      const finalStatus: RunStatus = success
        ? "success"
        : input.status === "timeout"
          ? "timeout"
          : input.status === "terminal_client_error"
            ? "terminal_client_error"
            : retryWindowExpired
              ? "retry_window_expired"
              : "dead_lettered";

      await tx.dispatchJob.update({
        where: { id: job.id },
        data: {
          status: success ? "succeeded" : "dead_lettered",
          leaseOwner: null,
          leasedUntil: null,
          lastError: input.errorMessage ?? null,
        },
      });
      await tx.run.update({
        where: { id: job.runId },
        data: {
          status: finalStatus,
          attempt: input.attemptNumber,
          completedAt: now,
          durationMs: input.durationMs,
          output: input.output ? (input.output as Prisma.InputJsonValue) : undefined,
          logs: input.logs ?? undefined,
          errorMessage: input.errorMessage ?? (success ? null : undefined),
        },
      });
      if (isTerminalRunStatus(finalStatus)) {
        const nextRunCount = job.task.runCount + 1;
        const shouldPause = job.task.kind === "scheduled"
          && (isMaxRunsReached(nextRunCount, job.task.maxRuns) || isExpiredAt(isoNullable(job.task.expiresAt)));
        await tx.task.update({
          where: { id: job.taskId },
          data: {
            runCount: nextRunCount,
            active: shouldPause ? false : job.task.active,
            nextRunAt: shouldPause ? null : job.task.nextRunAt,
          },
        });
      }
    });
  }

  async reconcileDispatches(limit = 100): Promise<{ repaired: number }> {
    const expired = await this.prisma.dispatchJob.findMany({
      where: {
        status: { in: ["leased", "running"] },
        leasedUntil: { lt: new Date() },
      },
      take: limit,
    });
    for (const job of expired) {
      await this.prisma.dispatchJob.update({
        where: { id: job.id },
        data: {
          status: "retry_wait",
          leaseOwner: null,
          leasedUntil: null,
          availableAt: new Date(),
          lastError: "lease expired",
        },
      });
      await this.prisma.run.update({
        where: { id: job.runId },
        data: {
          status: "retry_wait",
          errorMessage: "Dispatch lease expired; retry scheduled.",
        },
      });
    }
    return { repaired: expired.length };
  }
}
