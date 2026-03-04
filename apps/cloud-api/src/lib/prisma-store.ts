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
  type AlertCreateInput,
  type AlertRecord,
  type DispatchInstruction,
  type EndpointCreateInput,
  type EndpointPatchInput,
  type EndpointRecord,
  type JobCreateInput,
  type JobPatchInput,
  type JobRecord,
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

function toEndpointRecord(value: {
  id: string;
  organizationId: string;
  projectId: string;
  name: string;
  url: string;
  authMode: EndpointRecord["authMode"];
  authSecretRef: string | null;
  timeoutMs: number;
  createdAt: Date;
  updatedAt: Date;
  environment: { name: string } | null;
}): EndpointRecord {
  return {
    id: value.id,
    orgId: value.organizationId,
    projectId: value.projectId,
    environment: value.environment?.name ?? "prod",
    name: value.name,
    url: value.url,
    authMode: value.authMode,
    authSecretRef: value.authSecretRef,
    timeoutMs: value.timeoutMs,
    createdAt: iso(value.createdAt),
    updatedAt: iso(value.updatedAt),
  };
}

function toJobRecord(value: {
  id: string;
  organizationId: string;
  projectId: string;
  endpointId: string;
  name: string;
  jobKey: string;
  concurrency: JobRecord["concurrency"];
  catchup: boolean;
  retryAttempts: number;
  retryBackoff: string;
  retryInitialDelay: string;
  timeout: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  environment: { name: string } | null;
}): JobRecord {
  const retryBackoff = value.retryBackoff === "exponential" ? "exponential" : "linear";
  return {
    id: value.id,
    orgId: value.organizationId,
    projectId: value.projectId,
    environment: value.environment?.name ?? "prod",
    endpointId: value.endpointId,
    name: value.name,
    key: value.jobKey,
    concurrency: value.concurrency,
    catchup: value.catchup,
    retryAttempts: value.retryAttempts,
    retryBackoff,
    retryInitialDelay: value.retryInitialDelay,
    timeout: value.timeout,
    active: value.active,
    createdAt: iso(value.createdAt),
    updatedAt: iso(value.updatedAt),
  };
}

function toScheduleRecord(value: {
  id: string;
  organizationId: string;
  projectId: string;
  jobId: string;
  cron: string;
  timezone: string;
  active: boolean;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ScheduleRecord {
  return {
    id: value.id,
    orgId: value.organizationId,
    projectId: value.projectId,
    jobId: value.jobId,
    cron: value.cron,
    timezone: value.timezone,
    active: value.active,
    nextRunAt: isoNullable(value.nextRunAt),
    createdAt: iso(value.createdAt),
    updatedAt: iso(value.updatedAt),
  };
}

function toRunRecord(value: {
  id: string;
  organizationId: string;
  projectId: string;
  jobId: string;
  scheduleId: string | null;
  status: RunStatus;
  attempt: number;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  errorMessage: string | null;
  trigger: string;
  createdAt: Date;
  updatedAt: Date;
}): RunRecord {
  const trigger = value.trigger === "schedule" ? "schedule" : "manual";
  return {
    id: value.id,
    orgId: value.organizationId,
    projectId: value.projectId,
    jobId: value.jobId,
    scheduleId: value.scheduleId,
    status: value.status,
    attempt: value.attempt,
    startedAt: isoNullable(value.startedAt),
    completedAt: isoNullable(value.completedAt),
    durationMs: value.durationMs,
    errorMessage: value.errorMessage,
    trigger,
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
  private readonly claimLockId = "cronlet_claim_due_schedules";

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

  private async ensureEnvironment(projectId: string, name: string): Promise<{ id: string; name: string }> {
    const environment = await this.prisma.environment.upsert({
      where: { projectId_name: { projectId, name } },
      update: {},
      create: { projectId, name },
    });
    return {
      id: environment.id,
      name: environment.name,
    };
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

  async listEndpoints(orgId: string): Promise<EndpointRecord[]> {
    const endpoints = await this.prisma.endpoint.findMany({
      where: { organizationId: orgId },
      include: {
        environment: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return endpoints.map(toEndpointRecord);
  }

  async createEndpoint(orgId: string, input: EndpointCreateInput): Promise<EndpointRecord> {
    await this.assertWritable(orgId);
    await this.assertProjectAccess(orgId, input.projectId);

    const environment = await this.ensureEnvironment(input.projectId, input.environment);
    const created = await this.prisma.endpoint.create({
      data: {
        organizationId: orgId,
        projectId: input.projectId,
        environmentId: environment.id,
        name: input.name,
        url: input.url,
        authMode: input.authMode,
        authSecretRef: input.authSecretRef ?? null,
        timeoutMs: input.timeoutMs,
      },
      include: {
        environment: {
          select: { name: true },
        },
      },
    });

    return toEndpointRecord(created);
  }

  async patchEndpoint(orgId: string, endpointId: string, input: EndpointPatchInput): Promise<EndpointRecord> {
    await this.assertWritable(orgId);

    const existing = await this.prisma.endpoint.findFirst({
      where: {
        id: endpointId,
        organizationId: orgId,
      },
      include: {
        environment: {
          select: { name: true },
        },
      },
    });
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Endpoint not found");
    }

    const updated = await this.prisma.endpoint.update({
      where: { id: endpointId },
      data: {
        name: input.name ?? existing.name,
        url: input.url ?? existing.url,
        authMode: input.authMode ?? existing.authMode,
        authSecretRef: input.authSecretRef ?? existing.authSecretRef,
        timeoutMs: input.timeoutMs ?? existing.timeoutMs,
      },
      include: {
        environment: {
          select: { name: true },
        },
      },
    });

    return toEndpointRecord(updated);
  }

  async listJobs(orgId: string): Promise<JobRecord[]> {
    const jobs = await this.prisma.job.findMany({
      where: { organizationId: orgId },
      include: {
        environment: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return jobs.map(toJobRecord);
  }

  async createJob(orgId: string, input: JobCreateInput): Promise<JobRecord> {
    await this.assertWritable(orgId);
    await this.assertProjectAccess(orgId, input.projectId);

    const endpoint = await this.prisma.endpoint.findFirst({
      where: {
        id: input.endpointId,
        organizationId: orgId,
        projectId: input.projectId,
      },
      select: { id: true },
    });
    if (!endpoint) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Endpoint not found for project");
    }

    const environment = await this.ensureEnvironment(input.projectId, input.environment);

    try {
      const created = await this.prisma.job.create({
        data: {
          organizationId: orgId,
          projectId: input.projectId,
          environmentId: environment.id,
          endpointId: input.endpointId,
          name: input.name,
          jobKey: input.key,
          concurrency: input.concurrency,
          catchup: input.catchup,
          retryAttempts: input.retryAttempts,
          retryBackoff: input.retryBackoff,
          retryInitialDelay: input.retryInitialDelay,
          timeout: input.timeout,
          active: true,
        },
        include: {
          environment: {
            select: { name: true },
          },
        },
      });
      return toJobRecord(created);
    } catch {
      throw new AppError(409, ERROR_CODES.VALIDATION_ERROR, "Job key already exists for organization");
    }
  }

  async patchJob(orgId: string, jobId: string, input: JobPatchInput): Promise<JobRecord> {
    await this.assertWritable(orgId);

    const existing = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        organizationId: orgId,
      },
      include: {
        environment: {
          select: { name: true },
        },
      },
    });
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Job not found");
    }

    const updated = await this.prisma.job.update({
      where: { id: jobId },
      data: {
        name: input.name ?? existing.name,
        concurrency: input.concurrency ?? existing.concurrency,
        catchup: input.catchup ?? existing.catchup,
        retryAttempts: input.retryAttempts ?? existing.retryAttempts,
        retryBackoff: input.retryBackoff ?? existing.retryBackoff,
        retryInitialDelay: input.retryInitialDelay ?? existing.retryInitialDelay,
        timeout: input.timeout ?? existing.timeout,
        active: input.active ?? existing.active,
      },
      include: {
        environment: {
          select: { name: true },
        },
      },
    });

    return toJobRecord(updated);
  }

  async listSchedules(orgId: string): Promise<ScheduleRecord[]> {
    const schedules = await this.prisma.schedule.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
    return schedules.map(toScheduleRecord);
  }

  async createSchedule(orgId: string, input: ScheduleCreateInput): Promise<ScheduleRecord> {
    await this.assertWritable(orgId);

    const job = await this.prisma.job.findFirst({
      where: {
        id: input.jobId,
        organizationId: orgId,
      },
      select: {
        id: true,
        projectId: true,
      },
    });
    if (!job) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Job not found");
    }

    const created = await this.prisma.schedule.create({
      data: {
        organizationId: orgId,
        projectId: job.projectId,
        jobId: job.id,
        cron: input.cron,
        timezone: input.timezone,
        active: input.active,
        nextRunAt: input.active ? new Date(computeNextRun(input.cron, input.timezone) ?? Date.now()) : null,
      },
    });
    return toScheduleRecord(created);
  }

  async patchSchedule(orgId: string, scheduleId: string, input: SchedulePatchInput): Promise<ScheduleRecord> {
    await this.assertWritable(orgId);

    const existing = await this.prisma.schedule.findFirst({
      where: {
        id: scheduleId,
        organizationId: orgId,
      },
    });
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Schedule not found");
    }

    const cron = input.cron ?? existing.cron;
    const timezone = input.timezone ?? existing.timezone;
    const active = input.active ?? existing.active;
    const nextRunAt = active ? computeNextRun(cron, timezone) : null;

    const updated = await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        cron,
        timezone,
        active,
        nextRunAt: nextRunAt ? new Date(nextRunAt) : null,
      },
    });
    return toScheduleRecord(updated);
  }

  async triggerJob(
    orgId: string,
    jobId: string,
    trigger: "manual" | "schedule",
    scheduleId: string | null
  ): Promise<RunRecord> {
    await this.assertWritable(orgId);
    await this.assertWithinRunLimit(orgId);

    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        organizationId: orgId,
      },
      include: {
        endpoint: {
          select: {
            url: true,
            authMode: true,
            authSecretRef: true,
            timeoutMs: true,
          },
        },
      },
    });
    if (!job) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Job not found");
    }

    await this.incrementUsage(orgId);

    const run = await this.prisma.run.create({
      data: {
        organizationId: orgId,
        projectId: job.projectId,
        jobId: job.id,
        scheduleId,
        status: "queued",
        attempt: 0,
        trigger,
      },
    });

    this.dispatchQueue.push({
      runId: run.id,
      orgId,
      projectId: job.projectId,
      jobId: job.id,
      endpointUrl: job.endpoint.url,
      authMode: job.endpoint.authMode,
      authSecretRef: job.endpoint.authSecretRef,
      timeoutMs: job.endpoint.timeoutMs,
      retryAttempts: job.retryAttempts,
      retryBackoff: job.retryBackoff as "linear" | "exponential",
      retryInitialDelay: job.retryInitialDelay,
    });

    return toRunRecord(run);
  }

  async listRuns(orgId: string): Promise<RunRecord[]> {
    const runs = await this.prisma.run.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
    return runs.map((run) => toRunRecord(run as Parameters<typeof toRunRecord>[0]));
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
    return toRunRecord(run as Parameters<typeof toRunRecord>[0]);
  }

  async updateRunStatus(
    runId: string,
    status: RunStatus,
    attempt: number,
    durationMs?: number,
    errorMessage?: string
  ): Promise<RunRecord> {
    const existing = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!existing) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Run not found");
    }
    if (existing.status === "success" || existing.status === "failure" || existing.status === "timeout") {
      return toRunRecord(existing as Parameters<typeof toRunRecord>[0]);
    }
    if (attempt < existing.attempt) {
      return toRunRecord(existing as Parameters<typeof toRunRecord>[0]);
    }

    const updated = await this.prisma.run.update({
      where: { id: runId },
      data: {
        status,
        attempt,
        startedAt: status === "running" && !existing.startedAt ? new Date() : undefined,
        completedAt: status === "success" || status === "failure" || status === "timeout" ? new Date() : null,
        durationMs: durationMs ?? undefined,
        errorMessage: errorMessage ?? (status === "success" ? null : undefined),
      },
    });

    return toRunRecord(updated as Parameters<typeof toRunRecord>[0]);
  }

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

  async listAuditEvents(orgId: string, input: AuditEventListInput): Promise<AuditEventRecord[]> {
    const where = {
      organizationId: orgId,
      ...(input.actorType ? { actorType: input.actorType } : {}),
      ...(input.action ? { action: input.action } : {}),
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

    return events.map((event) =>
      toAuditEventRecord({
        id: event.id,
        organizationId: event.organizationId,
        actorType: event.actorType,
        actorId: event.actorId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        payloadHash: event.payloadHash,
        metadata: event.metadata,
        createdAt: event.createdAt,
      })
    );
  }

  async createAuditEvent(input: {
    organizationId: string;
    actorType: string;
    actorId: string;
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
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        payloadHash: input.payloadHash ?? null,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : undefined,
        createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
      },
    });
  }

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

  async claimDueDispatches(limit = 100): Promise<DispatchInstruction[]> {
    const lockAcquired = await this.tryClaimDispatchLock();
    if (!lockAcquired) {
      return [];
    }

    try {
      const now = new Date();
      const dueSchedules = await this.prisma.schedule.findMany({
        where: {
          active: true,
          nextRunAt: { lte: now },
        },
        include: {
          job: {
            include: {
              endpoint: true,
            },
          },
        },
        orderBy: { nextRunAt: "asc" },
        take: limit,
      });

      for (const schedule of dueSchedules) {
        const entitlement = await this.getBillingState(schedule.organizationId);
        if (entitlement.delinquent && !this.isGracePeriodActive(entitlement.graceEndsAt, now)) {
          continue;
        }

        const nextRunAt = computeNextRun(schedule.cron, schedule.timezone, now);
        const run = await this.prisma.$transaction(async (tx) => {
          const cas = await tx.schedule.updateMany({
            where: {
              id: schedule.id,
              active: true,
              nextRunAt: schedule.nextRunAt,
            },
            data: {
              nextRunAt: nextRunAt ? new Date(nextRunAt) : null,
            },
          });
          if (cas.count === 0) {
            return null;
          }

          const billing = await tx.billingEntitlement.findUnique({
            where: { organizationId: schedule.organizationId },
            select: { tier: true },
          });
          const tier = billing?.tier ?? "free";
          const month = formatYearMonth(now);
          const usageCounter = await tx.usageCounter.findUnique({
            where: {
              organizationId_yearMonth: {
                organizationId: schedule.organizationId,
                yearMonth: month,
              },
            },
            select: { runAttempts: true },
          });
          if ((usageCounter?.runAttempts ?? 0) >= PLAN_LIMITS[tier].runAttemptsPerMonth) {
            return null;
          }

          await tx.usageCounter.upsert({
            where: {
              organizationId_yearMonth: {
                organizationId: schedule.organizationId,
                yearMonth: month,
              },
            },
            update: {
              runAttempts: {
                increment: 1,
              },
            },
            create: {
              organizationId: schedule.organizationId,
              yearMonth: month,
              runAttempts: 1,
            },
          });

          return tx.run.create({
            data: {
              organizationId: schedule.organizationId,
              projectId: schedule.projectId,
              jobId: schedule.jobId,
              scheduleId: schedule.id,
              status: "queued",
              attempt: 0,
              trigger: "schedule",
            },
          });
        });

        if (!run) {
          continue;
        }

        this.dispatchQueue.push({
          runId: run.id,
          orgId: schedule.organizationId,
          projectId: schedule.projectId,
          jobId: schedule.jobId,
          endpointUrl: schedule.job.endpoint.url,
          authMode: schedule.job.endpoint.authMode,
          authSecretRef: schedule.job.endpoint.authSecretRef,
          timeoutMs: schedule.job.endpoint.timeoutMs,
          retryAttempts: schedule.job.retryAttempts,
          retryBackoff: schedule.job.retryBackoff === "exponential" ? "exponential" : "linear",
          retryInitialDelay: schedule.job.retryInitialDelay,
        });
      }

      return this.dispatchQueue.splice(0, limit);
    } finally {
      await this.releaseDispatchLock();
    }
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
}
