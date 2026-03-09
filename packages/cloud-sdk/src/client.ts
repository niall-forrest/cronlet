import type {
  ApiResponse,
  TaskCreateInput,
  TaskPatchInput,
  ScheduleConfigInput,
  SecretCreateInput,
  TaskRecord,
  RunRecord,
  SecretRecord,
  UsageSnapshot,
  CreatedBy,
} from "@cronlet/shared";
import { resolveSchedule, ScheduleParseError } from "@cronlet/shared";
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

export type ScheduleInput = ScheduleConfigInput | string;

export type TaskCreateRequest = Omit<TaskCreateInput, "schedule"> & {
  schedule: ScheduleInput;
};

export type TaskPatchRequest = Omit<TaskPatchInput, "schedule"> & {
  schedule?: ScheduleInput;
};

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

  private normalizeTaskCreateInput(input: TaskCreateRequest): TaskCreateInput {
    return {
      ...input,
      schedule: this.normalizeSchedule(input.schedule),
    };
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
      throw new CronletError(
        payload.error?.message ?? `Request failed (${response.status})`,
        payload.error?.code,
        response.status
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
        body: JSON.stringify({ ...this.normalizeTaskCreateInput(input), createdBy }),
      }),

    /**
     * List all tasks
     */
    list: (): Promise<TaskRecord[]> => this.request<TaskRecord[]>("/v1/tasks"),

    /**
     * Get a task by ID
     */
    get: (taskId: string): Promise<TaskRecord> =>
      this.request<TaskRecord>(`/v1/tasks/${taskId}`),

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

  /**
   * Run history methods
   */
  readonly runs = {
    /**
     * List runs, optionally filtered by task
     */
    list: (taskId?: string, limit?: number): Promise<RunRecord[]> => {
      const params = new URLSearchParams();
      if (taskId) params.set("taskId", taskId);
      if (limit) params.set("limit", String(limit));
      const query = params.toString() ? `?${params.toString()}` : "";
      return this.request<RunRecord[]>(`/v1/runs${query}`);
    },

    /**
     * Get a specific run by ID
     */
    get: (runId: string): Promise<RunRecord> =>
      this.request<RunRecord>(`/v1/runs/${runId}`),
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
    /**
     * Record an audit event
     */
    record: (input: AuditRecordInput): Promise<{ id: string }> =>
      this.request<{ id: string }>("/v1/audit", {
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
    public readonly status?: number
  ) {
    super(message);
    this.name = "CronletError";
  }
}

export { ScheduleParseError };
