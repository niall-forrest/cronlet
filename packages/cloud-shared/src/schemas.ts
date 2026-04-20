import { z } from "zod";
import { MAX_TASK_HANDLER_STEPS, MAX_TASK_METADATA_BYTES, getMetadataSizeBytes } from "./guardrails";

// ============================================
// COMMON
// ============================================

const durationSchema = z.string().regex(/^\d+(ms|s|m|h|d)$/);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/); // HH:MM format
const dayOfWeek = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const taskSourceSchema = z.enum(["dashboard", "mcp", "sdk"]);

// ============================================
// HANDLER CONFIGS
// ============================================

const toolStepSchema = z.object({
  tool: z.string().min(1).max(100),
  args: z.record(z.unknown()),
  outputKey: z.string().min(1).max(50).optional(),
});

const toolsHandlerConfigSchema = z.object({
  type: z.literal("tools"),
  steps: z.array(toolStepSchema).min(1).max(MAX_TASK_HANDLER_STEPS),
});

const metadataSchema = z.record(z.unknown()).superRefine((metadata, ctx) => {
  const sizeBytes = getMetadataSizeBytes(metadata);
  if (sizeBytes > MAX_TASK_METADATA_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Metadata must be ${MAX_TASK_METADATA_BYTES} bytes or less.`,
    });
  }
});

const webhookHandlerConfigSchema = z.object({
  type: z.literal("webhook"),
  url: z.string().url(),
  method: z.enum(["GET", "POST"]).default("POST"),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  followRedirects: z.boolean().default(false).optional(),
  maxRedirects: z.number().int().min(0).max(10).default(0).optional(),
  auth: z
    .object({
      type: z.enum(["bearer", "basic", "header"]),
      secretName: z.string().min(1).max(100),
    })
    .optional(),
});

const codeHandlerConfigSchema = z.object({
  type: z.literal("code"),
  runtime: z.literal("javascript"),
  code: z.string().min(1).max(50000),
});

export const handlerConfigSchema = z.discriminatedUnion("type", [
  toolsHandlerConfigSchema,
  webhookHandlerConfigSchema,
  codeHandlerConfigSchema,
]);

// ============================================
// SCHEDULE CONFIGS
// ============================================

const everyScheduleConfigSchema = z.object({
  type: z.literal("every"),
  interval: durationSchema,
});

const dailyScheduleConfigSchema = z.object({
  type: z.literal("daily"),
  times: z.array(timeSchema).min(1).max(24),
});

const weeklyScheduleConfigSchema = z.object({
  type: z.literal("weekly"),
  days: z.array(dayOfWeek).min(1).max(7),
  time: timeSchema,
});

const monthlyScheduleConfigSchema = z.object({
  type: z.literal("monthly"),
  day: z.union([
    z.number().int().min(1).max(31),
    z.enum([
      "last",
      "last-mon",
      "last-tue",
      "last-wed",
      "last-thu",
      "last-fri",
      "last-sat",
      "last-sun",
    ]),
  ]),
  time: timeSchema,
});

const onceScheduleConfigSchema = z.object({
  type: z.literal("once"),
  at: z.string().datetime(),
});

const cronScheduleConfigSchema = z.object({
  type: z.literal("cron"),
  expression: z.string().min(5).max(120),
});

export const scheduleConfigSchema = z.discriminatedUnion("type", [
  everyScheduleConfigSchema,
  dailyScheduleConfigSchema,
  weeklyScheduleConfigSchema,
  monthlyScheduleConfigSchema,
  onceScheduleConfigSchema,
  cronScheduleConfigSchema,
]);

// ============================================
// TASK
// ============================================

export const taskCreateSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  externalId: z.string().min(1).max(200).optional(),
  handler: handlerConfigSchema,
  schedule: scheduleConfigSchema,
  timezone: z.string().min(2).max(80).default("UTC"),
  retryAttempts: z.number().int().min(1).max(10).default(1),
  retryBackoff: z.enum(["linear", "exponential"]).default("linear"),
  retryDelay: durationSchema.default("1s"),
  retryMaxAttempts: z.number().int().min(1).max(100).default(10),
  retryInitialDelay: durationSchema.default("10s"),
  retryMaxDelay: durationSchema.default("15m"),
  retryJitter: z.boolean().default(true),
  retryWindow: durationSchema.default("24h"),
  retryOnStatusCodes: z.array(z.number().int().min(100).max(599)).default([]),
  terminalStatusCodes: z.array(z.number().int().min(100).max(599)).default([]),
  timeout: durationSchema.default("30s"),
  active: z.boolean().default(true),
  source: taskSourceSchema.default("dashboard"),
  // Agent callback - closes the autonomous loop
  callbackUrl: z.string().url().max(500).optional(),
  metadata: metadataSchema.optional(),
  // Conditional scheduling - task auto-expires
  maxRuns: z.number().int().min(1).max(10000).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const taskPatchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  externalId: z.string().min(1).max(200).nullable().optional(),
  handler: handlerConfigSchema.optional(),
  schedule: scheduleConfigSchema.optional(),
  timezone: z.string().min(2).max(80).optional(),
  retryAttempts: z.number().int().min(1).max(10).optional(),
  retryBackoff: z.enum(["linear", "exponential"]).optional(),
  retryDelay: durationSchema.optional(),
  retryMaxAttempts: z.number().int().min(1).max(100).optional(),
  retryInitialDelay: durationSchema.optional(),
  retryMaxDelay: durationSchema.optional(),
  retryJitter: z.boolean().optional(),
  retryWindow: durationSchema.optional(),
  retryOnStatusCodes: z.array(z.number().int().min(100).max(599)).optional(),
  terminalStatusCodes: z.array(z.number().int().min(100).max(599)).optional(),
  timeout: durationSchema.optional(),
  active: z.boolean().optional(),
  // Agent callback
  callbackUrl: z.string().url().max(500).nullable().optional(),
  metadata: metadataSchema.nullable().optional(),
  // Conditional scheduling
  maxRuns: z.number().int().min(1).max(10000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const taskDispatchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  handler: handlerConfigSchema,
  retryAttempts: z.number().int().min(1).max(10).default(1),
  retryBackoff: z.enum(["linear", "exponential"]).default("linear"),
  retryDelay: durationSchema.default("1s"),
  retryMaxAttempts: z.number().int().min(1).max(100).default(10),
  retryInitialDelay: durationSchema.default("10s"),
  retryMaxDelay: durationSchema.default("15m"),
  retryJitter: z.boolean().default(true),
  retryWindow: durationSchema.default("24h"),
  retryOnStatusCodes: z.array(z.number().int().min(100).max(599)).default([]),
  terminalStatusCodes: z.array(z.number().int().min(100).max(599)).default([]),
  timeout: durationSchema.default("30s"),
  callbackUrl: z.string().url().max(500).optional(),
  metadata: metadataSchema.optional(),
});

// ============================================
// SECRET
// ============================================

export const secretCreateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Z][A-Z0-9_]*$/, "Secret name must be uppercase with underscores"),
  value: z.string().min(1).max(10000),
});

export const secretPatchSchema = z.object({
  value: z.string().min(1).max(10000),
});

// ============================================
// ALERT
// ============================================

export const alertCreateSchema = z.object({
  channel: z.enum(["email", "webhook"]),
  destination: z.string().min(3).max(300),
  onFailure: z.boolean().default(true),
  onTimeout: z.boolean().default(true),
});

// ============================================
// API KEY
// ============================================

export const apiKeyCreateSchema = z.object({
  label: z.string().min(2).max(80),
  scopes: z.array(z.string().min(1).max(120)).min(1),
});

export const apiKeyRotateSchema = z.object({
  label: z.string().min(2).max(80).optional(),
  scopes: z.array(z.string().min(1).max(120)).min(1).optional(),
});

// ============================================
// AUDIT
// ============================================

export const auditEventListSchema = z.object({
  actorType: z.enum(["user", "api_key", "agent", "internal", "webhook"]).optional(),
  action: z.string().min(1).max(120).optional(),
  actionPrefix: z.string().min(1).max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const auditEventCreateSchema = z.object({
  actorType: z.enum(["user", "api_key", "agent", "internal", "webhook"]).optional(),
  actorId: z.string().min(1).max(200).optional(),
  action: z.string().min(1).max(120),
  targetType: z.string().min(1).max(120),
  targetId: z.string().min(1).max(200),
  payloadHash: z.string().min(1).max(200).optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

// ============================================
// INTERNAL (Worker)
// ============================================

export const internalRunStatusSchema = z.object({
  status: z.enum(["queued", "leased", "running", "retry_wait", "success", "failure", "timeout", "cancelled", "dead_lettered", "terminal_client_error", "retry_window_expired"]),
  attempt: z.number().int().min(1),
  durationMs: z.number().int().min(0).optional(),
  output: z.record(z.unknown()).nullable().optional(),
  logs: z.string().max(100000).nullable().optional(),
  errorMessage: z.string().max(1000).optional(),
});

export const internalDispatchStartSchema = z.object({
  dispatchJobId: z.string().min(1),
  attemptId: z.string().min(1),
  attemptNumber: z.number().int().min(1),
});

export const internalDispatchCompleteSchema = z.object({
  dispatchJobId: z.string().min(1),
  attemptId: z.string().min(1),
  attemptNumber: z.number().int().min(1),
  status: z.enum(["success", "failure", "timeout", "terminal_client_error"]),
  durationMs: z.number().int().min(0),
  output: z.record(z.unknown()).nullable().optional(),
  logs: z.string().max(100000).nullable().optional(),
  httpStatus: z.number().int().min(100).max(599).nullable().optional(),
  errorClass: z.string().max(120).nullable().optional(),
  errorMessage: z.string().max(1000).nullable().optional(),
  responseBodyPreview: z.string().max(400).nullable().optional(),
  responseBodyHash: z.string().max(128).nullable().optional(),
});

export const taskListQuerySchema = z.object({
  status: z.enum(["active", "paused", "cancelled"]).optional(),
  scheduleType: z.enum(["every", "daily", "weekly", "monthly", "once", "cron"]).optional(),
  externalId: z.string().min(1).max(200).optional(),
  metadata: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});

export const runListQuerySchema = z.object({
  taskId: z.string().optional(),
  status: z.enum(["queued", "leased", "running", "retry_wait", "success", "failure", "timeout", "cancelled", "dead_lettered", "terminal_client_error", "retry_window_expired"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});

// ============================================
// INFERRED TYPES
// ============================================

export type TaskCreateInput = z.input<typeof taskCreateSchema>;
export type TaskPatchInput = z.infer<typeof taskPatchSchema>;
export type TaskDispatchInput = z.input<typeof taskDispatchSchema>;
export type SecretCreateInput = z.infer<typeof secretCreateSchema>;
export type SecretPatchInput = z.infer<typeof secretPatchSchema>;
export type AlertCreateInput = z.infer<typeof alertCreateSchema>;
export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;
export type ApiKeyRotateInput = z.infer<typeof apiKeyRotateSchema>;
export type AuditEventListInput = z.infer<typeof auditEventListSchema>;
export type AuditEventCreateInput = z.infer<typeof auditEventCreateSchema>;
export type InternalRunStatusInput = z.infer<typeof internalRunStatusSchema>;
export type HandlerConfigInput = z.infer<typeof handlerConfigSchema>;
export type ScheduleConfigInput = z.infer<typeof scheduleConfigSchema>;
