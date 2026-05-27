import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { RunRecord, TaskRecord, TimelineEntryRecord } from "@cronlet/shared";
import { ArrowLeft } from "@phosphor-icons/react";
import { getRun, getRunTimeline, listTasksWithFilters } from "@/lib/api";
import {
  formatCreatedBy,
  formatDateTime,
  formatDuration,
  formatRelativeTime,
  formatTaskSource,
  getTaskDestination,
  getTaskIntentSummary,
  getTaskNextActionSummary,
  getTaskPatternLabel,
  summarizeMetadata,
} from "@/lib/format";
import { Skeleton } from "@/components/Skeleton";
import { PageHeader, SectionCard, StatusBadge } from "@/components/operator-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface RunDetailPageProps {
  runId: string;
}

const TRACE_ACTION_LABELS: Record<string, string> = {
  "task.triggered": "Task triggered",
  "run.queued": "Run queued",
  "run.running": "Delivery started",
  "run.success": "Delivery succeeded",
  "run.failure": "Delivery failed",
  "run.timeout": "Delivery timed out",
  "run.cancelled": "Run cancelled",
  "run.dead_lettered": "Run dead-lettered",
  "run.retry_wait": "Retry scheduled",
  "run.retry_window_expired": "Retry window expired",
  "run.terminal_client_error": "Terminal client error",
  "run.replayed": "Replay created",
  "dispatch.queued": "Dispatch queued",
  "dispatch.leased": "Worker leased dispatch",
  "dispatch.running": "Dispatch running",
  "dispatch.succeeded": "Callback delivered",
  "dispatch.failed": "Dispatch failed",
  "dispatch.retry_wait": "Dispatch waiting to retry",
  "dispatch.cancelled": "Dispatch cancelled",
  "dispatch.dead_lettered": "Dispatch dead-lettered",
  "dispatch.policy_blocked": "Blocked by outbound policy",
  "dispatch.circuit_opened": "Destination circuit opened",
  "dispatch.circuit_half_open": "Destination probe allowed",
  "dispatch.circuit_closed": "Destination circuit closed",
};

function getRunStatus(run: RunRecord): {
  label: string;
  variant: "success" | "error" | "warning" | "secondary";
} {
  switch (run.status) {
    case "success":
      return { label: "Succeeded", variant: "success" };
    case "running":
    case "queued":
    case "leased":
    case "retry_wait":
      return { label: "In flight", variant: "warning" };
    case "cancelled":
      return { label: "Cancelled", variant: "secondary" };
    case "failure":
    case "timeout":
    case "dead_lettered":
    case "terminal_client_error":
    case "retry_window_expired":
      return { label: "Needs attention", variant: "error" };
  }
}

function describeTraceEntry(entry: TimelineEntryRecord): string {
  return TRACE_ACTION_LABELS[entry.action] ?? entry.action.replaceAll(".", " ");
}

function describeTraceReason(entry: TimelineEntryRecord): string | null {
  if (entry.reason) {
    return entry.reason.replaceAll("_", " ");
  }

  if (entry.metadata?.callbackUrl && typeof entry.metadata.callbackUrl === "string") {
    return entry.metadata.callbackUrl;
  }

  if (entry.metadata?.replayOfRunId && typeof entry.metadata.replayOfRunId === "string") {
    return `Replay of ${entry.metadata.replayOfRunId}`;
  }

  return null;
}

function getTraceEntries(entries: TimelineEntryRecord[]): TimelineEntryRecord[] {
  return entries.filter((entry) => {
    if (entry.action in TRACE_ACTION_LABELS) return true;
    return entry.action.startsWith("run.") || entry.action.startsWith("dispatch.") || entry.action.startsWith("task.");
  });
}

function getRunNextAction(run: RunRecord, task?: TaskRecord): string {
  switch (run.status) {
    case "success":
      return task?.callbackUrl
        ? "Delivery completed. Cronlet can now call back into the agent or product flow."
        : "Delivery completed successfully.";
    case "running":
    case "queued":
    case "leased":
      return "This delivery attempt is still in flight.";
    case "retry_wait":
      return "Cronlet is holding this run for another delivery attempt.";
    case "dead_lettered":
      return "No more automatic attempts will start unless you replay this run.";
    case "terminal_client_error":
      return "The destination returned a terminal client error, so retries stopped.";
    case "retry_window_expired":
      return "The retry window expired before delivery could succeed.";
    case "failure":
    case "timeout":
      return "This attempt failed. Check the trace and error details to decide whether to replay.";
    case "cancelled":
      return "This run was cancelled and will not continue.";
  }
}

export function RunDetailPage({ runId }: RunDetailPageProps) {
  const runQuery = useQuery({
    queryKey: ["run", runId],
    queryFn: () => getRun(runId),
    refetchInterval: (query) => {
      const run = query.state.data;
      return run?.status === "running" || run?.status === "queued" || run?.status === "leased" ? 2000 : false;
    },
  });

  const tasksQuery = useQuery({
    queryKey: ["run-detail", "tasks"],
    queryFn: () => listTasksWithFilters({ limit: 500 }),
  });

  const timelineQuery = useQuery({
    queryKey: ["run-timeline", runId],
    queryFn: () => getRunTimeline(runId, 40),
    refetchInterval: 5000,
  });

  const run = runQuery.data;
  const task = useMemo(
    () => (run ? tasksQuery.data?.find((candidate) => candidate.id === run.taskId) : undefined),
    [run, tasksQuery.data]
  );

  const traceEntries = useMemo(() => getTraceEntries(timelineQuery.data ?? []).slice(0, 12), [timelineQuery.data]);

  if (runQuery.isLoading) {
    return <RunDetailSkeleton />;
  }

  if (runQuery.error || !run) {
    return (
      <div className="space-y-4">
        <Link to="/runs" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} className="mr-1" />
          Back to Runs
        </Link>
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            {runQuery.error instanceof Error ? runQuery.error.message : "Failed to load this run."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const runStatus = getRunStatus(run);

  return (
    <div className="space-y-6">
      <Link to="/runs" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} className="mr-1" />
        Back to Runs
      </Link>

      <PageHeader
        title={task?.name ?? run.taskId}
        description={task ? getTaskIntentSummary(task) : "Scheduled delivery attempt details."}
        actions={
          <>
            <StatusBadge label={runStatus.label} variant={runStatus.variant} />
            {task ? (
              <Button variant="outline" asChild>
                <Link to="/tasks/$taskId" params={{ taskId: task.id }}>
                  View task
                </Link>
              </Button>
            ) : null}
            <Button asChild>
              <Link to="/runs">All runs</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Run status" value={run.status.replaceAll("_", " ")} detail={run.trigger} />
        <StatCard label="Attempt" value={String(run.attempt)} detail={run.scheduledAt ? formatDateTime(run.scheduledAt) : "No scheduled time recorded"} />
        <StatCard label="Duration" value={formatDuration(run.durationMs)} detail={run.startedAt ? `Started ${formatRelativeTime(run.startedAt)}` : "Not started yet"} />
        <StatCard label="What happens next" value={task?.callbackUrl ? "Callback" : task ? "Task-managed" : "Manual"} detail={getRunNextAction(run, task)} />
      </div>

      <SectionCard
        title="Provenance"
        description="Who created the parent task, where it came from, and what this delivery was trying to reach."
      >
        <div className="grid gap-3 px-4 py-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCell label="Created by" value={task ? formatCreatedBy(task.createdBy) : "Unknown"} detail={task?.createdBy?.type === "agent" ? "Agent-created task" : task?.createdBy?.type === "user" ? "User-created task" : "No actor metadata"} />
          <InfoCell label="Origin" value={task ? formatTaskSource(task.source) : "Unknown"} detail={task?.createdBy?.id ?? "No actor ID"} mono={Boolean(task?.createdBy?.id)} />
          <InfoCell label="External ID" value={task?.externalId ?? "Not set"} detail={task?.externalId ? "Linked to product-owned identity" : "No external identity attached"} mono={Boolean(task?.externalId)} />
          <InfoCell label="Destination" value={task ? getTaskDestination(task) ?? "Internal delivery" : "Unknown"} detail={task?.callbackUrl ?? "No callback URL"} mono={Boolean(task && (getTaskDestination(task) || task.callbackUrl))} />
          <InfoCell label="Pattern" value={task ? getTaskPatternLabel(task) : "Unknown"} detail={task?.nextRunAt ? `Next wake-up ${formatRelativeTime(task.nextRunAt)}` : "No next wake-up scheduled"} />
          <InfoCell label="Task state" value={task ? (task.active ? "Active" : "Paused") : "Unknown"} detail={task ? getTaskNextActionSummary(task) : "Task no longer visible in this organization"} />
          <InfoCell label="Trigger" value={run.trigger} detail={run.scheduledAt ? formatDateTime(run.scheduledAt) : "Triggered without a scheduled timestamp"} />
          <InfoCell label="Metadata" value={task ? summarizeMetadata(task.metadata) : "Unknown"} detail={task?.metadata ? `${Object.keys(task.metadata).length} field${Object.keys(task.metadata).length === 1 ? "" : "s"}` : "No metadata attached"} />
        </div>
      </SectionCard>

      <SectionCard
        title="What happens next"
        description="Current delivery status, follow-through behavior, and what Cronlet will or will not do after this attempt."
      >
        <div className="grid gap-4 px-4 py-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="rounded-lg border border-border/40 bg-background/30 p-4">
              <p className="text-sm font-medium text-foreground">{getRunNextAction(run, task)}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {task ? getTaskNextActionSummary(task) : "No parent task context is available for follow-through details."}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoCell label="Created" value={formatDateTime(run.createdAt)} detail={formatRelativeTime(run.createdAt)} />
              <InfoCell label="Completed" value={run.completedAt ? formatDateTime(run.completedAt) : "Not completed"} detail={run.completedAt ? formatRelativeTime(run.completedAt) : "Still in progress"} />
            </div>
          </div>
          <div className="rounded-lg border border-border/40 bg-background/30 p-4">
            <p className="text-sm font-medium text-foreground">Constraints</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>{task?.retryPolicy.maxAttempts ?? "Unknown"} maximum delivery attempts</li>
              <li>{task?.retryPolicy.retryWindow ?? "Unknown"} retry window</li>
              <li>{task?.timeout ?? "Unknown"} timeout</li>
              <li>{task?.callbackUrl ? "Callback URL configured after delivery" : "No callback URL configured"}</li>
            </ul>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Wake-up trace"
        description="The linked sequence from queued run to delivery attempt, callback, replay, or stop condition."
      >
        <div className="divide-y divide-border/30">
          {timelineQuery.isLoading ? (
            <div className="space-y-3 px-4 py-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : traceEntries.length > 0 ? (
            traceEntries.map((entry) => (
              <div key={entry.id} className="grid gap-2 px-4 py-3 md:grid-cols-[180px_minmax(0,1fr)]">
                <div className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{describeTraceEntry(entry)}</p>
                  {describeTraceReason(entry) ? <p className="text-xs text-muted-foreground">{describeTraceReason(entry)}</p> : null}
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No trace events yet.
            </div>
          )}
        </div>
      </SectionCard>

      {run.errorMessage ? (
        <SectionCard title="Error" description="The most relevant failure message captured for this delivery attempt.">
          <div className="px-4 py-4">
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-destructive/20 bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-300">
              {run.errorMessage}
            </pre>
          </div>
        </SectionCard>
      ) : null}

      {run.output ? (
        <SectionCard title="Output" description="Structured result payload captured from the delivery attempt.">
          <div className="px-4 py-4">
            <pre className="max-h-[360px] overflow-auto rounded-lg border border-border/40 bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-300">
              {JSON.stringify(run.output, null, 2)}
            </pre>
          </div>
        </SectionCard>
      ) : null}

      {run.logs ? (
        <SectionCard title="Logs" description="Raw logs captured during this delivery attempt.">
          <div className="px-4 py-4">
            <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg border border-border/40 bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-300">
              {run.logs}
            </pre>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

function RunDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-28" />
      <div className="space-y-2">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-5 w-[520px]" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card variant="flat">
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-xl font-semibold tracking-tight text-foreground capitalize">{value}</p>
        {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
      </CardContent>
    </Card>
  );
}

function InfoCell({
  label,
  value,
  detail,
  mono = false,
}: {
  label: string;
  value: string;
  detail?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/30 px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={mono ? "mt-2 font-mono text-sm text-foreground" : "mt-2 text-sm text-foreground"}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
