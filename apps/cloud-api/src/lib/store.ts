import {
  type AuditEventListInput,
  type AuditEventRecord,
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
  type HandlerType,
  type InternalRunStatusInput,
  type PlanTier,
  type RunRecord,
  type ScheduleType,
  type SecretCreateInput,
  type SecretPatchInput,
  type SecretRecord,
  type TaskCreateInput,
  type TaskPatchInput,
  type TaskRecord,
  type UsageSnapshot,
  parseDuration,
} from "@cronlet/shared";
import { ERROR_CODES } from "@cronlet/shared";
import { nanoid } from "nanoid";
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
  // Internal fields not exposed via API
}

interface InternalSecretRecord extends SecretRecord {
  encryptedValue: string;
}

export class InMemoryCloudStore implements CloudStore {
  private readonly tasks = new Map<string, InternalTaskRecord>();
  private readonly runs = new Map<string, RunRecord>();
  private readonly secrets = new Map<string, InternalSecretRecord>();
  private readonly alerts = new Map<string, AlertRecord>();
  private readonly apiKeys = new Map<string, ApiKeyRecord & { keyHash: string }>();
  private readonly auditEvents = new Map<string, AuditEventRecord>();
  private readonly usage = new Map<string, number>();
  private readonly entitlements = new Map<string, OrgEntitlement>();
  private readonly dispatchQueue: DispatchInstruction[] = [];

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

  // ============================================
  // TASKS
  // ============================================

  listTasks(orgId: string): TaskRecord[] {
    return Array.from(this.tasks.values())
      .filter((task) => task.orgId === orgId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getTask(orgId: string, taskId: string): TaskRecord {
    const task = this.tasks.get(taskId);
    if (!task || task.orgId !== orgId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Task not found");
    }
    return task;
  }

  createTask(orgId: string, input: TaskCreateInput, createdBy?: CreatedBy): TaskRecord {
    this.assertWritable(orgId);

    const now = nowIso();
    const scheduleConfig = input.schedule;
    const handlerConfig = input.handler;

    const nextRunAt = input.active !== false
      ? computeNextRun(scheduleConfig, input.timezone ?? "UTC")
      : null;

    const task: InternalTaskRecord = {
      id: nanoid(),
      orgId,
      name: input.name,
      description: input.description ?? null,
      handlerType: handlerConfig.type as HandlerType,
      handlerConfig,
      scheduleType: scheduleConfig.type as ScheduleType,
      scheduleConfig,
      timezone: input.timezone ?? "UTC",
      nextRunAt,
      retryAttempts: input.retryAttempts ?? 1,
      retryBackoff: input.retryBackoff ?? "linear",
      retryDelay: input.retryDelay ?? "1s",
      timeout: input.timeout ?? "30s",
      active: input.active !== false,
      createdBy: createdBy ?? null,
      callbackUrl: input.callbackUrl ?? null,
      metadata: input.metadata ?? null,
      maxRuns: input.maxRuns ?? null,
      expiresAt: input.expiresAt ?? null,
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(task.id, task);
    return task;
  }

  patchTask(orgId: string, taskId: string, input: TaskPatchInput): TaskRecord {
    this.assertWritable(orgId);

    const task = this.tasks.get(taskId);
    if (!task || task.orgId !== orgId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Task not found");
    }

    const scheduleConfig = input.schedule ?? task.scheduleConfig;
    const handlerConfig = input.handler ?? task.handlerConfig;
    const timezone = input.timezone ?? task.timezone;
    const active = input.active ?? task.active;

    // Recompute nextRunAt if schedule, timezone, or active status changed
    const needsNextRunUpdate =
      input.schedule !== undefined ||
      input.timezone !== undefined ||
      input.active !== undefined;

    const nextRunAt = needsNextRunUpdate
      ? (active ? computeNextRun(scheduleConfig, timezone) : null)
      : task.nextRunAt;

    const updated: InternalTaskRecord = {
      ...task,
      name: input.name ?? task.name,
      description: input.description === null ? null : (input.description ?? task.description),
      handlerType: handlerConfig.type as HandlerType,
      handlerConfig,
      scheduleType: scheduleConfig.type as ScheduleType,
      scheduleConfig,
      timezone,
      nextRunAt,
      retryAttempts: input.retryAttempts ?? task.retryAttempts,
      retryBackoff: input.retryBackoff ?? task.retryBackoff,
      retryDelay: input.retryDelay ?? task.retryDelay,
      timeout: input.timeout ?? task.timeout,
      active,
      updatedAt: nowIso(),
    };

    this.tasks.set(taskId, updated);
    return updated;
  }

  deleteTask(orgId: string, taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.orgId !== orgId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Task not found");
    }
    this.tasks.delete(taskId);
  }

  triggerTask(orgId: string, taskId: string, trigger: "manual" | "api"): RunRecord {
    this.assertWritable(orgId);
    this.assertWithinRunLimit(orgId);

    const task = this.tasks.get(taskId);
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

    const timeoutMs = parseDuration(task.timeout);

    this.dispatchQueue.push({
      runId: run.id,
      orgId,
      taskId: task.id,
      handlerType: task.handlerType,
      handlerConfig: task.handlerConfig,
      timeoutMs,
      retryAttempts: task.retryAttempts,
      retryBackoff: task.retryBackoff,
      retryDelay: task.retryDelay,
      callbackUrl: task.callbackUrl,
      metadata: task.metadata,
      maxRuns: task.maxRuns,
      runCount: task.runCount,
    });

    return run;
  }

  // ============================================
  // RUNS
  // ============================================

  listRuns(orgId: string, taskId?: string, limit = 100): RunRecord[] {
    return Array.from(this.runs.values())
      .filter((run) => run.orgId === orgId && (!taskId || run.taskId === taskId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  getRun(orgId: string, runId: string): RunRecord {
    const run = this.runs.get(runId);
    if (!run || run.orgId !== orgId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Run not found");
    }
    return run;
  }

  updateRunStatus(runId: string, input: InternalRunStatusInput): RunRecord {
    const run = this.runs.get(runId);
    if (!run) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Run not found");
    }

    // Don't update if already in a terminal state
    if (run.status === "success" || run.status === "failure" || run.status === "timeout") {
      return run;
    }

    // Don't process old attempts
    if (input.attempt < run.attempt) {
      return run;
    }

    const now = nowIso();
    const isTerminal = input.status === "success" || input.status === "failure" || input.status === "timeout";

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

  upsertOrganization(_input: OrganizationUpsertInput): void {
    // In-memory mode uses org identifiers directly from request auth context.
  }

  upsertEntitlementForOrg(orgId: string, input: EntitlementUpdateInput): void {
    this.entitlements.set(orgId, {
      tier: input.tier,
      delinquent: input.delinquent,
      graceEndsAt: input.graceEndsAt,
    });
  }

  // ============================================
  // WORKER DISPATCH
  // ============================================

  claimDueDispatches(limit = 100): DispatchInstruction[] {
    const now = new Date();

    for (const task of this.tasks.values()) {
      if (!task.active || !task.nextRunAt) {
        continue;
      }

      const dueAt = new Date(task.nextRunAt);
      if (dueAt.getTime() > now.getTime()) {
        continue;
      }

      const entitlement = this.getEntitlement(task.orgId);
      if (!this.isGracePeriodActive(entitlement, now.getTime())) {
        continue;
      }

      // Create the run
      const runNow = nowIso();
      const run: RunRecord = {
        id: nanoid(),
        orgId: task.orgId,
        taskId: task.id,
        status: "queued",
        trigger: "schedule",
        attempt: 1,
        scheduledAt: task.nextRunAt,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        output: null,
        logs: null,
        errorMessage: null,
        createdAt: runNow,
      };
      this.runs.set(run.id, run);
      this.incrementUsage(task.orgId);

      const timeoutMs = parseDuration(task.timeout);

      this.dispatchQueue.push({
        runId: run.id,
        orgId: task.orgId,
        taskId: task.id,
        handlerType: task.handlerType,
        handlerConfig: task.handlerConfig,
        timeoutMs,
        retryAttempts: task.retryAttempts,
        retryBackoff: task.retryBackoff,
        retryDelay: task.retryDelay,
        callbackUrl: task.callbackUrl,
        metadata: task.metadata,
        maxRuns: task.maxRuns,
        runCount: task.runCount,
      });

      // Update next run time
      const nextRunAt = computeNextRun(task.scheduleConfig, task.timezone, now);
      this.tasks.set(task.id, {
        ...task,
        nextRunAt,
        updatedAt: nowIso(),
      });
    }

    return this.dispatchQueue.splice(0, limit);
  }
}
