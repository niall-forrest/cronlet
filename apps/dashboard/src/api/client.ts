const API_BASE = "/api";

export interface Job {
  id: string;
  name: string;
  schedule: string;
  cron: string;
  timezone?: string;
  status: "idle" | "running" | "failed" | "success";
  lastRun: {
    runId: string;
    status: string;
    duration: number;
    completedAt: string;
  } | null;
  nextRun: string | null;
}

export interface JobDetail extends Job {
  config: {
    retry?: {
      attempts: number;
      backoff?: string;
      initialDelay?: string;
    };
    timeout?: string;
  };
}

export interface JobRun {
  runId: string;
  status: "success" | "failure" | "timeout";
  startedAt: string;
  completedAt: string;
  duration: number;
  attempt: number;
  error?: {
    message: string;
    stack?: string;
  };
}

export async function fetchJobs(): Promise<Job[]> {
  const res = await fetch(`${API_BASE}/jobs`);
  if (!res.ok) throw new Error("Failed to fetch jobs");
  return res.json();
}

export async function fetchJob(id: string): Promise<JobDetail> {
  const res = await fetch(`${API_BASE}/jobs/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Failed to fetch job");
  return res.json();
}

export async function fetchJobRuns(id: string): Promise<JobRun[]> {
  const res = await fetch(`${API_BASE}/jobs/${encodeURIComponent(id)}/runs`);
  if (!res.ok) throw new Error("Failed to fetch job runs");
  return res.json();
}

export async function triggerJob(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/jobs/${encodeURIComponent(id)}/trigger`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to trigger job");
}
