import type {
  EndpointRecord,
  JobRecord,
  ScheduleRecord,
  ApiResponse,
  ProjectRecord,
  UsageSnapshot,
} from "@cronlet/cloud-shared";
import type { CloudAuthConfig, CloudLinkConfig } from "./config.js";

interface RequestContext {
  auth: CloudAuthConfig;
  link: CloudLinkConfig;
}

async function request<T>(context: RequestContext, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${context.auth.apiUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${context.auth.apiKey}`,
      "x-org-id": context.link.orgId,
      "x-user-id": "cli_user",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.ok || payload.data === undefined) {
    throw new Error(payload.error?.message ?? `Request failed (${response.status})`);
  }

  return payload.data;
}

export async function healthcheck(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export function listProjects(context: RequestContext): Promise<ProjectRecord[]> {
  return request<ProjectRecord[]>(context, "/v1/projects");
}

export function listUsage(context: RequestContext): Promise<UsageSnapshot> {
  return request<UsageSnapshot>(context, "/v1/usage");
}

export function listEndpoints(context: RequestContext): Promise<EndpointRecord[]> {
  return request<EndpointRecord[]>(context, "/v1/endpoints");
}

export function createEndpoint(
  context: RequestContext,
  body: {
    projectId: string;
    environment: string;
    name: string;
    url: string;
    authMode: "none";
    timeoutMs: number;
  }
): Promise<EndpointRecord> {
  return request<EndpointRecord>(context, "/v1/endpoints", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listJobs(context: RequestContext): Promise<JobRecord[]> {
  return request<JobRecord[]>(context, "/v1/jobs");
}

export function createJob(
  context: RequestContext,
  body: {
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
  }
): Promise<JobRecord> {
  return request<JobRecord>(context, "/v1/jobs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listSchedules(context: RequestContext): Promise<ScheduleRecord[]> {
  return request<ScheduleRecord[]>(context, "/v1/schedules");
}

export function createSchedule(
  context: RequestContext,
  body: {
    jobId: string;
    cron: string;
    timezone: string;
    active: boolean;
  }
): Promise<ScheduleRecord> {
  return request<ScheduleRecord>(context, "/v1/schedules", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
