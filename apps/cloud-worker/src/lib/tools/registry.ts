import type { Tool, ToolContext, ToolResult } from "./types.js";
import { httpGet, httpPost } from "./http.js";
import { log, sleep } from "./util.js";
import { slackPost } from "./slack.js";
import { emailSend } from "./email.js";

/**
 * Registry of all available tools
 */
const tools: Map<string, Tool> = new Map();

// Register built-in tools
function register(tool: Tool): void {
  tools.set(tool.name, tool);
}

// HTTP tools
register(httpGet);
register(httpPost);

// Utility tools
register(log);
register(sleep);

// Integration tools (require secrets)
register(slackPost);
register(emailSend);

/**
 * Get a tool by name
 */
export function getTool(name: string): Tool | undefined {
  return tools.get(name);
}

/**
 * List all available tool names
 */
export function listTools(): string[] {
  return Array.from(tools.keys());
}

/**
 * Execute a tool by name
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const tool = tools.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return tool.execute(args, ctx);
}

// Re-export types
export type { Tool, ToolContext, ToolResult } from "./types.js";
