export type McpToolName =
  | "list_tasks"
  | "create_task"
  | "trigger_task"
  | "pause_task"
  | "resume_task"
  | "delete_task"
  | "list_runs"
  | "get_run"
  | "parse_schedule"
  | "get_failure_summary";

export interface McpToolDefinition {
  name: McpToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  mutating: boolean;
  critical: boolean;
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: "list_tasks",
    description: "List scheduled tasks. Optionally filter to show only tasks created by this agent.",
    inputSchema: {
      type: "object",
      properties: {
        mine: {
          type: "boolean",
          description: "Only show tasks created by this agent",
        },
      },
    },
    mutating: false,
    critical: false,
  },
  {
    name: "create_task",
    description: "Create a new scheduled task. Requires approval. Supports callbacks for autonomous agent loops.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Task name",
        },
        description: {
          type: "string",
          description: "What the task does",
        },
        handler: {
          type: "object",
          description: "Handler config: { type: 'tools', steps: [...] } or { type: 'webhook', url: '...' }",
        },
        schedule: {
          type: ["object", "string"],
          description: "Schedule config object or natural language like 'every 15 minutes' or 'daily at 9am'",
        },
        timezone: {
          type: "string",
          description: "Timezone (default: UTC)",
        },
        callbackUrl: {
          type: "string",
          description: "URL to POST results when task runs. Enables autonomous agent feedback loops.",
        },
        metadata: {
          type: "object",
          description: "Agent context stored with task and returned in callbacks. Use for intent, conversation IDs, etc.",
        },
        maxRuns: {
          type: "number",
          description: "Auto-pause task after this many runs. Use for ephemeral monitoring tasks.",
        },
        expiresAt: {
          type: "string",
          description: "ISO datetime. Auto-pause task after this time.",
        },
      },
      required: ["name", "handler", "schedule"],
    },
    mutating: true,
    critical: true,
  },
  {
    name: "trigger_task",
    description: "Trigger a task to run immediately.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Task ID to trigger",
        },
      },
      required: ["taskId"],
    },
    mutating: true,
    critical: false,
  },
  {
    name: "pause_task",
    description: "Pause a scheduled task. Requires approval.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Task ID to pause",
        },
      },
      required: ["taskId"],
    },
    mutating: true,
    critical: true,
  },
  {
    name: "resume_task",
    description: "Resume a paused task.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Task ID to resume",
        },
      },
      required: ["taskId"],
    },
    mutating: true,
    critical: false,
  },
  {
    name: "delete_task",
    description: "Delete a scheduled task. Requires approval.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Task ID to delete",
        },
      },
      required: ["taskId"],
    },
    mutating: true,
    critical: true,
  },
  {
    name: "list_runs",
    description: "List recent task runs with status and timing.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Filter runs by task ID",
        },
        limit: {
          type: "number",
          description: "Max runs to return (default: 20)",
        },
      },
    },
    mutating: false,
    critical: false,
  },
  {
    name: "get_run",
    description: "Get details of a specific run including output and logs.",
    inputSchema: {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description: "Run ID",
        },
      },
      required: ["runId"],
    },
    mutating: false,
    critical: false,
  },
  {
    name: "parse_schedule",
    description: "Parse natural language into a schedule config. Use this to validate schedule input before creating tasks.",
    inputSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Natural language schedule like 'every 15 minutes', 'daily at 9am', 'weekdays at 5pm'",
        },
      },
      required: ["description"],
    },
    mutating: false,
    critical: false,
  },
  {
    name: "get_failure_summary",
    description: "Summarize recent failure patterns from run history.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Filter by task ID",
        },
      },
    },
    mutating: false,
    critical: false,
  },
];
