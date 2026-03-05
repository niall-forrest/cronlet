import type { DispatchInstruction, InternalRunStatusInput } from "@cronlet/shared";

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    message: string;
  };
}

export class CloudApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-internal-token": this.internalToken,
        ...(init?.headers ?? {}),
      },
    });

    const payload = (await response.json()) as ApiResponse<T>;
    if (!response.ok || !payload.ok || payload.data === undefined) {
      throw new Error(payload.error?.message ?? `API request failed: ${response.status}`);
    }

    return payload.data;
  }

  claimDueTasks(limit: number): Promise<DispatchInstruction[]> {
    return this.request<DispatchInstruction[]>(`/internal/tasks/due?limit=${limit}`);
  }

  updateRunStatus(runId: string, input: InternalRunStatusInput): Promise<void> {
    return this.request<void>(`/internal/runs/${runId}/status`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  getSecretValue(orgId: string, name: string): Promise<{ value: string }> {
    return this.request<{ value: string }>(`/internal/secrets/${name}`, {
      headers: {
        "x-org-id": orgId,
      },
    });
  }
}
