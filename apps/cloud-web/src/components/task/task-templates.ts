import type { ScheduleConfig, ToolsHandlerConfig } from "@cronlet/shared";
import type { TaskFormValues } from "./task-form";
import { createDefaultTaskFormValues } from "./task-form";

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  category: "popular" | "monitoring" | "agent-workflows";
  handler: {
    type: "tools" | "webhook";
    steps?: ToolsHandlerConfig["steps"];
    url?: string;
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
  };
  schedule: ScheduleConfig;
  retryAttempts?: number;
  timeout?: string;
  requiredFields: string[];
}

export interface AgentSdkTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

function buildAgentSdkPrompt(input: {
  objective: string;
  domainModel: string[];
  implementationTasks: string[];
  callbackHandling: string[];
  acceptanceCriteria: string[];
}): string {
  return [
    "Integrate Cronlet Cloud scheduling into this product so our AI agents can create and manage schedules on behalf of users.",
    "",
    `Objective: ${input.objective}`,
    "",
    "Before writing code:",
    "- Inspect the existing stack, routing, API patterns, ORM/database layer, auth model, and environment variable conventions.",
    "- Implement the integration idiomatically for this codebase instead of inventing a parallel architecture.",
    "- If scheduling concepts already exist, extend them rather than duplicating them.",
    "",
    "Cronlet-specific requirements:",
    "- Use the server-side Cronlet SDK package `@cronlet/sdk` and create a small service wrapper around `new CloudClient({ apiKey: process.env.CRONLET_API_KEY, baseUrl?: process.env.CRONLET_BASE_URL })`.",
    "- Never expose the Cronlet API key to the client. All Cronlet calls must stay server-side.",
    "- Use Cronlet task metadata aggressively so every task can be mapped back to the correct internal records. Include stable identifiers like userId, orgId/accountId, feature key, integration type, and product record IDs.",
    "- Store the Cronlet task ID in the product database so the app can pause, resume, patch, or delete the task later.",
    "- Set a callback URL so the product receives completion events for each run.",
    "- The callback handler should be idempotent, safe to retry, and must verify the task/run being updated still belongs to the expected user/account context.",
    "- Model the Cronlet lifecycle clearly in the product: create, view status, pause, resume, update schedule, delete/cancel.",
    "- Use descriptive task names and descriptions so tasks are understandable in the Cronlet dashboard.",
    "- Use `maxRuns` and `expiresAt` when they help enforce product logic.",
    "",
    "Cronlet callback payload shape to account for:",
    "- `event`: `task.run.completed`",
    "- `task.id`, `task.name`, `task.metadata`",
    "- `run.id`, `run.status`, `run.output`, `run.durationMs`, `run.createdAt`",
    "- `stats.totalRuns`, `stats.remainingRuns`, `stats.expiresAt`",
    "",
    "Core architecture to implement:",
    "- A server-side Cronlet client/service module.",
    "- Database persistence for Cronlet task IDs and schedule state.",
    "- Agent-facing application functions or endpoints that the product's AI agent can call.",
    "- A callback endpoint that processes Cronlet run completion events.",
    "- Clear typing/interfaces for schedule requests, metadata, and callback payload handling.",
    "- Basic logging and error handling so failures are diagnosable.",
    "",
    "Domain model to represent:",
    ...input.domainModel.map((line) => `- ${line}`),
    "",
    "Implementation tasks:",
    ...input.implementationTasks.map((line) => `- ${line}`),
    "",
    "Callback handling details:",
    ...input.callbackHandling.map((line) => `- ${line}`),
    "",
    "Acceptance criteria:",
    ...input.acceptanceCriteria.map((line) => `- ${line}`),
    "",
    "Delivery requirements:",
    "- Make the smallest coherent set of code changes needed for a production-grade first version.",
    "- Add or update tests for the Cronlet service logic, callback handling, and the agent-facing schedule lifecycle where this repo normally keeps tests.",
    "- Update environment variable docs and any relevant README/developer setup docs.",
    "- At the end, summarize what was added, where the Cronlet integration lives, which env vars are required, and how the AI agent should call the new scheduling functions.",
  ].join("\n");
}

const EVERY_FIVE_MINUTES: ScheduleConfig = {
  type: "every",
  interval: "5m",
};

const EVERY_SIX_HOURS: ScheduleConfig = {
  type: "every",
  interval: "6h",
};

const DAILY_MORNING: ScheduleConfig = {
  type: "daily",
  times: ["09:00"],
};

const DAILY_MIDNIGHT: ScheduleConfig = {
  type: "daily",
  times: ["00:30"],
};

const WEEKLY_MONDAY: ScheduleConfig = {
  type: "weekly",
  days: ["mon"],
  time: "09:00",
};

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: "uptime-monitor",
    name: "Uptime Monitor",
    description: "Check a URL every 5 minutes, alert on failure",
    category: "popular",
    handler: {
      type: "webhook",
      url: "https://your-service.example.com/health",
      method: "GET",
    },
    schedule: EVERY_FIVE_MINUTES,
    retryAttempts: 2,
    timeout: "30s",
    requiredFields: ["webhook.url", "name"],
  },
  {
    id: "ai-content-pipeline",
    name: "AI Content Pipeline",
    description: "Generate content with AI daily, email for review",
    category: "popular",
    handler: {
      type: "tools",
      steps: [
        {
          tool: "http.post",
          args: {
            url: "https://your-ai-service.example.com/generate",
            body: {
              prompt: "Draft tomorrow's product update in a concise, friendly tone.",
            },
            headers: {
              Authorization: "Bearer YOUR_AI_API_KEY",
              "Content-Type": "application/json",
            },
          },
          outputKey: "draft",
        },
        {
          tool: "email.send",
          args: {
            to: "editor@yourcompany.com",
            subject: "Cronlet content draft",
            text: "{{draft.body}}",
            from: "noreply@yourcompany.com",
            secretName: "RESEND_API_KEY",
          },
        },
      ],
    },
    schedule: DAILY_MORNING,
    retryAttempts: 1,
    timeout: "1m",
    requiredFields: [
      "tools.steps.0.args.url",
      "tools.steps.0.args.headers.Authorization",
      "tools.steps.1.args.to",
      "tools.steps.1.args.from",
      "tools.steps.1.args.secretName",
    ],
  },
  {
    id: "self-healing-endpoint",
    name: "Self-Healing Endpoint",
    description: "Monitor, auto-restart on failure, escalate if still down",
    category: "popular",
    handler: {
      type: "tools",
      steps: [
        {
          tool: "http.get",
          args: {
            url: "https://your-service.example.com/health",
          },
          outputKey: "health",
        },
        {
          tool: "http.post",
          args: {
            url: "https://your-internal-api.example.com/restart",
            headers: {
              Authorization: "Bearer YOUR_INTERNAL_TOKEN",
            },
            body: {
              reason: "Automated restart requested by Cronlet",
            },
          },
          outputKey: "restart",
        },
        {
          tool: "slack.post",
          args: {
            channel: "#ops",
            text: "Self-healing workflow ran. Health: {{health.status}} Restart: {{restart.status}}",
            secretName: "SLACK_TOKEN",
          },
        },
      ],
    },
    schedule: EVERY_FIVE_MINUTES,
    retryAttempts: 2,
    timeout: "1m",
    requiredFields: [
      "tools.steps.0.args.url",
      "tools.steps.1.args.url",
      "tools.steps.1.args.headers.Authorization",
      "tools.steps.2.args.channel",
      "tools.steps.2.args.secretName",
    ],
  },
  {
    id: "weekly-slack-digest",
    name: "Weekly Slack Digest",
    description: "Summarize data and post to Slack every Monday",
    category: "popular",
    handler: {
      type: "tools",
      steps: [
        {
          tool: "http.get",
          args: {
            url: "https://your-api.example.com/reports/weekly-summary",
          },
          outputKey: "report",
        },
        {
          tool: "slack.post",
          args: {
            channel: "#team-updates",
            text: "Weekly digest: {{report.body}}",
            secretName: "SLACK_TOKEN",
          },
        },
      ],
    },
    schedule: WEEKLY_MONDAY,
    retryAttempts: 1,
    timeout: "30s",
    requiredFields: [
      "tools.steps.0.args.url",
      "tools.steps.1.args.channel",
      "tools.steps.1.args.secretName",
    ],
  },
  {
    id: "api-health-check",
    name: "API Health Check",
    description: "Monitor response times across endpoints",
    category: "monitoring",
    handler: {
      type: "webhook",
      url: "https://your-service.example.com/health",
      method: "GET",
    },
    schedule: EVERY_FIVE_MINUTES,
    retryAttempts: 3,
    timeout: "10s",
    requiredFields: ["webhook.url"],
  },
  {
    id: "price-change-detector",
    name: "Price Change Detector",
    description: "Watch a page for changes every 6 hours",
    category: "monitoring",
    handler: {
      type: "tools",
      steps: [
        {
          tool: "http.get",
          args: {
            url: "https://your-service.example.com/scrape/price",
          },
          outputKey: "price",
        },
        {
          tool: "log",
          args: {
            message: "Observed price payload: {{price.body}}",
            level: "info",
          },
        },
      ],
    },
    schedule: EVERY_SIX_HOURS,
    retryAttempts: 1,
    timeout: "30s",
    requiredFields: ["tools.steps.0.args.url"],
  },
  {
    id: "ssl-certificate-expiry",
    name: "SSL Certificate Expiry",
    description: "Check SSL cert expiry daily, alert before it expires",
    category: "monitoring",
    handler: {
      type: "tools",
      steps: [
        {
          tool: "http.get",
          args: {
            url: "https://your-monitor.example.com/ssl-status?domain=example.com",
          },
          outputKey: "ssl",
        },
        {
          tool: "slack.post",
          args: {
            channel: "#ops",
            text: "SSL status: {{ssl.body}}",
            secretName: "SLACK_TOKEN",
          },
        },
      ],
    },
    schedule: DAILY_MORNING,
    retryAttempts: 1,
    timeout: "30s",
    requiredFields: [
      "tools.steps.0.args.url",
      "tools.steps.1.args.channel",
      "tools.steps.1.args.secretName",
    ],
  },
  {
    id: "database-backup-ping",
    name: "Database Backup Ping",
    description: "Verify your backup endpoint runs nightly",
    category: "monitoring",
    handler: {
      type: "webhook",
      url: "https://your-backup-service.example.com/last-run",
      method: "GET",
    },
    schedule: DAILY_MIDNIGHT,
    retryAttempts: 2,
    timeout: "30s",
    requiredFields: ["webhook.url"],
  },
  {
    id: "lead-follow-up-agent",
    name: "Lead Follow-Up Agent",
    description: "Check CRM for new leads daily, draft outreach",
    category: "agent-workflows",
    handler: {
      type: "tools",
      steps: [
        {
          tool: "http.get",
          args: {
            url: "https://your-crm.example.com/leads/new",
            headers: {
              Authorization: "Bearer YOUR_CRM_TOKEN",
            },
          },
          outputKey: "leads",
        },
        {
          tool: "http.post",
          args: {
            url: "https://your-ai-service.example.com/draft-outreach",
            body: {
              leads: "{{leads.body}}",
            },
          },
          outputKey: "drafts",
        },
        {
          tool: "email.send",
          args: {
            to: "sales@yourcompany.com",
            subject: "New lead follow-up drafts",
            text: "{{drafts.body}}",
            from: "noreply@yourcompany.com",
            secretName: "RESEND_API_KEY",
          },
        },
      ],
    },
    schedule: DAILY_MORNING,
    retryAttempts: 1,
    timeout: "1m",
    requiredFields: [
      "tools.steps.0.args.url",
      "tools.steps.0.args.headers.Authorization",
      "tools.steps.1.args.url",
      "tools.steps.2.args.to",
      "tools.steps.2.args.from",
      "tools.steps.2.args.secretName",
    ],
  },
  {
    id: "research-digest",
    name: "Research Digest",
    description: "Search for a topic weekly, summarize what's new",
    category: "agent-workflows",
    handler: {
      type: "tools",
      steps: [
        {
          tool: "http.get",
          args: {
            url: "https://your-research-service.example.com/digest?topic=cron-jobs",
          },
          outputKey: "digest",
        },
        {
          tool: "log",
          args: {
            message: "Research digest: {{digest.body}}",
            level: "info",
          },
        },
      ],
    },
    schedule: WEEKLY_MONDAY,
    retryAttempts: 1,
    timeout: "30s",
    requiredFields: ["tools.steps.0.args.url"],
  },
  {
    id: "standup-bot",
    name: "Standup Bot",
    description: "Collect standup updates via Slack every morning",
    category: "agent-workflows",
    handler: {
      type: "tools",
      steps: [
        {
          tool: "slack.post",
          args: {
            channel: "#engineering",
            text: "Daily standup thread is open. Reply with blockers and wins.",
            secretName: "SLACK_TOKEN",
          },
        },
      ],
    },
    schedule: {
      type: "weekly",
      days: ["mon", "tue", "wed", "thu", "fri"],
      time: "09:00",
    },
    retryAttempts: 1,
    timeout: "30s",
    requiredFields: ["tools.steps.0.args.channel", "tools.steps.0.args.secretName"],
  },
  {
    id: "expiring-trial-nudge",
    name: "Expiring Trial Nudge",
    description: "Email users before trial ends, stop after conversion",
    category: "agent-workflows",
    handler: {
      type: "tools",
      steps: [
        {
          tool: "http.get",
          args: {
            url: "https://your-app.example.com/api/trials/expiring",
            headers: {
              Authorization: "Bearer YOUR_APP_TOKEN",
            },
          },
          outputKey: "trials",
        },
        {
          tool: "http.post",
          args: {
            url: "https://your-app.example.com/api/trials/send-nudges",
            body: {
              users: "{{trials.body}}",
            },
            headers: {
              Authorization: "Bearer YOUR_APP_TOKEN",
            },
          },
        },
      ],
    },
    schedule: DAILY_MORNING,
    retryAttempts: 2,
    timeout: "1m",
    requiredFields: [
      "tools.steps.0.args.url",
      "tools.steps.0.args.headers.Authorization",
      "tools.steps.1.args.url",
      "tools.steps.1.args.headers.Authorization",
    ],
  },
];

export const AGENT_SDK_TEMPLATES: AgentSdkTemplate[] = [
  {
    id: "user-report-scheduler",
    name: "User Report Scheduler",
    description: "Let your agent schedule recurring reports for users",
    prompt: buildAgentSdkPrompt({
      objective:
        "Enable the product's AI agent to create recurring report schedules for users, deliver generated reports back into the product, and let the app manage the full schedule lifecycle.",
      domainModel: [
        "A user-configured report definition with fields like reportId, userId, orgId/accountId, report type, filters, destination, timezone, and schedule preference.",
        "A persisted linkage between the product's report schedule record and the Cronlet task ID.",
        "Run history or last delivery state so the UI can show when the report last ran and whether it succeeded.",
      ],
      implementationTasks: [
        "Add a server-side Cronlet client/service module with methods to create, patch, pause/resume, and delete report scheduler tasks.",
        "Create the agent-facing function or internal API endpoint the product's AI agent will call to schedule a report. It should accept user/account context, report definition, human-readable schedule input, timezone, and delivery target.",
        "When creating the Cronlet task, use metadata containing at least userId, orgId/accountId, reportId, scheduleType=`user-report`, and any stable delivery identifiers needed by the callback handler.",
        "Use a callback URL that points back to the product so completed runs can be persisted and surfaced in the app.",
        "Implement schedule update support so the agent can change timing, pause a report, resume it, or cancel it entirely without creating duplicates.",
        "Add product-side persistence so the app can query the current Cronlet task status and show the user whether the schedule is active, paused, or failed recently.",
        "If the product already has report generation code, call into that existing logic from the callback or downstream processing path rather than re-implementing reporting from scratch.",
      ],
      callbackHandling: [
        "Handle `task.run.completed` events by looking up the schedule via `task.id` and verifying metadata matches the expected report/user/account records.",
        "On success, persist the run output reference, update `lastRunAt`, `lastStatus`, and attach any generated artifact or result summary to the user's report history.",
        "On failure or timeout, persist the error state so the UI and support tooling can see what happened.",
        "Make callback processing idempotent by storing the incoming `run.id` and ignoring duplicates.",
      ],
      acceptanceCriteria: [
        "The AI agent can create a recurring report schedule for a user through one product-facing function or endpoint.",
        "The product stores and can later reuse the Cronlet task ID.",
        "A completed Cronlet run updates the correct user/report record through the callback handler.",
        "The schedule can be paused, resumed, updated, and deleted from the product without manual dashboard intervention.",
        "Tests cover task creation mapping, metadata correctness, callback processing, and lifecycle changes.",
      ],
    }),
  },
  {
    id: "smart-follow-up",
    name: "Smart Follow-Up",
    description: "Agent schedules a follow-up based on user activity, stops after conversion",
    prompt: buildAgentSdkPrompt({
      objective:
        "Implement a smart follow-up system where the product's AI agent schedules repeated follow-up actions for a user or lead, stops automatically after conversion, and keeps the follow-up state synchronized with Cronlet.",
      domainModel: [
        "A follow-up target entity such as a lead, trial user, or account contact with userId/orgId, campaign or workflow ID, follow-up channel, and conversion status.",
        "A follow-up schedule record that stores the Cronlet task ID, cadence, active/paused state, next intended action, and stop conditions.",
        "A run/result record that captures the last follow-up attempt, outcome, and whether the workflow should continue.",
      ],
      implementationTasks: [
        "Add a server-side Cronlet service specifically for follow-up workflows, reusing a shared Cronlet client wrapper.",
        "Create an agent-facing function or endpoint that lets the product's AI agent start a follow-up schedule with inputs like target entity ID, cadence, timezone, follow-up copy context, and stop conditions.",
        "When creating the Cronlet task, use metadata containing userId, orgId/accountId, target entity ID, campaign/workflow ID, scheduleType=`smart-follow-up`, and any internal IDs needed by downstream handlers.",
        "Use `maxRuns` and/or `expiresAt` when appropriate so obviously bounded follow-up sequences stop even if the product-side stop signal is missed.",
        "Implement a product-side method to stop the Cronlet task automatically when conversion happens, and also allow manual pause/resume/cancel from the app.",
        "If the product has existing activity or conversion webhooks/events, hook them into the schedule lifecycle so the Cronlet task is patched or deleted immediately on conversion.",
      ],
      callbackHandling: [
        "On each `task.run.completed` callback, resolve the target follow-up record by Cronlet task ID and metadata.",
        "If the run succeeded, persist the follow-up attempt result and update the next-action state.",
        "Before scheduling any future action or leaving the task active, check whether the target already converted; if converted, stop the Cronlet task and mark the workflow complete.",
        "If a run fails, persist the failure state and decide whether to leave retries to Cronlet or mark the workflow for human review.",
      ],
      acceptanceCriteria: [
        "The AI agent can start a recurring follow-up schedule for a user/lead from inside the product.",
        "The product automatically stops the schedule after conversion.",
        "The Cronlet task can be paused, resumed, updated, or deleted from the product.",
        "The callback handler updates follow-up state safely and idempotently.",
        "Tests cover schedule creation, automatic stop-on-conversion behavior, and callback reconciliation.",
      ],
    }),
  },
  {
    id: "adaptive-monitoring",
    name: "Adaptive Monitoring",
    description: "Agent creates a health check, increases frequency when issues detected",
    prompt: buildAgentSdkPrompt({
      objective:
        "Enable the product's AI agent to create adaptive health-check schedules for user-owned resources, automatically increase schedule frequency during incidents, and relax frequency again after recovery.",
      domainModel: [
        "A monitored resource record such as endpointId/serviceId with owner userId/orgId, target URL, baseline cadence, degraded cadence, recovery rules, and alert settings.",
        "A persisted monitoring schedule record containing the Cronlet task ID, current cadence mode, current health state, and recent run summary.",
        "Optional incident/escalation state tied to repeated failures or recoveries.",
      ],
      implementationTasks: [
        "Add a Cronlet-backed monitoring service on the server that can create, patch, pause/resume, and delete monitoring tasks.",
        "Create an agent-facing function or endpoint to let the AI agent start monitoring a user-owned endpoint with a baseline cadence and a degraded cadence.",
        "Model the Cronlet task metadata with at least userId, orgId/accountId, monitored resource ID, scheduleType=`adaptive-monitoring`, baseline cadence, degraded cadence, and current mode if helpful.",
        "Use the callback flow to inspect run outcomes and patch the Cronlet schedule when health changes. For example: normal cadence -> degraded cadence on failure, degraded cadence -> normal cadence after a recovery threshold.",
        "Persist enough state to avoid oscillation. For example, track consecutive failures and consecutive successes before changing cadence.",
        "Surface the monitoring state in the product so the app can show last check time, current cadence, last result, and whether the monitor is actively escalated.",
      ],
      callbackHandling: [
        "On callback, update the latest health status for the monitored resource and store run outcome details keyed by `run.id`.",
        "When a failure or timeout arrives, update counters and, if the failure threshold is crossed, patch the Cronlet task to a faster schedule and mark the resource as degraded.",
        "When enough successful runs arrive after degradation, patch the Cronlet task back to the baseline schedule and mark the resource recovered.",
        "Make sure schedule patching is idempotent so repeated callbacks do not thrash the schedule.",
      ],
      acceptanceCriteria: [
        "The AI agent can create an adaptive monitor for a user-owned resource.",
        "The product persists the Cronlet task ID and current monitoring mode.",
        "Failed runs can trigger a schedule increase, and recovered runs can restore the baseline cadence.",
        "The callback flow is safe against duplicate delivery.",
        "Tests cover creation, degradation, recovery, and schedule patch behavior.",
      ],
    }),
  },
  {
    id: "scheduled-data-export",
    name: "Scheduled Data Export",
    description: "Agent sets up recurring CSV exports on behalf of users",
    prompt: buildAgentSdkPrompt({
      objective:
        "Implement recurring scheduled data exports so the product's AI agent can create, manage, and stop export schedules for users, with results delivered back into the product.",
      domainModel: [
        "An export definition with exportId, userId, orgId/accountId, dataset type, filters, output format, destination, and timezone.",
        "A persisted export schedule record with the Cronlet task ID, current schedule config, active/paused state, and last export status.",
        "A run/result record that stores exported artifact references, failure reasons, and delivery timestamps.",
      ],
      implementationTasks: [
        "Add a server-side Cronlet export scheduling service that wraps task create/patch/delete operations.",
        "Create an agent-facing function or endpoint that lets the AI agent schedule recurring exports with inputs for dataset, cadence, timezone, destination, and stop conditions.",
        "Store Cronlet metadata containing userId, orgId/accountId, exportId, dataset key, scheduleType=`scheduled-data-export`, and destination identifiers.",
        "Set the callback URL so the product can record the completion of each export run and attach any generated artifact metadata back to the export record.",
        "Support pause/resume/update/delete operations from the product UI or agent layer.",
        "If exports should stop when a user disables a feature or disconnects a destination, hook that product event into deleting or deactivating the Cronlet task immediately.",
      ],
      callbackHandling: [
        "Resolve the export schedule by Cronlet task ID and metadata on callback.",
        "Persist `run.id`, `run.status`, `run.durationMs`, and a useful summary of `run.output` for support/debugging.",
        "On success, update the export record with the latest exported artifact reference or delivery status.",
        "On failure, preserve enough detail for retry diagnosis and surface the failure in the product.",
      ],
      acceptanceCriteria: [
        "The AI agent can create a recurring export schedule for a user through the product.",
        "The product can later update, pause, resume, or delete that schedule.",
        "The callback handler reconciles completed runs back into the correct export record.",
        "Disabling exports in the product stops the associated Cronlet schedule.",
        "Tests cover task creation, callback reconciliation, and schedule cleanup behavior.",
      ],
    }),
  },
];

const REQUIRED_FIELD_LABELS: Record<string, string> = {
  name: "Task name",
  "webhook.url": "Webhook URL",
  "tools.steps.0.args.url": "Primary endpoint URL",
  "tools.steps.0.args.headers.Authorization": "API token",
  "tools.steps.1.args.url": "Secondary endpoint URL",
  "tools.steps.1.args.headers.Authorization": "Secondary API token",
  "tools.steps.0.args.channel": "Slack channel",
  "tools.steps.1.args.channel": "Slack channel",
  "tools.steps.2.args.channel": "Slack channel",
  "tools.steps.0.args.secretName": "Secret name",
  "tools.steps.1.args.secretName": "Secret name",
  "tools.steps.2.args.secretName": "Secret name",
  "tools.steps.0.args.to": "Recipient email",
  "tools.steps.1.args.to": "Recipient email",
  "tools.steps.2.args.to": "Recipient email",
  "tools.steps.0.args.from": "Sender email",
  "tools.steps.1.args.from": "Sender email",
  "tools.steps.2.args.from": "Sender email",
};

export function createFormValuesFromTemplate(template: TaskTemplate): TaskFormValues {
  const defaults = createDefaultTaskFormValues();

  return {
    ...defaults,
    name: template.name,
    description: template.description,
    handlerType: template.handler.type,
    toolsConfig: template.handler.type === "tools"
      ? { type: "tools", steps: template.handler.steps ?? defaults.toolsConfig.steps }
      : defaults.toolsConfig,
    webhookConfig: template.handler.type === "webhook"
      ? {
          type: "webhook",
          url: template.handler.url ?? "",
          method: template.handler.method ?? "POST",
          headers: template.handler.headers,
          body: template.handler.body,
        }
      : defaults.webhookConfig,
    schedule: template.schedule,
    retryAttempts: template.retryAttempts ?? defaults.retryAttempts,
    timeout: template.timeout ?? defaults.timeout,
  };
}

export function getTemplateRequiredFieldLabels(template: TaskTemplate): string[] {
  return template.requiredFields.map((field) => REQUIRED_FIELD_LABELS[field] ?? field);
}

export function getTemplatesByCategory(category: TaskTemplate["category"]): TaskTemplate[] {
  return TASK_TEMPLATES.filter((template) => template.category === category);
}
