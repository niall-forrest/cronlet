import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ScheduleConfig,
  TaskCreateInput,
  ToolsHandlerConfig,
  WebhookHandlerConfig,
} from "@cronlet/cloud-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wrench, Globe, Code, ArrowLeft, ArrowRight, Check, Copy, Terminal, Robot } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { ScheduleBuilder } from "@/components/task/ScheduleBuilder";
import { ToolStepBuilder } from "@/components/task/ToolStepBuilder";
import { WebhookBuilder } from "@/components/task/WebhookBuilder";
import { createTask } from "@/lib/api";

type HandlerType = "tools" | "webhook" | "code";
type Step = "handler" | "schedule" | "details";
type CodeTab = "curl" | "sdk" | "mcp";

const STEPS: Step[] = ["handler", "schedule", "details"];

const RETRY_DELAYS = [
  { value: "1s", label: "1 second" },
  { value: "5s", label: "5 seconds" },
  { value: "30s", label: "30 seconds" },
  { value: "1m", label: "1 minute" },
  { value: "5m", label: "5 minutes" },
];

const TIMEOUTS = [
  { value: "10s", label: "10 seconds" },
  { value: "30s", label: "30 seconds" },
  { value: "1m", label: "1 minute" },
  { value: "5m", label: "5 minutes" },
  { value: "10m", label: "10 minutes" },
];

export function CreateTaskPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      navigate({ to: "/tasks" });
    },
  });

  const [step, setStep] = useState<Step>("handler");
  const [codeTab, setCodeTab] = useState<CodeTab>("mcp");
  const [copied, setCopied] = useState(false);

  // Form state
  const [handlerType, setHandlerType] = useState<HandlerType>("tools");
  const [toolsConfig, setToolsConfig] = useState<ToolsHandlerConfig>({
    type: "tools",
    steps: [{ tool: "http.get", args: { url: "" } }],
  });
  const [webhookConfig, setWebhookConfig] = useState<WebhookHandlerConfig>({
    type: "webhook",
    url: "",
    method: "POST",
  });
  const [schedule, setSchedule] = useState<ScheduleConfig>({
    type: "every",
    interval: "15m",
  });
  const [timezone, setTimezone] = useState("UTC");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [retryAttempts, setRetryAttempts] = useState(1);
  const [retryBackoff, setRetryBackoff] = useState<"linear" | "exponential">("linear");
  const [retryDelay, setRetryDelay] = useState("1s");
  const [taskTimeout, setTaskTimeout] = useState("30s");
  const [callbackUrl, setCallbackUrl] = useState("");

  // Generate natural language schedule description
  const scheduleDescription = useMemo(() => {
    if (schedule.type === "every") {
      const interval = schedule.interval;
      const match = interval.match(/^(\d+)([smhd])$/);
      if (match) {
        const [, num, unit] = match;
        const units: Record<string, string> = { s: "seconds", m: "minutes", h: "hours", d: "days" };
        return `every ${num} ${units[unit]}`;
      }
      return `every ${interval}`;
    }
    if (schedule.type === "daily") {
      return `daily at ${schedule.times.join(", ")}`;
    }
    if (schedule.type === "weekly") {
      return `${schedule.days.join(", ")} at ${schedule.time}`;
    }
    if (schedule.type === "monthly") {
      return `monthly on ${schedule.day} at ${schedule.time}`;
    }
    if (schedule.type === "cron") {
      return schedule.expression;
    }
    return "once";
  }, [schedule]);

  // Generate code snippets for API preview
  const codeSnippets = useMemo(() => {
    const handler = handlerType === "tools" ? toolsConfig : webhookConfig;

    // Full payload for REST/SDK (includes all options)
    const fullPayload: Record<string, unknown> = {
      name: name || "My Task",
      description: description || undefined,
      handler,
      schedule,
      timezone,
      retryAttempts,
      retryBackoff,
      retryDelay,
      timeout: taskTimeout,
      active: true,
    };
    if (callbackUrl) {
      fullPayload.callbackUrl = callbackUrl;
    }
    const payloadJson = JSON.stringify(fullPayload, null, 2);

    const curl = `curl -X POST https://api.cronlet.dev/v1/tasks \\
  -H "Authorization: Bearer $CRONLET_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${payloadJson}'`;

    const sdk = `import { CloudClient } from "@cronlet/cloud-sdk";

const client = new CloudClient({
  baseUrl: "https://api.cronlet.dev",
  apiKey: process.env.CRONLET_API_KEY,
});

const task = await client.tasks.create(${payloadJson});

console.log("Created task:", task.id);`;

    // Simplified MCP payload - essentials only
    const mcpArgs: Record<string, unknown> = {
      name: name || "My Task",
      handler,
      schedule: scheduleDescription,
    };

    // Only include optional fields if they have non-default values
    if (description) {
      mcpArgs.description = description;
    }
    if (timezone !== "UTC") {
      mcpArgs.timezone = timezone;
    }
    if (callbackUrl) {
      mcpArgs.callbackUrl = callbackUrl;
    }

    const mcp = `// MCP Tool: create_task
// Sensible defaults for retry/timeout - just specify what matters

{
  "tool": "create_task",
  "args": ${JSON.stringify(mcpArgs, null, 4)}
}

// Schedule examples (natural language):
//   "every 15 minutes"
//   "daily at 9am"
//   "weekdays at 5pm"
//   "mon, wed, fri at 9:00"
//   "monthly on the 1st at 9am"`;

    return { curl, sdk, mcp };
  }, [handlerType, toolsConfig, webhookConfig, name, description, schedule, scheduleDescription, timezone, retryAttempts, retryBackoff, retryDelay, taskTimeout, callbackUrl]);

  const handleCopy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const currentStepIndex = STEPS.indexOf(step);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === STEPS.length - 1;

  const getHandler = useCallback(() => {
    switch (handlerType) {
      case "tools":
        return toolsConfig;
      case "webhook":
        return { ...webhookConfig, method: webhookConfig.method ?? "POST" } as const;
      case "code":
        return { type: "code" as const, runtime: "javascript" as const, code: "" };
    }
  }, [handlerType, toolsConfig, webhookConfig]);

  const canProceed = useCallback((): boolean => {
    switch (step) {
      case "handler": {
        const handler = getHandler();
        if (handler.type === "tools") {
          return handler.steps.length > 0 && handler.steps.every((s) => s.tool);
        }
        if (handler.type === "webhook") {
          return !!handler.url;
        }
        return false;
      }
      case "schedule":
        return true;
      case "details":
        return !!name;
    }
  }, [step, getHandler, name]);

  const handleNext = () => {
    if (!canProceed()) return;
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setStep(STEPS[nextIndex]);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setStep(STEPS[prevIndex]);
    }
  };

  const handleSubmit = async () => {
    if (!canProceed()) return;

    const input: TaskCreateInput = {
      name,
      description: description || undefined,
      handler: getHandler(),
      schedule,
      timezone,
      retryAttempts,
      retryBackoff,
      retryDelay,
      timeout: taskTimeout,
      callbackUrl: callbackUrl || undefined,
      active: true,
    };
    createMutation.mutate(input);
  };

  const handleScheduleChange = useCallback((config: ScheduleConfig) => {
    setSchedule(config);
  }, []);

  const currentCode = codeTab === "curl" ? codeSnippets.curl : codeTab === "sdk" ? codeSnippets.sdk : codeSnippets.mcp;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/tasks" })}
        >
          <ArrowLeft size={16} className="mr-2" />
          Back to Tasks
        </Button>
      </div>

      <div>
        <h1 className="display-title">Create Task</h1>
        <p className="text-muted-foreground mt-1">
          Set up a new scheduled task
        </p>
      </div>

      {/* Side-by-side layout */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left: Form */}
        <div className="space-y-6">
          {/* Progress Steps */}
          <div className="flex items-center gap-3">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (i < currentStepIndex) {
                      setStep(STEPS[i]);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 transition-colors",
                    i <= currentStepIndex ? "cursor-pointer" : "cursor-default"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                      i < currentStepIndex
                        ? "bg-primary text-primary-foreground"
                        : i === currentStepIndex
                          ? "bg-primary/20 text-primary ring-2 ring-primary"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {i < currentStepIndex ? <Check size={14} /> : i + 1}
                  </div>
                  <span
                    className={cn(
                      "text-sm capitalize hidden sm:inline",
                      i === currentStepIndex ? "text-foreground font-medium" : "text-muted-foreground"
                    )}
                  >
                    {s}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className="h-px w-8 bg-border" />
                )}
              </div>
            ))}
          </div>

          {/* Step Content */}
          <Card className="border-border/50 bg-card/60">
            <CardContent className="pt-6">
              {step === "handler" && (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <Label className="text-base font-medium">What should this task do?</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {
                          type: "tools" as const,
                          icon: Wrench,
                          label: "Tools",
                          desc: "HTTP, Slack, email",
                        },
                        {
                          type: "webhook" as const,
                          icon: Globe,
                          label: "Webhook",
                          desc: "Call your endpoint",
                        },
                        {
                          type: "code" as const,
                          icon: Code,
                          label: "Code",
                          desc: "Run JavaScript",
                          disabled: true,
                        },
                      ].map((opt) => (
                        <button
                          key={opt.type}
                          type="button"
                          disabled={opt.disabled}
                          onClick={() => setHandlerType(opt.type)}
                          className={cn(
                            "flex flex-col items-center gap-2 rounded-lg border p-4 transition-all",
                            handlerType === opt.type
                              ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                              : "border-border/50 bg-card/50 hover:border-border hover:bg-card",
                            opt.disabled && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <opt.icon
                            size={24}
                            className={cn(
                              handlerType === opt.type ? "text-primary" : "text-muted-foreground"
                            )}
                          />
                          <span className="text-sm font-medium">{opt.label}</span>
                          <span className="text-xs text-muted-foreground text-center">
                            {opt.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {handlerType === "tools" && toolsConfig.type === "tools" && (
                      <ToolStepBuilder
                        value={toolsConfig}
                        onChange={(config) => setToolsConfig(config)}
                      />
                    )}
                    {handlerType === "webhook" && webhookConfig.type === "webhook" && (
                      <WebhookBuilder
                        value={webhookConfig}
                        onChange={(config) => setWebhookConfig(config)}
                      />
                    )}
                  </div>
                </div>
              )}

              {step === "schedule" && (
                <div className="space-y-6">
                  <Label className="text-base font-medium">When should it run?</Label>
                  <ScheduleBuilder
                    value={schedule}
                    onChange={handleScheduleChange}
                    timezone={timezone}
                    onTimezoneChange={setTimezone}
                  />
                </div>
              )}

              {step === "details" && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label>
                      Task Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Check API and alert Slack"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Description <span className="text-muted-foreground text-xs">(optional)</span>
                    </Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What does this task do?"
                      className="min-h-[60px]"
                    />
                  </div>

                  {/* Advanced Settings */}
                  <div className="space-y-3 pt-3 border-t border-border/50">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Retry & Timeout
                    </Label>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Retry Attempts</Label>
                        <Select
                          value={String(retryAttempts)}
                          onValueChange={(v) => setRetryAttempts(Number(v))}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 5, 10].map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Backoff</Label>
                        <Select value={retryBackoff} onValueChange={(v: "linear" | "exponential") => setRetryBackoff(v)}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="linear">Linear</SelectItem>
                            <SelectItem value="exponential">Exponential</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Retry Delay</Label>
                        <Select value={retryDelay} onValueChange={setRetryDelay}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RETRY_DELAYS.map((d) => (
                              <SelectItem key={d.value} value={d.value}>
                                {d.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Timeout</Label>
                        <Select value={taskTimeout} onValueChange={setTaskTimeout}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIMEOUTS.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Callback URL */}
                  <div className="space-y-3 pt-3 border-t border-border/50">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Completion Callback
                    </Label>
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Callback URL <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        value={callbackUrl}
                        onChange={(e) => setCallbackUrl(e.target.value)}
                        placeholder="https://your-api.com/webhook/task-complete"
                        className="h-9"
                      />
                      <p className="text-xs text-muted-foreground">
                        We'll POST the run result to this URL when the task completes. Useful for agent loops.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={handleBack}
              disabled={isFirstStep}
            >
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>

            {isLastStep ? (
              <Button
                onClick={handleSubmit}
                disabled={!canProceed() || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Task"}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Next
                <ArrowRight size={16} className="ml-2" />
              </Button>
            )}
          </div>

          {createMutation.error && (
            <p className="text-sm text-destructive">
              Failed to create task: {(createMutation.error as Error).message}
            </p>
          )}
        </div>

        {/* Right: Code Preview */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Tabs value={codeTab} onValueChange={(v) => setCodeTab(v as CodeTab)}>
              <TabsList className="bg-muted/50 h-9">
                <TabsTrigger value="mcp" className="gap-1.5 text-xs px-3">
                  <Robot size={14} />
                  MCP
                </TabsTrigger>
                <TabsTrigger value="sdk" className="gap-1.5 text-xs px-3">
                  <Code size={14} />
                  SDK
                </TabsTrigger>
                <TabsTrigger value="curl" className="gap-1.5 text-xs px-3">
                  <Terminal size={14} />
                  cURL
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => handleCopy(currentCode)}
            >
              <Copy size={14} className="mr-1.5" />
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>

          <div className="relative">
            <pre className="bg-zinc-950 border border-border/50 rounded-lg p-4 overflow-auto text-[13px] text-zinc-300 font-mono leading-relaxed min-h-[400px] max-h-[600px]">
              <code>{currentCode}</code>
            </pre>
          </div>

          {codeTab === "mcp" && (
            <p className="text-xs text-muted-foreground">
              AI agents use natural language schedules. Retry and timeout use sensible defaults.
            </p>
          )}
          {codeTab === "sdk" && (
            <p className="text-xs text-muted-foreground">
              Install: <code className="bg-muted px-1.5 py-0.5 rounded">npm install @cronlet/cloud-sdk</code>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
