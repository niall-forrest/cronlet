import type {
  ScheduleConfig,
  TaskCreateInput,
  TaskPatchInput,
  TaskRecord,
  ToolsHandlerConfig,
  WebhookHandlerConfig,
} from "@cronlet/shared";

export type TaskFormHandlerType = "tools" | "webhook";
export type MetadataEditorMode = "builder" | "json";

export interface MetadataEntry {
  key: string;
  value: string;
}

export interface TaskFormValues {
  handlerType: TaskFormHandlerType;
  toolsConfig: ToolsHandlerConfig;
  webhookConfig: WebhookHandlerConfig;
  schedule: ScheduleConfig;
  timezone: string;
  name: string;
  description: string;
  active: boolean;
  retryAttempts: number;
  retryBackoff: "linear" | "exponential";
  retryDelay: string;
  timeout: string;
  callbackUrl: string;
  metadataMode: MetadataEditorMode;
  metadataText: string;
  metadataEntries: MetadataEntry[];
  maxRunsEnabled: boolean;
  maxRuns: string;
  expiresAtEnabled: boolean;
  expiresAt: string;
}

export interface TaskFormErrors {
  name?: string;
  webhookUrl?: string;
  callbackUrl?: string;
  metadata?: string;
  maxRuns?: string;
  expiresAt?: string;
}

export const RETRY_DELAYS = [
  { value: "1s", label: "1 second" },
  { value: "5s", label: "5 seconds" },
  { value: "30s", label: "30 seconds" },
  { value: "1m", label: "1 minute" },
  { value: "5m", label: "5 minutes" },
] as const;

export const TIMEOUTS = [
  { value: "10s", label: "10 seconds" },
  { value: "30s", label: "30 seconds" },
  { value: "1m", label: "1 minute" },
  { value: "5m", label: "5 minutes" },
  { value: "10m", label: "10 minutes" },
] as const;

const DEFAULT_TOOLS_CONFIG: ToolsHandlerConfig = {
  type: "tools",
  steps: [{ tool: "http.get", args: { url: "" } }],
};

const DEFAULT_WEBHOOK_CONFIG: WebhookHandlerConfig = {
  type: "webhook",
  url: "",
  method: "POST",
};

const DEFAULT_SCHEDULE: ScheduleConfig = {
  type: "every",
  interval: "15m",
};

export function createDefaultTaskFormValues(): TaskFormValues {
  return {
    handlerType: "tools",
    toolsConfig: DEFAULT_TOOLS_CONFIG,
    webhookConfig: DEFAULT_WEBHOOK_CONFIG,
    schedule: DEFAULT_SCHEDULE,
    timezone: "UTC",
    name: "",
    description: "",
    active: true,
    retryAttempts: 1,
    retryBackoff: "linear",
    retryDelay: "1s",
    timeout: "30s",
    callbackUrl: "",
    metadataMode: "builder",
    metadataText: "",
    metadataEntries: [{ key: "", value: "" }],
    maxRunsEnabled: false,
    maxRuns: "",
    expiresAtEnabled: false,
    expiresAt: "",
  };
}

export function createTaskFormValuesFromTask(task: TaskRecord): TaskFormValues {
  const metadataText = stringifyMetadata(task.metadata);
  const builderCompatible = isBuilderCompatibleMetadata(task.metadata);

  return {
    handlerType: task.handlerConfig.type === "webhook" ? "webhook" : "tools",
    toolsConfig: task.handlerConfig.type === "tools" ? task.handlerConfig : DEFAULT_TOOLS_CONFIG,
    webhookConfig: task.handlerConfig.type === "webhook" ? task.handlerConfig : DEFAULT_WEBHOOK_CONFIG,
    schedule: task.scheduleConfig,
    timezone: task.timezone,
    name: task.name,
    description: task.description ?? "",
    active: task.active,
    retryAttempts: task.retryAttempts,
    retryBackoff: task.retryBackoff,
    retryDelay: task.retryDelay,
    timeout: task.timeout,
    callbackUrl: task.callbackUrl ?? "",
    metadataMode: builderCompatible ? "builder" : "json",
    metadataText,
    metadataEntries: builderCompatible ? metadataEntriesFromMetadata(task.metadata) : [{ key: "", value: "" }],
    maxRunsEnabled: task.maxRuns !== null,
    maxRuns: task.maxRuns !== null ? String(task.maxRuns) : "",
    expiresAtEnabled: task.expiresAt !== null,
    expiresAt: formatDateTimeLocalValue(task.expiresAt),
  };
}

export function getTaskHandler(values: TaskFormValues): TaskCreateInput["handler"] {
  return values.handlerType === "webhook"
    ? {
        type: "webhook",
        url: values.webhookConfig.url,
        method: values.webhookConfig.method ?? "POST",
        headers: values.webhookConfig.headers,
        body: values.webhookConfig.body,
        auth: values.webhookConfig.auth,
      }
    : values.toolsConfig;
}

export function parseMetadataText(text: string): {
  value: Record<string, unknown> | null;
  error: string | null;
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return { value: null, error: null };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!isPlainObject(parsed)) {
      return {
        value: null,
        error: "Metadata must be a JSON object.",
      };
    }
    return {
      value: parsed,
      error: null,
    };
  } catch {
    return {
      value: null,
      error: "Metadata must be valid JSON.",
    };
  }
}

export function metadataEntriesFromText(text: string): MetadataEntry[] {
  const parsed = parseMetadataText(text);
  if (!parsed.value || !isBuilderCompatibleMetadata(parsed.value)) {
    return [{ key: "", value: "" }];
  }

  return metadataEntriesFromMetadata(parsed.value);
}

export function metadataTextFromEntries(entries: MetadataEntry[]): string {
  const metadata = entries.reduce<Record<string, string>>((result, entry) => {
    const key = entry.key.trim();
    if (!key) {
      return result;
    }

    result[key] = entry.value;
    return result;
  }, {});

  return Object.keys(metadata).length > 0 ? JSON.stringify(metadata, null, 2) : "";
}

export function isBuilderCompatibleMetadata(metadata: Record<string, unknown> | null): boolean {
  if (!metadata) {
    return true;
  }

  return Object.values(metadata).every((value) => typeof value === "string");
}

export function getTaskFormErrors(values: TaskFormValues): TaskFormErrors {
  const errors: TaskFormErrors = {};

  const name = values.name.trim();
  if (name.length < 2) {
    errors.name = "Task name must be at least 2 characters.";
  }

  if (values.handlerType === "webhook") {
    const webhookUrl = values.webhookConfig.url.trim();
    if (!webhookUrl) {
      errors.webhookUrl = "Webhook URL is required.";
    } else if (!isValidUrl(webhookUrl)) {
      errors.webhookUrl = "Webhook URL must be valid.";
    }
  }

  if (values.callbackUrl.trim() && !isValidUrl(values.callbackUrl.trim())) {
    errors.callbackUrl = "Callback URL must be valid.";
  }

  if (values.maxRunsEnabled) {
    const maxRuns = values.maxRuns.trim();
    if (!maxRuns) {
      errors.maxRuns = "Max runs is required when enabled.";
    } else if (!/^\d+$/.test(maxRuns) || Number(maxRuns) < 1) {
      errors.maxRuns = "Max runs must be an integer of at least 1.";
    }
  }

  if (values.expiresAtEnabled) {
    if (!values.expiresAt.trim()) {
      errors.expiresAt = "Expiry date is required when enabled.";
    } else {
      const expiresAt = new Date(values.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) {
        errors.expiresAt = "Expiry date must be valid.";
      } else if (expiresAt.getTime() <= Date.now()) {
        errors.expiresAt = "Expiry date must be in the future.";
      }
    }
  }

  const metadata = parseMetadataText(values.metadataText);
  if (metadata.error) {
    errors.metadata = metadata.error;
  }

  return errors;
}

export function hasBlockingErrors(errors: TaskFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

export function buildCreateTaskInput(values: TaskFormValues): TaskCreateInput {
  const parsedMetadata = parseMetadataText(values.metadataText);
  const input: TaskCreateInput = {
    name: values.name.trim(),
    description: values.description.trim() || undefined,
    handler: getTaskHandler(values),
    schedule: values.schedule,
    timezone: values.timezone,
    retryAttempts: values.retryAttempts,
    retryBackoff: values.retryBackoff,
    retryDelay: values.retryDelay,
    timeout: values.timeout,
    active: values.active,
    callbackUrl: values.callbackUrl.trim() || undefined,
  };

  if (parsedMetadata.value) {
    input.metadata = parsedMetadata.value;
  }

  if (values.maxRunsEnabled && values.maxRuns.trim()) {
    input.maxRuns = Number(values.maxRuns.trim());
  }

  if (values.expiresAtEnabled && values.expiresAt.trim()) {
    input.expiresAt = new Date(values.expiresAt).toISOString();
  }

  return input;
}

export function buildPatchTaskInput(values: TaskFormValues): TaskPatchInput {
  const parsedMetadata = parseMetadataText(values.metadataText);

  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    handler: getTaskHandler(values),
    schedule: values.schedule,
    timezone: values.timezone,
    retryAttempts: values.retryAttempts,
    retryBackoff: values.retryBackoff,
    retryDelay: values.retryDelay,
    timeout: values.timeout,
    active: values.active,
    callbackUrl: values.callbackUrl.trim() || null,
    metadata: parsedMetadata.value,
    maxRuns: values.maxRunsEnabled && values.maxRuns.trim() ? Number(values.maxRuns.trim()) : null,
    expiresAt: values.expiresAtEnabled && values.expiresAt.trim() ? new Date(values.expiresAt).toISOString() : null,
  };
}

export function getAdvancedSummary(values: TaskFormValues): string[] {
  const summary: string[] = [];

  if (!values.active) {
    summary.push("Paused on creation");
  }

  if (values.retryAttempts !== 1) {
    summary.push(`${values.retryAttempts} retry attempts`);
  }

  if (values.retryBackoff !== "linear") {
    summary.push("Exponential backoff");
  }

  if (values.retryDelay !== "1s") {
    summary.push(`Retry delay ${values.retryDelay}`);
  }

  if (values.timeout !== "30s") {
    summary.push(`Timeout ${values.timeout}`);
  }

  if (values.callbackUrl.trim()) {
    summary.push("Completion callback");
  }

  const metadata = parseMetadataText(values.metadataText);
  if (metadata.value) {
    summary.push(`${Object.keys(metadata.value).length} metadata field${Object.keys(metadata.value).length === 1 ? "" : "s"}`);
  }

  if (values.maxRunsEnabled && values.maxRuns.trim()) {
    summary.push(`Max ${values.maxRuns.trim()} runs`);
  }

  if (values.expiresAtEnabled && values.expiresAt.trim()) {
    summary.push(`Expires ${new Date(values.expiresAt).toLocaleDateString()}`);
  }

  return summary;
}

export function formatDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function metadataEntriesFromMetadata(metadata: Record<string, unknown> | null): MetadataEntry[] {
  if (!metadata) {
    return [{ key: "", value: "" }];
  }

  const entries = Object.entries(metadata).map(([key, value]) => ({
    key,
    value: String(value),
  }));

  return entries.length > 0 ? entries : [{ key: "", value: "" }];
}

function stringifyMetadata(metadata: Record<string, unknown> | null): string {
  return metadata ? JSON.stringify(metadata, null, 2) : "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
