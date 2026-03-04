import { Prisma, PrismaClient } from "@prisma/client";
import {
  type AuditEventListInput,
  type AuditEventRecord,
  PLAN_LIMITS,
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
  type InternalRunStatusInput,
  type ProjectCreateInput,
  type ProjectRecord,
  type RunRecord,
  type ScheduleConfig,
  type ScheduleType,
  type SecretCreateInput,
  type SecretPatchInput,
  type SecretRecord,
  type TaskCreateInput,
  type TaskPatchInput,
  type TaskRecord,
  type UsageSnapshot,
} from "@cronlet/cloud-shared";
import { ERROR_CODES } from "@cronlet/cloud-shared";
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

function toProjectRecord(value: {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}): ProjectRecord {
  return {
    id: value.id,
    orgId: value.organizationId,
    name: value.name,
    slug: value.slug,
    createdAt: iso(value.createdAt),
    updatedAt: iso(value.updatedAt),
  };
}

function toTaskRecord(value: {
  id: string;
  organizationId: string;
  projectId: string;
  name: string;
  description: string | null;
  handlerType: string;
  handlerConfig: unknown;
  scheduleType: string;
  scheduleConfig: unknown;
  timezone: string;
  nextRunAt: Date | null;
  retryAttempts: number;
  retryBackoff: string;
  retryDelay: string;
  timeout: string;
  active: boolean;
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
    projectId: value.projectId,
    name: value.name,
    description: value.description,
    handlerType: value.handlerType as HandlerType,
    handlerConfig: value.handlerConfig as HandlerConfig,
    scheduleType: value.scheduleType as ScheduleType,
    scheduleConfig: value.scheduleConfig as ScheduleConfig,
    timezone: value.timezone,
    nextRunAt: isoNullable(value.nextRunAt),
    retryAttempts: value.retryAttempts,
    retryBackoff: value.retryBackoff as "linear" | "exponential",
    retryDelay: value.retryDelay,
    timeout: value.timeout,
    active: value.active,
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
  projectId: string;
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
    projectId: value.projectId,
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
  projectId: string;
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
    projectId: value.projectId,
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
  private readonly dispatchQueue: DispatchInstruction[] = [];
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
      },
      create: {
        id: orgId,
        clerkOrgId: orgId,
        name: name ?? `Organization ${orgId}`,
        slug: orgSlug(orgId, slug),
      },
    });
  }

  private async assertProjectAccess(orgId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: orgId,
      },
      select: { id: true },
    });

    if (!project) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Project not found");
    }
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

  // ============================================
  // PROJECTS
  // ============================================

  async listProjects(orgId: string): Promise<ProjectRecord[]> {
    const projects = await this.prisma.project.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
    return projects.map(toProjectRecord);
  }

  async createProject(orgId: string, input: ProjectCreateInput): Promise<ProjectRecord> {
    await this.assertWritable(orgId);
    await this.ensureOrganization(orgId);

    try {
      const created = await this.prisma.project.create({
        data: {
          organizationId: orgId,
          name: input.name,
          slug: input.slug,
        },
      });
      return toProjectRecord(created);
    } catch {
      throw new AppError(409, ERROR_CODES.VALIDATION_ERROR, "Project slug already exists");
    }
  }

  // ============================================
  // TASKS
  // ============================================

  async listTasks(orgId: string, projectId?: string): Promise<TaskRecord[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId: orgId,
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return tasks.map(toTaskRecord);
  }

  async getTask(orgId: string, taskId: string): Promise<TaskRecord> {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        organizationId: orgId,
      },
    });
    if (!task) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Task not found");
    }
    return toTaskRecord(task);
  }

  async createTask(orgId: string, input: TaskCreateInput, createdBy?: CreatedBy): Promise<TaskRecord> {
    await this.assertWritable(orgId);
    await this.assertProjectAccess(orgId, input.projectId);

    const scheduleConfig = input.schedule;
    const handlerConfig = input.handler;
    const active = input.active !== false;

    const nextRunAt = active
      ? computeNextRun(scheduleConfig, input.timezone ?? "UTC")
      : null;

    const created = await this.prisma.task.create({
      data: {
        organizationId: orgId,
        projectId: input.projectId,
        name: input.name,
        description: input.description ?? null,
        handlerType: handlerConfig.type,
        handlerConfig: handlerConfig as unknown as Prisma.InputJsonValue,
        scheduleType: scheduleConfig.type,
        scheduleConfig: scheduleConfig as unknown as Prisma.InputJsonValue,
        timezone: input.timezone ?? "UTC",
        nextRunAt: nextRunAt ? new Date(nextRunAt) : null,
        retryAttempts: input.retryAttempts ?? 1,
        retryBackoff: input.retryBackoff ?? "linear",
        retryDelay: input.retryDelay ?? "1s",
        timeout: input.timeout ?? "30s",
        active,
        createdBy: createdBy ? (createdBy as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
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
      },
    });
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Task not found");
    }

    const scheduleConfig = input.schedule ?? (existing.scheduleConfig as unknown as ScheduleConfig);
    const handlerConfig = input.handler ?? (existing.handlerConfig as unknown as HandlerConfig);
    const timezone = input.timezone ?? existing.timezone;
    const active = input.active ?? existing.active;

    // Recompute nextRunAt if schedule, timezone, or active status changed
    const needsNextRunUpdate =
      input.schedule !== undefined ||
      input.timezone !== undefined ||
      input.active !== undefined;

    const nextRunAt = needsNextRunUpdate
      ? (active ? computeNextRun(scheduleConfig, timezone) : null)
      : isoNullable(existing.nextRunAt);

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        name: input.name ?? existing.name,
        description: input.description === null ? null : (input.description ?? existing.description),
        handlerType: handlerConfig.type,
        handlerConfig: handlerConfig as unknown as Prisma.InputJsonValue,
        scheduleType: scheduleConfig.type,
        scheduleConfig: scheduleConfig as unknown as Prisma.InputJsonValue,
        timezone,
        nextRunAt: nextRunAt ? new Date(nextRunAt) : null,
        retryAttempts: input.retryAttempts ?? existing.retryAttempts,
        retryBackoff: input.retryBackoff ?? existing.retryBackoff,
        retryDelay: input.retryDelay ?? existing.retryDelay,
        timeout: input.timeout ?? existing.timeout,
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

  async triggerTask(orgId: string, taskId: string, trigger: "manual" | "api"): Promise<RunRecord> {
    await this.assertWritable(orgId);
    await this.assertWithinRunLimit(orgId);

    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        organizationId: orgId,
      },
    });
    if (!task) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Task not found");
    }

    await this.incrementUsage(orgId);

    const run = await this.prisma.run.create({
      data: {
        organizationId: orgId,
        projectId: task.projectId,
        taskId: task.id,
        status: "queued",
        trigger,
        attempt: 1,
      },
    });

    const timeoutMs = parseDuration(task.timeout);

    this.dispatchQueue.push({
      runId: run.id,
      orgId,
      projectId: task.projectId,
      taskId: task.id,
      handlerType: task.handlerType as HandlerType,
      handlerConfig: task.handlerConfig as unknown as HandlerConfig,
      timeoutMs,
      retryAttempts: task.retryAttempts,
      retryBackoff: task.retryBackoff as "linear" | "exponential",
      retryDelay: task.retryDelay,
      callbackUrl: task.callbackUrl,
      metadata: task.metadata as Record<string, unknown> | null,
      maxRuns: task.maxRuns,
      runCount: task.runCount,
    });

    return toRunRecord(run);
  }

  // ============================================
  // RUNS
  // ============================================

  async listRuns(orgId: string, taskId?: string, limit = 100): Promise<RunRecord[]> {
    const runs = await this.prisma.run.findMany({
      where: {
        organizationId: orgId,
        ...(taskId ? { taskId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
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

  async updateRunStatus(runId: string, input: InternalRunStatusInput): Promise<RunRecord> {
    const existing = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Run not found");
    }

    // Don't update if already in terminal state
    if (existing.status === "success" || existing.status === "failure" || existing.status === "timeout") {
      return toRunRecord(existing);
    }

    // Don't process old attempts
    if (input.attempt < existing.attempt) {
      return toRunRecord(existing);
    }

    const isTerminal = input.status === "success" || input.status === "failure" || input.status === "timeout";

    const updated = await this.prisma.run.update({
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
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Secret not found");
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
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Secret not found");
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
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Secret not found");
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
    await this.assertProjectAccess(orgId, input.projectId);

    const created = await this.prisma.alert.create({
      data: {
        organizationId: orgId,
        projectId: input.projectId,
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

  // ============================================
  // WORKER DISPATCH
  // ============================================

  async claimDueDispatches(limit = 100): Promise<DispatchInstruction[]> {
    const lockAcquired = await this.tryClaimDispatchLock();
    if (!lockAcquired) {
      return [];
    }

    try {
      const now = new Date();
      const dueTasks = await this.prisma.task.findMany({
        where: {
          active: true,
          nextRunAt: { lte: now },
        },
        orderBy: { nextRunAt: "asc" },
        take: limit,
      });

      for (const task of dueTasks) {
        const entitlement = await this.getBillingState(task.organizationId);
        if (entitlement.delinquent && !this.isGracePeriodActive(entitlement.graceEndsAt, now)) {
          continue;
        }

        const scheduleConfig = task.scheduleConfig as unknown as ScheduleConfig;
        const nextRunAt = computeNextRun(scheduleConfig, task.timezone, now);

        const run = await this.prisma.$transaction(async (tx) => {
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
            return null;
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
            return null;
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

          // Create run
          return tx.run.create({
            data: {
              organizationId: task.organizationId,
              projectId: task.projectId,
              taskId: task.id,
              status: "queued",
              trigger: "schedule",
              attempt: 1,
              scheduledAt: task.nextRunAt,
            },
          });
        });

        if (!run) {
          continue;
        }

        const timeoutMs = parseDuration(task.timeout);

        this.dispatchQueue.push({
          runId: run.id,
          orgId: task.organizationId,
          projectId: task.projectId,
          taskId: task.id,
          handlerType: task.handlerType as HandlerType,
          handlerConfig: task.handlerConfig as unknown as HandlerConfig,
          timeoutMs,
          retryAttempts: task.retryAttempts,
          retryBackoff: task.retryBackoff as "linear" | "exponential",
          retryDelay: task.retryDelay,
          callbackUrl: task.callbackUrl,
          metadata: task.metadata as Record<string, unknown> | null,
          maxRuns: task.maxRuns,
          runCount: task.runCount,
        });
      }

      return this.dispatchQueue.splice(0, limit);
    } finally {
      await this.releaseDispatchLock();
    }
  }
}
