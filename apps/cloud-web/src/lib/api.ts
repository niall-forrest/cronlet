import type {
  AlertRecord,
  AuditEventRecord,
  ApiKeyRecord,
  ApiKeyWithToken,
  ApiResponse,
  BulkRunReplayInput,
  BulkRunReplayResult,
  BulkTaskCancelInput,
  BulkTaskCancelResult,
  CallbackSigningSecretRecord,
  CircuitBreakerListInput,
  CircuitBreakerRecord,
  OpsSummaryRecord,
  OrgStatusSnapshot,
  OutboundPolicyPatchInput,
  OutboundPolicyRecord,
  ReconciliationCompareInput,
  ReconciliationCompareResult,
  RunListInput,
  RunRecord,
  RunReplayResult,
  SecretCreateInput,
  SecretPatchInput,
  SecretRecord,
  TaskCreateInput,
  TaskListInput,
  TaskPatchInput,
  TaskRecord,
  TimelineEntryRecord,
  UsageSnapshot,
} from "@cronlet/shared";

const BASE_URL =
  (import.meta.env.VITE_CLOUD_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://127.0.0.1:4050";

interface CloudAuthSnapshot {
  token: string | null;
  orgId: string | null;
  userId: string | null;
}

const DEFAULT_AUTH_SNAPSHOT: CloudAuthSnapshot = {
  token: null,
  orgId: null,
  userId: null,
};

let authProvider: () => Promise<CloudAuthSnapshot> | CloudAuthSnapshot = () => DEFAULT_AUTH_SNAPSHOT;

export function setCloudAuthProvider(
  provider: () => Promise<CloudAuthSnapshot> | CloudAuthSnapshot
): void {
  authProvider = provider;
}

export function resetCloudAuthProvider(): void {
  authProvider = () => DEFAULT_AUTH_SNAPSHOT;
}

async function resolveHeaders(init?: RequestInit): Promise<Headers> {
  const snapshot = await authProvider();
  const headers = new Headers();

  if (init?.body) {
    headers.set("content-type", "application/json");
  }

  if (snapshot.token) {
    headers.set("authorization", `Bearer ${snapshot.token}`);
  }

  if (snapshot.orgId) {
    headers.set("x-org-id", snapshot.orgId);
  }

  if (snapshot.userId) {
    headers.set("x-user-id", snapshot.userId);
  }

  if (!snapshot.token) {
    headers.set("x-org-id", snapshot.orgId ?? "org_demo");
    headers.set("x-user-id", snapshot.userId ?? "user_demo");
  }

  if (init?.headers) {
    const extra = new Headers(init.headers);
    extra.forEach((value, key) => headers.set(key, value));
  }

  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await resolveHeaders(init);
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.ok || payload.data === undefined) {
    throw new Error(payload.error?.message ?? `Request failed (${response.status})`);
  }

  return payload.data;
}

function buildQuery(entries: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function listTasks(): Promise<TaskRecord[]> {
  return request<TaskRecord[]>("/v1/tasks");
}

export function listTasksWithFilters(input: TaskListInput = {}): Promise<TaskRecord[]> {
  return request<TaskRecord[]>(
    `/v1/tasks${buildQuery({
      status: input.status,
      scheduleType: input.scheduleType,
      externalId: input.externalId,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
      nextRunAfter: input.nextRunAfter,
      nextRunBefore: input.nextRunBefore,
      limit: input.limit,
    })}`
  );
}

export function getTask(taskId: string): Promise<TaskRecord> {
  return request<TaskRecord>(`/v1/tasks/${taskId}`);
}

export function getTaskTimeline(taskId: string, limit?: number): Promise<TimelineEntryRecord[]> {
  return request<TimelineEntryRecord[]>(`/v1/tasks/${taskId}/timeline${buildQuery({ limit })}`);
}

export function createTask(input: TaskCreateInput): Promise<TaskRecord> {
  return request<TaskRecord>("/v1/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function patchTask(taskId: string, input: TaskPatchInput): Promise<TaskRecord> {
  return request<TaskRecord>(`/v1/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteTask(taskId: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/v1/tasks/${taskId}`, {
    method: "DELETE",
  });
}

export function cancelTask(taskId: string): Promise<BulkTaskCancelResult["results"][number]> {
  return request<BulkTaskCancelResult["results"][number]>(`/v1/tasks/${taskId}/cancel`, {
    method: "POST",
  });
}

export function bulkCancelTasks(input: BulkTaskCancelInput): Promise<BulkTaskCancelResult> {
  return request<BulkTaskCancelResult>("/v1/tasks/bulk-cancel", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function triggerTask(taskId: string): Promise<RunRecord> {
  return request<RunRecord>(`/v1/tasks/${taskId}/trigger`, {
    method: "POST",
  });
}

export function getOrgStatus(): Promise<OrgStatusSnapshot> {
  return request<OrgStatusSnapshot>("/v1/org-status");
}

export function getCallbackSigningSecret(): Promise<CallbackSigningSecretRecord> {
  return request<CallbackSigningSecretRecord>("/v1/callback-signing-secret");
}

export function rotateCallbackSigningSecret(): Promise<CallbackSigningSecretRecord> {
  return request<CallbackSigningSecretRecord>("/v1/callback-signing-secret/rotate", {
    method: "POST",
  });
}

export function listRuns(taskId?: string, limit?: number): Promise<RunRecord[]> {
  return request<RunRecord[]>(`/v1/runs${buildQuery({ taskId, limit })}`);
}

export function listRunsWithFilters(input: RunListInput = {}): Promise<RunRecord[]> {
  return request<RunRecord[]>(
    `/v1/runs${buildQuery({
      taskId: input.taskId,
      status: input.status,
      externalId: input.externalId,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
      scheduledAfter: input.scheduledAfter,
      scheduledBefore: input.scheduledBefore,
      limit: input.limit,
    })}`
  );
}

export function getRun(runId: string): Promise<RunRecord> {
  return request<RunRecord>(`/v1/runs/${runId}`);
}

export function getRunTimeline(runId: string, limit?: number): Promise<TimelineEntryRecord[]> {
  return request<TimelineEntryRecord[]>(`/v1/runs/${runId}/timeline${buildQuery({ limit })}`);
}

export function replayRun(runId: string): Promise<RunReplayResult> {
  return request<RunReplayResult>(`/v1/runs/${runId}/replay`, {
    method: "POST",
  });
}

export function bulkReplayRuns(input: BulkRunReplayInput): Promise<BulkRunReplayResult> {
  return request<BulkRunReplayResult>("/v1/runs/bulk-replay", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listSecrets(): Promise<SecretRecord[]> {
  return request<SecretRecord[]>("/v1/secrets");
}

export function createSecret(input: SecretCreateInput): Promise<SecretRecord> {
  return request<SecretRecord>("/v1/secrets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function patchSecret(name: string, input: SecretPatchInput): Promise<SecretRecord> {
  return request<SecretRecord>(`/v1/secrets/${name}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteSecret(name: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/v1/secrets/${name}`, {
    method: "DELETE",
  });
}

export function listAlerts(): Promise<AlertRecord[]> {
  return request<AlertRecord[]>("/v1/alerts");
}

export function createAlert(input: {
  channel: "email" | "webhook";
  destination: string;
  onFailure: boolean;
  onTimeout: boolean;
}): Promise<AlertRecord> {
  return request<AlertRecord>("/v1/alerts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listApiKeys(): Promise<ApiKeyRecord[]> {
  return request<ApiKeyRecord[]>("/v1/api-keys");
}

export function createApiKey(input: { label: string; scopes: string[] }): Promise<ApiKeyWithToken> {
  return request<ApiKeyWithToken>("/v1/api-keys", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function rotateApiKey(
  apiKeyId: string,
  input: { label?: string; scopes?: string[] } = {}
): Promise<ApiKeyWithToken> {
  return request<ApiKeyWithToken>(`/v1/api-keys/${apiKeyId}/rotate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function revokeApiKey(apiKeyId: string): Promise<{ revoked: boolean }> {
  return request<{ revoked: boolean }>(`/v1/api-keys/${apiKeyId}`, {
    method: "DELETE",
  });
}

export function getOutboundPolicy(): Promise<OutboundPolicyRecord> {
  return request<OutboundPolicyRecord>("/v1/outbound-policy");
}

export function patchOutboundPolicy(input: OutboundPolicyPatchInput): Promise<OutboundPolicyRecord> {
  return request<OutboundPolicyRecord>("/v1/outbound-policy", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function listCircuitBreakers(input: CircuitBreakerListInput = {}): Promise<CircuitBreakerRecord[]> {
  return request<CircuitBreakerRecord[]>(
    `/v1/circuit-breakers${buildQuery({
      state: input.state,
      destinationKey: input.destinationKey,
      limit: input.limit,
    })}`
  );
}

export function compareReconciliation(input: ReconciliationCompareInput): Promise<ReconciliationCompareResult> {
  return request<ReconciliationCompareResult>("/v1/reconciliation/compare", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getUsage(): Promise<UsageSnapshot> {
  return request<UsageSnapshot>("/v1/usage");
}

export function getOpsSummary(): Promise<OpsSummaryRecord> {
  return request<OpsSummaryRecord>("/v1/ops-summary");
}

export function seedDemoData(): Promise<{
  taskCount: number;
  runCount: number;
  seededAt: string;
}> {
  return request<{
    taskCount: number;
    runCount: number;
    seededAt: string;
  }>("/v1/demo/seed", {
    method: "POST",
  });
}

export function listAuditEvents(input: {
  actorType?: "user" | "api_key" | "agent" | "internal" | "webhook";
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
} = {}): Promise<AuditEventRecord[]> {
  return request<AuditEventRecord[]>(
    `/v1/audit-events${buildQuery({
      actorType: input.actorType,
      action: input.action,
      from: input.from,
      to: input.to,
      limit: input.limit,
    })}`
  );
}
