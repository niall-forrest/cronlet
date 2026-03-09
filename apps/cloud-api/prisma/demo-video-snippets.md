# Cronlet Demo Video Snippets

These snippets are written for local demo recording against `http://127.0.0.1:4050`.

Seeded org:

```txt
org_demo
```

Seeded demo API keys:

```txt
SDK:      ck_demo_sdk_video_key_1234567890abcdefghijklmnopqrstuv
MCP:      ck_demo_mcp_video_key_1234567890abcdefghijklmnopqrstuv
Readonly: ck_demo_readonly_key_1234567890abcdefghijklmnopqrstuvw
```

## SDK: create a task programmatically

```ts
import { CloudClient } from "@cronlet/sdk";

const cronlet = new CloudClient({
  apiKey: "ck_demo_sdk_video_key_1234567890abcdefghijklmnopqrstuv",
  baseUrl: "http://127.0.0.1:4050",
  orgId: "org_demo",
  userId: "user_demo_owner",
  role: "owner",
});

const task = await cronlet.tasks.create({
  name: "Product Hunt Launch Pulse",
  description: "Check launch metrics every 15 minutes and callback with a summary.",
  handler: {
    type: "webhook",
    url: "https://demo.cronlet.dev/hooks/product-hunt-pulse",
    method: "POST",
  },
  schedule: "every 15 minutes",
  timezone: "UTC",
  callbackUrl: "https://demo.cronlet.dev/callbacks/product-hunt-pulse",
  metadata: {
    launch: "product-hunt-2026",
    owner: "growth",
    purpose: "launch-monitoring",
  },
});

console.log(task.id, task.source);
```

## SDK: summarize all tasks for an agent

```ts
import { CloudClient } from "@cronlet/sdk";

const cronlet = new CloudClient({
  apiKey: "ck_demo_sdk_video_key_1234567890abcdefghijklmnopqrstuv",
  baseUrl: "http://127.0.0.1:4050",
  orgId: "org_demo",
  userId: "user_demo_owner",
  role: "owner",
});

const overview = await cronlet.tasks.summarizeAll({
  windowHours: 24,
  limit: 50,
});

console.log(overview.summaryText);
console.table(
  overview.items.map((item) => ({
    task: item.taskName,
    status: item.status,
    successRate: item.successRate,
    failures: item.consecutiveFailures,
  })),
);
```

## SDK: callback handler for agent loops

```ts
import Fastify from "fastify";

const app = Fastify();

app.post("/cronlet/callbacks", async (request, reply) => {
  const payload = request.body as {
    event: string;
    task: { id: string; name: string; metadata: Record<string, unknown> | null };
    run?: { id: string; status: string; durationMs: number | null; errorMessage?: string | null };
  };

  if (payload.event === "task.run.failed") {
    console.log("Escalate failure", payload.task.name, payload.run?.errorMessage);
  }

  if (payload.event === "task.run.completed") {
    console.log("Agent received result", payload.task.metadata);
  }

  reply.send({ ok: true });
});

await app.listen({ port: 3001 });
```

## MCP: Claude Desktop config

```json
{
  "mcpServers": {
    "cronlet": {
      "command": "npx",
      "args": ["-y", "@cronlet/mcp"],
      "env": {
        "CRONLET_API_KEY": "ck_demo_mcp_video_key_1234567890abcdefghijklmnopqrstuv",
        "CLOUD_API_BASE_URL": "http://127.0.0.1:4050"
      }
    }
  }
}
```

## MCP: prompts to show on screen

```txt
Create a task that checks https://demo.cronlet.dev/health every 5 minutes and reports back if it fails.
```

```txt
Create a weekly digest task for every Monday at 9am that posts to Slack and store the context in metadata.
```

```txt
Summarize all my Cronlet tasks and tell me which ones need attention.
```

## Curl: show the API directly

```bash
curl -X POST http://127.0.0.1:4050/v1/tasks \
  -H "Authorization: Bearer ck_demo_sdk_video_key_1234567890abcdefghijklmnopqrstuv" \
  -H "x-cronlet-org-id: org_demo" \
  -H "x-cronlet-user-id: user_demo_owner" \
  -H "x-cronlet-role: owner" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SDK-created Product Hunt monitor",
    "handler": {
      "type": "webhook",
      "url": "https://demo.cronlet.dev/hooks/sdk-monitor",
      "method": "POST"
    },
    "schedule": {
      "type": "every",
      "interval": "15m"
    },
    "timezone": "UTC",
    "source": "sdk"
  }'
```
