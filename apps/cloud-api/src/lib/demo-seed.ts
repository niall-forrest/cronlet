import { type Prisma, PrismaClient } from "@prisma/client";
import type {
  CreatedBy,
  HandlerConfig,
  RunStatus,
  ScheduleConfig,
  TaskSource,
} from "@cronlet/shared";
import { formatYearMonth } from "@cronlet/shared";

interface DemoSeedInput {
  organizationId: string;
  userId: string;
}

export interface DemoSeedResult {
  taskCount: number;
  runCount: number;
  seededAt: string;
}

export interface DemoTaskDefinition {
  idSuffix: string;
  name: string;
  description: string;
  externalId: string;
  source: TaskSource;
  createdBy: CreatedBy;
  handlerType: "webhook" | "tools";
  handlerConfig: HandlerConfig;
  scheduleType: "every" | "once" | "weekly";
  scheduleConfig: ScheduleConfig;
  nextRunAt: Date | null;
  active: boolean;
  callbackUrl: string | null;
  metadata: Record<string, unknown>;
  timeout: string;
  retryAttempts: number;
  retryInitialDelay: string;
  retryMaxDelay: string;
  retryWindow: string;
  maxRuns: number | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  runs: DemoRunDefinition[];
}

export interface DemoRunDefinition {
  idSuffix: string;
  status: RunStatus;
  trigger: "schedule" | "manual" | "api";
  attempt: number;
  scheduledAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  errorMessage: string | null;
  logs: string | null;
  output: Record<string, unknown> | null;
  dispatchStatus: "pending" | "running" | "succeeded" | "failed" | "retry_wait" | "dead_lettered";
  dispatchAvailableAt: Date;
  dispatchLastError: string | null;
  responseBodyPreview: string | null;
  responseBodyHash: string | null;
  httpStatus: number | null;
}

function slugPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "_");
}

export function demoId(orgId: string, suffix: string): string {
  return `demo_${slugPart(orgId)}_${suffix}`;
}

function minutesAgo(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60 * 1000);
}

function hoursAgo(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function minutesFromNow(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function hoursFromNow(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function daysFromNow(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function toPrismaJson(value: Record<string, unknown> | HandlerConfig | ScheduleConfig | CreatedBy): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function destinationKeyForDefinition(definition: DemoTaskDefinition): string {
  if (definition.handlerConfig.type === "webhook") {
    return new URL(definition.handlerConfig.url).host;
  }
  return definition.handlerType;
}

export function runAttemptStatusForRun(status: RunStatus): "pending" | "running" | "success" | "failure" | "timeout" | "cancelled" | "terminal_client_error" {
  switch (status) {
    case "queued":
    case "leased":
    case "retry_wait":
      return "pending";
    case "running":
      return "running";
    case "success":
      return "success";
    case "failure":
    case "dead_lettered":
    case "retry_window_expired":
      return "failure";
    case "timeout":
      return "timeout";
    case "cancelled":
      return "cancelled";
    case "terminal_client_error":
      return "terminal_client_error";
  }
}

export function runLifecycleEvents(run: DemoRunDefinition): Array<{
  action: string;
  previousState: string | null;
  nextState: string | null;
  reason: string | null;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}> {
  const events: Array<{
    action: string;
    previousState: string | null;
    nextState: string | null;
    reason: string | null;
    createdAt: Date;
    metadata?: Record<string, unknown>;
  }> = [
    {
      action: "run.queued",
      previousState: null,
      nextState: "queued",
      reason: run.trigger,
      createdAt: run.scheduledAt,
    },
  ];

  if (run.startedAt) {
    events.push({
      action: "run.running",
      previousState: "queued",
      nextState: "running",
      reason: "worker-started",
      createdAt: run.startedAt,
    });
  }

  if (run.completedAt) {
    events.push({
      action: `run.${run.status}`,
      previousState: run.startedAt ? "running" : "queued",
      nextState: run.status,
      reason: run.errorMessage,
      createdAt: run.completedAt,
      metadata: run.output ?? undefined,
    });
  } else if (run.status === "retry_wait") {
    events.push({
      action: "run.retry_wait",
      previousState: "running",
      nextState: "retry_wait",
      reason: run.errorMessage,
      createdAt: run.dispatchAvailableAt,
    });
  }

  return events;
}

export function dispatchLifecycleEvents(run: DemoRunDefinition): Array<{
  action: string;
  previousState: string | null;
  nextState: string | null;
  reason: string | null;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}> {
  const leaseTime = run.startedAt ? new Date(run.startedAt.getTime() - 1_000) : run.scheduledAt;
  const runningTime = run.startedAt ?? run.scheduledAt;
  const terminalTime = run.completedAt ?? run.dispatchAvailableAt;

  const events: Array<{
    action: string;
    previousState: string | null;
    nextState: string | null;
    reason: string | null;
    createdAt: Date;
    metadata?: Record<string, unknown>;
  }> = [
    {
      action: "dispatch.queued",
      previousState: null,
      nextState: "pending",
      reason: "scheduled",
      createdAt: run.scheduledAt,
    },
  ];

  if (run.dispatchStatus !== "pending") {
    events.push({
      action: "dispatch.leased",
      previousState: "pending",
      nextState: "leased",
      reason: "worker-lease",
      createdAt: leaseTime,
    });
  }

  if (run.dispatchStatus === "running" || run.dispatchStatus === "succeeded" || run.dispatchStatus === "failed" || run.dispatchStatus === "retry_wait" || run.dispatchStatus === "dead_lettered") {
    events.push({
      action: "dispatch.running",
      previousState: "leased",
      nextState: "running",
      reason: "delivery-started",
      createdAt: runningTime,
    });
  }

  if (run.dispatchStatus === "succeeded") {
    events.push({
      action: "dispatch.succeeded",
      previousState: "running",
      nextState: "succeeded",
      reason: "2xx response",
      createdAt: terminalTime,
      metadata: {
        httpStatus: run.httpStatus,
        callbackDelivered: true,
      },
    });
  }

  if (run.dispatchStatus === "failed") {
    events.push({
      action: "dispatch.failed",
      previousState: "running",
      nextState: "failed",
      reason: run.dispatchLastError,
      createdAt: terminalTime,
      metadata: {
        httpStatus: run.httpStatus,
      },
    });
  }

  if (run.dispatchStatus === "retry_wait") {
    events.push({
      action: "dispatch.retry_wait",
      previousState: "running",
      nextState: "retry_wait",
      reason: run.dispatchLastError,
      createdAt: terminalTime,
      metadata: {
        httpStatus: run.httpStatus,
        availableAt: run.dispatchAvailableAt.toISOString(),
      },
    });
  }

  if (run.dispatchStatus === "dead_lettered") {
    events.push({
      action: "dispatch.dead_lettered",
      previousState: "running",
      nextState: "dead_lettered",
      reason: run.dispatchLastError,
      createdAt: terminalTime,
      metadata: {
        httpStatus: run.httpStatus,
      },
    });
  }

  return events;
}

export function buildDemoTasks(now: Date, currentUserId: string): DemoTaskDefinition[] {
  return [
    {
      idSuffix: "api_health_monitor",
      name: "API Health Monitor",
      description: "Checks the public API every 5 minutes and records latency.",
      externalId: "demo_api_health_monitor",
      source: "dashboard",
      createdBy: { type: "user", id: currentUserId, name: "You" },
      handlerType: "webhook",
      handlerConfig: {
        type: "webhook",
        url: "https://demo.cronlet.dev/hooks/api-health",
        method: "GET",
      },
      scheduleType: "every",
      scheduleConfig: { type: "every", interval: "5m" },
      nextRunAt: minutesFromNow(now, 12),
      active: true,
      callbackUrl: null,
      metadata: {
        demoSeed: true,
        purpose: "Monitor public API health and surface latency regressions.",
        service: "public-api",
        environment: "production",
      },
      timeout: "30s",
      retryAttempts: 3,
      retryInitialDelay: "15s",
      retryMaxDelay: "5m",
      retryWindow: "6h",
      maxRuns: null,
      expiresAt: null,
      createdAt: daysAgo(now, 45),
      updatedAt: minutesAgo(now, 7),
      runs: [
        {
          idSuffix: "run_1",
          status: "success",
          trigger: "schedule",
          attempt: 1,
          scheduledAt: minutesAgo(now, 12),
          startedAt: minutesAgo(now, 12),
          completedAt: new Date(minutesAgo(now, 12).getTime() + 234),
          durationMs: 234,
          errorMessage: null,
          logs: "GET /health 200 234ms",
          output: { statusCode: 200, responseTimeMs: 234 },
          dispatchStatus: "succeeded",
          dispatchAvailableAt: minutesAgo(now, 12),
          dispatchLastError: null,
          responseBodyPreview: "OK",
          responseBodyHash: "demo_ok_234",
          httpStatus: 200,
        },
        {
          idSuffix: "run_2",
          status: "success",
          trigger: "schedule",
          attempt: 1,
          scheduledAt: minutesAgo(now, 17),
          startedAt: minutesAgo(now, 17),
          completedAt: new Date(minutesAgo(now, 17).getTime() + 221),
          durationMs: 221,
          errorMessage: null,
          logs: "GET /health 200 221ms",
          output: { statusCode: 200, responseTimeMs: 221 },
          dispatchStatus: "succeeded",
          dispatchAvailableAt: minutesAgo(now, 17),
          dispatchLastError: null,
          responseBodyPreview: "OK",
          responseBodyHash: "demo_ok_221",
          httpStatus: 200,
        },
        {
          idSuffix: "run_3",
          status: "failure",
          trigger: "schedule",
          attempt: 1,
          scheduledAt: hoursAgo(now, 5),
          startedAt: hoursAgo(now, 5),
          completedAt: new Date(hoursAgo(now, 5).getTime() + 910),
          durationMs: 910,
          errorMessage: "HTTP 503 from upstream health endpoint",
          logs: "GET /health 503 910ms",
          output: { statusCode: 503, body: "Service Unavailable" },
          dispatchStatus: "failed",
          dispatchAvailableAt: hoursAgo(now, 5),
          dispatchLastError: "HTTP 503 from upstream health endpoint",
          responseBodyPreview: "Service Unavailable",
          responseBodyHash: "demo_503_health",
          httpStatus: 503,
        },
      ],
    },
    {
      idSuffix: "pricing_watcher",
      name: "Pricing Watcher",
      description: "Monitors competitor pricing pages and calls back with diffs.",
      externalId: "demo_pricing_watcher",
      source: "mcp",
      createdBy: { type: "agent", id: "agent_research_ops", name: "Research Ops Agent" },
      handlerType: "tools",
      handlerConfig: {
        type: "tools",
        steps: [
          { tool: "http.get", args: { url: "https://example.com/pricing" }, outputKey: "page" },
          { tool: "json.parse", args: { input: "$page.body" }, outputKey: "parsed" },
        ],
      },
      scheduleType: "every",
      scheduleConfig: { type: "every", interval: "30m" },
      nextRunAt: minutesFromNow(now, 18),
      active: true,
      callbackUrl: "https://demo.cronlet.dev/agents/pricing-watcher/callback",
      metadata: {
        demoSeed: true,
        purpose: "Watch competitor pricing and call back with diffs.",
        competitor: "Acme Monitor",
        conversationId: "conv_demo_pricing_001",
      },
      timeout: "45s",
      retryAttempts: 2,
      retryInitialDelay: "30s",
      retryMaxDelay: "10m",
      retryWindow: "12h",
      maxRuns: null,
      expiresAt: null,
      createdAt: daysAgo(now, 10),
      updatedAt: minutesAgo(now, 16),
      runs: [
        {
          idSuffix: "run_1",
          status: "success",
          trigger: "schedule",
          attempt: 1,
          scheduledAt: minutesAgo(now, 16),
          startedAt: minutesAgo(now, 16),
          completedAt: new Date(minutesAgo(now, 16).getTime() + 430),
          durationMs: 430,
          errorMessage: null,
          logs: "Fetched pricing page and found 1 change.",
          output: { diffCount: 1, changedPlans: ["Growth"] },
          dispatchStatus: "succeeded",
          dispatchAvailableAt: minutesAgo(now, 16),
          dispatchLastError: null,
          responseBodyPreview: "{\"ok\":true}",
          responseBodyHash: "demo_pricing_ok_1",
          httpStatus: 200,
        },
        {
          idSuffix: "run_2",
          status: "success",
          trigger: "schedule",
          attempt: 1,
          scheduledAt: minutesAgo(now, 46),
          startedAt: minutesAgo(now, 46),
          completedAt: new Date(minutesAgo(now, 46).getTime() + 512),
          durationMs: 512,
          errorMessage: null,
          logs: "Fetched pricing page and found no changes.",
          output: { diffCount: 0 },
          dispatchStatus: "succeeded",
          dispatchAvailableAt: minutesAgo(now, 46),
          dispatchLastError: null,
          responseBodyPreview: "{\"ok\":true}",
          responseBodyHash: "demo_pricing_ok_0",
          httpStatus: 200,
        },
      ],
    },
    {
      idSuffix: "trial_nudge_followup",
      name: "Trial Nudge Follow-up",
      description: "Checks expiring trials and nudges accounts that have gone quiet.",
      externalId: "demo_trial_nudge_followup",
      source: "sdk",
      createdBy: { type: "agent", id: "agent_lifecycle", name: "Lifecycle Agent" },
      handlerType: "tools",
      handlerConfig: {
        type: "tools",
        steps: [
          { tool: "http.get", args: { url: "https://demo.cronlet.dev/trials/expiring" }, outputKey: "trials" },
        ],
      },
      scheduleType: "once",
      scheduleConfig: { type: "once", at: hoursFromNow(now, 2).toISOString() },
      nextRunAt: hoursFromNow(now, 2),
      active: true,
      callbackUrl: "https://demo.cronlet.dev/callbacks/trial-nudge",
      metadata: {
        demoSeed: true,
        purpose: "Follow up with trials that are about to expire and have no recent activity.",
        workflow: "trial-nudge",
        accountSegment: "self-serve",
      },
      timeout: "30s",
      retryAttempts: 4,
      retryInitialDelay: "20s",
      retryMaxDelay: "10m",
      retryWindow: "24h",
      maxRuns: 1,
      expiresAt: daysFromNow(now, 2),
      createdAt: hoursAgo(now, 3),
      updatedAt: hoursAgo(now, 3),
      runs: [],
    },
    {
      idSuffix: "launch_checklist_followup",
      name: "Launch Checklist Follow-up",
      description: "One-off reminder to confirm the launch checklist closed out.",
      externalId: "demo_launch_checklist_followup",
      source: "dashboard",
      createdBy: { type: "user", id: currentUserId, name: "You" },
      handlerType: "webhook",
      handlerConfig: {
        type: "webhook",
        url: "https://demo.cronlet.dev/hooks/launch-checklist",
        method: "POST",
      },
      scheduleType: "once",
      scheduleConfig: { type: "once", at: hoursAgo(now, 3).toISOString() },
      nextRunAt: hoursAgo(now, 3),
      active: true,
      callbackUrl: null,
      metadata: {
        demoSeed: true,
        purpose: "Follow up on the launch checklist after the scheduled launch window.",
        workflow: "launch-checklist",
      },
      timeout: "30s",
      retryAttempts: 3,
      retryInitialDelay: "10s",
      retryMaxDelay: "5m",
      retryWindow: "12h",
      maxRuns: 1,
      expiresAt: daysFromNow(now, 1),
      createdAt: daysAgo(now, 1),
      updatedAt: hoursAgo(now, 4),
      runs: [],
    },
    {
      idSuffix: "adaptive_monitoring",
      name: "Adaptive Monitoring",
      description: "Turns up monitoring cadence when the slow endpoint starts drifting.",
      externalId: "demo_adaptive_monitoring",
      source: "mcp",
      createdBy: { type: "agent", id: "agent_sre", name: "SRE Agent" },
      handlerType: "tools",
      handlerConfig: {
        type: "tools",
        steps: [
          { tool: "http.get", args: { url: "https://demo.cronlet.dev/health/slow-endpoint" }, outputKey: "response" },
        ],
      },
      scheduleType: "every",
      scheduleConfig: { type: "every", interval: "15m" },
      nextRunAt: minutesFromNow(now, 9),
      active: true,
      callbackUrl: "https://demo.cronlet.dev/callbacks/adaptive-monitoring",
      metadata: {
        demoSeed: true,
        purpose: "Watch a degrading endpoint and tighten cadence when it starts timing out.",
        workflow: "adaptive-monitoring",
        service: "slow-endpoint",
      },
      timeout: "45s",
      retryAttempts: 5,
      retryInitialDelay: "30s",
      retryMaxDelay: "15m",
      retryWindow: "24h",
      maxRuns: null,
      expiresAt: null,
      createdAt: daysAgo(now, 14),
      updatedAt: minutesAgo(now, 25),
      runs: [
        {
          idSuffix: "run_1",
          status: "dead_lettered",
          trigger: "schedule",
          attempt: 3,
          scheduledAt: minutesAgo(now, 25),
          startedAt: minutesAgo(now, 25),
          completedAt: new Date(minutesAgo(now, 25).getTime() + 32_000),
          durationMs: 32_000,
          errorMessage: "Retries exhausted after repeated timeouts",
          logs: "Endpoint timed out on three consecutive attempts.",
          output: null,
          dispatchStatus: "dead_lettered",
          dispatchAvailableAt: minutesAgo(now, 25),
          dispatchLastError: "Retries exhausted after repeated timeouts",
          responseBodyPreview: null,
          responseBodyHash: null,
          httpStatus: 504,
        },
        {
          idSuffix: "run_2",
          status: "success",
          trigger: "schedule",
          attempt: 1,
          scheduledAt: hoursAgo(now, 3),
          startedAt: hoursAgo(now, 3),
          completedAt: new Date(hoursAgo(now, 3).getTime() + 1_400),
          durationMs: 1_400,
          errorMessage: null,
          logs: "Endpoint recovered within baseline latency.",
          output: { responseTimeMs: 1400 },
          dispatchStatus: "succeeded",
          dispatchAvailableAt: hoursAgo(now, 3),
          dispatchLastError: null,
          responseBodyPreview: "{\"ok\":true}",
          responseBodyHash: "demo_monitor_ok",
          httpStatus: 200,
        },
      ],
    },
    {
      idSuffix: "stripe_sync",
      name: "Stripe Sync",
      description: "Synchronizes Stripe events and retries when rate limits bite.",
      externalId: "demo_stripe_sync",
      source: "sdk",
      createdBy: { type: "user", id: currentUserId, name: "You" },
      handlerType: "webhook",
      handlerConfig: {
        type: "webhook",
        url: "https://demo.cronlet.dev/jobs/stripe-sync",
        method: "POST",
      },
      scheduleType: "every",
      scheduleConfig: { type: "every", interval: "1h" },
      nextRunAt: minutesFromNow(now, 27),
      active: true,
      callbackUrl: "https://demo.cronlet.dev/callbacks/stripe-sync",
      metadata: {
        demoSeed: true,
        purpose: "Keep subscription and invoice state in sync from Stripe.",
        workflow: "stripe-sync",
        integration: "stripe",
      },
      timeout: "60s",
      retryAttempts: 5,
      retryInitialDelay: "30s",
      retryMaxDelay: "15m",
      retryWindow: "12h",
      maxRuns: null,
      expiresAt: null,
      createdAt: daysAgo(now, 28),
      updatedAt: minutesAgo(now, 6),
      runs: [
        {
          idSuffix: "run_1",
          status: "retry_wait",
          trigger: "schedule",
          attempt: 2,
          scheduledAt: minutesAgo(now, 6),
          startedAt: minutesAgo(now, 6),
          completedAt: null,
          durationMs: null,
          errorMessage: "HTTP 429 from Stripe webhook endpoint",
          logs: "Waiting before the next delivery attempt.",
          output: null,
          dispatchStatus: "retry_wait",
          dispatchAvailableAt: minutesFromNow(now, 9),
          dispatchLastError: "HTTP 429 from Stripe webhook endpoint",
          responseBodyPreview: "rate limited",
          responseBodyHash: "demo_rate_limited",
          httpStatus: 429,
        },
        {
          idSuffix: "run_2",
          status: "success",
          trigger: "schedule",
          attempt: 1,
          scheduledAt: hoursAgo(now, 1),
          startedAt: hoursAgo(now, 1),
          completedAt: new Date(hoursAgo(now, 1).getTime() + 1_280),
          durationMs: 1_280,
          errorMessage: null,
          logs: "Stripe events synchronized successfully.",
          output: { syncedEvents: 14 },
          dispatchStatus: "succeeded",
          dispatchAvailableAt: hoursAgo(now, 1),
          dispatchLastError: null,
          responseBodyPreview: "{\"synced\":14}",
          responseBodyHash: "demo_stripe_ok",
          httpStatus: 200,
        },
      ],
    },
    {
      idSuffix: "backup_escalation_ping",
      name: "Backup Escalation Ping",
      description: "Paused backup reminder that can be resumed before the next maintenance window.",
      externalId: "demo_backup_escalation_ping",
      source: "dashboard",
      createdBy: { type: "user", id: currentUserId, name: "You" },
      handlerType: "webhook",
      handlerConfig: {
        type: "webhook",
        url: "https://demo.cronlet.dev/hooks/backup-ping",
        method: "POST",
      },
      scheduleType: "every",
      scheduleConfig: { type: "every", interval: "6h" },
      nextRunAt: hoursFromNow(now, 6),
      active: false,
      callbackUrl: null,
      metadata: {
        demoSeed: true,
        purpose: "Escalate if the backup verification run has not been acknowledged.",
        workflow: "backup-escalation",
      },
      timeout: "30s",
      retryAttempts: 2,
      retryInitialDelay: "30s",
      retryMaxDelay: "10m",
      retryWindow: "6h",
      maxRuns: null,
      expiresAt: null,
      createdAt: daysAgo(now, 12),
      updatedAt: hoursAgo(now, 8),
      runs: [],
    },
  ];
}

export async function seedDemoDataForOrganization(
  prisma: PrismaClient,
  input: DemoSeedInput
): Promise<DemoSeedResult> {
  const now = new Date();
  const tasks = buildDemoTasks(now, input.userId);
  const currentMonth = formatYearMonth(now);

  await prisma.$transaction(async (tx) => {
    const existingTasks = await tx.task.findMany({
      where: {
        organizationId: input.organizationId,
        externalId: { startsWith: "demo_" },
      },
      select: {
        id: true,
        runs: {
          select: { id: true },
        },
      },
    });

    const existingTaskIds = existingTasks.map((task) => task.id);
    const existingRunIds = existingTasks.flatMap((task) => task.runs.map((run) => run.id));

    if (existingTaskIds.length > 0 || existingRunIds.length > 0) {
      const auditTargets: Prisma.AuditEventWhereInput[] = [];
      if (existingTaskIds.length > 0) {
        auditTargets.push({ targetType: "task", targetId: { in: existingTaskIds } });
      }
      if (existingRunIds.length > 0) {
        auditTargets.push({ targetType: "run", targetId: { in: existingRunIds } });
      }

      await tx.auditEvent.deleteMany({
        where: {
          organizationId: input.organizationId,
          OR: auditTargets,
        },
      });
    }

    if (existingTaskIds.length > 0) {
      await tx.task.deleteMany({
        where: {
          organizationId: input.organizationId,
          id: { in: existingTaskIds },
        },
      });
    }

    for (const definition of tasks) {
      const taskId = demoId(input.organizationId, definition.idSuffix);
      await tx.task.create({
        data: {
          id: taskId,
          organizationId: input.organizationId,
          name: definition.name,
          description: definition.description,
          externalId: definition.externalId,
          handlerType: definition.handlerType,
          handlerConfig: toPrismaJson(definition.handlerConfig),
          scheduleType: definition.scheduleType,
          scheduleConfig: toPrismaJson(definition.scheduleConfig),
          timezone: "UTC",
          nextRunAt: definition.nextRunAt,
          retryAttempts: definition.retryAttempts,
          retryBackoff: "exponential",
          retryDelay: definition.retryInitialDelay,
          retryMaxAttempts: definition.retryAttempts,
          retryInitialDelay: definition.retryInitialDelay,
          retryMaxDelay: definition.retryMaxDelay,
          retryJitter: true,
          retryWindow: definition.retryWindow,
          retryOnStatusCodes: [],
          terminalStatusCodes: [],
          timeout: definition.timeout,
          active: definition.active,
          source: definition.source,
          createdBy: toPrismaJson(definition.createdBy),
          callbackUrl: definition.callbackUrl,
          metadata: toPrismaJson(definition.metadata),
          maxRuns: definition.maxRuns,
          expiresAt: definition.expiresAt,
          runCount: definition.runs.length,
          createdAt: definition.createdAt,
          updatedAt: definition.updatedAt,
        },
      });

      await tx.taskEvent.create({
        data: {
          organizationId: input.organizationId,
          taskId,
          action: "task.created",
          previousState: null,
          nextState: definition.active ? "active" : "paused",
          reason: definition.source,
          metadata: {
            externalId: definition.externalId,
            callbackUrl: definition.callbackUrl,
          },
          createdAt: definition.createdAt,
        },
      });

      if (!definition.active) {
        await tx.taskEvent.create({
          data: {
            organizationId: input.organizationId,
            taskId,
            action: "task.updated",
            previousState: "active",
            nextState: "paused",
            reason: "manual",
            metadata: {
              lifecycle: "paused",
            },
            createdAt: definition.updatedAt,
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorType: definition.createdBy.type,
          actorId: definition.createdBy.id,
          action: "task.created",
          targetType: "task",
          targetId: taskId,
          metadata: {
            demoSeed: true,
            source: definition.source,
          },
          createdAt: definition.createdAt,
        },
      });

      for (const run of definition.runs) {
        const runId = demoId(input.organizationId, `${definition.idSuffix}_${run.idSuffix}`);
        const dispatchJobId = demoId(input.organizationId, `${definition.idSuffix}_${run.idSuffix}_dispatch`);
        const runAttemptId = demoId(input.organizationId, `${definition.idSuffix}_${run.idSuffix}_attempt`);

        await tx.run.create({
          data: {
            id: runId,
            organizationId: input.organizationId,
            taskId,
            status: run.status,
            trigger: run.trigger,
            attempt: run.attempt,
            scheduledAt: run.scheduledAt,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            durationMs: run.durationMs,
            output: run.output ? toPrismaJson(run.output) : undefined,
            logs: run.logs,
            errorMessage: run.errorMessage,
            createdAt: run.scheduledAt,
            updatedAt: run.completedAt ?? run.startedAt ?? run.scheduledAt,
          },
        });

        await tx.dispatchJob.create({
          data: {
            id: dispatchJobId,
            organizationId: input.organizationId,
            taskId,
            runId,
            status: run.dispatchStatus,
            availableAt: run.dispatchAvailableAt,
            leaseOwner: run.dispatchStatus === "pending" ? null : "demo-worker",
            leasedUntil: run.dispatchStatus === "pending" ? null : new Date(run.dispatchAvailableAt.getTime() + 60_000),
            attemptCount: run.attempt,
            maxAttempts: 5,
            retryWindowEndsAt: new Date(run.scheduledAt.getTime() + 12 * 60 * 60 * 1000),
            lastError: run.dispatchLastError,
            destinationKey: definition.callbackUrl ?? destinationKeyForDefinition(definition),
            createdAt: run.scheduledAt,
            updatedAt: run.completedAt ?? run.dispatchAvailableAt,
          },
        });

        await tx.runAttempt.create({
          data: {
            id: runAttemptId,
            organizationId: input.organizationId,
            runId,
            taskId,
            dispatchJobId,
            attemptNumber: run.attempt,
            status: runAttemptStatusForRun(run.status),
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            durationMs: run.durationMs,
            httpStatus: run.httpStatus,
            errorClass: run.errorMessage ? "DemoError" : null,
            errorMessage: run.errorMessage,
            responseBodyPreview: run.responseBodyPreview,
            responseBodyHash: run.responseBodyHash,
            output: run.output ? toPrismaJson(run.output) : undefined,
            logs: run.logs,
            createdAt: run.scheduledAt,
            updatedAt: run.completedAt ?? run.dispatchAvailableAt,
          },
        });

        for (const event of runLifecycleEvents(run)) {
          await tx.runEvent.create({
            data: {
              organizationId: input.organizationId,
              runId,
              action: event.action,
              previousState: event.previousState,
              nextState: event.nextState,
              reason: event.reason,
              metadata: event.metadata ? toPrismaJson(event.metadata) : undefined,
              createdAt: event.createdAt,
            },
          });
        }

        for (const event of dispatchLifecycleEvents(run)) {
          await tx.dispatchEvent.create({
            data: {
              organizationId: input.organizationId,
              dispatchJobId,
              action: event.action,
              previousState: event.previousState,
              nextState: event.nextState,
              reason: event.reason,
              metadata: event.metadata ? toPrismaJson(event.metadata) : undefined,
              createdAt: event.createdAt,
            },
          });
        }

        await tx.auditEvent.create({
          data: {
            organizationId: input.organizationId,
            actorType: definition.createdBy.type,
            actorId: definition.createdBy.id,
            action: run.status === "success" ? "run.completed" : "run.created",
            targetType: "run",
            targetId: runId,
            metadata: {
              demoSeed: true,
              taskId,
              status: run.status,
            },
            createdAt: run.scheduledAt,
          },
        });
      }
    }

    const existingUsage = await tx.usageCounter.findUnique({
      where: {
        organizationId_yearMonth: {
          organizationId: input.organizationId,
          yearMonth: currentMonth,
        },
      },
    });

    const demoRunAttempts = tasks.reduce((sum, task) => sum + task.runs.length, 0);

    await tx.usageCounter.upsert({
      where: {
        organizationId_yearMonth: {
          organizationId: input.organizationId,
          yearMonth: currentMonth,
        },
      },
      update: {
        runAttempts: Math.max(existingUsage?.runAttempts ?? 0, demoRunAttempts),
      },
      create: {
        organizationId: input.organizationId,
        yearMonth: currentMonth,
        runAttempts: demoRunAttempts,
      },
    });

    await tx.billingEntitlement.upsert({
      where: { organizationId: input.organizationId },
      update: {},
      create: {
        organizationId: input.organizationId,
        tier: "free",
        delinquent: false,
        graceEndsAt: null,
      },
    });

    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorType: "internal",
        actorId: input.userId,
        action: "demo.seeded",
        targetType: "organization",
        targetId: input.organizationId,
        metadata: {
          demoSeed: true,
          taskCount: tasks.length,
          runCount: tasks.reduce((sum, task) => sum + task.runs.length, 0),
        },
        createdAt: now,
      },
    });
  });

  return {
    taskCount: tasks.length,
    runCount: tasks.reduce((sum, task) => sum + task.runs.length, 0),
    seededAt: now.toISOString(),
  };
}
