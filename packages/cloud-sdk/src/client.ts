import type {
  AlertCreateInput,
  ApiResponse,
  EndpointCreateInput,
  JobCreateInput,
  ProjectCreateInput,
  ScheduleCreateInput,
  SchedulePatchInput,
  AlertRecord,
  EndpointRecord,
  JobRecord,
  ProjectRecord,
  RunRecord,
  ScheduleRecord,
  UsageSnapshot,
} from "@cronlet/cloud-shared";

export interface CloudClientOptions {
  baseUrl: string;
  apiKey: string;
}

export class CloudClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: CloudClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
        ...(init?.headers ?? {}),
      },
    });

    const payload = (await response.json()) as ApiResponse<T>;
    if (!response.ok || !payload.ok || !payload.data) {
      throw new Error(payload.error?.message ?? `Request failed (${response.status})`);
    }

    return payload.data;
  }

  readonly projects = {
    create: (input: ProjectCreateInput): Promise<ProjectRecord> =>
      this.request<ProjectRecord>("/v1/projects", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    list: (): Promise<ProjectRecord[]> => this.request<ProjectRecord[]>("/v1/projects"),
  };

  readonly endpoints = {
    create: (input: EndpointCreateInput): Promise<EndpointRecord> =>
      this.request<EndpointRecord>("/v1/endpoints", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    list: (): Promise<EndpointRecord[]> => this.request<EndpointRecord[]>("/v1/endpoints"),
  };

  readonly jobs = {
    create: (input: JobCreateInput): Promise<JobRecord> =>
      this.request<JobRecord>("/v1/jobs", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    list: (): Promise<JobRecord[]> => this.request<JobRecord[]>("/v1/jobs"),
    trigger: (jobId: string): Promise<RunRecord> =>
      this.request<RunRecord>(`/v1/jobs/${jobId}/trigger`, {
        method: "POST",
      }),
  };

  readonly schedules = {
    create: (input: ScheduleCreateInput): Promise<ScheduleRecord> =>
      this.request<ScheduleRecord>("/v1/schedules", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    patch: (scheduleId: string, input: SchedulePatchInput): Promise<ScheduleRecord> =>
      this.request<ScheduleRecord>(`/v1/schedules/${scheduleId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
  };

  readonly runs = {
    list: (): Promise<RunRecord[]> => this.request<RunRecord[]>("/v1/runs"),
    get: (runId: string): Promise<RunRecord> => this.request<RunRecord>(`/v1/runs/${runId}`),
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
}
