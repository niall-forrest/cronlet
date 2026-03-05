// ============================================
// ENUMS
// ============================================

export type PlanTier = "free" | "pro" | "team";

export type HandlerType = "tools" | "code" | "webhook";

export type ScheduleType = "every" | "daily" | "weekly" | "monthly" | "once" | "cron";

export type RunStatus = "queued" | "running" | "success" | "failure" | "timeout";

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

// ============================================
// RECORDS
// ============================================

export interface TaskRecord {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  handlerType: HandlerType;
  handlerConfig: HandlerConfig;
  scheduleType: ScheduleType;
  scheduleConfig: ScheduleConfig;
  timezone: string;
  nextRunAt: string | null;
  retryAttempts: number;
  retryBackoff: "linear" | "exponential";
  retryDelay: string;
  timeout: string;
  active: boolean;
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

export interface SecretRecord {
  id: string;
  orgId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  // Note: encryptedValue is never exposed via API
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

export interface UsageSnapshot {
  tier: PlanTier;
  month: string;
  runAttempts: number;
  runLimit: number;
  retentionDays: number;
  delinquent: boolean;
  graceEndsAt: string | null;
}

// ============================================
// DISPATCH (Worker)
// ============================================

export interface DispatchInstruction {
  runId: string;
  orgId: string;
  taskId: string;
  handlerType: HandlerType;
  handlerConfig: HandlerConfig;
  timeoutMs: number;
  retryAttempts: number;
  retryBackoff: "linear" | "exponential";
  retryDelay: string;
  // Callback info for agent loop
  callbackUrl: string | null;
  metadata: Record<string, unknown> | null;
  maxRuns: number | null;
  runCount: number;
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
    metadata: Record<string, unknown> | null;
  };
  run?: {
    id: string;
    status: RunStatus;
    output: Record<string, unknown> | null;
    errorMessage: string | null;
    durationMs: number | null;
    attempt: number;
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
