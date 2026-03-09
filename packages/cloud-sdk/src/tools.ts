import type { CloudClient } from "./client.js";
import type { HandlerConfigInput } from "@cronlet/shared";
import type { ScheduleInput } from "./client.js";

// =============================================================================
// Tool Definitions - Compatible with OpenAI, Anthropic, and LangChain
// =============================================================================

export interface ToolParameter {
  type: string | string[];
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

/**
 * Core tool definitions for Cronlet scheduling operations.
 * These are framework-agnostic and can be converted to any format.
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "cronlet_list_tasks",
    description: "List all scheduled tasks.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "cronlet_create_task",
    description:
      "Create a new scheduled task. Use this to schedule recurring webhooks, API calls, or automated workflows.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Human-readable name for the task",
        },
        description: {
          type: "string",
          description: "What the task does",
        },
        handler: {
          type: "object",
          description:
            "Handler configuration. Use { type: 'webhook', url: 'https://...', method: 'POST' } for HTTP calls",
        },
        schedule: {
          type: ["object", "string"],
          description:
            "Schedule as object { type: 'daily', times: ['09:00'] } or supported string like 'every 15 minutes', 'daily at 9am', or 'once at 2026-03-15 09:00'",
        },
        timezone: {
          type: "string",
          description: "Timezone for the schedule (default: UTC). Example: 'America/New_York'",
        },
        callbackUrl: {
          type: "string",
          description: "URL to POST results when task completes. Enables feedback loops.",
        },
        metadata: {
          type: "object",
          description: "Custom metadata to store with the task and return in callbacks",
        },
      },
      required: ["name", "handler", "schedule"],
    },
  },
  {
    name: "cronlet_get_task",
    description: "Get details of a specific task by ID.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Task ID to retrieve",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "cronlet_trigger_task",
    description: "Trigger a task to run immediately, outside its normal schedule.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Task ID to trigger",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "cronlet_pause_task",
    description: "Pause a scheduled task. It will not run until resumed.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Task ID to pause",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "cronlet_resume_task",
    description: "Resume a paused task.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Task ID to resume",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "cronlet_delete_task",
    description: "Permanently delete a scheduled task.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Task ID to delete",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "cronlet_list_runs",
    description: "List recent task execution runs with status and timing.",
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Filter runs by task ID",
        },
        limit: {
          type: "string",
          description: "Maximum number of runs to return (default: 20)",
        },
      },
    },
  },
  {
    name: "cronlet_get_run",
    description: "Get details of a specific run including output and logs.",
    parameters: {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description: "Run ID to retrieve",
        },
      },
      required: ["runId"],
    },
  },
];

// =============================================================================
// OpenAI Format
// =============================================================================

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/**
 * Tool definitions in OpenAI function calling format.
 * Use with openai.chat.completions.create({ tools: cronletTools.openai })
 */
export const openaiTools: OpenAITool[] = TOOL_DEFINITIONS.map((tool) => ({
  type: "function" as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
}));

// =============================================================================
// Anthropic Format
// =============================================================================

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Tool definitions in Anthropic tool use format.
 * Use with anthropic.messages.create({ tools: cronletTools.anthropic })
 */
export const anthropicTools: AnthropicTool[] = TOOL_DEFINITIONS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.parameters,
}));

// =============================================================================
// LangChain Format
// =============================================================================

export interface LangChainToolDef {
  name: string;
  description: string;
  schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Tool definitions for LangChain DynamicStructuredTool.
 * Use with: tools.map(t => new DynamicStructuredTool({ ...t, func: handler.execute }))
 */
export const langchainTools: LangChainToolDef[] = TOOL_DEFINITIONS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  schema: tool.parameters,
}));

// =============================================================================
// Tool Handler - Executes tool calls
// =============================================================================

export interface ToolCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export type ToolCallInput = Record<string, unknown>;

/**
 * Creates a handler that executes Cronlet tool calls.
 *
 * @example
 * ```typescript
 * const client = new CloudClient({ baseUrl, apiKey });
 * const handler = createToolHandler(client);
 *
 * // Execute a tool call from OpenAI/Anthropic response
 * const result = await handler.execute("cronlet_create_task", {
 *   name: "Daily Report",
 *   handler: { type: "webhook", url: "https://api.example.com/report" },
 *   schedule: "daily at 9am"
 * });
 * ```
 */
export function createToolHandler(client: CloudClient) {
  const handlers: Record<string, (args: ToolCallInput) => Promise<unknown>> = {
    cronlet_list_tasks: async () => {
      return client.tasks.list();
    },

    cronlet_create_task: async (args) => {
      return client.tasks.create({
        name: args.name as string,
        description: args.description as string | undefined,
        handler: args.handler as HandlerConfigInput,
        schedule: args.schedule as ScheduleInput,
        timezone: (args.timezone as string) ?? "UTC",
        callbackUrl: args.callbackUrl as string | undefined,
        metadata: args.metadata as Record<string, unknown> | undefined,
        // Defaults (these have schema defaults but TypeScript requires them)
        retryAttempts: 1,
        retryBackoff: "linear",
        retryDelay: "1s",
        timeout: "30s",
        active: true,
      });
    },

    cronlet_get_task: async (args) => {
      return client.tasks.get(args.taskId as string);
    },

    cronlet_trigger_task: async (args) => {
      return client.tasks.trigger(args.taskId as string);
    },

    cronlet_pause_task: async (args) => {
      return client.tasks.patch(args.taskId as string, { active: false });
    },

    cronlet_resume_task: async (args) => {
      return client.tasks.patch(args.taskId as string, { active: true });
    },

    cronlet_delete_task: async (args) => {
      return client.tasks.delete(args.taskId as string);
    },

    cronlet_list_runs: async (args) => {
      const limit = args.limit ? parseInt(args.limit as string, 10) : undefined;
      return client.runs.list(args.taskId as string | undefined, limit);
    },

    cronlet_get_run: async (args) => {
      return client.runs.get(args.runId as string);
    },
  };

  return {
    /**
     * Execute a tool call by name with arguments.
     */
    execute: async (name: string, args: ToolCallInput = {}): Promise<ToolCallResult> => {
      const handler = handlers[name];
      if (!handler) {
        return {
          success: false,
          error: `Unknown tool: ${name}`,
        };
      }

      try {
        const data = await handler(args);
        return { success: true, data };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * Handle an OpenAI tool call response.
     */
    handleOpenAI: async (toolCall: {
      function: { name: string; arguments: string };
    }): Promise<ToolCallResult> => {
      const args = JSON.parse(toolCall.function.arguments);
      return handlers[toolCall.function.name]
        ? { success: true, data: await handlers[toolCall.function.name](args) }
        : { success: false, error: `Unknown tool: ${toolCall.function.name}` };
    },

    /**
     * Handle an Anthropic tool use block.
     */
    handleAnthropic: async (toolUse: {
      name: string;
      input: Record<string, unknown>;
    }): Promise<ToolCallResult> => {
      return handlers[toolUse.name]
        ? { success: true, data: await handlers[toolUse.name](toolUse.input) }
        : { success: false, error: `Unknown tool: ${toolUse.name}` };
    },
  };
}

// =============================================================================
// Convenience Export
// =============================================================================

/**
 * Pre-formatted tool definitions for each framework.
 */
export const cronletTools = {
  /** OpenAI function calling format */
  openai: openaiTools,
  /** Anthropic tool use format */
  anthropic: anthropicTools,
  /** LangChain DynamicStructuredTool format */
  langchain: langchainTools,
  /** Raw definitions (framework-agnostic) */
  definitions: TOOL_DEFINITIONS,
};
