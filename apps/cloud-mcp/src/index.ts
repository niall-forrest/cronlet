import { createHash, randomUUID } from "node:crypto";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { CloudClient } from "@cronlet/cloud-sdk";
import { handlerConfigSchema } from "@cronlet/cloud-shared";
import { MCP_TOOLS, type McpToolName } from "./lib/tools.js";
import { resolveSchedule, parseSchedule } from "./lib/schedule-parser.js";

// Validate required environment variables in production
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  const required = [
    "CLOUD_API_BASE_URL",
    "CLOUD_API_KEY",
    "CLOUD_MCP_SERVICE_TOKENS_JSON",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}

interface ServicePrincipal {
  id: string;
  name?: string;
  token: string;
  scopes: string[];
  projectIds: string[];
  allowWrites: boolean;
  canApprove: boolean;
}

interface ApprovalRequest {
  id: string;
  tool: McpToolName;
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

interface McpAuditEvent {
  id: string;
  createdAt: string;
  actorId: string;
  action: string;
  status: "success" | "denied" | "approval_required" | "error";
  tool: McpToolName | null;
  projectId: string | null;
  targetId: string | null;
  approvalId: string | null;
  payloadHash: string | null;
  message: string | null;
}

interface PrincipalQuery {
  principal?: ServicePrincipal;
}

const port = Number.parseInt(process.env.PORT ?? "4060", 10);
const host = process.env.HOST ?? "0.0.0.0";
const apiBaseUrl = process.env.CLOUD_API_BASE_URL ?? "http://127.0.0.1:4050";
const apiKey = process.env.CLOUD_API_KEY ?? "dev-token";
const enableWrites = process.env.CLOUD_MCP_ENABLE_WRITES === "true";
const approvalTtlMinutes = Number.parseInt(process.env.CLOUD_MCP_APPROVAL_TTL_MINUTES ?? "30", 10);
const approvalTtlMs = approvalTtlMinutes * 60 * 1000;
const maxAuditEvents = Number.parseInt(process.env.CLOUD_MCP_MAX_AUDIT_EVENTS ?? "2000", 10);
const cloudOrgId = process.env.CLOUD_MCP_ORG_ID ?? "org_demo";
const cloudUserId = process.env.CLOUD_MCP_USER_ID ?? "mcp_service";

const cloudClient = new CloudClient({
  baseUrl: apiBaseUrl,
  apiKey,
  orgId: cloudOrgId,
  userId: cloudUserId,
  role: "owner",
});

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function loadServicePrincipals(): ServicePrincipal[] {
  const raw = process.env.CLOUD_MCP_SERVICE_TOKENS_JSON;

  if (!raw || raw.trim().length === 0) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CLOUD_MCP_SERVICE_TOKENS_JSON is required in production");
    }

    const fallbackToken = process.env.CLOUD_MCP_DEV_TOKEN ?? "mcp_dev_token";
    return [
      {
        id: "local-dev",
        name: "Local Dev Agent",
        token: fallbackToken,
        scopes: ["*"],
        projectIds: ["*"],
        allowWrites: true,
        canApprove: true,
      },
    ];
  }

  const parsed = safeJsonParse<unknown>(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("CLOUD_MCP_SERVICE_TOKENS_JSON must be a non-empty JSON array");
  }

  const principals: ServicePrincipal[] = [];
  for (const value of parsed) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const entry = value as Record<string, unknown>;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const name = typeof entry.name === "string" ? entry.name.trim() : undefined;
    const token = typeof entry.token === "string" ? entry.token.trim() : "";
    const scopes = toStringArray(entry.scopes);
    const projectIds = toStringArray(entry.projectIds);

    if (!id || !token || scopes.length === 0) {
      continue;
    }

    principals.push({
      id,
      name,
      token,
      scopes,
      projectIds: projectIds.length > 0 ? projectIds : ["*"],
      allowWrites: entry.allowWrites === true,
      canApprove: entry.canApprove === true,
    });
  }

  if (principals.length === 0) {
    throw new Error("No valid MCP service principals loaded from CLOUD_MCP_SERVICE_TOKENS_JSON");
  }

  return principals;
}

function extractServiceToken(request: FastifyRequest): string | null {
  const direct = request.headers["x-mcp-token"];
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }

  const authorization = request.headers.authorization;
  if (!authorization || typeof authorization !== "string") {
    return null;
  }

  const [scheme, value] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value) {
    return null;
  }

  return value.trim();
}

function hasScope(principal: ServicePrincipal, scope: string): boolean {
  return principal.scopes.includes("*") || principal.scopes.includes(scope);
}

function canAccessProject(principal: ServicePrincipal, projectId: string): boolean {
  return principal.projectIds.includes("*") || principal.projectIds.includes(projectId);
}

function hashPayload(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function nowIso(): string {
  return new Date().toISOString();
}

const servicePrincipals = loadServicePrincipals();
const principalByToken = new Map(servicePrincipals.map((principal) => [principal.token, principal]));
const approvals = new Map<string, ApprovalRequest>();
const mcpAuditEvents: McpAuditEvent[] = [];

const app = Fastify({ logger: true });

function principalFromRequest(request: FastifyRequest): ServicePrincipal | null {
  return (request as FastifyRequest & PrincipalQuery).principal ?? null;
}

function deny(reply: FastifyReply, status: number, message: string): void {
  reply.status(status).send({
    ok: false,
    error: {
      message,
    },
  });
}

function cleanupApprovals(): void {
  const now = Date.now();
  for (const [id, approval] of approvals) {
    if (approval.status !== "pending") {
      continue;
    }

    const age = now - new Date(approval.requestedAt).getTime();
    if (age > approvalTtlMs) {
      approvals.set(id, {
        ...approval,
        status: "rejected",
        decidedAt: nowIso(),
        decidedBy: "system",
        decisionNote: "expired",
      });
    }
  }
}

async function appendAuditEvent(event: Omit<McpAuditEvent, "id" | "createdAt">): Promise<void> {
  const entry: McpAuditEvent = {
    id: randomUUID(),
    createdAt: nowIso(),
    ...event,
  };

  mcpAuditEvents.unshift(entry);
  if (mcpAuditEvents.length > maxAuditEvents) {
    mcpAuditEvents.length = maxAuditEvents;
  }

  try {
    await cloudClient.audit.record({
      action: entry.action,
      targetType: entry.tool ? "mcp_tool" : "mcp",
      targetId: entry.targetId ?? entry.tool ?? "unknown",
      payloadHash: entry.payloadHash ?? undefined,
      actorType: "agent",
      actorId: entry.actorId,
      metadata: {
        status: entry.status,
        tool: entry.tool,
        projectId: entry.projectId,
        approvalId: entry.approvalId,
        message: entry.message,
      },
    });
  } catch (error) {
    app.log.warn(
      {
        error,
        action: entry.action,
      },
      "Failed to mirror MCP audit event to cloud-api"
    );
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parseApprovalId(payload: Record<string, unknown>): string | null {
  const value = payload.approvalId;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function resolveProjectForTool(
  tool: McpToolName,
  payload: Record<string, unknown>
): Promise<{ projectId: string; targetId: string }> {
  // For task-related tools
  if (tool === "trigger_task" || tool === "pause_task" || tool === "resume_task" || tool === "delete_task") {
    const taskId = String(payload.taskId ?? "").trim();
    if (!taskId) {
      throw new Error("taskId is required");
    }
    const task = await cloudClient.tasks.get(taskId);
    return { projectId: task.projectId, targetId: taskId };
  }

  // For create_task, projectId is provided directly
  if (tool === "create_task") {
    const projectId = String(payload.projectId ?? "").trim();
    if (!projectId) {
      throw new Error("projectId is required");
    }
    return { projectId, targetId: "new-task" };
  }

  throw new Error("Cannot resolve project for tool");
}

async function executeTool(
  tool: McpToolName,
  payload: Record<string, unknown>,
  principal: ServicePrincipal
): Promise<unknown> {
  switch (tool) {
    case "list_projects":
      return cloudClient.projects.list();

    case "list_tasks": {
      const projectId = payload.projectId as string | undefined;
      const mine = payload.mine === true;
      let tasks = await cloudClient.tasks.list(projectId);

      // Filter by creator if "mine" is set
      if (mine) {
        tasks = tasks.filter(
          (t) => t.createdBy?.type === "agent" && t.createdBy?.id === principal.id
        );
      }

      return tasks;
    }

    case "create_task": {
      const projectId = String(payload.projectId ?? "").trim();
      const name = String(payload.name ?? "").trim();
      const description = payload.description as string | undefined;
      const handlerInput = payload.handler;
      const scheduleInput = payload.schedule;
      const timezone = (payload.timezone as string) ?? "UTC";
      // Agent callback fields
      const callbackUrl = typeof payload.callbackUrl === "string" ? payload.callbackUrl.trim() : undefined;
      const metadata = payload.metadata as Record<string, unknown> | undefined;
      const maxRuns = typeof payload.maxRuns === "number" ? payload.maxRuns : undefined;
      const expiresAt = typeof payload.expiresAt === "string" ? payload.expiresAt : undefined;

      if (!projectId || !name || !handlerInput) {
        throw new Error("projectId, name, and handler are required");
      }

      // Parse handler through Zod to apply defaults and validate
      const handlerResult = handlerConfigSchema.safeParse(handlerInput);
      if (!handlerResult.success) {
        throw new Error(`Invalid handler: ${handlerResult.error.message}`);
      }

      // Resolve schedule from string or config
      const scheduleResult = resolveSchedule(scheduleInput);
      if (!scheduleResult.success || !scheduleResult.config) {
        throw new Error(scheduleResult.error ?? "Invalid schedule");
      }

      const input = {
        projectId,
        name,
        description,
        handler: handlerResult.data,
        schedule: scheduleResult.config,
        timezone,
        active: true,
        retryAttempts: 1,
        retryBackoff: "linear" as const,
        retryDelay: "1s",
        timeout: "30s",
        // Agent callback - closes the autonomous loop
        callbackUrl,
        metadata,
        maxRuns,
        expiresAt,
      };

      // Create task with agent tracking
      const createdBy = {
        type: "agent" as const,
        id: principal.id,
        name: principal.name,
      };

      return cloudClient.tasks.create(input, createdBy);
    }

    case "trigger_task": {
      const taskId = String(payload.taskId ?? "").trim();
      if (!taskId) {
        throw new Error("taskId is required");
      }
      return cloudClient.tasks.trigger(taskId);
    }

    case "pause_task": {
      const taskId = String(payload.taskId ?? "").trim();
      if (!taskId) {
        throw new Error("taskId is required");
      }
      return cloudClient.tasks.patch(taskId, { active: false });
    }

    case "resume_task": {
      const taskId = String(payload.taskId ?? "").trim();
      if (!taskId) {
        throw new Error("taskId is required");
      }
      return cloudClient.tasks.patch(taskId, { active: true });
    }

    case "delete_task": {
      const taskId = String(payload.taskId ?? "").trim();
      if (!taskId) {
        throw new Error("taskId is required");
      }
      return cloudClient.tasks.delete(taskId);
    }

    case "list_runs": {
      const taskId = payload.taskId as string | undefined;
      const limit = typeof payload.limit === "number" ? payload.limit : 20;
      return cloudClient.runs.list(taskId, limit);
    }

    case "get_run": {
      const runId = String(payload.runId ?? "").trim();
      if (!runId) {
        throw new Error("runId is required");
      }
      return cloudClient.runs.get(runId);
    }

    case "parse_schedule": {
      const description = String(payload.description ?? "").trim();
      if (!description) {
        throw new Error("description is required");
      }
      return parseSchedule(description);
    }

    case "get_failure_summary": {
      const taskId = payload.taskId as string | undefined;
      const runs = await cloudClient.runs.list(taskId, 100);
      const failures = runs.filter((run) => run.status === "failure" || run.status === "timeout");
      const byTask = failures.reduce<Record<string, number>>((acc, run) => {
        acc[run.taskId] = (acc[run.taskId] ?? 0) + 1;
        return acc;
      }, {});

      return {
        totalFailures: failures.length,
        byTask,
        recentErrors: failures.slice(0, 5).map((f) => ({
          taskId: f.taskId,
          status: f.status,
          errorMessage: f.errorMessage,
          createdAt: f.createdAt,
        })),
      };
    }

    default:
      throw new Error("Unsupported tool");
  }
}

function filterProjects<T extends { projectId: string }>(
  principal: ServicePrincipal,
  items: T[]
): T[] {
  if (principal.projectIds.includes("*")) {
    return items;
  }
  return items.filter((item) => canAccessProject(principal, item.projectId));
}

app.addHook("preHandler", async (request, reply) => {
  if (request.url === "/health") {
    return;
  }

  const token = extractServiceToken(request);
  if (!token) {
    deny(reply, 401, "Missing MCP service token");
    return reply;
  }

  const principal = principalByToken.get(token);
  if (!principal) {
    deny(reply, 401, "Invalid MCP service token");
    return reply;
  }

  (request as FastifyRequest & PrincipalQuery).principal = principal;
  return;
});

app.get("/health", async () => ({
  ok: true,
  data: {
    ok: true,
    service: "cloud-mcp",
    enableWrites,
    principals: servicePrincipals.map((principal) => ({
      id: principal.id,
      name: principal.name,
      allowWrites: principal.allowWrites,
      canApprove: principal.canApprove,
      projectIds: principal.projectIds,
      scopes: principal.scopes,
    })),
  },
}));

app.get("/tools", async (request, reply) => {
  const principal = principalFromRequest(request);
  if (!principal) {
    deny(reply, 401, "Unauthorized");
    return;
  }

  return {
    ok: true,
    data: MCP_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      enabled: hasScope(principal, tool.name) && (!tool.mutating || (enableWrites && principal.allowWrites)),
      requiresApproval: tool.critical,
    })),
  };
});

app.get("/approvals", async (request, reply) => {
  const principal = principalFromRequest(request);
  if (!principal) {
    deny(reply, 401, "Unauthorized");
    return;
  }

  if (!principal.canApprove && !hasScope(principal, "admin:approvals:read")) {
    deny(reply, 403, "Approvals read scope missing");
    return;
  }

  cleanupApprovals();
  const statusFilter = String((request.query as Record<string, unknown> | undefined)?.status ?? "").trim();
  const data = Array.from(approvals.values())
    .filter((approval) => !statusFilter || approval.status === statusFilter)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

  return { ok: true, data };
});

app.post<{ Params: { id: string }; Body: { note?: string } }>("/approvals/:id/approve", async (request, reply) => {
  const principal = principalFromRequest(request);
  if (!principal) {
    deny(reply, 401, "Unauthorized");
    return;
  }

  if (!principal.canApprove && !hasScope(principal, "admin:approvals:write")) {
    deny(reply, 403, "Approvals write scope missing");
    return;
  }

  cleanupApprovals();
  const existing = approvals.get(request.params.id);
  if (!existing) {
    deny(reply, 404, "Approval not found");
    return;
  }

  const next: ApprovalRequest = {
    ...existing,
    status: "approved",
    decidedAt: nowIso(),
    decidedBy: principal.id,
    decisionNote: typeof request.body?.note === "string" ? request.body.note : null,
  };
  approvals.set(existing.id, next);

  await appendAuditEvent({
    actorId: principal.id,
    action: "mcp.approval.approved",
    status: "success",
    tool: next.tool,
    projectId: next.projectId,
    targetId: next.id,
    approvalId: next.id,
    payloadHash: next.payloadHash,
    message: next.decisionNote,
  });

  return { ok: true, data: next };
});

app.post<{ Params: { id: string }; Body: { note?: string } }>("/approvals/:id/reject", async (request, reply) => {
  const principal = principalFromRequest(request);
  if (!principal) {
    deny(reply, 401, "Unauthorized");
    return;
  }

  if (!principal.canApprove && !hasScope(principal, "admin:approvals:write")) {
    deny(reply, 403, "Approvals write scope missing");
    return;
  }

  cleanupApprovals();
  const existing = approvals.get(request.params.id);
  if (!existing) {
    deny(reply, 404, "Approval not found");
    return;
  }

  const next: ApprovalRequest = {
    ...existing,
    status: "rejected",
    decidedAt: nowIso(),
    decidedBy: principal.id,
    decisionNote: typeof request.body?.note === "string" ? request.body.note : null,
  };
  approvals.set(existing.id, next);

  await appendAuditEvent({
    actorId: principal.id,
    action: "mcp.approval.rejected",
    status: "success",
    tool: next.tool,
    projectId: next.projectId,
    targetId: next.id,
    approvalId: next.id,
    payloadHash: next.payloadHash,
    message: next.decisionNote,
  });

  return { ok: true, data: next };
});

app.get("/audit-events", async (request, reply) => {
  const principal = principalFromRequest(request);
  if (!principal) {
    deny(reply, 401, "Unauthorized");
    return;
  }

  if (!principal.canApprove && !hasScope(principal, "admin:audit:read")) {
    deny(reply, 403, "Audit read scope missing");
    return;
  }

  const query = (request.query as Record<string, unknown> | undefined) ?? {};
  const toolFilter = typeof query.tool === "string" ? query.tool : "";
  const statusFilter = typeof query.status === "string" ? query.status : "";
  const actorFilter = typeof query.actorId === "string" ? query.actorId : "";
  const limit = Math.min(500, Math.max(1, Number.parseInt(String(query.limit ?? "100"), 10) || 100));

  const data = mcpAuditEvents
    .filter((event) => {
      if (toolFilter && event.tool !== toolFilter) {
        return false;
      }
      if (statusFilter && event.status !== statusFilter) {
        return false;
      }
      if (actorFilter && event.actorId !== actorFilter) {
        return false;
      }
      return true;
    })
    .slice(0, limit);

  return { ok: true, data };
});

app.post<{ Params: { tool: McpToolName }; Body: Record<string, unknown> }>("/tools/:tool", async (request, reply) => {
  const principal = principalFromRequest(request);
  if (!principal) {
    deny(reply, 401, "Unauthorized");
    return;
  }

  const tool = MCP_TOOLS.find((item) => item.name === request.params.tool);
  if (!tool) {
    deny(reply, 404, "Tool not found");
    return;
  }

  if (!hasScope(principal, tool.name)) {
    await appendAuditEvent({
      actorId: principal.id,
      action: "mcp.tool.denied",
      status: "denied",
      tool: tool.name,
      projectId: null,
      targetId: null,
      approvalId: null,
      payloadHash: null,
      message: "Tool scope missing",
    });
    deny(reply, 403, `Tool scope missing: ${tool.name}`);
    return;
  }

  const payload = toRecord(request.body);
  const payloadHash = hashPayload(payload);
  const approvalId = parseApprovalId(payload);

  try {
    // Handle read-only tools directly
    if (!tool.mutating) {
      let data = await executeTool(tool.name, payload, principal);

      // Filter results by project access
      if (tool.name === "list_projects") {
        const projects = data as Array<{ id: string }>;
        data = principal.projectIds.includes("*")
          ? projects
          : projects.filter((p) => canAccessProject(principal, p.id));
      } else if (tool.name === "list_tasks" || tool.name === "list_runs") {
        data = filterProjects(principal, data as Array<{ projectId: string }>);
      }

      return { ok: true, data };
    }

    // Check write permissions
    if (!enableWrites || !principal.allowWrites) {
      await appendAuditEvent({
        actorId: principal.id,
        action: "mcp.tool.denied",
        status: "denied",
        tool: tool.name,
        projectId: null,
        targetId: null,
        approvalId: null,
        payloadHash,
        message: "Writes disabled by policy",
      });
      deny(reply, 403, "MCP mutating tools are disabled by policy");
      return;
    }

    // Resolve project for write operations
    const target = await resolveProjectForTool(tool.name, payload);
    if (!canAccessProject(principal, target.projectId)) {
      await appendAuditEvent({
        actorId: principal.id,
        action: "mcp.tool.denied",
        status: "denied",
        tool: tool.name,
        projectId: target.projectId,
        targetId: target.targetId,
        approvalId: null,
        payloadHash,
        message: "Project write opt-in missing",
      });
      deny(reply, 403, "Project write opt-in missing for this service token");
      return;
    }

    // Handle critical tools that require approval
    if (tool.critical) {
      cleanupApprovals();
      const existingApproval = approvalId ? approvals.get(approvalId) : undefined;

      if (!existingApproval) {
        const created: ApprovalRequest = {
          id: randomUUID(),
          tool: tool.name,
          projectId: target.projectId,
          payload,
          payloadHash,
          requestedBy: principal.id,
          status: "pending",
          requestedAt: nowIso(),
          decidedAt: null,
          decidedBy: null,
          decisionNote: null,
        };

        approvals.set(created.id, created);
        await appendAuditEvent({
          actorId: principal.id,
          action: "mcp.tool.approval_requested",
          status: "approval_required",
          tool: tool.name,
          projectId: target.projectId,
          targetId: target.targetId,
          approvalId: created.id,
          payloadHash,
          message: "Critical write requires approval",
        });

        reply.status(202).send({
          ok: false,
          error: {
            code: "APPROVAL_REQUIRED",
            message: "Critical MCP write requires approval",
          },
          data: {
            approvalId: created.id,
            status: created.status,
            tool: tool.name,
            requestedAt: created.requestedAt,
          },
        });
        return;
      }

      if (
        existingApproval.status !== "approved" ||
        existingApproval.tool !== tool.name ||
        existingApproval.projectId !== target.projectId ||
        existingApproval.payloadHash !== payloadHash
      ) {
        await appendAuditEvent({
          actorId: principal.id,
          action: "mcp.tool.denied",
          status: "denied",
          tool: tool.name,
          projectId: target.projectId,
          targetId: target.targetId,
          approvalId: existingApproval.id,
          payloadHash,
          message: "Approval invalid or stale",
        });
        deny(reply, 409, "Approval is invalid, stale, or does not match payload");
        return;
      }
    }

    // Execute the tool
    const data = await executeTool(tool.name, payload, principal);

    // Mark approval as executed
    if (approvalId) {
      const existingApproval = approvals.get(approvalId);
      if (existingApproval && existingApproval.status === "approved") {
        approvals.set(approvalId, {
          ...existingApproval,
          status: "executed",
          decidedAt: nowIso(),
          decidedBy: principal.id,
          decisionNote: existingApproval.decisionNote,
        });
      }
    }

    await appendAuditEvent({
      actorId: principal.id,
      action: "mcp.tool.executed",
      status: "success",
      tool: tool.name,
      projectId: target.projectId,
      targetId: target.targetId,
      approvalId: approvalId ?? null,
      payloadHash,
      message: null,
    });

    reply.send({ ok: true, data });
  } catch (error) {
    await appendAuditEvent({
      actorId: principal.id,
      action: "mcp.tool.failed",
      status: "error",
      tool: tool.name,
      projectId: null,
      targetId: null,
      approvalId: approvalId ?? null,
      payloadHash,
      message: error instanceof Error ? error.message : String(error),
    });
    deny(reply, 500, error instanceof Error ? error.message : String(error));
  }
});

await app.listen({ port, host });
