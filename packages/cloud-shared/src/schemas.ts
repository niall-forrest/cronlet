import { z } from "zod";

const durationSchema = z.string().regex(/^\d+(ms|s|m|h|d)$/);

export const projectCreateSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
});

export const endpointCreateSchema = z.object({
  projectId: z.string().min(1),
  environment: z.string().min(1).max(40).default("prod"),
  name: z.string().min(2).max(80),
  url: z.string().url(),
  authMode: z.enum(["none", "bearer", "basic", "header"]).default("none"),
  authSecretRef: z.string().max(160).optional(),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000),
});

export const endpointPatchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  url: z.string().url().optional(),
  authMode: z.enum(["none", "bearer", "basic", "header"]).optional(),
  authSecretRef: z.string().max(160).nullable().optional(),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
});

export const jobCreateSchema = z.object({
  projectId: z.string().min(1),
  environment: z.string().min(1).max(40).default("prod"),
  endpointId: z.string().min(1),
  name: z.string().min(2).max(120),
  key: z.string().min(2).max(160),
  concurrency: z.enum(["allow", "skip", "queue"]).default("skip"),
  catchup: z.boolean().default(false),
  retryAttempts: z.number().int().min(1).max(10).default(1),
  retryBackoff: z.enum(["linear", "exponential"]).default("linear"),
  retryInitialDelay: durationSchema.default("1s"),
  timeout: durationSchema.default("30s"),
});

export const jobPatchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  concurrency: z.enum(["allow", "skip", "queue"]).optional(),
  catchup: z.boolean().optional(),
  retryAttempts: z.number().int().min(1).max(10).optional(),
  retryBackoff: z.enum(["linear", "exponential"]).optional(),
  retryInitialDelay: durationSchema.optional(),
  timeout: durationSchema.optional(),
  active: z.boolean().optional(),
});

export const scheduleCreateSchema = z.object({
  jobId: z.string().min(1),
  cron: z.string().min(5).max(120),
  timezone: z.string().min(2).max(80).default("UTC"),
  active: z.boolean().default(true),
});

export const schedulePatchSchema = z.object({
  cron: z.string().min(5).max(120).optional(),
  timezone: z.string().min(2).max(80).optional(),
  active: z.boolean().optional(),
});

export const alertCreateSchema = z.object({
  projectId: z.string().min(1),
  channel: z.enum(["email", "webhook"]),
  destination: z.string().min(3).max(300),
  onFailure: z.boolean().default(true),
  onTimeout: z.boolean().default(true),
});

export const apiKeyCreateSchema = z.object({
  label: z.string().min(2).max(80),
  scopes: z.array(z.string().min(1).max(120)).min(1),
});

export const apiKeyRotateSchema = z.object({
  label: z.string().min(2).max(80).optional(),
  scopes: z.array(z.string().min(1).max(120)).min(1).optional(),
});

export const auditEventListSchema = z.object({
  actorType: z.enum(["user", "api_key", "internal", "webhook"]).optional(),
  action: z.string().min(1).max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const internalRunStatusSchema = z.object({
  status: z.enum(["queued", "running", "success", "failure", "timeout"]),
  attempt: z.number().int().min(1),
  durationMs: z.number().int().min(0).optional(),
  errorMessage: z.string().max(1000).optional(),
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type EndpointCreateInput = z.infer<typeof endpointCreateSchema>;
export type EndpointPatchInput = z.infer<typeof endpointPatchSchema>;
export type JobCreateInput = z.infer<typeof jobCreateSchema>;
export type JobPatchInput = z.infer<typeof jobPatchSchema>;
export type ScheduleCreateInput = z.infer<typeof scheduleCreateSchema>;
export type SchedulePatchInput = z.infer<typeof schedulePatchSchema>;
export type AlertCreateInput = z.infer<typeof alertCreateSchema>;
export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;
export type ApiKeyRotateInput = z.infer<typeof apiKeyRotateSchema>;
export type AuditEventListInput = z.infer<typeof auditEventListSchema>;
export type InternalRunStatusInput = z.infer<typeof internalRunStatusSchema>;
