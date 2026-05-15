import type {
  ApiResponse,
  AuditEventCreateInput,
  AuditEventRecord,
  TaskCreateInput,
  TaskDispatchInput,
  TaskPatchInput,
  ScheduleConfigInput,
  SecretCreateInput,
  TaskRecord,
  TaskListInput,
  RunRecord,
  RunListInput,
  TaskCancelResult,
  BulkTaskCancelInput,
  BulkTaskCancelResult,
  RunReplayResult,
  BulkRunReplayInput,
  BulkRunReplayResult,
  CircuitBreakerListInput,
  CircuitBreakerRecord,
  ReconciliationCompareInput,
  ReconciliationCompareResult,
  SecretRecord,
  TimelineEntryRecord,
  UsageSnapshot,
  CreatedBy,
  OutboundPolicyPatchInput,
  OutboundPolicyRecord,
  TaskSource,
} from "@cronlet/shared";
import { ERROR_CODES, resolveSchedule, ScheduleParseError } from "@cronlet/shared";
import type {
  SummarizeAllOptions,
  TaskSummary,
  TaskSummaryOverview,
  TaskSummaryOptions,
} from "./summaries.js";
import {
  normalizeTaskSummaryOptions,
  summarizeTask,
  summarizeTasksOverview,
} from "./summaries.js";

const DEFAULT_BASE_URL = "https://api.cronlet.dev";

export interface CloudClientOptions {
  /**
   * Your Cronlet API key. Get one at https://app.cronlet.dev/settings
   */
  apiKey: string;
  /**
   * Base URL for the API. Defaults to https://api.cronlet.dev
   */
  baseUrl?: string;
  /**
   * Organization ID for multi-tenant contexts (internal use)
   */
  orgId?: string;
  /**
   * User ID for audit attribution (internal use)
   */
  userId?: string;
  /**
   * Role for authorization context (internal use)
   */
  role?: "viewer" | "member" | "admin" | "owner";
}

export interface AuditRecordInput {
  action: string;
  targetType: string;
  targetId: string;
  payloadHash?: string;
  actorType: string;
  actorId: string;
  metadata?: Record<string, unknown>;
}

export interface AuditEventFilter {
  actorType?: "user" | "api_key" | "agent" | "internal" | "webhook";
  action?: string;
  actionPrefix?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface RateLimitInfo {
  retryAfter?: number;
  limit?: number;
  remaining?: number;
  reset?: number;
}

export type ScheduleInput = ScheduleConfigInput | string;

export type TaskCreateRequest = Omit<TaskCreateInput, "schedule" | "source"> & {
  schedule: ScheduleInput;
};

export type TaskPatchRequest = Omit<TaskPatchInput, "schedule"> & {
  schedule?: ScheduleInput;
};

export type TaskDispatchRequest = TaskDispatchInput;

/**
 * Cronlet Cloud API client.
 *
 * @example
 * ```typescript
 * import { CloudClient } from '@cronlet/sdk';
 *
 * const cronlet = new CloudClient({
 *   apiKey: process.env.CRONLET_API_KEY!,
 * });
 *
 * // Create a scheduled task
 * const task = await cronlet.tasks.create({
 *   name: 'Daily Report',
 *   handler: { type: 'webhook', url: 'https://api.example.com/report' },
 *   schedule: 'daily at 9am',
 * });
 *
 * // List all tasks
 * const tasks = await cronlet.tasks.list();
 *
 * // Trigger a task manually
 * await cronlet.tasks.trigger(task.id);
 * ```
 */
export class CloudClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly orgId?: string;
  private readonly userId?: string;
  private readonly role?: string;

  constructor(options: CloudClientOptions) {
    if (!options.apiKey) {
      throw new Error("Cronlet API key is required");
    }
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.orgId = options.orgId;
    this.userId = options.userId;
    this.role = options.role;
  }

  private normalizeSchedule(schedule: ScheduleInput): ScheduleConfigInput {
    const result = resolveSchedule(schedule);
    if (!result.success) {
      throw new ScheduleParseError(schedule, result.error, result.code);
    }
    return result.config;
  }

  private normalizeTaskCreateInput(input: TaskCreateRequest, createdBy?: CreatedBy): TaskCreateInput {
    return {
      ...input,
      schedule: this.normalizeSchedule(input.schedule),
      source: this.getTaskSource(createdBy),
    };
  }

  private getTaskSource(createdBy?: CreatedBy): TaskSource {
    return createdBy?.type === "agent" ? "mcp" : "sdk";
  }

  private normalizeTaskPatchInput(input: TaskPatchRequest): TaskPatchInput {
    const { schedule, ...rest } = input;

    if (schedule === undefined) {
      return rest;
    }

    return {
      ...rest,
      schedule: this.normalizeSchedule(schedule),
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
    };

    // Add internal context headers if provided
    if (this.orgId) headers["x-cronlet-org-id"] = this.orgId;
    if (this.userId) headers["x-cronlet-user-id"] = this.userId;
    if (this.role) headers["x-cronlet-role"] = this.role;

    // Only set content-type for requests with a body
    if (init?.body) {
      headers["content-type"] = "application/json";
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init?.headers ?? {}),
      },
    });

    const payload = (await response.json()) as ApiResponse<T>;
    if (!response.ok || !payload.ok || !payload.data) {
      const retryAfterHeader = response.headers.get("retry-after");
      const limitHeader = response.headers.get("x-ratelimit-limit");
      const remainingHeader = response.headers.get("x-ratelimit-remaining");
      const resetHeader = response.headers.get("x-ratelimit-reset");
      const details = payload.error?.details as Record<string, unknown> | undefined;
      const retryAfter = Number(details?.retryAfter ?? retryAfterHeader);
      const limit = Number(limitHeader);
      const remaining = Number(remainingHeader);
      const reset = Number(resetHeader);

      if (response.status === 429 || payload.error?.code === ERROR_CODES.RATE_LIMITED) {
        throw new RateLimitError(
          payload.error?.message ?? `Request failed (${response.status})`,
          payload.error?.code,
          response.status,
          {
            retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
            limit: Number.isFinite(limit) ? limit : undefined,
            remaining: Number.isFinite(remaining) ? remaining : undefined,
            reset: Number.isFinite(reset) ? reset : undefined,
          },
          details,
        );
      }

      throw new CronletError(
        payload.error?.message ?? `Request failed (${response.status})`,
        payload.error?.code,
        response.status,
        details,
      );
    }

    return payload.data;
  }

  /**
   * Task management methods
   */
  readonly tasks = {
    /**
     * Create a new scheduled task
     */
    create: (input: TaskCreateRequest, createdBy?: CreatedBy): Promise<TaskRecord> =>
      this.request<TaskRecord>("/v1/tasks", {
        method: "POST",
        body: JSON.stringify({ ...this.normalizeTaskCreateInput(input, createdBy), createdBy }),
      }),

    /**
     * List all tasks
     */
    list: (filter?: TaskListInput): Promise<TaskRecord[]> => {
      const params = new URLSearchParams();
      if (filter?.status) params.set("status", filter.status);
      if (filter?.scheduleType) params.set("scheduleType", filter.scheduleType);
      if (filter?.externalId) params.set("externalId", filter.externalId);
      if (filter?.metadata) params.set("metadata", JSON.stringify(filter.metadata));
      if (filter?.nextRunAfter) params.set("nextRunAfter", filter.nextRunAfter);
      if (filter?.nextRunBefore) params.set("nextRunBefore", filter.nextRunBefore);
      if (typeof filter?.limit === "number") params.set("limit", String(filter.limit));
      const query = params.toString() ? `?${params.toString()}` : "";
      return this.request<TaskRecord[]>(`/v1/tasks${query}`);
    },

    findByExternalId: async (externalId: string): Promise<TaskRecord | null> => {
      const tasks = await this.tasks.list({ externalId, limit: 1 });
      return tasks[0] ?? null;
    },

    findByMetadata: (metadata: Record<string, unknown>, limit = 100): Promise<TaskRecord[]> =>
      this.tasks.list({ metadata, limit }),

    /**
     * Get a task by ID
     */
    get: (taskId: string): Promise<TaskRecord> =>
      this.request<TaskRecord>(`/v1/tasks/${taskId}`),

    timeline: (taskId: string, limit?: number): Promise<TimelineEntryRecord[]> => {
      const query = typeof limit === "number" ? `?limit=${limit}` : "";
      return this.request<TimelineEntryRecord[]>(`/v1/tasks/${taskId}/timeline${query}`);
    },

    /**
     * Update a task
     */
    patch: (taskId: string, input: TaskPatchRequest): Promise<TaskRecord> =>
      this.request<TaskRecord>(`/v1/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(this.normalizeTaskPatchInput(input)),
      }),

    /**
     * Delete a task
     */
    delete: (taskId: string): Promise<{ deleted: boolean }> =>
      this.request<{ deleted: boolean }>(`/v1/tasks/${taskId}`, {
        method: "DELETE",
      }),

    /**
     * Cancel a task and prevent new delivery attempts from starting
     */
    cancel: (taskId: string): Promise<TaskCancelResult> =>
      this.request<TaskCancelResult>(`/v1/tasks/${taskId}/cancel`, {
        method: "POST",
      }),

    bulkCancel: (input: BulkTaskCancelInput): Promise<BulkTaskCancelResult> =>
      this.request<BulkTaskCancelResult>("/v1/tasks/bulk-cancel", {
        method: "POST",
        body: JSON.stringify(input),
      }),

    /**
     * Trigger a task to run immediately
     */
    trigger: (taskId: string): Promise<RunRecord> =>
      this.request<RunRecord>(`/v1/tasks/${taskId}/trigger`, {
        method: "POST",
      }),

    /**
     * Pause a task (stops scheduled runs)
     */
    pause: (taskId: string): Promise<TaskRecord> =>
      this.request<TaskRecord>(`/v1/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      }),

    /**
     * Resume a paused task
     */
    resume: (taskId: string): Promise<TaskRecord> =>
      this.request<TaskRecord>(`/v1/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ active: true }),
      }),

    /**
     * Summarize recent runs for a task in an agent-readable format
     */
    summarize: async (taskId: string, options?: TaskSummaryOptions): Promise<TaskSummary> => {
      const resolvedOptions = normalizeTaskSummaryOptions(options);
      const [task, runs] = await Promise.all([
        this.request<TaskRecord>(`/v1/tasks/${taskId}`),
        this.runs.list(taskId, resolvedOptions.limit),
      ]);

      return summarizeTask(task, runs, resolvedOptions);
    },

    /**
     * Summarize recent runs across tasks in an agent-readable format
     */
    summarizeAll: async (options?: SummarizeAllOptions): Promise<TaskSummaryOverview> => {
      const resolvedOptions = normalizeTaskSummaryOptions(options);
      const tasks = await this.tasks.list();
      const filteredTasks = options?.taskIds
        ? tasks.filter((task) => options.taskIds?.includes(task.id))
        : tasks;

      const taskRuns = await Promise.all(
        filteredTasks.map(async (task) => [task.id, await this.runs.list(task.id, resolvedOptions.limit)] as const)
      );

      return summarizeTasksOverview(filteredTasks, new Map(taskRuns), resolvedOptions);
    },
  };

  readonly outboundPolicy = {
    get: (): Promise<OutboundPolicyRecord> =>
      this.request<OutboundPolicyRecord>("/v1/outbound-policy"),

    update: (input: OutboundPolicyPatchInput): Promise<OutboundPolicyRecord> =>
      this.request<OutboundPolicyRecord>("/v1/outbound-policy", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
  };

  /**
   * Run a handler immediately without creating a visible scheduled task
   */
  dispatch = (input: TaskDispatchRequest): Promise<RunRecord> =>
    this.request<RunRecord>("/v1/dispatch", {
      method: "POST",
      body: JSON.stringify(input),
    });

  /**
   * Run history methods
   */
  readonly runs = {
    /**
     * List runs, optionally filtered by task
     */
    list: (filterOrTaskId?: string | RunListInput, limit?: number): Promise<RunRecord[]> => {
      const params = new URLSearchParams();
      if (typeof filterOrTaskId === "string") {
        params.set("taskId", filterOrTaskId);
        if (limit) params.set("limit", String(limit));
      } else if (filterOrTaskId) {
        if (filterOrTaskId.taskId) params.set("taskId", filterOrTaskId.taskId);
        if (filterOrTaskId.status) params.set("status", filterOrTaskId.status);
        if (filterOrTaskId.externalId) params.set("externalId", filterOrTaskId.externalId);
        if (filterOrTaskId.metadata) params.set("metadata", JSON.stringify(filterOrTaskId.metadata));
        if (filterOrTaskId.scheduledAfter) params.set("scheduledAfter", filterOrTaskId.scheduledAfter);
        if (filterOrTaskId.scheduledBefore) params.set("scheduledBefore", filterOrTaskId.scheduledBefore);
        if (filterOrTaskId.limit) params.set("limit", String(filterOrTaskId.limit));
      }
      const query = params.toString() ? `?${params.toString()}` : "";
      return this.request<RunRecord[]>(`/v1/runs${query}`);
    },

    find: (filter: RunListInput): Promise<RunRecord[]> =>
      this.runs.list(filter),

    /**
     * Get a specific run by ID
     */
    get: (runId: string): Promise<RunRecord> =>
      this.request<RunRecord>(`/v1/runs/${runId}`),

    timeline: (runId: string, limit?: number): Promise<TimelineEntryRecord[]> => {
      const query = typeof limit === "number" ? `?limit=${limit}` : "";
      return this.request<TimelineEntryRecord[]>(`/v1/runs/${runId}/timeline${query}`);
    },

    /**
     * Replay a previous run as a new delivery attempt chain
     */
    replay: (runId: string): Promise<RunReplayResult> =>
      this.request<RunReplayResult>(`/v1/runs/${runId}/replay`, {
        method: "POST",
      }),

    bulkReplay: (input: BulkRunReplayInput): Promise<BulkRunReplayResult> =>
      this.request<BulkRunReplayResult>("/v1/runs/bulk-replay", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  };

  readonly reconciliation = {
    compare: (input: ReconciliationCompareInput): Promise<ReconciliationCompareResult> =>
      this.request<ReconciliationCompareResult>("/v1/reconciliation/compare", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  };

  readonly circuitBreakers = {
    list: (filter?: CircuitBreakerListInput): Promise<CircuitBreakerRecord[]> => {
      const params = new URLSearchParams();
      if (filter?.state) params.set("state", filter.state);
      if (filter?.destinationKey) params.set("destinationKey", filter.destinationKey);
      if (typeof filter?.limit === "number") params.set("limit", String(filter.limit));
      const query = params.toString() ? `?${params.toString()}` : "";
      return this.request<CircuitBreakerRecord[]>(`/v1/circuit-breakers${query}`);
    },
  };

  /**
   * Secret management methods
   */
  readonly secrets = {
    /**
     * List all secrets (values are masked)
     */
    list: (): Promise<SecretRecord[]> => this.request<SecretRecord[]>("/v1/secrets"),

    /**
     * Create a new secret
     */
    create: (input: SecretCreateInput): Promise<SecretRecord> =>
      this.request<SecretRecord>("/v1/secrets", {
        method: "POST",
        body: JSON.stringify(input),
      }),

    patch: (name: string, value: string): Promise<SecretRecord> =>
      this.request<SecretRecord>(`/v1/secrets/${encodeURIComponent(name)}`, {
        method: "PATCH",
        body: JSON.stringify({ value }),
      }),

    rotate: (name: string): Promise<SecretRecord> =>
      this.request<SecretRecord>(`/v1/secrets/${encodeURIComponent(name)}/rotate`, {
        method: "POST",
      }),

    /**
     * Delete a secret by name
     */
    delete: (name: string): Promise<{ deleted: boolean }> =>
      this.request<{ deleted: boolean }>(`/v1/secrets/${encodeURIComponent(name)}`, {
        method: "DELETE",
      }),
  };

  /**
   * Usage information
   */
  readonly usage = {
    /**
     * Get current usage snapshot
     */
    get: (): Promise<UsageSnapshot> => this.request<UsageSnapshot>("/v1/usage"),
  };

  /**
   * Audit event recording (internal use)
   */
  readonly audit = {
    list: (filter?: AuditEventFilter): Promise<AuditEventRecord[]> => {
      const params = new URLSearchParams();
      if (filter?.actorType) params.set("actorType", filter.actorType);
      if (filter?.action) params.set("action", filter.action);
      if (filter?.actionPrefix) params.set("actionPrefix", filter.actionPrefix);
      if (filter?.targetType) params.set("targetType", filter.targetType);
      if (filter?.targetId) params.set("targetId", filter.targetId);
      if (filter?.from) params.set("from", filter.from);
      if (filter?.to) params.set("to", filter.to);
      if (typeof filter?.limit === "number") params.set("limit", String(filter.limit));
      const query = params.toString() ? `?${params.toString()}` : "";
      return this.request<AuditEventRecord[]>(`/v1/audit-events${query}`);
    },

    /**
     * Record an audit event
     */
    record: (input: AuditRecordInput | AuditEventCreateInput): Promise<{ recorded: boolean }> =>
      this.request<{ recorded: boolean }>("/v1/audit-events", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  };
}

/**
 * Error thrown by the Cronlet API
 */
export class CronletError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CronletError";
  }
}

export class RateLimitError extends CronletError {
  readonly retryAfter?: number;
  readonly limit?: number;
  readonly remaining?: number;
  readonly reset?: number;

  constructor(
    message: string,
    code?: string,
    status?: number,
    info?: RateLimitInfo,
    details?: Record<string, unknown>,
  ) {
    super(message, code, status, details);
    this.name = "RateLimitError";
    this.retryAfter = info?.retryAfter;
    this.limit = info?.limit;
    this.remaining = info?.remaining;
    this.reset = info?.reset;
  }
}

export { ScheduleParseError };
