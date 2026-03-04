import type {
  AuditEventListInput,
  AuditEventRecord,
  ApiKeyCreateInput,
  ApiKeyRecord,
  ApiKeyRotateInput,
  ApiKeyWithToken,
  AlertCreateInput,
  AlertRecord,
  DispatchInstruction,
  EndpointCreateInput,
  EndpointPatchInput,
  EndpointRecord,
  JobCreateInput,
  JobPatchInput,
  JobRecord,
  PlanTier,
  ProjectCreateInput,
  ProjectRecord,
  RunRecord,
  RunStatus,
  ScheduleCreateInput,
  SchedulePatchInput,
  ScheduleRecord,
  UsageSnapshot,
} from "@cronlet/cloud-shared";

export interface EntitlementUpdateInput {
  tier: PlanTier;
  delinquent: boolean;
  graceEndsAt: string | null;
}

export interface OrganizationUpsertInput {
  orgId: string;
  name?: string;
  slug?: string;
}

export interface CloudStore {
  listProjects(orgId: string): Promise<ProjectRecord[]> | ProjectRecord[];
  createProject(orgId: string, input: ProjectCreateInput): Promise<ProjectRecord> | ProjectRecord;

  listEndpoints(orgId: string): Promise<EndpointRecord[]> | EndpointRecord[];
  createEndpoint(orgId: string, input: EndpointCreateInput): Promise<EndpointRecord> | EndpointRecord;
  patchEndpoint(orgId: string, endpointId: string, input: EndpointPatchInput): Promise<EndpointRecord> | EndpointRecord;

  listJobs(orgId: string): Promise<JobRecord[]> | JobRecord[];
  createJob(orgId: string, input: JobCreateInput): Promise<JobRecord> | JobRecord;
  patchJob(orgId: string, jobId: string, input: JobPatchInput): Promise<JobRecord> | JobRecord;

  listSchedules(orgId: string): Promise<ScheduleRecord[]> | ScheduleRecord[];
  createSchedule(orgId: string, input: ScheduleCreateInput): Promise<ScheduleRecord> | ScheduleRecord;
  patchSchedule(orgId: string, scheduleId: string, input: SchedulePatchInput): Promise<ScheduleRecord> | ScheduleRecord;

  triggerJob(
    orgId: string,
    jobId: string,
    trigger: "manual" | "schedule",
    scheduleId: string | null
  ): Promise<RunRecord> | RunRecord;
  listRuns(orgId: string): Promise<RunRecord[]> | RunRecord[];
  getRun(orgId: string, runId: string): Promise<RunRecord> | RunRecord;
  updateRunStatus(
    runId: string,
    status: RunStatus,
    attempt: number,
    durationMs?: number,
    errorMessage?: string
  ): Promise<RunRecord> | RunRecord;

  listAlerts(orgId: string): Promise<AlertRecord[]> | AlertRecord[];
  createAlert(orgId: string, input: AlertCreateInput): Promise<AlertRecord> | AlertRecord;

  listApiKeys(orgId: string): Promise<ApiKeyRecord[]> | ApiKeyRecord[];
  createApiKey(orgId: string, input: ApiKeyCreateInput): Promise<ApiKeyWithToken> | ApiKeyWithToken;
  rotateApiKey(orgId: string, keyId: string, input: ApiKeyRotateInput): Promise<ApiKeyWithToken> | ApiKeyWithToken;
  revokeApiKey(orgId: string, keyId: string): Promise<void> | void;
  listAuditEvents(orgId: string, input: AuditEventListInput): Promise<AuditEventRecord[]> | AuditEventRecord[];
  createAuditEvent(
    input: {
      organizationId: string;
      actorType: string;
      actorId: string;
      action: string;
      targetType: string;
      targetId: string;
      payloadHash?: string | null;
      metadata?: Record<string, unknown> | null;
      createdAt?: string;
    }
  ): Promise<void> | void;

  getUsage(orgId: string): Promise<UsageSnapshot> | UsageSnapshot;
  claimDueDispatches(limit?: number): Promise<DispatchInstruction[]> | DispatchInstruction[];

  upsertOrganization(input: OrganizationUpsertInput): Promise<void> | void;
  upsertEntitlementForOrg(orgId: string, input: EntitlementUpdateInput): Promise<void> | void;
}
