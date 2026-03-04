import type {
  AlertRecord,
  AuditEventRecord,
  ApiKeyRecord,
  ApiKeyWithToken,
  ApiResponse,
  ProjectRecord,
  RunRecord,
  TaskRecord,
  SecretRecord,
  UsageSnapshot,
  TaskCreateInput,
  TaskPatchInput,
  SecretCreateInput,
  SecretPatchInput,
} from "@cronlet/cloud-shared";

const BASE_URL = (import.meta.env.VITE_CLOUD_API_BASE_URL as string | undefined)?.replace(/\/$/, "")
  ?? "http://127.0.0.1:4050";

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
  headers.set("content-type", "application/json");

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

// ============================================
// PROJECTS
// ============================================

export function listProjects(): Promise<ProjectRecord[]> {
  return request<ProjectRecord[]>("/v1/projects");
}

export function createProject(input: { name: string; slug: string }): Promise<ProjectRecord> {
  return request<ProjectRecord>("/v1/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ============================================
// TASKS
// ============================================

export function listTasks(projectId?: string): Promise<TaskRecord[]> {
  const query = projectId ? `?projectId=${projectId}` : "";
  return request<TaskRecord[]>(`/v1/tasks${query}`);
}

export function getTask(taskId: string): Promise<TaskRecord> {
  return request<TaskRecord>(`/v1/tasks/${taskId}`);
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

export function triggerTask(taskId: string): Promise<RunRecord> {
  return request<RunRecord>(`/v1/tasks/${taskId}/trigger`, {
    method: "POST",
  });
}

// ============================================
// RUNS
// ============================================

export function listRuns(taskId?: string, limit?: number): Promise<RunRecord[]> {
  const params = new URLSearchParams();
  if (taskId) params.set("taskId", taskId);
  if (limit) params.set("limit", String(limit));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<RunRecord[]>(`/v1/runs${query}`);
}

export function getRun(runId: string): Promise<RunRecord> {
  return request<RunRecord>(`/v1/runs/${runId}`);
}

// ============================================
// SECRETS
// ============================================

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

// ============================================
// ALERTS
// ============================================

export function listAlerts(): Promise<AlertRecord[]> {
  return request<AlertRecord[]>("/v1/alerts");
}

export function createAlert(input: {
  projectId: string;
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

// ============================================
// API KEYS
// ============================================

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

// ============================================
// USAGE
// ============================================

export function getUsage(): Promise<UsageSnapshot> {
  return request<UsageSnapshot>("/v1/usage");
}

// ============================================
// AUDIT
// ============================================

export function listAuditEvents(input: {
  actorType?: "user" | "api_key" | "agent" | "internal" | "webhook";
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
} = {}): Promise<AuditEventRecord[]> {
  const query = new URLSearchParams();
  if (input.actorType) query.set("actorType", input.actorType);
  if (input.action) query.set("action", input.action);
  if (input.from) query.set("from", input.from);
  if (input.to) query.set("to", input.to);
  if (typeof input.limit === "number") query.set("limit", String(input.limit));

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<AuditEventRecord[]>(`/v1/audit-events${suffix}`);
}
