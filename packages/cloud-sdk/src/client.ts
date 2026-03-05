import type {
  AuditEventCreateInput,
  AuditEventRecord,
  AlertCreateInput,
  ApiResponse,
  TaskCreateInput,
  TaskPatchInput,
  SecretCreateInput,
  AlertRecord,
  TaskRecord,
  RunRecord,
  SecretRecord,
  UsageSnapshot,
  CreatedBy,
} from "@cronlet/cloud-shared";

export interface CloudClientOptions {
  baseUrl: string;
  apiKey: string;
  orgId?: string;
  userId?: string;
  role?: "owner" | "admin" | "member" | "viewer";
}

export class CloudClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly orgId: string | null;
  private readonly userId: string | null;
  private readonly role: "owner" | "admin" | "member" | "viewer" | null;

  constructor(options: CloudClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.orgId = options.orgId ?? null;
    this.userId = options.userId ?? null;
    this.role = options.role ?? null;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-internal-token": this.apiKey,
        ...(this.orgId ? { "x-org-id": this.orgId } : {}),
        ...(this.userId ? { "x-user-id": this.userId } : {}),
        ...(this.role ? { "x-role": this.role } : {}),
        ...(init?.headers ?? {}),
      },
    });

    const payload = (await response.json()) as ApiResponse<T>;
    if (!response.ok || !payload.ok || !payload.data) {
      throw new Error(payload.error?.message ?? `Request failed (${response.status})`);
    }

    return payload.data;
  }

  readonly tasks = {
    create: (input: TaskCreateInput, createdBy?: CreatedBy): Promise<TaskRecord> =>
      this.request<TaskRecord>("/v1/tasks", {
        method: "POST",
        body: JSON.stringify({ ...input, createdBy }),
      }),
    list: (): Promise<TaskRecord[]> => this.request<TaskRecord[]>("/v1/tasks"),
    get: (taskId: string): Promise<TaskRecord> =>
      this.request<TaskRecord>(`/v1/tasks/${taskId}`),
    patch: (taskId: string, input: TaskPatchInput): Promise<TaskRecord> =>
      this.request<TaskRecord>(`/v1/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    delete: (taskId: string): Promise<{ deleted: boolean }> =>
      this.request<{ deleted: boolean }>(`/v1/tasks/${taskId}`, {
        method: "DELETE",
      }),
    trigger: (taskId: string): Promise<RunRecord> =>
      this.request<RunRecord>(`/v1/tasks/${taskId}/trigger`, {
        method: "POST",
      }),
  };

  readonly runs = {
    list: (taskId?: string, limit?: number): Promise<RunRecord[]> => {
      const params = new URLSearchParams();
      if (taskId) params.set("taskId", taskId);
      if (limit) params.set("limit", String(limit));
      const query = params.toString() ? `?${params.toString()}` : "";
      return this.request<RunRecord[]>(`/v1/runs${query}`);
    },
    get: (runId: string): Promise<RunRecord> => this.request<RunRecord>(`/v1/runs/${runId}`),
  };

  readonly secrets = {
    list: (): Promise<SecretRecord[]> => this.request<SecretRecord[]>("/v1/secrets"),
    create: (input: SecretCreateInput): Promise<SecretRecord> =>
      this.request<SecretRecord>("/v1/secrets", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    delete: (name: string): Promise<{ deleted: boolean }> =>
      this.request<{ deleted: boolean }>(`/v1/secrets/${encodeURIComponent(name)}`, {
        method: "DELETE",
      }),
  };

  readonly alerts = {
    create: (input: AlertCreateInput): Promise<AlertRecord> =>
      this.request<AlertRecord>("/v1/alerts", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    list: (): Promise<AlertRecord[]> => this.request<AlertRecord[]>("/v1/alerts"),
  };

  readonly usage = {
    get: (): Promise<UsageSnapshot> => this.request<UsageSnapshot>("/v1/usage"),
  };

  readonly audit = {
    list: (input: {
      actorType?: "user" | "api_key" | "internal" | "webhook";
      action?: string;
      actionPrefix?: string;
      from?: string;
      to?: string;
      limit?: number;
    } = {}): Promise<AuditEventRecord[]> => {
      const query = new URLSearchParams();
      if (input.actorType) {
        query.set("actorType", input.actorType);
      }
      if (input.action) {
        query.set("action", input.action);
      }
      if (input.actionPrefix) {
        query.set("actionPrefix", input.actionPrefix);
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
      return this.request<AuditEventRecord[]>(`/v1/audit-events${suffix}`);
    },
    record: (input: AuditEventCreateInput): Promise<{ recorded: boolean }> =>
      this.request<{ recorded: boolean }>("/v1/audit-events", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  };
}
