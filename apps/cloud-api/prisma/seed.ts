import { PrismaClient, type Prisma } from "@prisma/client";
import { formatYearMonth } from "@cronlet/shared";
import { hashApiKey } from "../src/lib/api-keys.js";

const prisma = new PrismaClient();

const DEMO_ORG_ID = process.env.CRONLET_DEMO_ORG_ID ?? "org_demo";
const DEMO_CLERK_ORG_ID = process.env.CRONLET_DEMO_CLERK_ORG_ID ?? DEMO_ORG_ID;
const DEMO_ORG_NAME = process.env.CRONLET_DEMO_ORG_NAME ?? "Cronlet Demo Lab";
const DEMO_ORG_SLUG = process.env.CRONLET_DEMO_ORG_SLUG ?? "cronlet-demo-lab";

const DEMO_USERS = {
  owner: {
    id: process.env.CRONLET_DEMO_OWNER_ID ?? "user_demo_owner",
    clerkUserId: process.env.CRONLET_DEMO_OWNER_CLERK_ID ?? "user_demo_owner",
    email: process.env.CRONLET_DEMO_OWNER_EMAIL ?? "owner@demo.cronlet.dev",
    name: "Niall",
    role: "owner",
  },
  admin: {
    id: "user_demo_admin",
    clerkUserId: "user_demo_admin",
    email: "admin@demo.cronlet.dev",
    name: "Maya",
    role: "admin",
  },
  member: {
    id: "user_demo_member",
    clerkUserId: "user_demo_member",
    email: "member@demo.cronlet.dev",
    name: "Sam",
    role: "member",
  },
  viewer: {
    id: "user_demo_viewer",
    clerkUserId: "user_demo_viewer",
    email: "viewer@demo.cronlet.dev",
    name: "Ava",
    role: "viewer",
  },
} as const;

const DEMO_API_KEYS = {
  sdk: {
    id: "key_demo_sdk",
    label: "Product Hunt SDK Demo",
    token: "ck_demo_sdk_video_key_1234567890abcdefghijklmnopqrstuv",
    scopes: ["*"],
  },
  mcp: {
    id: "key_demo_mcp",
    label: "Product Hunt MCP Demo",
    token: "ck_demo_mcp_video_key_1234567890abcdefghijklmnopqrstuv",
    scopes: ["*"],
  },
  readOnly: {
    id: "key_demo_readonly",
    label: "Readonly Support Key",
    token: "ck_demo_readonly_key_1234567890abcdefghijklmnopqrstuvw",
    scopes: ["tasks:read", "runs:read"],
  },
} as const;

const now = new Date("2026-03-09T10:00:00.000Z");

function iso(date: Date): string {
  return date.toISOString();
}

function minutesAgo(minutes: number): Date {
  return new Date(now.getTime() - minutes * 60 * 1000);
}

function hoursAgo(hours: number): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function minutesFromNow(minutes: number): Date {
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function daysFromNow(days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function runRecord(input: {
  id: string;
  taskId: string;
  status: "queued" | "running" | "success" | "failure" | "timeout";
  trigger?: "schedule" | "manual" | "api";
  attempt?: number;
  createdAt: Date;
  startedOffsetSeconds?: number;
  completedOffsetSeconds?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  output?: Record<string, unknown> | null;
  logs?: string | null;
}) {
  const startedAt = input.status === "queued" ? null : new Date(input.createdAt.getTime() + (input.startedOffsetSeconds ?? 1) * 1000);
  const completedAt =
    input.status === "queued" || input.status === "running" || input.completedOffsetSeconds === null
      ? null
      : new Date(input.createdAt.getTime() + (input.completedOffsetSeconds ?? 3) * 1000);

  return {
    id: input.id,
    organizationId: DEMO_ORG_ID,
    taskId: input.taskId,
    status: input.status,
    trigger: input.trigger ?? "schedule",
    attempt: input.attempt ?? 1,
    scheduledAt: input.createdAt,
    startedAt,
    completedAt,
    durationMs: input.durationMs ?? null,
    output: input.output ? (input.output as Prisma.InputJsonValue) : null,
    logs: input.logs ?? null,
    errorMessage: input.errorMessage ?? null,
    createdAt: input.createdAt,
    updatedAt: completedAt ?? startedAt ?? input.createdAt,
  };
}

const taskDefinitions = [
  {
    id: "task_api_health_monitor",
    name: "API Health Monitor",
    description: "Checks the public API every 5 minutes and records latency.",
    source: "dashboard",
    createdBy: { type: "user", id: DEMO_USERS.owner.id, name: DEMO_USERS.owner.name },
    handlerType: "webhook",
    handlerConfig: {
      type: "webhook",
      url: "https://demo.cronlet.dev/hooks/api-health",
      method: "GET",
      headers: {
        "X-Demo": "product-hunt",
      },
    },
    scheduleType: "every",
    scheduleConfig: { type: "every", interval: "5m" },
    timezone: "UTC",
    nextRunAt: minutesFromNow(3),
    retryAttempts: 3,
    retryBackoff: "linear",
    retryDelay: "15s",
    timeout: "30s",
    active: true,
    callbackUrl: null,
    metadata: {
      environment: "production",
      service: "public-api",
      owner: "platform",
    },
    maxRuns: null,
    expiresAt: null,
    runCount: 1864,
    createdAt: daysAgo(45),
    updatedAt: minutesAgo(7),
    runs: [
      runRecord({
        id: "run_api_health_1",
        taskId: "task_api_health_monitor",
        status: "success",
        createdAt: minutesAgo(7),
        durationMs: 234,
        output: { statusCode: 200, body: "OK", responseTimeMs: 234 },
      }),
      runRecord({
        id: "run_api_health_2",
        taskId: "task_api_health_monitor",
        status: "success",
        createdAt: minutesAgo(12),
        durationMs: 228,
        output: { statusCode: 200, body: "OK", responseTimeMs: 228 },
      }),
      runRecord({
        id: "run_api_health_3",
        taskId: "task_api_health_monitor",
        status: "failure",
        createdAt: hoursAgo(5),
        durationMs: 910,
        errorMessage: "HTTP 503 from upstream health endpoint",
        output: { statusCode: 503, body: "Service Unavailable" },
      }),
      runRecord({
        id: "run_api_health_4",
        taskId: "task_api_health_monitor",
        status: "success",
        createdAt: hoursAgo(6),
        durationMs: 241,
        output: { statusCode: 200, body: "OK", responseTimeMs: 241 },
      }),
      runRecord({
        id: "run_api_health_5",
        taskId: "task_api_health_monitor",
        status: "success",
        createdAt: hoursAgo(12),
        durationMs: 219,
        output: { statusCode: 200, body: "OK", responseTimeMs: 219 },
      }),
    ],
  },
  {
    id: "task_pricing_watcher",
    name: "Pricing Watcher",
    description: "Monitors competitor pricing pages and calls back with diffs.",
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
    timezone: "UTC",
    nextRunAt: minutesFromNow(18),
    retryAttempts: 2,
    retryBackoff: "linear",
    retryDelay: "30s",
    timeout: "45s",
    active: true,
    callbackUrl: "https://demo.cronlet.dev/agents/pricing-watcher/callback",
    metadata: {
      agent: "research-ops",
      conversationId: "conv_demo_pricing_001",
      competitor: "Acme Monitor",
      purpose: "pricing intelligence",
    },
    maxRuns: null,
    expiresAt: null,
    runCount: 84,
    createdAt: daysAgo(14),
    updatedAt: minutesAgo(24),
    runs: [
      runRecord({
        id: "run_pricing_watcher_1",
        taskId: "task_pricing_watcher",
        status: "success",
        createdAt: minutesAgo(24),
        durationMs: 612,
        output: { statusCode: 200, diffFound: true, changedFields: ["starter", "pro"] },
      }),
      runRecord({
        id: "run_pricing_watcher_2",
        taskId: "task_pricing_watcher",
        status: "success",
        createdAt: hoursAgo(1),
        durationMs: 584,
        output: { statusCode: 200, diffFound: false },
      }),
      runRecord({
        id: "run_pricing_watcher_3",
        taskId: "task_pricing_watcher",
        status: "success",
        createdAt: hoursAgo(2),
        durationMs: 601,
        output: { statusCode: 200, diffFound: false },
      }),
    ],
  },
  {
    id: "task_weekly_slack_digest",
    name: "Weekly Slack Digest",
    description: "Summarizes product metrics and posts a Monday digest to Slack.",
    source: "dashboard",
    createdBy: { type: "user", id: DEMO_USERS.admin.id, name: DEMO_USERS.admin.name },
    handlerType: "tools",
    handlerConfig: {
      type: "tools",
      steps: [
        { tool: "http.get", args: { url: "https://demo.cronlet.dev/metrics/weekly" }, outputKey: "metrics" },
        { tool: "slack.postMessage", args: { channel: "#ops", text: "Weekly digest ready" } },
      ],
    },
    scheduleType: "weekly",
    scheduleConfig: { type: "weekly", days: ["mon"], time: "09:00" },
    timezone: "UTC",
    nextRunAt: daysFromNow(7),
    retryAttempts: 2,
    retryBackoff: "linear",
    retryDelay: "1m",
    timeout: "60s",
    active: true,
    callbackUrl: null,
    metadata: {
      channel: "#ops",
      report: "weekly-company-digest",
    },
    maxRuns: null,
    expiresAt: null,
    runCount: 18,
    createdAt: daysAgo(120),
    updatedAt: daysAgo(2),
    runs: [
      runRecord({
        id: "run_weekly_digest_1",
        taskId: "task_weekly_slack_digest",
        status: "success",
        createdAt: daysAgo(2),
        durationMs: 1480,
        output: { statusCode: 200, posted: true, channel: "#ops" },
      }),
      runRecord({
        id: "run_weekly_digest_2",
        taskId: "task_weekly_slack_digest",
        status: "success",
        createdAt: daysAgo(9),
        durationMs: 1312,
        output: { statusCode: 200, posted: true, channel: "#ops" },
      }),
    ],
  },
  {
    id: "task_stripe_sync_guard",
    name: "Stripe Sync Guard",
    description: "Syncs Stripe data every 15 minutes and alerts on repeated failures.",
    source: "sdk",
    createdBy: { type: "user", id: DEMO_USERS.owner.id, name: DEMO_USERS.owner.name },
    handlerType: "webhook",
    handlerConfig: {
      type: "webhook",
      url: "https://demo.cronlet.dev/jobs/stripe-sync",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        source: "cronlet",
      },
    },
    scheduleType: "every",
    scheduleConfig: { type: "every", interval: "15m" },
    timezone: "UTC",
    nextRunAt: minutesFromNow(11),
    retryAttempts: 3,
    retryBackoff: "exponential",
    retryDelay: "30s",
    timeout: "45s",
    active: true,
    callbackUrl: "https://demo.cronlet.dev/callbacks/stripe-sync",
    metadata: {
      integration: "stripe",
      customerSegment: "pro",
      owner: "billing-platform",
    },
    maxRuns: null,
    expiresAt: null,
    runCount: 324,
    createdAt: daysAgo(30),
    updatedAt: minutesAgo(18),
    runs: [
      runRecord({
        id: "run_stripe_sync_1",
        taskId: "task_stripe_sync_guard",
        status: "success",
        createdAt: minutesAgo(18),
        attempt: 2,
        durationMs: 522,
        output: { statusCode: 200, syncedCustomers: 18, retried: true },
      }),
      runRecord({
        id: "run_stripe_sync_2",
        taskId: "task_stripe_sync_guard",
        status: "failure",
        createdAt: minutesAgo(19),
        attempt: 1,
        durationMs: 800,
        errorMessage: "Database pool timeout",
        output: { statusCode: 500 },
      }),
      runRecord({
        id: "run_stripe_sync_3",
        taskId: "task_stripe_sync_guard",
        status: "timeout",
        createdAt: hoursAgo(3),
        attempt: 1,
        durationMs: null,
        errorMessage: "Task timed out after 45s",
      }),
      runRecord({
        id: "run_stripe_sync_4",
        taskId: "task_stripe_sync_guard",
        status: "success",
        createdAt: hoursAgo(4),
        durationMs: 441,
        output: { statusCode: 200, syncedCustomers: 22 },
      }),
    ],
  },
  {
    id: "task_lead_followup_agent",
    name: "Lead Follow-Up Agent",
    description: "Checks CRM for new leads, drafts outreach, and reports back via callback.",
    source: "mcp",
    createdBy: { type: "agent", id: "agent_revenue_assist", name: "Revenue Assist" },
    handlerType: "tools",
    handlerConfig: {
      type: "tools",
      steps: [
        { tool: "http.get", args: { url: "https://demo.cronlet.dev/crm/new-leads" }, outputKey: "leads" },
        { tool: "openai.chat", args: { prompt: "Draft follow-up emails for the latest leads" }, outputKey: "drafts" },
      ],
    },
    scheduleType: "weekly",
    scheduleConfig: { type: "weekly", days: ["mon", "tue", "wed", "thu", "fri"], time: "09:30" },
    timezone: "UTC",
    nextRunAt: minutesFromNow(26),
    retryAttempts: 1,
    retryBackoff: "linear",
    retryDelay: "1m",
    timeout: "90s",
    active: true,
    callbackUrl: "https://demo.cronlet.dev/agents/revenue/followups",
    metadata: {
      agent: "revenue-assist",
      workspace: "sales",
      purpose: "lead-follow-up",
    },
    maxRuns: null,
    expiresAt: null,
    runCount: 46,
    createdAt: daysAgo(10),
    updatedAt: hoursAgo(23),
    runs: [
      runRecord({
        id: "run_lead_followup_1",
        taskId: "task_lead_followup_agent",
        status: "success",
        createdAt: hoursAgo(23),
        durationMs: 1960,
        output: { statusCode: 200, draftedMessages: 6, postedCallback: true },
      }),
      runRecord({
        id: "run_lead_followup_2",
        taskId: "task_lead_followup_agent",
        status: "queued",
        createdAt: minutesAgo(2),
        trigger: "manual",
        attempt: 1,
        completedOffsetSeconds: null,
        durationMs: null,
      }),
    ],
  },
  {
    id: "task_ssl_expiry",
    name: "SSL Certificate Expiry",
    description: "Checks certificate expiration daily and raises alerts before expiry.",
    source: "sdk",
    createdBy: { type: "user", id: DEMO_USERS.admin.id, name: DEMO_USERS.admin.name },
    handlerType: "tools",
    handlerConfig: {
      type: "tools",
      steps: [
        { tool: "http.get", args: { url: "https://demo.cronlet.dev/ssl/check" }, outputKey: "cert" },
      ],
    },
    scheduleType: "daily",
    scheduleConfig: { type: "daily", times: ["07:00"] },
    timezone: "UTC",
    nextRunAt: daysFromNow(1),
    retryAttempts: 1,
    retryBackoff: "linear",
    retryDelay: "1m",
    timeout: "30s",
    active: true,
    callbackUrl: null,
    metadata: {
      domain: "api.cronlet.dev",
      thresholdDays: 21,
    },
    maxRuns: null,
    expiresAt: null,
    runCount: 72,
    createdAt: daysAgo(90),
    updatedAt: hoursAgo(9),
    runs: [
      runRecord({
        id: "run_ssl_expiry_1",
        taskId: "task_ssl_expiry",
        status: "success",
        createdAt: hoursAgo(9),
        durationMs: 189,
        output: { statusCode: 200, daysRemaining: 43 },
      }),
      runRecord({
        id: "run_ssl_expiry_2",
        taskId: "task_ssl_expiry",
        status: "success",
        createdAt: daysAgo(1),
        durationMs: 195,
        output: { statusCode: 200, daysRemaining: 44 },
      }),
    ],
  },
  {
    id: "task_backup_ping",
    name: "Database Backup Ping",
    description: "Verifies the nightly backup endpoint completed successfully.",
    source: "dashboard",
    createdBy: { type: "user", id: DEMO_USERS.owner.id, name: DEMO_USERS.owner.name },
    handlerType: "webhook",
    handlerConfig: {
      type: "webhook",
      url: "https://demo.cronlet.dev/hooks/backup-ping",
      method: "POST",
    },
    scheduleType: "daily",
    scheduleConfig: { type: "daily", times: ["02:00"] },
    timezone: "UTC",
    nextRunAt: daysFromNow(1),
    retryAttempts: 2,
    retryBackoff: "linear",
    retryDelay: "1m",
    timeout: "30s",
    active: true,
    callbackUrl: null,
    metadata: {
      system: "postgres-primary",
      environment: "production",
    },
    maxRuns: null,
    expiresAt: null,
    runCount: 57,
    createdAt: daysAgo(60),
    updatedAt: hoursAgo(8),
    runs: [
      runRecord({
        id: "run_backup_ping_1",
        taskId: "task_backup_ping",
        status: "success",
        createdAt: hoursAgo(8),
        durationMs: 312,
        output: { statusCode: 200, backupId: "backup_2026_03_09" },
      }),
      runRecord({
        id: "run_backup_ping_2",
        taskId: "task_backup_ping",
        status: "success",
        createdAt: daysAgo(1),
        durationMs: 298,
        output: { statusCode: 200, backupId: "backup_2026_03_08" },
      }),
    ],
  },
  {
    id: "task_research_digest",
    name: "Research Digest",
    description: "Paused weekly research sweep for shipping and AI infra updates.",
    source: "mcp",
    createdBy: { type: "agent", id: "agent_research_ops", name: "Research Ops Agent" },
    handlerType: "tools",
    handlerConfig: {
      type: "tools",
      steps: [
        { tool: "http.get", args: { url: "https://demo.cronlet.dev/research/feed" }, outputKey: "feed" },
      ],
    },
    scheduleType: "weekly",
    scheduleConfig: { type: "weekly", days: ["fri"], time: "14:00" },
    timezone: "UTC",
    nextRunAt: null,
    retryAttempts: 1,
    retryBackoff: "linear",
    retryDelay: "1m",
    timeout: "60s",
    active: false,
    callbackUrl: "https://demo.cronlet.dev/agents/research/digest",
    metadata: {
      topic: "ai-infrastructure",
      pausedBy: "operator",
    },
    maxRuns: null,
    expiresAt: null,
    runCount: 12,
    createdAt: daysAgo(50),
    updatedAt: daysAgo(6),
    runs: [
      runRecord({
        id: "run_research_digest_1",
        taskId: "task_research_digest",
        status: "success",
        createdAt: daysAgo(6),
        durationMs: 1444,
        output: { statusCode: 200, articles: 9 },
      }),
    ],
  },
  {
    id: "task_trial_nudge",
    name: "Expiring Trial Nudge",
    description: "Sends trial-ending nudges and stops automatically after conversion.",
    source: "sdk",
    createdBy: { type: "user", id: DEMO_USERS.member.id, name: DEMO_USERS.member.name },
    handlerType: "tools",
    handlerConfig: {
      type: "tools",
      steps: [
        { tool: "http.get", args: { url: "https://demo.cronlet.dev/trials/expiring" }, outputKey: "trials" },
        { tool: "resend.sendEmail", args: { template: "trial-ending" } },
      ],
    },
    scheduleType: "daily",
    scheduleConfig: { type: "daily", times: ["11:00"] },
    timezone: "UTC",
    nextRunAt: daysFromNow(1),
    retryAttempts: 2,
    retryBackoff: "linear",
    retryDelay: "2m",
    timeout: "45s",
    active: true,
    callbackUrl: "https://demo.cronlet.dev/callbacks/trial-nudge",
    metadata: {
      campaign: "trial-ending",
      segment: "self-serve",
    },
    maxRuns: 50,
    expiresAt: null,
    runCount: 21,
    createdAt: daysAgo(21),
    updatedAt: hoursAgo(18),
    runs: [
      runRecord({
        id: "run_trial_nudge_1",
        taskId: "task_trial_nudge",
        status: "success",
        createdAt: hoursAgo(18),
        durationMs: 733,
        output: { statusCode: 202, emailsQueued: 14 },
      }),
      runRecord({
        id: "run_trial_nudge_2",
        taskId: "task_trial_nudge",
        status: "success",
        createdAt: daysAgo(1),
        durationMs: 710,
        output: { statusCode: 202, emailsQueued: 17 },
      }),
    ],
  },
  {
    id: "task_launch_checklist",
    name: "One-off Launch Checklist",
    description: "Ran once during launch week and is now paused for record keeping.",
    source: "dashboard",
    createdBy: { type: "user", id: DEMO_USERS.owner.id, name: DEMO_USERS.owner.name },
    handlerType: "webhook",
    handlerConfig: {
      type: "webhook",
      url: "https://demo.cronlet.dev/hooks/launch-checklist",
      method: "POST",
    },
    scheduleType: "once",
    scheduleConfig: { type: "once", at: iso(daysAgo(12)) },
    timezone: "UTC",
    nextRunAt: null,
    retryAttempts: 1,
    retryBackoff: "linear",
    retryDelay: "1m",
    timeout: "30s",
    active: false,
    callbackUrl: null,
    metadata: {
      release: "v1.0",
      owner: "product",
    },
    maxRuns: 1,
    expiresAt: daysAgo(11),
    runCount: 1,
    createdAt: daysAgo(13),
    updatedAt: daysAgo(12),
    runs: [
      runRecord({
        id: "run_launch_checklist_1",
        taskId: "task_launch_checklist",
        status: "success",
        createdAt: daysAgo(12),
        trigger: "manual",
        durationMs: 422,
        output: { statusCode: 200, checklistPassed: true },
      }),
    ],
  },
  {
    id: "task_adaptive_monitoring",
    name: "Adaptive Monitoring",
    description: "Monitors a health endpoint and increases urgency as latency trends upward.",
    source: "sdk",
    createdBy: { type: "user", id: DEMO_USERS.admin.id, name: DEMO_USERS.admin.name },
    handlerType: "tools",
    handlerConfig: {
      type: "tools",
      steps: [
        { tool: "http.get", args: { url: "https://demo.cronlet.dev/health/slow-endpoint" }, outputKey: "response" },
      ],
    },
    scheduleType: "every",
    scheduleConfig: { type: "every", interval: "10m" },
    timezone: "UTC",
    nextRunAt: minutesFromNow(4),
    retryAttempts: 1,
    retryBackoff: "linear",
    retryDelay: "30s",
    timeout: "30s",
    active: true,
    callbackUrl: "https://demo.cronlet.dev/callbacks/adaptive-monitoring",
    metadata: {
      monitor: "slow-endpoint",
      policy: "increase-frequency-on-drift",
    },
    maxRuns: null,
    expiresAt: null,
    runCount: 198,
    createdAt: daysAgo(18),
    updatedAt: minutesAgo(9),
    runs: [
      runRecord({
        id: "run_adaptive_monitoring_1",
        taskId: "task_adaptive_monitoring",
        status: "success",
        createdAt: minutesAgo(9),
        durationMs: 290,
        output: { statusCode: 200, responseTimeMs: 290 },
      }),
      runRecord({
        id: "run_adaptive_monitoring_2",
        taskId: "task_adaptive_monitoring",
        status: "success",
        createdAt: minutesAgo(19),
        durationMs: 275,
        output: { statusCode: 200, responseTimeMs: 275 },
      }),
      runRecord({
        id: "run_adaptive_monitoring_3",
        taskId: "task_adaptive_monitoring",
        status: "success",
        createdAt: minutesAgo(29),
        durationMs: 260,
        output: { statusCode: 200, responseTimeMs: 260 },
      }),
      runRecord({
        id: "run_adaptive_monitoring_4",
        taskId: "task_adaptive_monitoring",
        status: "success",
        createdAt: minutesAgo(39),
        durationMs: 190,
        output: { statusCode: 200, responseTimeMs: 190 },
      }),
      runRecord({
        id: "run_adaptive_monitoring_5",
        taskId: "task_adaptive_monitoring",
        status: "success",
        createdAt: minutesAgo(49),
        durationMs: 180,
        output: { statusCode: 200, responseTimeMs: 180 },
      }),
      runRecord({
        id: "run_adaptive_monitoring_6",
        taskId: "task_adaptive_monitoring",
        status: "success",
        createdAt: minutesAgo(59),
        durationMs: 170,
        output: { statusCode: 200, responseTimeMs: 170 },
      }),
    ],
  },
  {
    id: "task_scheduled_export",
    name: "Scheduled CSV Export",
    description: "Builds a recurring CSV export for customers on the first of each month.",
    source: "mcp",
    createdBy: { type: "agent", id: "agent_ops_export", name: "Ops Export Agent" },
    handlerType: "webhook",
    handlerConfig: {
      type: "webhook",
      url: "https://demo.cronlet.dev/exports/monthly-csv",
      method: "POST",
      body: {
        format: "csv",
        destination: "s3://cronlet-demo-exports/monthly.csv",
      },
    },
    scheduleType: "monthly",
    scheduleConfig: { type: "monthly", day: 1, time: "06:00" },
    timezone: "UTC",
    nextRunAt: daysFromNow(23),
    retryAttempts: 2,
    retryBackoff: "linear",
    retryDelay: "5m",
    timeout: "90s",
    active: true,
    callbackUrl: "https://demo.cronlet.dev/callbacks/monthly-export",
    metadata: {
      export: "monthly-customer-csv",
      destination: "s3",
    },
    maxRuns: null,
    expiresAt: null,
    runCount: 6,
    createdAt: daysAgo(150),
    updatedAt: daysAgo(8),
    runs: [
      runRecord({
        id: "run_scheduled_export_1",
        taskId: "task_scheduled_export",
        status: "success",
        createdAt: daysAgo(8),
        durationMs: 2440,
        output: { statusCode: 200, exportedRows: 12402 },
      }),
      runRecord({
        id: "run_scheduled_export_2",
        taskId: "task_scheduled_export",
        status: "running",
        createdAt: minutesAgo(1),
        trigger: "manual",
        completedOffsetSeconds: null,
      }),
    ],
  },
] as const;

const auditEvents: Prisma.AuditEventCreateManyInput[] = [
  {
    id: "audit_task_created_mcp",
    organizationId: DEMO_ORG_ID,
    actorType: "agent",
    actorId: "agent_research_ops",
    action: "task.created",
    targetType: "task",
    targetId: "task_pricing_watcher",
    metadata: { source: "mcp", taskName: "Pricing Watcher" },
    createdAt: daysAgo(14),
  },
  {
    id: "audit_task_created_sdk",
    organizationId: DEMO_ORG_ID,
    actorType: "user",
    actorId: DEMO_USERS.owner.id,
    action: "task.created",
    targetType: "task",
    targetId: "task_stripe_sync_guard",
    metadata: { source: "sdk", taskName: "Stripe Sync Guard" },
    createdAt: daysAgo(30),
  },
  {
    id: "audit_task_updated_sdk",
    organizationId: DEMO_ORG_ID,
    actorType: "user",
    actorId: DEMO_USERS.admin.id,
    action: "task.updated",
    targetType: "task",
    targetId: "task_adaptive_monitoring",
    metadata: { source: "sdk", changed: ["schedule", "retryAttempts"] },
    createdAt: daysAgo(2),
  },
  {
    id: "audit_run_failed",
    organizationId: DEMO_ORG_ID,
    actorType: "internal",
    actorId: "worker",
    action: "run.failed",
    targetType: "run",
    targetId: "run_stripe_sync_2",
    metadata: { taskId: "task_stripe_sync_guard", error: "Database pool timeout" },
    createdAt: minutesAgo(19),
  },
  {
    id: "audit_run_succeeded",
    organizationId: DEMO_ORG_ID,
    actorType: "internal",
    actorId: "worker",
    action: "run.succeeded",
    targetType: "run",
    targetId: "run_api_health_1",
    metadata: { taskId: "task_api_health_monitor", durationMs: 234 },
    createdAt: minutesAgo(7),
  },
  {
    id: "audit_api_key_created",
    organizationId: DEMO_ORG_ID,
    actorType: "user",
    actorId: DEMO_USERS.owner.id,
    action: "api_key.created",
    targetType: "api_key",
    targetId: DEMO_API_KEYS.sdk.id,
    metadata: { label: DEMO_API_KEYS.sdk.label },
    createdAt: daysAgo(20),
  },
];

async function seedUsersAndOrganization(): Promise<void> {
  await prisma.organization.deleteMany({
    where: {
      OR: [
        { id: DEMO_ORG_ID },
        { clerkOrgId: DEMO_CLERK_ORG_ID },
      ],
    },
  });

  for (const user of Object.values(DEMO_USERS)) {
    await prisma.user.upsert({
      where: { clerkUserId: user.clerkUserId },
      update: {
        email: user.email,
      },
      create: {
        id: user.id,
        clerkUserId: user.clerkUserId,
        email: user.email,
      },
    });
  }

  await prisma.organization.create({
    data: {
      id: DEMO_ORG_ID,
      clerkOrgId: DEMO_CLERK_ORG_ID,
      name: DEMO_ORG_NAME,
      slug: DEMO_ORG_SLUG,
    },
  });

  await prisma.organizationMember.createMany({
    data: Object.values(DEMO_USERS).map((user) => ({
      organizationId: DEMO_ORG_ID,
      userId: user.id,
      role: user.role,
    })),
  });

  await prisma.billingEntitlement.create({
    data: {
      organizationId: DEMO_ORG_ID,
      tier: "pro",
      delinquent: false,
      graceEndsAt: null,
    },
  });

  await prisma.usageCounter.create({
    data: {
      organizationId: DEMO_ORG_ID,
      yearMonth: formatYearMonth(now),
      runAttempts: 4823,
    },
  });
}

async function seedKeysSecretsAndAlerts(): Promise<void> {
  await prisma.apiKey.createMany({
    data: Object.values(DEMO_API_KEYS).map((key, index) => ({
      id: key.id,
      organizationId: DEMO_ORG_ID,
      label: key.label,
      keyHash: hashApiKey(key.token),
      scopes: key.scopes,
      lastUsedAt: index === 2 ? null : hoursAgo(index + 2),
      createdAt: daysAgo(20 - index),
      updatedAt: daysAgo(20 - index),
    })),
  });

  await prisma.secret.createMany({
    data: [
      {
        id: "secret_slack_bot",
        organizationId: DEMO_ORG_ID,
        name: "SLACK_BOT_TOKEN",
        encryptedValue: "enc_demo_slack_bot_token",
      },
      {
        id: "secret_posthog",
        organizationId: DEMO_ORG_ID,
        name: "POSTHOG_API_KEY",
        encryptedValue: "enc_demo_posthog_api_key",
      },
      {
        id: "secret_stripe",
        organizationId: DEMO_ORG_ID,
        name: "STRIPE_SECRET_KEY",
        encryptedValue: "enc_demo_stripe_secret_key",
      },
      {
        id: "secret_resend",
        organizationId: DEMO_ORG_ID,
        name: "RESEND_API_KEY",
        encryptedValue: "enc_demo_resend_api_key",
      },
    ],
  });

  await prisma.alert.createMany({
    data: [
      {
        id: "alert_email_ops",
        organizationId: DEMO_ORG_ID,
        channel: "email",
        destination: "ops@cronlet.dev",
        onFailure: true,
        onTimeout: true,
      },
      {
        id: "alert_webhook_pager",
        organizationId: DEMO_ORG_ID,
        channel: "webhook",
        destination: "https://demo.cronlet.dev/alerts/pagerduty",
        onFailure: true,
        onTimeout: true,
      },
    ],
  });
}

async function seedTasksAndRuns(): Promise<void> {
  for (const task of taskDefinitions) {
    await prisma.task.create({
      data: {
        id: task.id,
        organizationId: DEMO_ORG_ID,
        name: task.name,
        description: task.description,
        handlerType: task.handlerType,
        handlerConfig: task.handlerConfig as Prisma.InputJsonValue,
        scheduleType: task.scheduleType,
        scheduleConfig: task.scheduleConfig as Prisma.InputJsonValue,
        timezone: task.timezone,
        nextRunAt: task.nextRunAt,
        retryAttempts: task.retryAttempts,
        retryBackoff: task.retryBackoff,
        retryDelay: task.retryDelay,
        timeout: task.timeout,
        active: task.active,
        source: task.source,
        createdBy: task.createdBy as Prisma.InputJsonValue,
        callbackUrl: task.callbackUrl,
        metadata: task.metadata as Prisma.InputJsonValue,
        maxRuns: task.maxRuns,
        expiresAt: task.expiresAt,
        runCount: task.runCount,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
    });

    await prisma.run.createMany({
      data: task.runs,
    });
  }
}

async function seedAuditEvents(): Promise<void> {
  await prisma.auditEvent.createMany({
    data: auditEvents,
  });
}

async function main(): Promise<void> {
  await seedUsersAndOrganization();
  await seedKeysSecretsAndAlerts();
  await seedTasksAndRuns();
  await seedAuditEvents();

  console.log(`Demo org seeded: ${DEMO_ORG_NAME} (${DEMO_ORG_ID})`);
  console.log(`SDK demo key: ${DEMO_API_KEYS.sdk.token}`);
  console.log(`MCP demo key: ${DEMO_API_KEYS.mcp.token}`);
  console.log(`Read-only key: ${DEMO_API_KEYS.readOnly.token}`);
  console.log("Snippets: apps/cloud-api/prisma/demo-video-snippets.md");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
