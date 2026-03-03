export type PlanTier = "free" | "pro" | "team";

export type EndpointAuthMode = "none" | "bearer" | "basic" | "header";

export type JobConcurrency = "allow" | "skip" | "queue";

export type RunStatus = "queued" | "running" | "success" | "failure" | "timeout";

export interface ProjectRecord {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface EndpointRecord {
  id: string;
  orgId: string;
  projectId: string;
  environment: string;
  name: string;
  url: string;
  authMode: EndpointAuthMode;
  authSecretRef: string | null;
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyRecord {
  id: string;
  orgId: string;
  label: string;
  scopes: string[];
  keyPreview: string;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyWithToken {
  apiKey: ApiKeyRecord;
  token: string;
}

export interface JobRecord {
  id: string;
  orgId: string;
  projectId: string;
  environment: string;
  endpointId: string;
  name: string;
  key: string;
  concurrency: JobConcurrency;
  catchup: boolean;
  retryAttempts: number;
  retryBackoff: "linear" | "exponential";
  retryInitialDelay: string;
  timeout: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRecord {
  id: string;
  orgId: string;
  projectId: string;
  jobId: string;
  cron: string;
  timezone: string;
  active: boolean;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RunRecord {
  id: string;
  orgId: string;
  projectId: string;
  jobId: string;
  scheduleId: string | null;
  status: RunStatus;
  attempt: number;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  trigger: "manual" | "schedule";
  createdAt: string;
  updatedAt: string;
}

export interface AlertRecord {
  id: string;
  orgId: string;
  projectId: string;
  channel: "email" | "webhook";
  destination: string;
  onFailure: boolean;
  onTimeout: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UsageSnapshot {
  tier: PlanTier;
  month: string;
  runAttempts: number;
  runLimit: number;
  retentionDays: number;
  delinquent: boolean;
  graceEndsAt: string | null;
}

export interface DispatchInstruction {
  runId: string;
  orgId: string;
  projectId: string;
  jobId: string;
  endpointUrl: string;
  authMode: EndpointAuthMode;
  authSecretRef: string | null;
  timeoutMs: number;
  retryAttempts: number;
  retryBackoff: "linear" | "exponential";
  retryInitialDelay: string;
}

export interface ApiResponseError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: ApiResponseError;
}

export interface CloudAuthContext {
  userId: string;
  orgId: string;
  role: "owner" | "admin" | "member" | "viewer";
  actorType?: "user" | "api_key" | "internal" | "webhook";
  scopes?: string[];
  apiKeyId?: string | null;
}
