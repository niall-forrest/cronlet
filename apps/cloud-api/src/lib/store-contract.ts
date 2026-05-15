import type {
  AuditEventCreateInput,
  AuditEventListInput,
  AuditEventRecord,
  ApiKeyCreateInput,
  ApiKeyRecord,
  ApiKeyRotateInput,
  ApiKeyWithToken,
  AlertCreateInput,
  AlertRecord,
  CallbackSigningSecretRecord,
  CreatedBy,
  DispatchInstruction,
  DispatchEventRecord,
  InternalDispatchCompleteInput,
  InternalDispatchStartInput,
  InternalRunStatusInput,
  PlanTier,
  ReconciliationCompareInput,
  ReconciliationCompareResult,
  RunRecord,
  RunEventRecord,
  RunListInput,
  BulkRunReplayInput,
  BulkRunReplayResult,
  OutboundPolicyPatchInput,
  OutboundPolicyRecord,
  OpsSummaryRecord,
  RunReplayResult,
  RetentionCleanupResult,
  CircuitBreakerListInput,
  CircuitBreakerRecord,
  SecretCreateInput,
  SecretPatchInput,
  SecretRecord,
  BulkTaskCancelInput,
  BulkTaskCancelResult,
  TaskCreateInput,
  TaskEventRecord,
  TaskDispatchInput,
  TaskListInput,
  TaskPatchInput,
  TaskRecord,
  TaskCancelResult,
  TimelineEntryRecord,
  UsageSnapshot,
} from "@cronlet/shared";

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
  // Tasks
  listTasks(orgId: string, input?: TaskListInput): Promise<TaskRecord[]> | TaskRecord[];
  countTasks(orgId: string): Promise<number> | number;
  getTask(orgId: string, taskId: string): Promise<TaskRecord> | TaskRecord;
  getTaskTimeline(orgId: string, taskId: string, limit?: number): Promise<TimelineEntryRecord[]> | TimelineEntryRecord[];
  createTask(orgId: string, input: TaskCreateInput, createdBy?: CreatedBy): Promise<TaskRecord> | TaskRecord;
  patchTask(orgId: string, taskId: string, input: TaskPatchInput): Promise<TaskRecord> | TaskRecord;
  deleteTask(orgId: string, taskId: string): Promise<void> | void;
  cancelTask(orgId: string, taskId: string): Promise<TaskCancelResult> | TaskCancelResult;
  bulkCancelTasks(orgId: string, input: BulkTaskCancelInput): Promise<BulkTaskCancelResult> | BulkTaskCancelResult;
  triggerTask(orgId: string, taskId: string, trigger: "manual" | "api"): Promise<RunRecord> | RunRecord;
  dispatchTask(orgId: string, input: TaskDispatchInput, createdBy?: CreatedBy, trigger?: "manual" | "api"): Promise<RunRecord> | RunRecord;

  // Runs
  listRuns(orgId: string, input?: RunListInput): Promise<RunRecord[]> | RunRecord[];
  getRun(orgId: string, runId: string): Promise<RunRecord> | RunRecord;
  getRunTimeline(orgId: string, runId: string, limit?: number): Promise<TimelineEntryRecord[]> | TimelineEntryRecord[];
  replayRun(orgId: string, runId: string, trigger?: "manual" | "api"): Promise<RunReplayResult> | RunReplayResult;
  bulkReplayRuns(orgId: string, input: BulkRunReplayInput, trigger?: "manual" | "api"): Promise<BulkRunReplayResult> | BulkRunReplayResult;
  compareReconciliation(orgId: string, input: ReconciliationCompareInput): Promise<ReconciliationCompareResult> | ReconciliationCompareResult;
  updateRunStatus(runId: string, input: InternalRunStatusInput): Promise<RunRecord> | RunRecord;

  // Secrets
  listSecrets(orgId: string): Promise<SecretRecord[]> | SecretRecord[];
  getSecretValue(orgId: string, name: string): Promise<string> | string;
  createSecret(orgId: string, input: SecretCreateInput): Promise<SecretRecord> | SecretRecord;
  patchSecret(orgId: string, name: string, input: SecretPatchInput): Promise<SecretRecord> | SecretRecord;
  rotateSecret(orgId: string, name: string): Promise<SecretRecord> | SecretRecord;
  deleteSecret(orgId: string, name: string): Promise<void> | void;

  // Alerts
  listAlerts(orgId: string): Promise<AlertRecord[]> | AlertRecord[];
  createAlert(orgId: string, input: AlertCreateInput): Promise<AlertRecord> | AlertRecord;

  // API Keys
  listApiKeys(orgId: string): Promise<ApiKeyRecord[]> | ApiKeyRecord[];
  hasApiKeys(orgId: string): Promise<boolean> | boolean;
  createApiKey(orgId: string, input: ApiKeyCreateInput): Promise<ApiKeyWithToken> | ApiKeyWithToken;
  rotateApiKey(orgId: string, keyId: string, input: ApiKeyRotateInput): Promise<ApiKeyWithToken> | ApiKeyWithToken;
  revokeApiKey(orgId: string, keyId: string): Promise<void> | void;

  // Audit
  listAuditEvents(orgId: string, input: AuditEventListInput): Promise<AuditEventRecord[]> | AuditEventRecord[];
  listTaskEvents(orgId: string, taskId: string, limit?: number): Promise<TaskEventRecord[]> | TaskEventRecord[];
  listRunEvents(orgId: string, runId: string, limit?: number): Promise<RunEventRecord[]> | RunEventRecord[];
  listDispatchEvents(orgId: string, dispatchJobId: string, limit?: number): Promise<DispatchEventRecord[]> | DispatchEventRecord[];
  listCircuitBreakers(orgId: string, input?: CircuitBreakerListInput): Promise<CircuitBreakerRecord[]> | CircuitBreakerRecord[];
  createAuditEvent(input: {
    organizationId: string;
    actorType?: string;
    actorId?: string;
    action: AuditEventCreateInput["action"];
    targetType: AuditEventCreateInput["targetType"];
    targetId: AuditEventCreateInput["targetId"];
    payloadHash?: AuditEventCreateInput["payloadHash"] | null;
    metadata?: AuditEventCreateInput["metadata"];
    createdAt?: string;
  }): Promise<void> | void;

  // Usage & Billing
  getUsage(orgId: string): Promise<UsageSnapshot> | UsageSnapshot;
  upsertOrganization(input: OrganizationUpsertInput): Promise<void> | void;
  upsertEntitlementForOrg(orgId: string, input: EntitlementUpdateInput): Promise<void> | void;
  getCallbackSigningSecret(orgId: string): Promise<CallbackSigningSecretRecord> | CallbackSigningSecretRecord;
  rotateCallbackSigningSecret(orgId: string): Promise<CallbackSigningSecretRecord> | CallbackSigningSecretRecord;
  getOutboundPolicy(orgId: string): Promise<OutboundPolicyRecord> | OutboundPolicyRecord;
  updateOutboundPolicy(orgId: string, input: OutboundPolicyPatchInput): Promise<OutboundPolicyRecord> | OutboundPolicyRecord;
  getOpsSummary(orgId: string): Promise<OpsSummaryRecord> | OpsSummaryRecord;

  // Worker dispatch
  claimDueDispatches(limit?: number): Promise<DispatchInstruction[]> | DispatchInstruction[];
  startDispatchAttempt(input: InternalDispatchStartInput): Promise<void> | void;
  completeDispatchAttempt(input: InternalDispatchCompleteInput): Promise<void> | void;
  reconcileDispatches(limit?: number): Promise<{ repaired: number }> | { repaired: number };
  cleanupRetention(limit?: number): Promise<RetentionCleanupResult> | RetentionCleanupResult;
}
