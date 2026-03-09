import type { RunRecord, ScheduleConfig, TaskRecord } from "@cronlet/shared";

export interface TaskSummaryOptions {
  windowHours?: number;
  limit?: number;
}

export interface SummarizeAllOptions extends TaskSummaryOptions {
  taskIds?: string[];
}

export type TaskSummaryStatus =
  | "healthy"
  | "needs_attention"
  | "failing"
  | "degrading"
  | "idle"
  | "unknown";

export interface TaskSummary {
  taskId: string;
  taskName: string;
  summaryText: string;
  status: TaskSummaryStatus;
  scheduleText: string | null;
  timeframe: {
    windowHours: number;
    runLimit: number;
  };
  counts: {
    total: number;
    success: number;
    failure: number;
    timeout: number;
    running: number;
    queued: number;
  };
  successRate: number | null;
  averageDurationMs: number | null;
  latestRunAt: string | null;
  latestSuccessAt: string | null;
  latestFailureAt: string | null;
  consecutiveFailures: number;
  lastFailure: {
    runId: string;
    occurredAt: string | null;
    errorMessage: string | null;
  } | null;
  durationTrend: {
    direction: "up" | "down" | "flat" | "unknown";
    fromAvgMs: number | null;
    toAvgMs: number | null;
  };
  nextRunAt: string | null;
}

export interface TaskSummaryOverviewItem {
  taskId: string;
  taskName: string;
  status: TaskSummaryStatus;
  summaryText: string;
  successRate: number | null;
  consecutiveFailures: number;
  nextRunAt: string | null;
  latestRunAt: string | null;
}

export interface TaskSummaryOverview {
  summaryText: string;
  totals: {
    taskCount: number;
    healthy: number;
    needsAttention: number;
    failing: number;
    degrading: number;
    idle: number;
    unknown: number;
  };
  items: TaskSummaryOverviewItem[];
}

export const DEFAULT_TASK_SUMMARY_OPTIONS = {
  windowHours: 24,
  limit: 100,
} as const;

const FAILURE_STREAK_THRESHOLD = 3;
const HEALTHY_SUCCESS_RATE_THRESHOLD = 0.95;
const DEGRADING_INCREASE_THRESHOLD = 0.25;
const MIN_TREND_SAMPLES_PER_HALF = 3;

const STATUS_SEVERITY: Record<TaskSummaryStatus, number> = {
  failing: 0,
  needs_attention: 1,
  degrading: 2,
  unknown: 3,
  idle: 4,
  healthy: 5,
};

export function normalizeTaskSummaryOptions(options: TaskSummaryOptions = {}): Required<TaskSummaryOptions> {
  return {
    windowHours: options.windowHours ?? DEFAULT_TASK_SUMMARY_OPTIONS.windowHours,
    limit: options.limit ?? DEFAULT_TASK_SUMMARY_OPTIONS.limit,
  };
}

export function summarizeTask(
  task: TaskRecord,
  runs: RunRecord[],
  options: Required<TaskSummaryOptions>,
  now = new Date()
): TaskSummary {
  const scopedRuns = filterRunsByWindow(runs, options.windowHours, now);
  const counts = countRuns(scopedRuns);
  const terminalCount = counts.success + counts.failure + counts.timeout;
  const successRate = terminalCount > 0 ? counts.success / terminalCount : null;
  const latestRun = scopedRuns[0] ?? null;
  const latestSuccess = scopedRuns.find((run) => run.status === "success") ?? null;
  const latestFailureRun = scopedRuns.find((run) => isFailureStatus(run.status)) ?? null;
  const consecutiveFailures = countConsecutiveFailures(scopedRuns);
  const averageDurationMs = average(
    scopedRuns.map((run) => run.durationMs).filter((value): value is number => value !== null)
  );
  const durationTrend = computeDurationTrend(scopedRuns);
  const scheduleText = formatScheduleText(task.scheduleConfig);
  const status = classifyTaskStatus({
    task,
    counts,
    successRate,
    latestRun,
    consecutiveFailures,
    durationTrend,
  });

  const summary: TaskSummary = {
    taskId: task.id,
    taskName: task.name,
    summaryText: "",
    status,
    scheduleText,
    timeframe: {
      windowHours: options.windowHours,
      runLimit: options.limit,
    },
    counts,
    successRate,
    averageDurationMs,
    latestRunAt: latestRun?.createdAt ?? null,
    latestSuccessAt: latestSuccess?.createdAt ?? null,
    latestFailureAt: latestFailureRun?.createdAt ?? null,
    consecutiveFailures,
    lastFailure: latestFailureRun
      ? {
          runId: latestFailureRun.id,
          occurredAt: latestFailureRun.createdAt,
          errorMessage: latestFailureRun.errorMessage,
        }
      : null,
    durationTrend,
    nextRunAt: task.nextRunAt,
  };

  summary.summaryText = buildTaskSummaryText(summary, task, now);
  return summary;
}

export function summarizeTasksOverview(
  tasks: TaskRecord[],
  runsByTaskId: Map<string, RunRecord[]>,
  options: Required<TaskSummaryOptions>,
  now = new Date()
): TaskSummaryOverview {
  const summaries = tasks.map((task) => summarizeTask(task, runsByTaskId.get(task.id) ?? [], options, now));
  const items = summaries
    .map((summary) => ({
      taskId: summary.taskId,
      taskName: summary.taskName,
      status: summary.status,
      summaryText: buildOverviewItemText(summary, now),
      successRate: summary.successRate,
      consecutiveFailures: summary.consecutiveFailures,
      nextRunAt: summary.nextRunAt,
      latestRunAt: summary.latestRunAt,
    }))
    .sort(compareOverviewItems);

  const totals = {
    taskCount: items.length,
    healthy: items.filter((item) => item.status === "healthy").length,
    needsAttention: items.filter((item) => item.status === "needs_attention").length,
    failing: items.filter((item) => item.status === "failing").length,
    degrading: items.filter((item) => item.status === "degrading").length,
    idle: items.filter((item) => item.status === "idle").length,
    unknown: items.filter((item) => item.status === "unknown").length,
  };

  const attentionCount = totals.needsAttention + totals.failing + totals.degrading;
  const lines = [`${totals.taskCount} task${totals.taskCount === 1 ? "" : "s"}, ${attentionCount} need${attentionCount === 1 ? "s" : ""} attention.`];
  lines.push(...items.map((item) => item.summaryText));

  return {
    summaryText: lines.join("\n"),
    totals,
    items,
  };
}

function filterRunsByWindow(runs: RunRecord[], windowHours: number, now: Date): RunRecord[] {
  const cutoff = now.getTime() - windowHours * 60 * 60 * 1000;
  return [...runs]
    .filter((run) => new Date(run.createdAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function countRuns(runs: RunRecord[]): TaskSummary["counts"] {
  return runs.reduce<TaskSummary["counts"]>(
    (acc, run) => {
      acc.total += 1;
      if (run.status === "success") acc.success += 1;
      if (run.status === "failure") acc.failure += 1;
      if (run.status === "timeout") acc.timeout += 1;
      if (run.status === "running") acc.running += 1;
      if (run.status === "queued") acc.queued += 1;
      return acc;
    },
    {
      total: 0,
      success: 0,
      failure: 0,
      timeout: 0,
      running: 0,
      queued: 0,
    }
  );
}

function countConsecutiveFailures(runs: RunRecord[]): number {
  let count = 0;
  for (const run of runs) {
    if (!isFailureStatus(run.status)) {
      break;
    }
    count += 1;
  }
  return count;
}

function computeDurationTrend(runs: RunRecord[]): TaskSummary["durationTrend"] {
  const durationRuns = [...runs]
    .filter((run) => run.durationMs !== null)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (durationRuns.length < MIN_TREND_SAMPLES_PER_HALF * 2) {
    return {
      direction: "unknown",
      fromAvgMs: null,
      toAvgMs: null,
    };
  }

  const midpoint = Math.floor(durationRuns.length / 2);
  const firstHalf = durationRuns.slice(0, midpoint).map((run) => run.durationMs as number);
  const secondHalf = durationRuns.slice(midpoint).map((run) => run.durationMs as number);

  if (firstHalf.length < MIN_TREND_SAMPLES_PER_HALF || secondHalf.length < MIN_TREND_SAMPLES_PER_HALF) {
    return {
      direction: "unknown",
      fromAvgMs: null,
      toAvgMs: null,
    };
  }

  const fromAvgMs = average(firstHalf);
  const toAvgMs = average(secondHalf);
  if (fromAvgMs === null || toAvgMs === null) {
    return {
      direction: "unknown",
      fromAvgMs: null,
      toAvgMs: null,
    };
  }

  const delta = toAvgMs - fromAvgMs;
  const percentChange = fromAvgMs === 0 ? 0 : delta / fromAvgMs;

  if (Math.abs(percentChange) < 0.1) {
    return { direction: "flat", fromAvgMs, toAvgMs };
  }

  return {
    direction: percentChange >= DEGRADING_INCREASE_THRESHOLD ? "up" : percentChange <= -0.1 ? "down" : "flat",
    fromAvgMs,
    toAvgMs,
  };
}

function classifyTaskStatus(input: {
  task: TaskRecord;
  counts: TaskSummary["counts"];
  successRate: number | null;
  latestRun: RunRecord | null;
  consecutiveFailures: number;
  durationTrend: TaskSummary["durationTrend"];
}): TaskSummaryStatus {
  const { task, counts, successRate, latestRun, consecutiveFailures, durationTrend } = input;
  const issueCount = counts.failure + counts.timeout;

  if (counts.total === 0) {
    return "idle";
  }

  if (!task.active && issueCount === 0 && consecutiveFailures === 0) {
    return "idle";
  }

  if (latestRun && isFailureStatus(latestRun.status) && consecutiveFailures >= FAILURE_STREAK_THRESHOLD) {
    return "failing";
  }

  const isDegrading = durationTrend.direction === "up";

  if (
    successRate !== null &&
    successRate >= HEALTHY_SUCCESS_RATE_THRESHOLD &&
    latestRun?.status === "success" &&
    consecutiveFailures === 0 &&
    !isDegrading
  ) {
    return "healthy";
  }

  if (isDegrading && issueCount === 0) {
    return "degrading";
  }

  if (issueCount > 0) {
    return "needs_attention";
  }

  if (successRate !== null && successRate >= HEALTHY_SUCCESS_RATE_THRESHOLD) {
    return "healthy";
  }

  if (latestRun?.status === "running" || latestRun?.status === "queued") {
    return "unknown";
  }

  return "unknown";
}

function buildTaskSummaryText(summary: TaskSummary, task: TaskRecord, now: Date): string {
  const lines = [`Task \"${task.name}\" (${task.id}) is ${summary.status.replace(/_/g, " ")}${task.active ? "." : " and paused."}`];

  const scheduleBits: string[] = [];
  if (summary.scheduleText) {
    scheduleBits.push(`Schedule: ${summary.scheduleText}.`);
  }
  if (summary.nextRunAt) {
    scheduleBits.push(`Next run: ${summary.nextRunAt}.`);
  }
  if (scheduleBits.length > 0) {
    lines.push(scheduleBits.join(" "));
  }

  lines.push(
    `Last ${summary.timeframe.windowHours}h / ${summary.timeframe.runLimit}-run window: ${summary.counts.total} runs, ${summary.counts.success} succeeded, ${summary.counts.failure} failed, ${summary.counts.timeout} timed out.`
  );

  const durationBits: string[] = [];
  if (summary.averageDurationMs !== null) {
    durationBits.push(`Average duration: ${Math.round(summary.averageDurationMs)}ms.`);
  }
  if (summary.durationTrend.direction !== "unknown" && summary.durationTrend.direction !== "flat") {
    durationBits.push(
      `Duration trend: ${summary.durationTrend.direction} from ${Math.round(summary.durationTrend.fromAvgMs ?? 0)}ms to ${Math.round(summary.durationTrend.toAvgMs ?? 0)}ms.`
    );
  }
  if (durationBits.length > 0) {
    lines.push(durationBits.join(" "));
  }

  if (summary.status === "failing") {
    lines.push(`Current issue: ${summary.consecutiveFailures} consecutive failures.`);
  }

  if (summary.lastFailure) {
    const failureLabel = summary.lastFailure.errorMessage ?? inferFailureLabel(summary);
    lines.push(`Last failure: ${relativeTime(summary.lastFailure.occurredAt, now)}${failureLabel ? ` — ${failureLabel}.` : "."}`);
  }

  return lines.join("\n");
}

function buildOverviewItemText(summary: TaskSummary, now: Date): string {
  const icon =
    summary.status === "healthy"
      ? "✓"
      : summary.status === "idle"
        ? "•"
        : summary.status === "degrading"
          ? "↗"
          : "⚠";

  if (summary.status === "failing") {
    const failureLabel = summary.lastFailure?.errorMessage ?? inferFailureLabel(summary);
    return `${icon} \"${summary.taskName}\" — ${summary.consecutiveFailures} consecutive failures${failureLabel ? `, last error: ${failureLabel}` : ""}`;
  }

  if (summary.status === "needs_attention") {
    return `${icon} \"${summary.taskName}\" — needs attention, ${formatPercent(summary.successRate)} success, last failure ${relativeTime(summary.latestFailureAt, now)}`;
  }

  if (summary.status === "degrading") {
    return `${icon} \"${summary.taskName}\" — degrading, duration up from ${Math.round(summary.durationTrend.fromAvgMs ?? 0)}ms to ${Math.round(summary.durationTrend.toAvgMs ?? 0)}ms`;
  }

  if (summary.status === "idle") {
    const nextRunText = summary.nextRunAt ? `, next run ${relativeTime(summary.nextRunAt, now)}` : "";
    const latestRunText = summary.latestRunAt ? `, last run ${relativeTime(summary.latestRunAt, now)}` : "";
    return `${icon} \"${summary.taskName}\" — idle${latestRunText}${nextRunText}`;
  }

  return `${icon} \"${summary.taskName}\" — healthy, ${formatPercent(summary.successRate)} success${summary.nextRunAt ? `, next run ${relativeTime(summary.nextRunAt, now)}` : ""}`;
}

function compareOverviewItems(a: TaskSummaryOverviewItem, b: TaskSummaryOverviewItem): number {
  const severity = STATUS_SEVERITY[a.status] - STATUS_SEVERITY[b.status];
  if (severity !== 0) {
    return severity;
  }

  const aTime = a.latestRunAt ? new Date(a.latestRunAt).getTime() : 0;
  const bTime = b.latestRunAt ? new Date(b.latestRunAt).getTime() : 0;
  return bTime - aTime;
}

function inferFailureLabel(summary: TaskSummary): string | null {
  if (summary.counts.timeout > 0 && summary.counts.failure === 0) {
    return "timeout";
  }
  return null;
}

function formatScheduleText(config: ScheduleConfig): string | null {
  switch (config.type) {
    case "every":
      return `every ${humanizeDuration(config.interval)}`;
    case "daily":
      return `daily at ${config.times.join(", ")}`;
    case "weekly":
      return `${config.days.join(", ")} at ${config.time}`;
    case "monthly":
      return `monthly on ${config.day} at ${config.time}`;
    case "once":
      return `once at ${config.at}`;
    case "cron":
      return `cron ${config.expression}`;
    default:
      return null;
  }
}

function humanizeDuration(interval: string): string {
  const match = interval.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match || !match[1] || !match[2]) {
    return interval;
  }

  const value = Number.parseInt(match[1], 10);
  const unitMap: Record<string, string> = {
    ms: value === 1 ? "millisecond" : "milliseconds",
    s: value === 1 ? "second" : "seconds",
    m: value === 1 ? "minute" : "minutes",
    h: value === 1 ? "hour" : "hours",
    d: value === 1 ? "day" : "days",
  };

  return `${value} ${unitMap[match[2]]}`;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isFailureStatus(status: RunRecord["status"]): boolean {
  return status === "failure" || status === "timeout";
}

function relativeTime(value: string | null, now: Date): string {
  if (!value) {
    return "unknown";
  }

  const target = new Date(value);
  const diffMs = target.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  let amount: number;
  let unit: string;

  if (absMs < hour) {
    amount = Math.max(1, Math.round(absMs / minute));
    unit = amount === 1 ? "minute" : "minutes";
  } else if (absMs < day) {
    amount = Math.max(1, Math.round(absMs / hour));
    unit = amount === 1 ? "hour" : "hours";
  } else {
    amount = Math.max(1, Math.round(absMs / day));
    unit = amount === 1 ? "day" : "days";
  }

  return diffMs >= 0 ? `in ${amount} ${unit}` : `${amount} ${unit} ago`;
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "n/a";
  }
  return `${Math.round(value * 100)}%`;
}
