export interface McpToolDefinition {
  name:
    | "list_projects"
    | "list_jobs"
    | "list_runs"
    | "trigger_job"
    | "pause_schedule"
    | "update_schedule"
    | "get_failure_summary";
  description: string;
  mutating: boolean;
  critical: boolean;
  enabled: boolean;
}

export interface McpApprovalRequest {
  id: string;
  tool: McpToolDefinition["name"];
  projectId: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  requestedBy: string;
  status: "pending" | "approved" | "rejected" | "executed";
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
}

export interface McpAuditEvent {
  id: string;
  createdAt: string;
  actorId: string;
  action: string;
  status: "success" | "denied" | "approval_required" | "error";
  tool: McpToolDefinition["name"] | null;
  projectId: string | null;
  targetId: string | null;
  approvalId: string | null;
  payloadHash: string | null;
  message: string | null;
}

export interface McpHealth {
  ok: boolean;
  service: string;
  enableWrites: boolean;
  principals: Array<{
    id: string;
    allowWrites: boolean;
    canApprove: boolean;
    projectIds: string[];
    scopes: string[];
  }>;
}

interface McpApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

const BASE_URL =
  (import.meta.env.VITE_CLOUD_MCP_BASE_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://127.0.0.1:4060";

const MCP_TOKEN = import.meta.env.VITE_CLOUD_MCP_TOKEN as string | undefined;

async function mcpRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(MCP_TOKEN ? { "x-mcp-token": MCP_TOKEN } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as McpApiResponse<T>;
  if (!response.ok || !payload.ok || payload.data === undefined) {
    throw new Error(payload.error?.message ?? `MCP request failed (${response.status})`);
  }

  return payload.data;
}

export function getMcpHealth(): Promise<McpHealth> {
  return mcpRequest<McpHealth>("/health");
}

export function listMcpTools(): Promise<McpToolDefinition[]> {
  return mcpRequest<McpToolDefinition[]>("/tools");
}

export function listMcpApprovals(input: {
  status?: "pending" | "approved" | "rejected" | "executed";
} = {}): Promise<McpApprovalRequest[]> {
  const query = new URLSearchParams();
  if (input.status) {
    query.set("status", input.status);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return mcpRequest<McpApprovalRequest[]>(`/approvals${suffix}`);
}

export function approveMcpApproval(id: string, note?: string): Promise<McpApprovalRequest> {
  return mcpRequest<McpApprovalRequest>(`/approvals/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(note ? { note } : {}),
  });
}

export function rejectMcpApproval(id: string, note?: string): Promise<McpApprovalRequest> {
  return mcpRequest<McpApprovalRequest>(`/approvals/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(note ? { note } : {}),
  });
}

export function listMcpAuditEvents(input: {
  tool?: McpToolDefinition["name"];
  status?: McpAuditEvent["status"];
  actorId?: string;
  limit?: number;
} = {}): Promise<McpAuditEvent[]> {
  const query = new URLSearchParams();
  if (input.tool) {
    query.set("tool", input.tool);
  }
  if (input.status) {
    query.set("status", input.status);
  }
  if (input.actorId) {
    query.set("actorId", input.actorId);
  }
  if (typeof input.limit === "number") {
    query.set("limit", String(input.limit));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return mcpRequest<McpAuditEvent[]>(`/audit-events${suffix}`);
}
