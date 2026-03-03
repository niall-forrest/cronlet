export type McpToolName =
  | "list_projects"
  | "list_jobs"
  | "list_runs"
  | "trigger_job"
  | "pause_schedule"
  | "update_schedule"
  | "get_failure_summary";

export interface McpToolDefinition {
  name: McpToolName;
  description: string;
  mutating: boolean;
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: "list_projects",
    description: "List projects visible to the current scope.",
    mutating: false,
  },
  {
    name: "list_jobs",
    description: "List jobs in the selected organization/project scope.",
    mutating: false,
  },
  {
    name: "list_runs",
    description: "List recent runs with status and error details.",
    mutating: false,
  },
  {
    name: "trigger_job",
    description: "Trigger a job manually.",
    mutating: true,
  },
  {
    name: "pause_schedule",
    description: "Pause an active schedule.",
    mutating: true,
  },
  {
    name: "update_schedule",
    description: "Update cron/timezone/active flags for a schedule.",
    mutating: true,
  },
  {
    name: "get_failure_summary",
    description: "Summarize recent failure patterns from run history.",
    mutating: false,
  },
];
