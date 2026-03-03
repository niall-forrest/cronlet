import {
  PLAN_LIMITS,
  type ApiKeyCreateInput,
  type ApiKeyRecord,
  type ApiKeyRotateInput,
  type ApiKeyWithToken,
  formatYearMonth,
  type AlertCreateInput,
  type AlertRecord,
  type EndpointCreateInput,
  type EndpointPatchInput,
  type EndpointRecord,
  type DispatchInstruction,
  type JobCreateInput,
  type JobPatchInput,
  type JobRecord,
  type PlanTier,
  type ProjectCreateInput,
  type ProjectRecord,
  type RunRecord,
  type RunStatus,
  type ScheduleCreateInput,
  type SchedulePatchInput,
  type ScheduleRecord,
  type UsageSnapshot,
} from "@cronlet/cloud-shared";
import { ERROR_CODES } from "@cronlet/cloud-shared";
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

export class InMemoryCloudStore implements CloudStore {
  private readonly projects = new Map<string, ProjectRecord>();
  private readonly endpoints = new Map<string, EndpointRecord>();
  private readonly jobs = new Map<string, JobRecord>();
  private readonly schedules = new Map<string, ScheduleRecord>();
  private readonly runs = new Map<string, RunRecord>();
  private readonly alerts = new Map<string, AlertRecord>();
  private readonly apiKeys = new Map<string, ApiKeyRecord & { keyHash: string }>();
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

  private assertProjectAccess(orgId: string, projectId: string): ProjectRecord {
    const project = this.projects.get(projectId);
    if (!project || project.orgId !== orgId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Project not found");
    }
    return project;
  }

  private assertWritable(orgId: string): void {
    const entitlement = this.getEntitlement(orgId);
    if (!entitlement.delinquent) {
      return;
    }

    const graceEndsAt = entitlement.graceEndsAt ? new Date(entitlement.graceEndsAt) : null;
    if (graceEndsAt && graceEndsAt.getTime() > Date.now()) {
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

  listProjects(orgId: string): ProjectRecord[] {
    return Array.from(this.projects.values()).filter((item) => item.orgId === orgId);
  }

  createProject(orgId: string, input: ProjectCreateInput): ProjectRecord {
    this.assertWritable(orgId);
    const now = nowIso();

    const duplicateSlug = Array.from(this.projects.values()).some(
      (project) => project.orgId === orgId && project.slug === input.slug
    );
    if (duplicateSlug) {
      throw new AppError(409, ERROR_CODES.VALIDATION_ERROR, "Project slug already exists");
    }

    const created: ProjectRecord = {
      id: nanoid(),
      orgId,
      name: input.name,
      slug: input.slug,
      createdAt: now,
      updatedAt: now,
    };

    this.projects.set(created.id, created);
    return created;
  }

  listEndpoints(orgId: string): EndpointRecord[] {
    return Array.from(this.endpoints.values()).filter((item) => item.orgId === orgId);
  }

  createEndpoint(orgId: string, input: EndpointCreateInput): EndpointRecord {
    this.assertWritable(orgId);
    this.assertProjectAccess(orgId, input.projectId);
    const now = nowIso();

    const created: EndpointRecord = {
      id: nanoid(),
      orgId,
      projectId: input.projectId,
      environment: input.environment,
      name: input.name,
      url: input.url,
      authMode: input.authMode,
      authSecretRef: input.authSecretRef ?? null,
      timeoutMs: input.timeoutMs,
      createdAt: now,
      updatedAt: now,
    };

    this.endpoints.set(created.id, created);
    return created;
  }

  patchEndpoint(orgId: string, endpointId: string, input: EndpointPatchInput): EndpointRecord {
    this.assertWritable(orgId);

    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint || endpoint.orgId !== orgId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Endpoint not found");
    }

    const updated: EndpointRecord = {
      ...endpoint,
      name: input.name ?? endpoint.name,
      url: input.url ?? endpoint.url,
      authMode: input.authMode ?? endpoint.authMode,
      authSecretRef: input.authSecretRef ?? endpoint.authSecretRef,
      timeoutMs: input.timeoutMs ?? endpoint.timeoutMs,
      updatedAt: nowIso(),
    };

    this.endpoints.set(endpointId, updated);
    return updated;
  }

  listJobs(orgId: string): JobRecord[] {
    return Array.from(this.jobs.values()).filter((item) => item.orgId === orgId);
  }

  listSchedules(orgId: string): ScheduleRecord[] {
    return Array.from(this.schedules.values()).filter((item) => item.orgId === orgId);
  }

  createJob(orgId: string, input: JobCreateInput): JobRecord {
    this.assertWritable(orgId);
    this.assertProjectAccess(orgId, input.projectId);

    const endpoint = this.endpoints.get(input.endpointId);
    if (!endpoint || endpoint.orgId !== orgId || endpoint.projectId !== input.projectId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Endpoint not found for project");
    }

    const now = nowIso();
    const duplicateKey = Array.from(this.jobs.values()).some(
      (job) => job.orgId === orgId && job.key === input.key
    );
    if (duplicateKey) {
      throw new AppError(409, ERROR_CODES.VALIDATION_ERROR, "Job key already exists for organization");
    }

    const created: JobRecord = {
      id: nanoid(),
      orgId,
      projectId: input.projectId,
      environment: input.environment,
      endpointId: input.endpointId,
      name: input.name,
      key: input.key,
      concurrency: input.concurrency,
      catchup: input.catchup,
      retryAttempts: input.retryAttempts,
      retryBackoff: input.retryBackoff,
      retryInitialDelay: input.retryInitialDelay,
      timeout: input.timeout,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(created.id, created);
    return created;
  }

  patchJob(orgId: string, jobId: string, input: JobPatchInput): JobRecord {
    this.assertWritable(orgId);

    const job = this.jobs.get(jobId);
    if (!job || job.orgId !== orgId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Job not found");
    }

    const updated: JobRecord = {
      ...job,
      name: input.name ?? job.name,
      concurrency: input.concurrency ?? job.concurrency,
      catchup: input.catchup ?? job.catchup,
      retryAttempts: input.retryAttempts ?? job.retryAttempts,
      retryBackoff: input.retryBackoff ?? job.retryBackoff,
      retryInitialDelay: input.retryInitialDelay ?? job.retryInitialDelay,
      timeout: input.timeout ?? job.timeout,
      active: input.active ?? job.active,
      updatedAt: nowIso(),
    };

    this.jobs.set(jobId, updated);
    return updated;
  }

  createSchedule(orgId: string, input: ScheduleCreateInput): ScheduleRecord {
    this.assertWritable(orgId);

    const job = this.jobs.get(input.jobId);
    if (!job || job.orgId !== orgId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Job not found");
    }

    const now = nowIso();
    const created: ScheduleRecord = {
      id: nanoid(),
      orgId,
      projectId: job.projectId,
      jobId: job.id,
      cron: input.cron,
      timezone: input.timezone,
      active: input.active,
      nextRunAt: input.active ? computeNextRun(input.cron, input.timezone) : null,
      createdAt: now,
      updatedAt: now,
    };

    this.schedules.set(created.id, created);
    return created;
  }

  patchSchedule(orgId: string, scheduleId: string, input: SchedulePatchInput): ScheduleRecord {
    this.assertWritable(orgId);

    const schedule = this.schedules.get(scheduleId);
    if (!schedule || schedule.orgId !== orgId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Schedule not found");
    }

    const nextCron = input.cron ?? schedule.cron;
    const nextTimezone = input.timezone ?? schedule.timezone;
    const nextActive = input.active ?? schedule.active;

    const updated: ScheduleRecord = {
      ...schedule,
      cron: nextCron,
      timezone: nextTimezone,
      active: nextActive,
      nextRunAt: nextActive ? computeNextRun(nextCron, nextTimezone) : null,
      updatedAt: nowIso(),
    };

    this.schedules.set(scheduleId, updated);
    return updated;
  }

  triggerJob(orgId: string, jobId: string, trigger: "manual" | "schedule", scheduleId: string | null): RunRecord {
    this.assertWritable(orgId);
    this.assertWithinRunLimit(orgId);

    const job = this.jobs.get(jobId);
    if (!job || job.orgId !== orgId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Job not found");
    }

    const endpoint = this.endpoints.get(job.endpointId);
    if (!endpoint || endpoint.orgId !== orgId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Endpoint for job not found");
    }

    const now = nowIso();
    const run: RunRecord = {
      id: nanoid(),
      orgId,
      projectId: job.projectId,
      jobId: job.id,
      scheduleId,
      status: "queued",
      attempt: 0,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      errorMessage: null,
      trigger,
      createdAt: now,
      updatedAt: now,
    };

    this.runs.set(run.id, run);
    this.incrementUsage(orgId);

    this.dispatchQueue.push({
      runId: run.id,
      orgId,
      projectId: job.projectId,
      jobId: job.id,
      endpointUrl: endpoint.url,
      authMode: endpoint.authMode,
      authSecretRef: endpoint.authSecretRef,
      timeoutMs: endpoint.timeoutMs,
      retryAttempts: job.retryAttempts,
      retryBackoff: job.retryBackoff,
      retryInitialDelay: job.retryInitialDelay,
    });

    return run;
  }

  listRuns(orgId: string): RunRecord[] {
    return Array.from(this.runs.values())
      .filter((run) => run.orgId === orgId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getRun(orgId: string, runId: string): RunRecord {
    const run = this.runs.get(runId);
    if (!run || run.orgId !== orgId) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Run not found");
    }
    return run;
  }

  listAlerts(orgId: string): AlertRecord[] {
    return Array.from(this.alerts.values()).filter((item) => item.orgId === orgId);
  }

  createAlert(orgId: string, input: AlertCreateInput): AlertRecord {
    this.assertWritable(orgId);
    this.assertProjectAccess(orgId, input.projectId);

    const now = nowIso();
    const created: AlertRecord = {
      id: nanoid(),
      orgId,
      projectId: input.projectId,
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

  claimDueDispatches(limit = 100): DispatchInstruction[] {
    const now = new Date();

    for (const schedule of this.schedules.values()) {
      if (!schedule.active || !schedule.nextRunAt) {
        continue;
      }

      const dueAt = new Date(schedule.nextRunAt);
      if (dueAt.getTime() > now.getTime()) {
        continue;
      }

      const entitlement = this.getEntitlement(schedule.orgId);
      if (entitlement.delinquent) {
        continue;
      }

      this.triggerJob(schedule.orgId, schedule.jobId, "schedule", schedule.id);

      const nextRunAt = computeNextRun(schedule.cron, schedule.timezone, now);
      this.schedules.set(schedule.id, {
        ...schedule,
        nextRunAt,
        updatedAt: nowIso(),
      });
    }

    return this.dispatchQueue.splice(0, limit);
  }

  updateRunStatus(runId: string, status: RunStatus, attempt: number, durationMs?: number, errorMessage?: string): RunRecord {
    const run = this.runs.get(runId);
    if (!run) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Run not found");
    }

    if (run.status === "success" || run.status === "failure" || run.status === "timeout") {
      return run;
    }
    if (attempt < run.attempt) {
      return run;
    }

    const now = nowIso();
    const next: RunRecord = {
      ...run,
      status,
      attempt,
      startedAt: status === "running" && !run.startedAt ? now : run.startedAt,
      completedAt: status === "success" || status === "failure" || status === "timeout" ? now : null,
      durationMs: durationMs ?? run.durationMs,
      errorMessage: errorMessage ?? (status === "success" ? null : run.errorMessage),
      updatedAt: now,
    };

    this.runs.set(run.id, next);
    return next;
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
}
