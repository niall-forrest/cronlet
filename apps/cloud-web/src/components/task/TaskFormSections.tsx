import { useState } from "react";
import type {
  ScheduleConfig,
  ToolsHandlerConfig,
  WebhookHandlerConfig,
} from "@cronlet/shared";
import {
  CaretDown,
  Globe,
  Plus,
  Rows,
  Wrench,
  X,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ScheduleBuilder } from "./ScheduleBuilder";
import { ToolStepBuilder } from "./ToolStepBuilder";
import { WebhookBuilder } from "./WebhookBuilder";
import type {
  MetadataEditorMode,
  MetadataEntry,
  TaskFormErrors,
  TaskFormHandlerType,
  TaskFormValues,
} from "./task-form";
import {
  RETRY_DELAYS,
  TIMEOUTS,
  getAdvancedSummary,
  isBuilderCompatibleMetadata,
  metadataTextFromEntries,
  parseMetadataText,
} from "./task-form";

interface TaskHandlerEditorProps {
  handlerType: TaskFormHandlerType;
  toolsConfig: ToolsHandlerConfig;
  webhookConfig: WebhookHandlerConfig;
  onHandlerTypeChange: (type: TaskFormHandlerType) => void;
  onToolsConfigChange: (config: ToolsHandlerConfig) => void;
  onWebhookConfigChange: (config: WebhookHandlerConfig) => void;
}

export function TaskHandlerEditor({
  handlerType,
  toolsConfig,
  webhookConfig,
  onHandlerTypeChange,
  onToolsConfigChange,
  onWebhookConfigChange,
}: TaskHandlerEditorProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Label className="text-base font-semibold">What should this task do?</Label>
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              type: "tools" as const,
              icon: Wrench,
              label: "Tools",
              desc: "Chain HTTP, Slack, email, and utility steps",
            },
            {
              type: "webhook" as const,
              icon: Globe,
              label: "Webhook",
              desc: "Call your endpoint directly",
            },
          ].map((option) => (
            <button
              key={option.type}
              type="button"
              onClick={() => onHandlerTypeChange(option.type)}
              className={cn(
                "group flex flex-col items-center gap-2.5 rounded-xl border p-4 text-center transition-all duration-200",
                handlerType === option.type
                  ? "border-primary/50 bg-primary/5 shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]"
                  : "border-border/30 bg-card/30 hover:border-border/50 hover:bg-card/50"
              )}
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                  handlerType === option.type ? "bg-primary/15" : "bg-muted/50 group-hover:bg-muted"
                )}
              >
                <option.icon
                  size={22}
                  weight={handlerType === option.type ? "fill" : "regular"}
                  className={cn(
                    handlerType === option.type ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
              </div>
              <span className={cn("text-sm font-medium", handlerType === option.type ? "text-primary" : "text-foreground")}>
                {option.label}
              </span>
              <span className="text-xs text-muted-foreground">{option.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {handlerType === "tools" ? (
        <ToolStepBuilder value={toolsConfig} onChange={onToolsConfigChange} />
      ) : (
        <WebhookBuilder value={webhookConfig} onChange={onWebhookConfigChange} />
      )}
    </div>
  );
}

interface TaskScheduleEditorProps {
  schedule: ScheduleConfig;
  timezone: string;
  onScheduleChange: (config: ScheduleConfig) => void;
  onTimezoneChange: (timezone: string) => void;
}

export function TaskScheduleEditor({
  schedule,
  timezone,
  onScheduleChange,
  onTimezoneChange,
}: TaskScheduleEditorProps) {
  return (
    <div className="space-y-6">
      <Label className="text-base font-semibold">When should it run?</Label>
      <ScheduleBuilder
        value={schedule}
        onChange={onScheduleChange}
        timezone={timezone}
        onTimezoneChange={onTimezoneChange}
      />
    </div>
  );
}

interface TaskDetailsOptionsSectionProps {
  values: TaskFormValues;
  errors: TaskFormErrors;
  mode: "create" | "edit";
  collapsibleAdvanced?: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onActiveChange: (active: boolean) => void;
  onRetryAttemptsChange: (value: number) => void;
  onRetryBackoffChange: (value: "linear" | "exponential") => void;
  onRetryDelayChange: (value: string) => void;
  onTimeoutChange: (value: string) => void;
  onCallbackUrlChange: (value: string) => void;
  onMetadataModeChange: (mode: MetadataEditorMode) => void;
  onMetadataTextChange: (value: string) => void;
  onMetadataEntriesChange: (entries: MetadataEntry[]) => void;
  onMaxRunsEnabledChange: (enabled: boolean) => void;
  onMaxRunsChange: (value: string) => void;
  onExpiresAtEnabledChange: (enabled: boolean) => void;
  onExpiresAtChange: (value: string) => void;
}

export function TaskDetailsOptionsSection({
  values,
  errors,
  mode,
  collapsibleAdvanced = false,
  onNameChange,
  onDescriptionChange,
  onActiveChange,
  onRetryAttemptsChange,
  onRetryBackoffChange,
  onRetryDelayChange,
  onTimeoutChange,
  onCallbackUrlChange,
  onMetadataModeChange,
  onMetadataTextChange,
  onMetadataEntriesChange,
  onMaxRunsEnabledChange,
  onMaxRunsChange,
  onExpiresAtEnabledChange,
  onExpiresAtChange,
}: TaskDetailsOptionsSectionProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedSummary = getAdvancedSummary(values);

  return (
    <div className="space-y-6">
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>
            Task Name <span className="text-destructive">*</span>
          </Label>
          <Input
            value={values.name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Check API and alert Slack"
            aria-invalid={!!errors.name}
          />
          {errors.name ? <FieldError message={errors.name} /> : null}
        </div>

        <div className="space-y-2">
          <Label>
            Description <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <Textarea
            value={values.description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="What does this task do?"
            className="min-h-[72px]"
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-xl border border-border/40 bg-card/30 px-4 py-3">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Active on save</Label>
            <p className="text-xs text-muted-foreground">
              {mode === "create"
                ? "Start this task immediately after creation."
                : "Pause the task without leaving the editor."}
            </p>
          </div>
          <Switch checked={values.active} onCheckedChange={onActiveChange} />
        </div>
      </div>

      {collapsibleAdvanced ? (
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <div className="rounded-xl border border-border/40 bg-card/20">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Rows size={16} className="text-primary" />
                    <span className="text-sm font-medium">Advanced task options</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {advancedSummary.length > 0
                      ? advancedSummary.join(" • ")
                      : "Using default retries, timeout, unlimited lifecycle, and no metadata."}
                  </p>
                </div>
                <CaretDown
                  size={16}
                  className={cn("mt-1 shrink-0 text-muted-foreground transition-transform", advancedOpen && "rotate-180")}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t border-border/40 px-4 py-4">
                <AdvancedOptionsFields
                  values={values}
                  errors={errors}
                  onRetryAttemptsChange={onRetryAttemptsChange}
                  onRetryBackoffChange={onRetryBackoffChange}
                  onRetryDelayChange={onRetryDelayChange}
                  onTimeoutChange={onTimeoutChange}
                  onCallbackUrlChange={onCallbackUrlChange}
                  onMetadataModeChange={onMetadataModeChange}
                  onMetadataTextChange={onMetadataTextChange}
                  onMetadataEntriesChange={onMetadataEntriesChange}
                  onMaxRunsEnabledChange={onMaxRunsEnabledChange}
                  onMaxRunsChange={onMaxRunsChange}
                  onExpiresAtEnabledChange={onExpiresAtEnabledChange}
                  onExpiresAtChange={onExpiresAtChange}
                />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      ) : (
        <AdvancedOptionsFields
          values={values}
          errors={errors}
          onRetryAttemptsChange={onRetryAttemptsChange}
          onRetryBackoffChange={onRetryBackoffChange}
          onRetryDelayChange={onRetryDelayChange}
          onTimeoutChange={onTimeoutChange}
          onCallbackUrlChange={onCallbackUrlChange}
          onMetadataModeChange={onMetadataModeChange}
          onMetadataTextChange={onMetadataTextChange}
          onMetadataEntriesChange={onMetadataEntriesChange}
          onMaxRunsEnabledChange={onMaxRunsEnabledChange}
          onMaxRunsChange={onMaxRunsChange}
          onExpiresAtEnabledChange={onExpiresAtEnabledChange}
          onExpiresAtChange={onExpiresAtChange}
        />
      )}
    </div>
  );
}

interface AdvancedOptionsFieldsProps {
  values: TaskFormValues;
  errors: TaskFormErrors;
  onRetryAttemptsChange: (value: number) => void;
  onRetryBackoffChange: (value: "linear" | "exponential") => void;
  onRetryDelayChange: (value: string) => void;
  onTimeoutChange: (value: string) => void;
  onCallbackUrlChange: (value: string) => void;
  onMetadataModeChange: (mode: MetadataEditorMode) => void;
  onMetadataTextChange: (value: string) => void;
  onMetadataEntriesChange: (entries: MetadataEntry[]) => void;
  onMaxRunsEnabledChange: (enabled: boolean) => void;
  onMaxRunsChange: (value: string) => void;
  onExpiresAtEnabledChange: (enabled: boolean) => void;
  onExpiresAtChange: (value: string) => void;
}

function AdvancedOptionsFields({
  values,
  errors,
  onRetryAttemptsChange,
  onRetryBackoffChange,
  onRetryDelayChange,
  onTimeoutChange,
  onCallbackUrlChange,
  onMetadataModeChange,
  onMetadataTextChange,
  onMetadataEntriesChange,
  onMaxRunsEnabledChange,
  onMaxRunsChange,
  onExpiresAtEnabledChange,
  onExpiresAtChange,
}: AdvancedOptionsFieldsProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Execution</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Retry Attempts</Label>
            <Select value={String(values.retryAttempts)} onValueChange={(value) => onRetryAttemptsChange(Number(value))}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 5, 10].map((attempts) => (
                  <SelectItem key={attempts} value={String(attempts)}>
                    {attempts}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Backoff</Label>
            <Select value={values.retryBackoff} onValueChange={(value: "linear" | "exponential") => onRetryBackoffChange(value)}>
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
            <Select value={values.retryDelay} onValueChange={onRetryDelayChange}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RETRY_DELAYS.map((delay) => (
                  <SelectItem key={delay.value} value={delay.value}>
                    {delay.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Timeout</Label>
            <Select value={values.timeout} onValueChange={onTimeoutChange}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEOUTS.map((timeout) => (
                  <SelectItem key={timeout.value} value={timeout.value}>
                    {timeout.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-border/40 pt-4">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Delivery</Label>
        <div className="space-y-2">
          <Label className="text-xs">
            Callback URL <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            value={values.callbackUrl}
            onChange={(event) => onCallbackUrlChange(event.target.value)}
            placeholder="https://your-api.com/webhook/task-complete"
            className="h-9"
            aria-invalid={!!errors.callbackUrl}
          />
          <p className="text-xs text-muted-foreground">
            POST the run result here when the task completes. Useful for agent loops and follow-up automation.
          </p>
          {errors.callbackUrl ? <FieldError message={errors.callbackUrl} /> : null}
        </div>
      </div>

      <div className="space-y-3 border-t border-border/40 pt-4">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Lifecycle Limits</Label>
        <div className="space-y-3">
          <div className="rounded-xl border border-border/40 bg-card/20 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Max runs</Label>
                <p className="text-xs text-muted-foreground">
                  Stop the task automatically after a fixed number of successful or failed run attempts.
                </p>
              </div>
              <Switch checked={values.maxRunsEnabled} onCheckedChange={onMaxRunsEnabledChange} />
            </div>
            {values.maxRunsEnabled ? (
              <div className="mt-3 space-y-2">
                <Input
                  type="number"
                  min={1}
                  value={values.maxRuns}
                  onChange={(event) => onMaxRunsChange(event.target.value)}
                  placeholder="10"
                  aria-invalid={!!errors.maxRuns}
                />
                {errors.maxRuns ? <FieldError message={errors.maxRuns} /> : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-border/40 bg-card/20 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Expires at</Label>
                <p className="text-xs text-muted-foreground">
                  Stop the task after a specific date and time.
                </p>
              </div>
              <Switch checked={values.expiresAtEnabled} onCheckedChange={onExpiresAtEnabledChange} />
            </div>
            {values.expiresAtEnabled ? (
              <div className="mt-3 space-y-2">
                <Input
                  type="datetime-local"
                  value={values.expiresAt}
                  onChange={(event) => onExpiresAtChange(event.target.value)}
                  aria-invalid={!!errors.expiresAt}
                />
                {errors.expiresAt ? <FieldError message={errors.expiresAt} /> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-border/40 pt-4">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Metadata</Label>
        <MetadataEditor
          values={values}
          error={errors.metadata}
          onModeChange={onMetadataModeChange}
          onTextChange={onMetadataTextChange}
          onEntriesChange={onMetadataEntriesChange}
        />
      </div>
    </div>
  );
}

interface MetadataEditorProps {
  values: TaskFormValues;
  error?: string;
  onModeChange: (mode: MetadataEditorMode) => void;
  onTextChange: (value: string) => void;
  onEntriesChange: (entries: MetadataEntry[]) => void;
}

function MetadataEditor({
  values,
  error,
  onModeChange,
  onTextChange,
  onEntriesChange,
}: MetadataEditorProps) {
  const metadata = parseMetadataText(values.metadataText);
  const builderCompatible = isBuilderCompatibleMetadata(metadata.value);
  const builderDisabled = values.metadataText.trim().length > 0 && !builderCompatible;

  const updateEntry = (index: number, updates: Partial<MetadataEntry>) => {
    const nextEntries = values.metadataEntries.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, ...updates } : entry
    );
    onEntriesChange(nextEntries);
    onTextChange(metadataTextFromEntries(nextEntries));
  };

  const removeEntry = (index: number) => {
    const nextEntries = values.metadataEntries.filter((_, entryIndex) => entryIndex !== index);
    const safeEntries = nextEntries.length > 0 ? nextEntries : [{ key: "", value: "" }];
    onEntriesChange(safeEntries);
    onTextChange(metadataTextFromEntries(safeEntries));
  };

  const addEntry = () => {
    onEntriesChange([...values.metadataEntries, { key: "", value: "" }]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={values.metadataMode === "builder" ? "default" : "outline"}
          onClick={() => onModeChange("builder")}
        >
          Key/Value
        </Button>
        <Button
          type="button"
          size="sm"
          variant={values.metadataMode === "json" ? "default" : "outline"}
          onClick={() => onModeChange("json")}
        >
          Raw JSON
        </Button>
      </div>

      {values.metadataMode === "builder" ? (
        <div className="space-y-3 rounded-xl border border-border/40 bg-card/20 p-4">
          {builderDisabled ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                The current metadata contains nested fields or non-string values. Edit it in raw JSON mode to preserve its shape.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => onModeChange("json")}>
                Switch to Raw JSON
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Key/value mode is for flat string metadata. Use raw JSON for typed or nested values.
              </p>
              <div className="space-y-2">
                {values.metadataEntries.map((entry, index) => (
                  <div key={`${index}-${entry.key}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      value={entry.key}
                      onChange={(event) => updateEntry(index, { key: event.target.value })}
                      placeholder="key"
                    />
                    <Input
                      value={entry.value}
                      onChange={(event) => updateEntry(index, { value: event.target.value })}
                      placeholder="value"
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeEntry(index)}>
                      <X size={14} />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addEntry}>
                <Plus size={14} className="mr-1.5" />
                Add field
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={values.metadataText}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder={'{\n  "agentId": "health-bot",\n  "purpose": "monitoring"\n}'}
            className="min-h-[160px] font-mono text-sm"
            aria-invalid={!!error}
          />
          <p className="text-xs text-muted-foreground">
            Metadata must be a JSON object. This is the canonical value saved to the API.
          </p>
        </div>
      )}

      {error ? <FieldError message={error} /> : null}
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return <p className="text-xs text-destructive">{message}</p>;
}
