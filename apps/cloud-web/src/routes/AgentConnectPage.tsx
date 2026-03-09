import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Highlight, themes } from "prism-react-renderer";
import {
  Copy,
  Check,
  Terminal,
  Code,
  ArrowsClockwise,
  Key,
  ArrowRight,
  ArrowSquareOut,
  Lightning,
} from "@phosphor-icons/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check size={14} weight="bold" className="text-emerald-400" />
      ) : (
        <Copy size={14} />
      )}
    </button>
  );
}

function CodeBlock({
  code,
  language = "typescript",
}: {
  code: string;
  language?: string;
}) {
  return (
    <div className="group relative">
      <Highlight
        theme={themes.nightOwl}
        code={code.trim()}
        language={language as "typescript" | "json" | "bash"}
      >
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className="overflow-x-auto rounded-xl border border-border/50 p-4 font-mono text-sm leading-relaxed"
            style={{ ...style, background: "#011627" }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
      <CopyButton
        text={code}
        className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100"
      />
    </div>
  );
}

type SdkTab = "openai" | "anthropic" | "langchain";

const sdkExamples: Record<SdkTab, { label: string; code: string }> = {
  openai: {
    label: "OpenAI",
    code: `import OpenAI from "openai";
import { CloudClient, cronletTools, createToolHandler } from "@cronlet/sdk";

const openai = new OpenAI();
const cronlet = new CloudClient({ apiKey: process.env.CRONLET_API_KEY });
const handler = createToolHandler(cronlet);

const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Create a task that pings my API every hour" }],
  tools: cronletTools.openai,
});

// Execute any tool calls
for (const toolCall of response.choices[0].message.tool_calls ?? []) {
  const result = await handler.handleOpenAI(toolCall);
  console.log(result);
}`,
  },
  anthropic: {
    label: "Anthropic",
    code: `import Anthropic from "@anthropic-ai/sdk";
import { CloudClient, cronletTools, createToolHandler } from "@cronlet/sdk";

const anthropic = new Anthropic();
const cronlet = new CloudClient({ apiKey: process.env.CRONLET_API_KEY });
const handler = createToolHandler(cronlet);

const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Create a daily backup task at 2am" }],
  tools: cronletTools.anthropic,
});

// Execute any tool uses
for (const block of response.content) {
  if (block.type === "tool_use") {
    const result = await handler.handleAnthropic(block);
    console.log(result);
  }
}`,
  },
  langchain: {
    label: "LangChain",
    code: `import { ChatOpenAI } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { CloudClient, cronletTools, createToolHandler } from "@cronlet/sdk";

const cronlet = new CloudClient({ apiKey: process.env.CRONLET_API_KEY });
const handler = createToolHandler(cronlet);

const tools = cronletTools.langchain.map(
  (t) =>
    new DynamicStructuredTool({
      name: t.name,
      description: t.description,
      schema: t.schema,
      func: (args) => handler.execute(t.name, args).then((r) => JSON.stringify(r)),
    })
);

const llm = new ChatOpenAI({ model: "gpt-4o" }).bindTools(tools);
const result = await llm.invoke("Schedule a weekly report every Monday at 9am");`,
  },
};

const callbackPayloadExample = `{
  "event": "task.run.completed",
  "task": {
    "id": "task_abc123",
    "name": "Daily health check",
    "metadata": { "agentId": "my-agent", "purpose": "monitoring" }
  },
  "run": {
    "id": "run_xyz789",
    "status": "success",
    "output": { "statusCode": 200, "body": "OK" },
    "durationMs": 234,
    "createdAt": "2024-01-15T09:00:00Z"
  },
  "stats": {
    "totalRuns": 42,
    "remainingRuns": null,
    "expiresAt": null
  }
}`;

const claudeDesktopConfig = `{
  "mcpServers": {
    "cronlet": {
      "command": "npx",
      "args": ["-y", "@cronlet/mcp"],
      "env": {
        "CRONLET_API_KEY": "your-api-key"
      }
    }
  }
}`;

export function AgentConnectPage() {
  const [sdkTab, setSdkTab] = useState<SdkTab>("openai");

  useEffect(() => {
    if (window.location.hash !== "#sdk") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document.getElementById("sdk")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Agent Connect
            </h1>
            <p className="text-muted-foreground">
              Connect AI agents to schedule and manage tasks
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a
              href="https://docs.cronlet.dev"
              target="_blank"
              rel="noreferrer"
            >
              View Docs
              <ArrowSquareOut size={14} className="ml-2" />
            </a>
          </Button>
        </div>
      </div>

      {/* Quick start banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <Lightning size={28} weight="duotone" className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-foreground">Quick Start</p>
            <p className="text-sm text-muted-foreground">
              Using Claude? Run the MCP server and start scheduling tasks with natural language.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/50 px-4 py-3 font-mono text-sm">
            <code>npx @cronlet/mcp</code>
            <CopyButton text="npx @cronlet/mcp" />
          </div>
        </CardContent>
      </Card>

      {/* MCP Server */}
      <section id="sdk" className="space-y-4 scroll-mt-24">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Terminal size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">MCP Server</h2>
            <p className="text-sm text-muted-foreground">
              For Claude Desktop and other MCP-compatible clients
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-6 p-6">
            <div className="space-y-3">
              <p className="text-sm font-medium">1. Get an API key</p>
              <p className="text-sm text-muted-foreground">
                Create an API key in Settings to authenticate the MCP server.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to="/settings">
                  <Key size={14} className="mr-2" />
                  Manage API Keys
                  <ArrowRight size={12} className="ml-2" />
                </Link>
              </Button>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">2. Configure Claude Desktop</p>
              <p className="text-sm text-muted-foreground">
                Add this to your Claude Desktop config (
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  ~/Library/Application Support/Claude/claude_desktop_config.json
                </code>
                ):
              </p>
              <CodeBlock code={claudeDesktopConfig} language="json" />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">3. Start chatting</p>
              <p className="text-sm text-muted-foreground">
                Restart Claude Desktop and ask it to schedule tasks:
              </p>
              <div className="rounded-xl border border-border/50 bg-muted/30 p-4 text-sm italic text-muted-foreground">
                "Create a task that checks my API health every 5 minutes and notifies me if it's down"
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* SDK Integration */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--accent)/0.15)]">
            <Code size={20} className="text-[hsl(var(--accent))]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">SDK Integration</h2>
            <p className="text-sm text-muted-foreground">
              Add Cronlet tools to any AI framework
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center gap-4">
              <p className="text-sm font-medium">Install the SDK:</p>
              <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 font-mono text-sm">
                <code>npm install @cronlet/sdk</code>
                <CopyButton text="npm install @cronlet/sdk" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            {/* Framework tabs */}
            <div className="flex gap-1 rounded-lg border border-border/50 bg-muted/30 p-1">
              {(Object.keys(sdkExamples) as SdkTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSdkTab(tab)}
                  className={cn(
                    "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                    sdkTab === tab
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {sdkExamples[tab].label}
                </button>
              ))}
            </div>

            <CodeBlock code={sdkExamples[sdkTab].code} language="typescript" />

            <p className="text-xs text-muted-foreground">
              The SDK provides pre-formatted tool definitions and a handler to execute tool calls from any LLM response.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Callbacks */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
            <ArrowsClockwise size={20} className="text-emerald-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Callbacks & Feedback Loops</h2>
            <p className="text-sm text-muted-foreground">
              Receive task results for autonomous agent workflows
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-6 p-6">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                When creating a task, provide a <code className="rounded bg-muted px-1.5 py-0.5 text-xs">callbackUrl</code> to receive results when the task completes.
                This enables agents to create monitoring tasks that report back automatically.
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Callback payload</p>
              <p className="text-sm text-muted-foreground">
                We POST this JSON to your callback URL after each run:
              </p>
              <CodeBlock code={callbackPayloadExample} language="json" />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Event types</p>
              <div className="grid gap-2">
                <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-muted/20 px-4 py-2.5 text-sm">
                  <code className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">task.run.completed</code>
                  <span className="text-muted-foreground">Task ran successfully</span>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-muted/20 px-4 py-2.5 text-sm">
                  <code className="rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-400">task.run.failed</code>
                  <span className="text-muted-foreground">Task failed after all retries</span>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-muted/20 px-4 py-2.5 text-sm">
                  <code className="rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">task.expired</code>
                  <span className="text-muted-foreground">Task hit maxRuns or expiresAt limit</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm">
                <span className="font-medium text-primary">Pro tip:</span>{" "}
                <span className="text-muted-foreground">
                  Store agent context in the task's <code className="rounded bg-muted px-1 text-xs">metadata</code> field.
                  It's returned in every callback, letting your agent remember why it created the task.
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Available tools reference */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Available Tools</h2>
        <Card variant="flat">
          <CardContent className="p-0">
            <div className="divide-y divide-border/30">
              {[
                { name: "cronlet_list_tasks", desc: "List all scheduled tasks" },
                { name: "cronlet_create_task", desc: "Create a new scheduled task" },
                { name: "cronlet_get_task", desc: "Get details of a specific task" },
                { name: "cronlet_trigger_task", desc: "Trigger a task to run immediately" },
                { name: "cronlet_pause_task", desc: "Pause a scheduled task" },
                { name: "cronlet_resume_task", desc: "Resume a paused task" },
                { name: "cronlet_delete_task", desc: "Delete a task permanently" },
                { name: "cronlet_list_runs", desc: "List recent task runs" },
                { name: "cronlet_get_run", desc: "Get details of a specific run" },
              ].map((tool) => (
                <div key={tool.name} className="flex items-center gap-4 px-5 py-3">
                  <code className="shrink-0 rounded bg-muted/50 px-2 py-1 font-mono text-xs">
                    {tool.name}
                  </code>
                  <span className="text-sm text-muted-foreground">{tool.desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
