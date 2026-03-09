# @cronlet/sdk

Official SDK for [Cronlet Cloud](https://cronlet.dev) - scheduled tasks for AI agents and automation.

## Installation

```bash
npm install @cronlet/sdk
```

## Quick Start

```typescript
import { CloudClient } from "@cronlet/sdk";

const cronlet = new CloudClient({
  apiKey: process.env.CRONLET_API_KEY!,
});

// Create a scheduled task
const task = await cronlet.tasks.create({
  name: "Daily Report",
  handler: {
    type: "webhook",
    url: "https://api.example.com/report",
    method: "POST",
  },
  schedule: "daily at 9am",
  timezone: "America/New_York",
});

// List all tasks
const tasks = await cronlet.tasks.list();

// Trigger a task manually
await cronlet.tasks.trigger(task.id);

// Pause/resume
await cronlet.tasks.pause(task.id);
await cronlet.tasks.resume(task.id);

// View run history
const runs = await cronlet.runs.list(task.id);
```

## AI Agent Integration

The SDK includes pre-formatted tool definitions for OpenAI, Anthropic, and LangChain.

### OpenAI

```typescript
import OpenAI from "openai";
import { CloudClient, cronletTools, createToolHandler } from "@cronlet/sdk";

const openai = new OpenAI();
const cronlet = new CloudClient({ apiKey: process.env.CRONLET_API_KEY! });
const handler = createToolHandler(cronlet);

const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Schedule a daily report at 9am" }],
  tools: cronletTools.openai,
});

// Handle tool calls
for (const toolCall of response.choices[0].message.tool_calls ?? []) {
  const result = await handler.handleOpenAI(toolCall);
  console.log(result);
}
```

### Anthropic

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { CloudClient, cronletTools, createToolHandler } from "@cronlet/sdk";

const anthropic = new Anthropic();
const cronlet = new CloudClient({ apiKey: process.env.CRONLET_API_KEY! });
const handler = createToolHandler(cronlet);

const response = await anthropic.messages.create({
  model: "claude-3-opus-20240229",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Schedule a weekly digest every Monday" }],
  tools: cronletTools.anthropic,
});

// Handle tool use
for (const block of response.content) {
  if (block.type === 'tool_use') {
    const result = await handler.handleAnthropic(block);
    console.log(result);
  }
}
```

### LangChain

```typescript
import { DynamicStructuredTool } from "@langchain/core/tools";
import { CloudClient, langchainTools, createToolHandler } from "@cronlet/sdk";

const cronlet = new CloudClient({ apiKey: process.env.CRONLET_API_KEY! });
const handler = createToolHandler(cronlet);

const tools = langchainTools.map(
  (tool) =>
    new DynamicStructuredTool({
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
      func: async (args) => {
        const result = await handler.execute(tool.name, args);
        return JSON.stringify(result);
      },
    })
);
```

## API Reference

### Tasks

```typescript
// Create a task
cronlet.tasks.create(input)

// List all tasks
cronlet.tasks.list()

// Get a task by ID
cronlet.tasks.get(taskId)

// Update a task
cronlet.tasks.patch(taskId, updates)

// Delete a task
cronlet.tasks.delete(taskId)

// Trigger immediate execution
cronlet.tasks.trigger(taskId)

// Pause scheduled runs
cronlet.tasks.pause(taskId)

// Resume a paused task
cronlet.tasks.resume(taskId)
```

### Runs

```typescript
// List runs (optionally filter by task)
cronlet.runs.list(taskId?, limit?)

// Get a specific run
cronlet.runs.get(runId)
```

### Secrets

```typescript
// List secrets (values masked)
cronlet.secrets.list()

// Create a secret
cronlet.secrets.create({ name: "SLACK_TOKEN", value: "xoxb-..." })

// Delete a secret
cronlet.secrets.delete(name)
```

### Usage

```typescript
// Get current usage
cronlet.usage.get()
```

## Supported String Schedule Grammar

The SDK accepts schedule strings using a constrained grammar:

```typescript
"every 15 minutes"
"daily at 9am"
"weekdays at 5pm"
"every friday at 9am"
"monthly on the 1st at 9am"
"monthly on the last friday at 9am"
"once at 2026-03-15 09:00"
```

Rules:

- unsupported phrasing throws `ScheduleParseError`
- naive `once` datetimes are interpreted as UTC
- timezone-aware `once` datetimes are preserved and normalized to ISO
- object schedules remain supported

## Error Handling

```typescript
import { CronletError, ScheduleParseError } from "@cronlet/sdk";

try {
  await cronlet.tasks.get("nonexistent");
} catch (error) {
  if (error instanceof CronletError) {
    console.log(error.message); // "Task not found"
    console.log(error.code);    // "NOT_FOUND"
    console.log(error.status);  // 404
  }
  if (error instanceof ScheduleParseError) {
    console.log(error.message);
    console.log(error.examples);
  }
}
```

## License

MIT
