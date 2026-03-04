import type {
  AlertRecord,
  AuditEventRecord,
  ApiKeyRecord,
  ApiKeyWithToken,
  ApiResponse,
  EndpointRecord,
  JobRecord,
  ProjectRecord,
  RunRecord,
  ScheduleRecord,
  UsageSnapshot,
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

export function listProjects(): Promise<ProjectRecord[]> {
  return request<ProjectRecord[]>("/v1/projects");
}

export function createProject(input: { name: string; slug: string }): Promise<ProjectRecord> {
  return request<ProjectRecord>("/v1/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listEndpoints(): Promise<EndpointRecord[]> {
  return request<EndpointRecord[]>("/v1/endpoints");
}

export function createEndpoint(input: {
  projectId: string;
  environment: string;
  name: string;
  url: string;
  authMode: "none" | "bearer" | "basic" | "header";
  authSecretRef?: string | null;
  timeoutMs: number;
}): Promise<EndpointRecord> {
  return request<EndpointRecord>("/v1/endpoints", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function patchEndpoint(
  endpointId: string,
  input: {
    name?: string;
    url?: string;
    authMode?: "none" | "bearer" | "basic" | "header";
    authSecretRef?: string | null;
    timeoutMs?: number;
  }
): Promise<EndpointRecord> {
  return request<EndpointRecord>(`/v1/endpoints/${endpointId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function listJobs(): Promise<JobRecord[]> {
  return request<JobRecord[]>("/v1/jobs");
}

export function createJob(input: {
  projectId: string;
  environment: string;
  endpointId: string;
  name: string;
  key: string;
  concurrency: "allow" | "skip" | "queue";
  catchup: boolean;
  retryAttempts: number;
  retryBackoff: "linear" | "exponential";
  retryInitialDelay: string;
  timeout: string;
}): Promise<JobRecord> {
  return request<JobRecord>("/v1/jobs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function patchJob(
  jobId: string,
  input: {
    name?: string;
    concurrency?: "allow" | "skip" | "queue";
    catchup?: boolean;
    retryAttempts?: number;
    retryBackoff?: "linear" | "exponential";
    retryInitialDelay?: string;
    timeout?: string;
    active?: boolean;
  }
): Promise<JobRecord> {
  return request<JobRecord>(`/v1/jobs/${jobId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function triggerJob(jobId: string): Promise<RunRecord> {
  return request<RunRecord>(`/v1/jobs/${jobId}/trigger`, {
    method: "POST",
  });
}

export function listSchedules(): Promise<ScheduleRecord[]> {
  return request<ScheduleRecord[]>("/v1/schedules");
}

export function createSchedule(input: {
  jobId: string;
  cron: string;
  timezone: string;
  active: boolean;
}): Promise<ScheduleRecord> {
  return request<ScheduleRecord>("/v1/schedules", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function patchSchedule(
  scheduleId: string,
  input: { cron?: string; timezone?: string; active?: boolean }
): Promise<ScheduleRecord> {
  return request<ScheduleRecord>(`/v1/schedules/${scheduleId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function listRuns(): Promise<RunRecord[]> {
  return request<RunRecord[]>("/v1/runs");
}

export function getUsage(): Promise<UsageSnapshot> {
  return request<UsageSnapshot>("/v1/usage");
}

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

export function listAuditEvents(input: {
  actorType?: "user" | "api_key" | "internal" | "webhook";
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
} = {}): Promise<AuditEventRecord[]> {
  const query = new URLSearchParams();
  if (input.actorType) {
    query.set("actorType", input.actorType);
  }
  if (input.action) {
    query.set("action", input.action);
  }
  if (input.from) {
    query.set("from", input.from);
  }
  if (input.to) {
    query.set("to", input.to);
  }
  if (typeof input.limit === "number") {
    query.set("limit", String(input.limit));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<AuditEventRecord[]>(`/v1/audit-events${suffix}`);
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
