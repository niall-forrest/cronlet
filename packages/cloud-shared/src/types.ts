// ============================================
// ENUMS
// ============================================

export type PlanTier = "free" | "pro" | "team";

export type HandlerType = "tools" | "code" | "webhook";

export type ScheduleType = "every" | "daily" | "weekly" | "monthly" | "once" | "cron";

export type RunStatus =
  | "queued"
  | "leased"
  | "running"
  | "retry_wait"
  | "success"
  | "failure"
  | "timeout"
  | "cancelled"
  | "dead_lettered"
  | "terminal_client_error"
  | "retry_window_expired";
export type TaskSource = "dashboard" | "mcp" | "sdk";
export type DispatchJobStatus =
  | "pending"
  | "leased"
  | "running"
  | "retry_wait"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "dead_lettered";
export type RunAttemptStatus =
  | "pending"
  | "running"
  | "success"
  | "failure"
  | "timeout"
  | "cancelled"
  | "terminal_client_error";
export type CircuitBreakerStatus = "closed" | "open" | "half_open";

export type AuditActorType = "user" | "api_key" | "agent" | "internal" | "webhook";

export type MemberRole = "owner" | "admin" | "member" | "viewer";

// ============================================
// HANDLER CONFIGS
// ============================================

export interface ToolStep {
  tool: string;
  args: Record<string, unknown>;
  outputKey?: string;
}

export interface ToolsHandlerConfig {
  type: "tools";
  steps: ToolStep[];
}

export interface WebhookHandlerConfig {
  type: "webhook";
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  followRedirects?: boolean;
  maxRedirects?: number;
  auth?: {
    type: "bearer" | "basic" | "header";
    secretName: string;
  };
}

export interface CodeHandlerConfig {
  type: "code";
  runtime: "javascript";
  code: string;
}

export type HandlerConfig = ToolsHandlerConfig | WebhookHandlerConfig | CodeHandlerConfig;

// ============================================
// SCHEDULE CONFIGS
// ============================================

export interface EveryScheduleConfig {
  type: "every";
  interval: string; // "5m", "1h", "1d"
}

export interface DailyScheduleConfig {
  type: "daily";
  times: string[]; // ["09:00", "17:00"]
}

export interface WeeklyScheduleConfig {
  type: "weekly";
  days: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[];
  time: string;
}

export interface MonthlyScheduleConfig {
  type: "monthly";
  day: number | "last" | "last-fri" | "last-mon" | "last-tue" | "last-wed" | "last-thu" | "last-sat" | "last-sun";
  time: string;
}

export interface OnceScheduleConfig {
  type: "once";
  at: string; // ISO datetime
}

export interface CronScheduleConfig {
  type: "cron";
  expression: string;
}

export type ScheduleConfig =
  | EveryScheduleConfig
  | DailyScheduleConfig
  | WeeklyScheduleConfig
  | MonthlyScheduleConfig
  | OnceScheduleConfig
  | CronScheduleConfig;

// ============================================
// CREATED BY
// ============================================

export interface CreatedBy {
  type: "user" | "agent";
  id: string;
  name?: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoff: "fixed" | "linear" | "exponential";
  initialDelay: string;
  maxDelay: string;
  jitter: boolean;
  retryWindow: string;
  retryOnStatusCodes: number[];
  terminalStatusCodes: number[];
}

// ============================================
// RECORDS
// ============================================

export interface TaskRecord {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  externalId: string | null;
  handlerType: HandlerType;
  handlerConfig: HandlerConfig;
  scheduleType: ScheduleType;
  scheduleConfig: ScheduleConfig;
  timezone: string;
  nextRunAt: string | null;
  retryAttempts: number;
  retryBackoff: "linear" | "exponential";
  retryDelay: string;
  retryPolicy: RetryPolicy;
  timeout: string;
  active: boolean;
  source: TaskSource;
  createdBy: CreatedBy | null;
  // Agent callback - closes the autonomous loop
  callbackUrl: string | null;
  metadata: Record<string, unknown> | null;
  // Conditional scheduling
  maxRuns: number | null;
  expiresAt: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RunRecord {
  id: string;
  orgId: string;
  taskId: string;
  status: RunStatus;
  trigger: "schedule" | "manual" | "api";
  attempt: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  output: Record<string, unknown> | null;
  logs: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface TaskListInput {
  status?: "active" | "paused";
  scheduleType?: ScheduleType;
  externalId?: string;
  metadata?: Record<string, unknown>;
  nextRunAfter?: string;
  nextRunBefore?: string;
  limit?: number;
}

export interface RunListInput {
  taskId?: string;
  status?: RunStatus;
  externalId?: string;
  metadata?: Record<string, unknown>;
  scheduledAfter?: string;
  scheduledBefore?: string;
  limit?: number;
}

export interface RunAttemptRecord {
  id: string;
  orgId: string;
  runId: string;
  taskId: string;
  dispatchJobId: string | null;
  attemptNumber: number;
  status: RunAttemptStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  httpStatus: number | null;
  errorClass: string | null;
  errorMessage: string | null;
  responseBodyPreview: string | null;
  responseBodyHash: string | null;
  output: Record<string, unknown> | null;
  logs: string | null;
  createdAt: string;
}

export interface TaskCancelResult {
  cancelled: true;
  taskId: string;
  cancelledDispatchJobs: number;
  runningAttemptIds: string[];
  guarantee: "no-new-attempts";
  alreadyStarted: boolean;
}

export interface RunReplayResult {
  run: RunRecord;
  replayOfRunId: string;
}

export interface BulkTaskCancelInput {
  taskIds?: string[];
  externalIds?: string[];
  metadata?: Record<string, unknown>;
  limit?: number;
}

export interface BulkTaskCancelResult {
  count: number;
  results: TaskCancelResult[];
}

export interface BulkRunReplayInput {
  runIds?: string[];
  taskId?: string;
  status?: RunStatus;
  externalId?: string;
  metadata?: Record<string, unknown>;
  limit?: number;
}

export interface BulkRunReplayResult {
  count: number;
  results: RunReplayResult[];
}

export interface CircuitBreakerRecord {
  orgId: string;
  destinationKey: string;
  state: CircuitBreakerStatus;
  consecutiveFailures: number;
  openedAt: string | null;
  cooldownUntil: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  probeInFlight: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CircuitBreakerListInput {
  state?: CircuitBreakerStatus;
  destinationKey?: string;
  limit?: number;
}

export interface ReconciliationCompareInput {
  externalIds?: string[];
  metadata?: Record<string, unknown>;
  includePendingOnce?: boolean;
  includeOverdue?: boolean;
  limit?: number;
}

export interface ReconciliationCompareResult {
  matchedTasks: TaskRecord[];
  missingExternalIds: string[];
  duplicateExternalIds: string[];
  pendingOneOffTasks: TaskRecord[];
  overdueTasks: TaskRecord[];
}

export interface SecretRecord {
  id: string;
  orgId: string;
  name: string;
  keyVersion: string;
  lastRotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Note: encryptedValue is never exposed via API
}

export interface OutboundPolicyRecord {
  allowedHosts: string[];
  updatedAt: string;
}

export interface AlertRecord {
  id: string;
  orgId: string;
  channel: "email" | "webhook";
  destination: string;
  onFailure: boolean;
  onTimeout: boolean;
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

export interface AuditEventRecord {
  id: string;
  orgId: string;
  actorType: AuditActorType;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  payloadHash: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TaskEventRecord {
  id: string;
  orgId: string;
  taskId: string;
  action: string;
  previousState: string | null;
  nextState: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface RunEventRecord {
  id: string;
  orgId: string;
  runId: string;
  action: string;
  previousState: string | null;
  nextState: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface DispatchEventRecord {
  id: string;
  orgId: string;
  dispatchJobId: string;
  action: string;
  previousState: string | null;
  nextState: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TimelineEntryRecord {
  id: string;
  kind: "task_event" | "run_event" | "dispatch_event" | "audit_event";
  action: string;
  createdAt: string;
  targetType: "task" | "run" | "dispatch" | "audit";
  targetId: string;
  previousState: string | null;
  nextState: string | null;
  reason: string | null;
  actorType?: AuditActorType;
  actorId?: string;
  metadata: Record<string, unknown> | null;
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

export interface OrgStatusSnapshot {
  hasApiKeys: boolean;
}

export interface CallbackSigningSecretRecord {
  secret: string;
  rotatedAt: string;
}

// ============================================
// DISPATCH (Worker)
// ============================================

export interface DispatchInstruction {
  dispatchJobId: string;
  attemptId: string;
  attemptNumber: number;
  runId: string;
  orgId: string;
  taskId: string;
  taskName: string;
  taskExternalId: string | null;
  handlerType: HandlerType;
  handlerConfig: HandlerConfig;
  timeoutMs: number;
  retryAttempts: number;
  retryBackoff: "linear" | "exponential";
  retryDelay: string;
  retryPolicy: RetryPolicy;
  // Callback info for agent loop
  callbackUrl: string | null;
  callbackSigningSecret: string | null;
  outboundAllowedHosts: string[] | null;
  metadata: Record<string, unknown> | null;
  maxRuns: number | null;
  expiresAt: string | null;
  runCount: number;
}

export interface InternalDispatchStartInput {
  dispatchJobId: string;
  attemptId: string;
  attemptNumber: number;
}

export interface InternalDispatchCompleteInput {
  dispatchJobId: string;
  attemptId: string;
  attemptNumber: number;
  status: "success" | "failure" | "timeout" | "terminal_client_error";
  durationMs: number;
  output?: Record<string, unknown> | null;
  logs?: string | null;
  httpStatus?: number | null;
  errorClass?: string | null;
  errorMessage?: string | null;
  responseBodyPreview?: string | null;
  responseBodyHash?: string | null;
}

// ============================================
// CALLBACK EVENTS (Agent Feedback Loop)
// ============================================

export type TaskCallbackEventType =
  | "task.run.completed"  // Task ran successfully
  | "task.run.failed"     // Task failed after all retries
  | "task.expired";       // maxRuns hit or expiresAt passed

export interface TaskCallbackPayload {
  event: TaskCallbackEventType;
  timestamp: string;
  task: {
    id: string;
    name: string;
    externalId?: string | null;
    metadata: Record<string, unknown> | null;
  };
  run?: {
    id: string;
    status: RunStatus;
    scheduledAt?: string | null;
    output: Record<string, unknown> | null;
    errorMessage: string | null;
    durationMs: number | null;
    attempt: number;
  };
  attempt?: {
    id: string;
    number: number;
    httpStatus?: number | null;
  };
  callbackDeliveryId?: string;
  signature?: {
    version: "v1";
  };
  stats: {
    totalRuns: number;
    remainingRuns: number | null;  // null if no maxRuns set
    expiresAt: string | null;
  };
  reason?: "max_runs_reached" | "expired_at_reached";  // For task.expired event
}

// ============================================
// API RESPONSES
// ============================================

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
  role: MemberRole;
  actorType?: AuditActorType;
  scopes?: string[];
  apiKeyId?: string | null;
}
