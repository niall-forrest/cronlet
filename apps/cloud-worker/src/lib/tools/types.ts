/**
 * Tool execution context provided to all tools
 */
export interface ToolContext {
  orgId: string;
  signal: AbortSignal;
  getSecret: (name: string) => Promise<string>;
}

/**
 * Result returned by tool execution
 */
export type ToolResult = unknown;

/**
 * Tool definition interface
 */
export interface Tool {
  /** Unique tool identifier (e.g., "http.get", "slack.post") */
  name: string;

  /** Human-readable description */
  description: string;

  /** Execute the tool with given args and context */
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}
