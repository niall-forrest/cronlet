import type {
  CreatedBy,
  CircuitBreakerStatus,
  HandlerConfig,
  RunRecord,
  RunStatus,
  ScheduleConfig,
  TaskSource,
  TaskRecord,
} from "@cronlet/shared";

export function formatDateTime(input: string | null | undefined): string {
  if (!input) return "—";
  return new Date(input).toLocaleString();
}

export function formatRelativeTime(input: string | null | undefined): string {
  if (!input) return "—";

  const diffMs = new Date(input).getTime() - Date.now();
  const future = diffMs > 0;
  const absoluteMs = Math.abs(diffMs);
  const minutes = Math.floor(absoluteMs / 60000);
  const hours = Math.floor(absoluteMs / 3600000);
  const days = Math.floor(absoluteMs / 86400000);

  if (minutes < 1) return future ? "in a moment" : "just now";
  if (minutes < 60) return future ? `in ${minutes}m` : `${minutes}m ago`;
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  if (days < 7) return future ? `in ${days}d` : `${days}d ago`;
  return formatDateTime(input);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function formatSchedule(config: ScheduleConfig): string {
  switch (config.type) {
    case "every":
      return `Every ${config.interval}`;
    case "daily":
      return `Daily ${config.times.join(", ")}`;
    case "weekly":
      return `Weekly ${config.days.join(", ")} ${config.time}`;
    case "monthly":
      return `Monthly ${String(config.day)} ${config.time}`;
    case "once":
      return `Once ${formatDateTime(config.at)}`;
    case "cron":
      return config.expression;
  }
}

export function formatHandlerSummary(handler: HandlerConfig): string {
  switch (handler.type) {
    case "tools":
      return `${handler.steps.length} tool step${handler.steps.length === 1 ? "" : "s"}`;
    case "code":
      return `${handler.runtime} handler`;
    case "webhook":
      return `${handler.method ?? "POST"} ${handler.url}`;
  }
}

export function getTaskDestination(task: TaskRecord): string | null {
  if (task.handlerConfig.type !== "webhook") return null;
  try {
    return new URL(task.handlerConfig.url).host;
  } catch {
    return task.handlerConfig.url;
  }
}

export function getRunDestination(task: TaskRecord | undefined): string {
  return task ? getTaskDestination(task) ?? "internal" : "internal";
}

export function getRunStatusTone(
  status: RunStatus
): "success" | "error" | "warning" | "secondary" {
  switch (status) {
    case "success":
      return "success";
    case "failure":
    case "timeout":
    case "dead_lettered":
    case "terminal_client_error":
    case "retry_window_expired":
      return "error";
    case "running":
    case "leased":
    case "retry_wait":
      return "warning";
    case "queued":
    case "cancelled":
      return "secondary";
  }
}

export function getTaskStatusTone(
  task: TaskRecord,
  latestRun?: RunRecord
): "success" | "error" | "warning" | "secondary" {
  if (!task.active) return "secondary";
  if (!latestRun) return "warning";
  return getRunStatusTone(latestRun.status);
}

export function summarizeMetadata(metadata: Record<string, unknown> | null | undefined): string {
  if (!metadata) return "No metadata";
  const keys = Object.keys(metadata);
  if (keys.length === 0) return "No metadata";
  return keys.slice(0, 3).join(", ") + (keys.length > 3 ? ` +${keys.length - 3}` : "");
}

export function formatCircuitState(state: CircuitBreakerStatus): string {
  return state.replaceAll("_", " ");
}

export function formatPlanTier(tier: string): string {
  const normalized = tier.trim().toLowerCase();
  if (normalized === "free") {
    return "Free Tier";
  }

  return tier
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatTaskSource(source: TaskSource): string {
  switch (source) {
    case "dashboard":
      return "Dashboard";
    case "mcp":
      return "MCP";
    case "sdk":
      return "SDK";
  }
}

export function formatCreatedBy(createdBy: CreatedBy | null | undefined): string {
  if (!createdBy) return "Unknown";
  if (createdBy.type === "agent") {
    return createdBy.name?.trim() || createdBy.id;
  }
  return createdBy.name?.trim() || "User";
}

export function getCreatedByTypeLabel(createdBy: CreatedBy | null | undefined): string {
  if (!createdBy) return "unknown";
  return createdBy.type;
}

export function getActorSummary(task: TaskRecord): {
  actorType: "agent" | "user" | "unknown";
  actorName: string;
  origin: string;
} {
  return {
    actorType: task.createdBy?.type ?? "unknown",
    actorName: formatCreatedBy(task.createdBy),
    origin: formatTaskSource(task.source),
  };
}

export function getTaskIntentSummary(task: TaskRecord): string {
  const metadata = task.metadata;
  if (metadata) {
    const candidate = [
      metadata.purpose,
      metadata.reason,
      metadata.objective,
      metadata.workflow,
      metadata.scheduleType,
      metadata.emailStepKey,
      metadata.prompt,
    ].find((value) => typeof value === "string" && value.trim().length > 0);

    if (typeof candidate === "string") {
      return candidate.trim();
    }
  }

  if (task.externalId) {
    return `Tracking ${task.externalId}`;
  }

  if (task.handlerConfig.type === "webhook") {
    return "Delivers a scheduled webhook";
  }

  if (task.handlerConfig.type === "tools") {
    return `Runs ${task.handlerConfig.steps.length} tool step${task.handlerConfig.steps.length === 1 ? "" : "s"}`;
  }

  return "Scheduled work created through Cronlet";
}

export function getTaskPatternLabel(task: TaskRecord): string {
  if (task.scheduleType === "once") {
    return "One-off";
  }

  if (task.scheduleType === "every") {
    const interval = task.scheduleConfig.type === "every" ? task.scheduleConfig.interval : null;
    if (interval && /^(5m|10m|15m|30m|1h)$/.test(interval)) {
      return "Heartbeat-like";
    }
  }

  return "Recurring";
}

export function getTaskLifecycleSummary(task: TaskRecord): string {
  const parts: string[] = [];

  if (!task.active) {
    parts.push("Paused");
  }

  if (task.maxRuns !== null) {
    parts.push(`${task.runCount}/${task.maxRuns} runs used`);
  }

  if (task.expiresAt) {
    parts.push(`Expires ${formatRelativeTime(task.expiresAt)}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "No lifecycle limits";
}

export function getTaskNextActionSummary(task: TaskRecord): string {
  if (!task.active) {
    return "No new attempts will start until this task is resumed.";
  }

  if (task.scheduleType === "once") {
    if (task.nextRunAt) {
      return task.callbackUrl
        ? `Will deliver once at ${formatDateTime(task.nextRunAt)} and then call back to the configured URL.`
        : `Will deliver once at ${formatDateTime(task.nextRunAt)}.`;
    }
    return "This one-off task has no further scheduled wake-up.";
  }

  if (task.nextRunAt) {
    return task.callbackUrl
      ? `Next scheduled wake-up is ${formatRelativeTime(task.nextRunAt)}, then Cronlet will call back with the result.`
      : `Next scheduled wake-up is ${formatRelativeTime(task.nextRunAt)}.`;
  }

  if (task.callbackUrl) {
    return "This task reports results to the configured callback URL.";
  }

  return "No future wake-up is currently scheduled.";
}
