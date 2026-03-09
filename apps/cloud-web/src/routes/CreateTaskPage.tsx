import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TaskRecord } from "@cronlet/shared";
import type { MetadataEditorMode, MetadataEntry, TaskFormValues } from "@/components/task/task-form";
import type { TaskTemplate } from "@/components/task/task-templates";
import { ArrowLeft, ArrowRight, CheckCircle, Copy, Robot, Sparkle, Terminal } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { createTask } from "@/lib/api";
import { setFirstTaskPending } from "@/lib/onboarding";
import {
  TaskDetailsOptionsSection,
  TaskHandlerEditor,
  TaskScheduleEditor,
  TaskTemplateSelector,
  buildCreateTaskInput,
  createDefaultTaskFormValues,
  createFormValuesFromTemplate,
  getTaskFormErrors,
  getTaskHandler,
  getTemplateRequiredFieldLabels,
  hasBlockingErrors,
  metadataEntriesFromText,
  parseMetadataText,
} from "@/components/task";

type Step = "handler" | "schedule" | "details";
type CodeTab = "curl" | "sdk" | "mcp";

const STEPS: Step[] = ["handler", "schedule", "details"];
const STEP_LABELS: Record<Step, string> = {
  handler: "Handler",
  schedule: "Schedule",
  details: "Details & Options",
};

interface CreateTaskPageProps {
  showTemplatesInitially?: boolean;
}

export function CreateTaskPage({
  showTemplatesInitially = false,
}: CreateTaskPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("handler");
  const [codeTab, setCodeTab] = useState<CodeTab>("mcp");
  const [copied, setCopied] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TaskTemplate | null>(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(showTemplatesInitially);
  const [form, setForm] = useState<TaskFormValues>(() => createDefaultTaskFormValues());

  const existingTasks = (queryClient.getQueryData(["tasks"]) as TaskRecord[] | undefined) ?? [];
  const isFirstTaskCreate = existingTasks.length === 0;

  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      if (isFirstTaskCreate) {
        setFirstTaskPending(true);
      }
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      navigate({ to: "/tasks" });
    },
  });

  const errors = getTaskFormErrors(form);
  const currentStepIndex = STEPS.indexOf(step);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === STEPS.length - 1;

  const scheduleDescription = useMemo(() => {
    switch (form.schedule.type) {
      case "every":
        return `every ${formatIntervalDescription(form.schedule.interval)}`;
      case "daily":
        return `daily at ${form.schedule.times.join(", ")}`;
      case "weekly":
        return `${form.schedule.days.join(", ")} at ${form.schedule.time}`;
      case "monthly":
        return `monthly on ${form.schedule.day} at ${form.schedule.time}`;
      case "once":
        return `once at ${new Date(form.schedule.at).toLocaleString()}`;
      case "cron":
        return form.schedule.expression;
    }
  }, [form.schedule]);

  const currentCode = useMemo(() => {
    const fullPayload = buildPreviewPayload(form);
    const payloadJson = JSON.stringify(fullPayload, null, 2);

    const curl = `curl -X POST https://api.cronlet.dev/v1/tasks \\
  -H "Authorization: Bearer $CRONLET_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${payloadJson}'`;

    const sdk = `import { CloudClient } from "@cronlet/sdk";

const client = new CloudClient({
  baseUrl: "https://api.cronlet.dev",
  apiKey: process.env.CRONLET_API_KEY,
});

const task = await client.tasks.create(${payloadJson});

console.log("Created task:", task.id);`;

    const mcpArgs: Record<string, unknown> = {
      name: form.name || "My Task",
      handler: getTaskHandler(form),
      schedule: scheduleDescription,
    };

    if (form.description.trim()) {
      mcpArgs.description = form.description.trim();
    }
    if (form.timezone !== "UTC") {
      mcpArgs.timezone = form.timezone;
    }
    if (form.callbackUrl.trim()) {
      mcpArgs.callbackUrl = form.callbackUrl.trim();
    }

    const metadata = parseMetadataText(form.metadataText);
    if (metadata.value) {
      mcpArgs.metadata = metadata.value;
    }
    if (form.maxRunsEnabled && form.maxRuns.trim()) {
      mcpArgs.maxRuns = Number(form.maxRuns.trim());
    }
    if (form.expiresAtEnabled && form.expiresAt.trim()) {
      mcpArgs.expiresAt = new Date(form.expiresAt).toISOString();
    }
    if (!form.active) {
      mcpArgs.active = false;
    }

    const mcp = `// MCP Tool: create_task
// Sensible defaults for retry/timeout - just specify what matters

{
  "tool": "create_task",
  "args": ${JSON.stringify(mcpArgs, null, 4)}
}`;

    return {
      curl,
      sdk,
      mcp,
    }[codeTab];
  }, [codeTab, form, scheduleDescription]);

  const updateForm = (updates: Partial<TaskFormValues>) => {
    setForm((current) => ({ ...current, ...updates }));
  };

  const handleMetadataTextChange = (value: string) => {
    updateForm({
      metadataText: value,
      metadataEntries: metadataEntriesFromText(value),
    });
  };

  const handleMetadataEntriesChange = (entries: MetadataEntry[]) => {
    updateForm({ metadataEntries: entries });
  };

  const handleMetadataModeChange = (mode: MetadataEditorMode) => {
    updateForm({
      metadataMode: mode,
      metadataEntries: mode === "builder" ? metadataEntriesFromText(form.metadataText) : form.metadataEntries,
    });
  };

  const canProceed = () => {
    if (step === "handler") {
      if (form.handlerType === "webhook") {
        return !errors.webhookUrl;
      }

      return form.toolsConfig.steps.length > 0 && form.toolsConfig.steps.every((toolStep) => toolStep.tool);
    }

    if (step === "schedule") {
      return true;
    }

    return !hasBlockingErrors(errors);
  };

  const handleNext = () => {
    if (!canProceed()) {
      return;
    }

    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setStep(STEPS[nextIndex]);
    }
  };

  const handleBack = () => {
    const previousIndex = currentStepIndex - 1;
    if (previousIndex >= 0) {
      setStep(STEPS[previousIndex]);
    }
  };

  const handleSubmit = () => {
    if (!canProceed()) {
      return;
    }

    createMutation.mutate(buildCreateTaskInput(form));
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectTemplate = (template: TaskTemplate) => {
    setSelectedTemplate(template);
    setForm(createFormValuesFromTemplate(template));
    setStep("handler");
    setShowTemplateSelector(false);
  };

  const handleStartFromScratch = () => {
    setSelectedTemplate(null);
    setForm(createDefaultTaskFormValues());
    setStep("handler");
    setShowTemplateSelector(false);
  };

  if (showTemplateSelector) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/" })}>
            <ArrowLeft size={16} className="mr-2" />
            Back to Overview
          </Button>
        </div>

        <TaskTemplateSelector
          onSelectTemplate={handleSelectTemplate}
          onStartFromScratch={handleStartFromScratch}
        />
      </div>
    );
  }

  const templateFieldLabels = selectedTemplate ? getTemplateRequiredFieldLabels(selectedTemplate) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/tasks" })}>
          <ArrowLeft size={16} className="mr-2" />
          Back to Tasks
        </Button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="display-title">Create Task</h1>
          <p className="mt-1 text-muted-foreground">
            Set up a new scheduled task
          </p>
        </div>
        {showTemplatesInitially ? (
          <Button variant="outline" onClick={() => setShowTemplateSelector(true)}>
            <Sparkle size={14} className="mr-2" />
            Change template
          </Button>
        ) : null}
      </div>

      {selectedTemplate ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="space-y-4 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={selectedTemplate.handler.type === "tools" ? "tools" : "webhook"}>
                    {selectedTemplate.handler.type.toUpperCase()}
                  </Badge>
                  <span className="meta-label">Template loaded</span>
                </div>
                <p className="font-display text-lg text-foreground">{selectedTemplate.name}</p>
                <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
              </div>
              {showTemplatesInitially ? (
                <Button variant="ghost" size="sm" onClick={() => setShowTemplateSelector(true)}>
                  Browse templates
                </Button>
              ) : null}
            </div>

            <div className="rounded-xl border border-border/40 bg-background/40 p-4">
              <p className="meta-label mb-2">Replace these before creating</p>
              <div className="flex flex-wrap gap-2">
                {templateFieldLabels.map((label) => (
                  <Badge key={label} variant="outline" className="rounded-full px-2.5 py-1 text-[11px]">
                    {label}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            {STEPS.map((stepId, index) => (
              <div key={stepId} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (index < currentStepIndex) {
                      setStep(STEPS[index]);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all",
                    index < currentStepIndex && "cursor-pointer hover:bg-primary/5",
                    index === currentStepIndex && "bg-primary/10",
                    index > currentStepIndex && "cursor-default opacity-50"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition-all",
                      index < currentStepIndex
                        ? "bg-primary text-primary-foreground"
                        : index === currentStepIndex
                          ? "bg-primary/20 text-primary ring-1 ring-primary/50"
                          : "bg-muted text-muted-foreground"
                    )}
                  >
                    {index < currentStepIndex ? <CheckCircle size={14} weight="fill" /> : index + 1}
                  </div>
                  <span
                    className={cn(
                      "hidden text-sm sm:inline",
                      index === currentStepIndex ? "font-medium text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {STEP_LABELS[stepId]}
                  </span>
                </button>
                {index < STEPS.length - 1 ? <div className="h-px w-6 bg-border/50" /> : null}
              </div>
            ))}
          </div>

          <Card variant="flat">
            <CardContent>
              {step === "handler" ? (
                <TaskHandlerEditor
                  handlerType={form.handlerType}
                  toolsConfig={form.toolsConfig}
                  webhookConfig={form.webhookConfig}
                  onHandlerTypeChange={(handlerType) => updateForm({ handlerType })}
                  onToolsConfigChange={(toolsConfig) => updateForm({ toolsConfig })}
                  onWebhookConfigChange={(webhookConfig) => updateForm({ webhookConfig })}
                />
              ) : null}

              {step === "schedule" ? (
                <TaskScheduleEditor
                  schedule={form.schedule}
                  timezone={form.timezone}
                  onScheduleChange={(schedule) => updateForm({ schedule })}
                  onTimezoneChange={(timezone) => updateForm({ timezone })}
                />
              ) : null}

              {step === "details" ? (
                <TaskDetailsOptionsSection
                  mode="create"
                  collapsibleAdvanced
                  values={form}
                  errors={errors}
                  onNameChange={(name) => updateForm({ name })}
                  onDescriptionChange={(description) => updateForm({ description })}
                  onActiveChange={(active) => updateForm({ active })}
                  onRetryAttemptsChange={(retryAttempts) => updateForm({ retryAttempts })}
                  onRetryBackoffChange={(retryBackoff) => updateForm({ retryBackoff })}
                  onRetryDelayChange={(retryDelay) => updateForm({ retryDelay })}
                  onTimeoutChange={(timeout) => updateForm({ timeout })}
                  onCallbackUrlChange={(callbackUrl) => updateForm({ callbackUrl })}
                  onMetadataModeChange={handleMetadataModeChange}
                  onMetadataTextChange={handleMetadataTextChange}
                  onMetadataEntriesChange={handleMetadataEntriesChange}
                  onMaxRunsEnabledChange={(maxRunsEnabled) => updateForm({ maxRunsEnabled, maxRuns: maxRunsEnabled ? form.maxRuns : "" })}
                  onMaxRunsChange={(maxRuns) => updateForm({ maxRuns })}
                  onExpiresAtEnabledChange={(expiresAtEnabled) => updateForm({ expiresAtEnabled, expiresAt: expiresAtEnabled ? form.expiresAt : "" })}
                  onExpiresAtChange={(expiresAt) => updateForm({ expiresAt })}
                />
              ) : null}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" onClick={handleBack} disabled={isFirstStep}>
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>

            {isLastStep ? (
              <Button onClick={handleSubmit} disabled={!canProceed() || createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Task"}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Next
                <ArrowRight size={16} className="ml-2" />
              </Button>
            )}
          </div>

          {createMutation.error ? (
            <p className="text-sm text-destructive">Failed to create task: {(createMutation.error as Error).message}</p>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Tabs value={codeTab} onValueChange={(value) => setCodeTab(value as CodeTab)}>
              <TabsList className="h-9 bg-muted/30">
                <TabsTrigger value="mcp" className="gap-1.5 px-3 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                  <Robot size={14} />
                  MCP
                </TabsTrigger>
                <TabsTrigger value="sdk" className="gap-1.5 px-3 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                  <ArrowRight size={14} />
                  SDK
                </TabsTrigger>
                <TabsTrigger value="curl" className="gap-1.5 px-3 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                  <Terminal size={14} />
                  cURL
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" className="h-8 px-3" onClick={handleCopy}>
              {copied ? (
                <>
                  <CheckCircle size={14} weight="fill" className="mr-1.5 text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={14} className="mr-1.5" />
                  Copy
                </>
              )}
            </Button>
          </div>

          <pre className="min-h-[400px] max-h-[600px] overflow-auto rounded-xl border border-border/30 bg-zinc-950 p-5 font-mono text-[13px] leading-relaxed text-zinc-300">
            <code>{currentCode}</code>
          </pre>

          <p className="text-xs text-muted-foreground">
            The preview tracks advanced options too, including metadata and lifecycle limits when configured.
          </p>
        </div>
      </div>
    </div>
  );
}

function buildPreviewPayload(form: TaskFormValues) {
  const input = buildCreateTaskInput(form);
  const payload: Record<string, unknown> = {
    name: input.name,
    handler: input.handler,
    schedule: input.schedule,
    timezone: input.timezone,
    retryAttempts: input.retryAttempts,
    retryBackoff: input.retryBackoff,
    retryDelay: input.retryDelay,
    timeout: input.timeout,
  };

  if (input.description) {
    payload.description = input.description;
  }
  if (input.callbackUrl) {
    payload.callbackUrl = input.callbackUrl;
  }
  if (input.metadata) {
    payload.metadata = input.metadata;
  }
  if (typeof input.maxRuns === "number") {
    payload.maxRuns = input.maxRuns;
  }
  if (input.expiresAt) {
    payload.expiresAt = input.expiresAt;
  }
  if (input.active === false) {
    payload.active = false;
  }

  return payload;
}

function formatIntervalDescription(interval: string): string {
  const match = interval.match(/^(\d+)([smhd])$/);
  if (!match) {
    return interval;
  }

  const [, amount, unit] = match;
  const units: Record<string, string> = {
    s: "second",
    m: "minute",
    h: "hour",
    d: "day",
  };

  const label = units[unit] ?? unit;
  return amount === "1" ? `1 ${label}` : `${amount} ${label}s`;
}
