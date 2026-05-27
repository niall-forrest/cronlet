import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { HandlerConfig, RunRecord, TaskRecord, TimelineEntryRecord } from "@cronlet/shared";
import {
  ArrowLeft,
  Pause,
  PencilSimple,
  Play,
  Trash,
} from "@phosphor-icons/react";
import { deleteTask, getTask, getTaskTimeline, listRuns, patchTask, triggerTask } from "@/lib/api";
import {
  formatCreatedBy,
  formatDateTime,
  formatDuration,
  formatRelativeTime,
  formatTaskSource,
  formatSchedule,
  getTaskDestination,
  getTaskIntentSummary,
  getTaskLifecycleSummary,
  getTaskNextActionSummary,
  getTaskPatternLabel,
  summarizeMetadata,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/Skeleton";
import { PageHeader, SectionCard, StatusBadge } from "@/components/operator-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TaskDetailPageProps {
  taskId: string;
}

const TRACE_ACTION_LABELS: Record<string, string> = {
  "task.created": "Task created",
  "task.updated": "Task updated",
  "task.triggered": "Run queued",
  "task.cancelled": "Task cancelled",
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

function getTaskStatus(task: TaskRecord, lastRun?: RunRecord): {
  label: string;
  variant: "success" | "error" | "warning" | "secondary";
} {
  if (!task.active) {
    return { label: "Paused", variant: "secondary" };
  }

  if (!lastRun) {
    return { label: "Ready", variant: "warning" };
  }

  switch (lastRun.status) {
    case "success":
      return { label: "Healthy", variant: "success" };
    case "running":
    case "queued":
    case "leased":
    case "retry_wait":
      return { label: "In flight", variant: "warning" };
    case "failure":
    case "timeout":
    case "dead_lettered":
    case "retry_window_expired":
    case "terminal_client_error":
      return { label: "Needs attention", variant: "error" };
    case "cancelled":
      return { label: "Cancelled", variant: "secondary" };
  }
}

function getTraceEntries(entries: TimelineEntryRecord[]): TimelineEntryRecord[] {
  return entries.filter((entry) => {
    if (entry.action in TRACE_ACTION_LABELS) return true;
    return entry.action.startsWith("task.") || entry.action.startsWith("run.") || entry.action.startsWith("dispatch.");
  });
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

export function TaskDetailPage({ taskId }: TaskDetailPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const taskQuery = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => getTask(taskId),
  });

  const runsQuery = useQuery({
    queryKey: ["runs", taskId],
    queryFn: () => listRuns(taskId, 50),
    refetchInterval: 3000,
  });

  const timelineQuery = useQuery({
    queryKey: ["task-timeline", taskId],
    queryFn: () => getTaskTimeline(taskId, 40),
    refetchInterval: 5000,
  });

  const patchMutation = useMutation({
    mutationFn: (input: { active?: boolean }) => patchTask(taskId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      navigate({ to: "/tasks" });
    },
  });

  const triggerMutation = useMutation({
    mutationFn: () => triggerTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs", taskId] });
      queryClient.invalidateQueries({ queryKey: ["task-timeline", taskId] });
      queryClient.invalidateQueries({ queryKey: ["upcoming"] });
    },
  });

  const task = taskQuery.data;
  const runs = runsQuery.data ?? [];
  const timeline = timelineQuery.data ?? [];

  const recentRuns = useMemo(() => runs.slice(0, 6), [runs]);
  const lastRun = runs[0];
  const successCount = runs.filter((run) => run.status === "success").length;
  const successRate = runs.length > 0 ? Math.round((successCount / runs.length) * 100) : 0;
  const traceEntries = useMemo(() => getTraceEntries(timeline).slice(0, 12), [timeline]);

  if (taskQuery.isLoading) {
    return <TaskDetailSkeleton />;
  }

  if (taskQuery.error || !task) {
    return (
      <div className="space-y-4">
        <Link to="/tasks" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} className="mr-1" />
          Back to Tasks
        </Link>
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            {taskQuery.error instanceof Error ? taskQuery.error.message : "Failed to load this task."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const taskStatus = getTaskStatus(task, lastRun);
  const destination = getTaskDestination(task);
  const isRunning = lastRun?.status === "running" || lastRun?.status === "queued" || lastRun?.status === "leased";

  return (
    <div className="space-y-6">
      <Link to="/tasks" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} className="mr-1" />
        Back to Tasks
      </Link>

      <PageHeader
        title={task.name}
        description={task.description ?? getTaskIntentSummary(task)}
        actions={
          <>
            <StatusBadge label={taskStatus.label} variant={taskStatus.variant} />
            <Button
              onClick={() => triggerMutation.mutate()}
              disabled={triggerMutation.isPending || isRunning}
            >
              <Play size={14} className="mr-2" />
              {triggerMutation.isPending ? "Running..." : "Run now"}
            </Button>
            <Button
              variant="outline"
              onClick={() => patchMutation.mutate({ active: !task.active })}
              disabled={patchMutation.isPending}
            >
              {task.active ? (
                <>
                  <Pause size={14} className="mr-2" />
                  Pause
                </>
              ) : (
                <>
                  <Play size={14} className="mr-2" />
                  Resume
                </>
              )}
            </Button>
            <Button variant="outline" asChild>
              <Link to="/tasks/$taskId/edit" params={{ taskId }}>
                <PencilSimple size={14} className="mr-2" />
                Edit
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Next wake-up" value={task.nextRunAt ? formatRelativeTime(task.nextRunAt) : "—"} detail={task.nextRunAt ? formatDateTime(task.nextRunAt) : "No next run scheduled"} />
        <StatCard label="Pattern" value={getTaskPatternLabel(task)} detail={formatSchedule(task.scheduleConfig)} />
        <StatCard label="Runs" value={String(task.runCount)} detail={runs.length > 0 ? `${successRate}% recent success` : "No delivery history yet"} />
        <StatCard label="What happens next" value={task.callbackUrl ? "Callback" : destination ? "Webhook" : "Delivery"} detail={getTaskNextActionSummary(task)} />
      </div>

      <SectionCard
        title="Provenance"
        description="Who created this commitment, where it came from, and the delivery context Cronlet is holding."
      >
        <div className="grid gap-3 px-4 py-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCell label="Created by" value={formatCreatedBy(task.createdBy)} detail={task.createdBy?.type === "agent" ? "Agent-created" : task.createdBy?.type === "user" ? "User-created" : "Unknown actor"} />
          <InfoCell label="Origin" value={formatTaskSource(task.source)} detail={task.createdBy?.id ?? "No actor ID"} mono={Boolean(task.createdBy?.id)} />
          <InfoCell label="External ID" value={task.externalId ?? "Not set"} detail={task.externalId ? "Linked to product-owned identity" : "No external identity attached"} mono={Boolean(task.externalId)} />
          <InfoCell label="Destination" value={destination ?? "Internal delivery"} detail={task.callbackUrl ?? "No callback URL"} mono={Boolean(destination || task.callbackUrl)} />
          <InfoCell label="Lifecycle" value={getTaskLifecycleSummary(task)} detail={task.active ? "Accepting new attempts" : "No new attempts will start"} />
          <InfoCell label="Metadata" value={summarizeMetadata(task.metadata)} detail={task.metadata ? `${Object.keys(task.metadata).length} field${Object.keys(task.metadata).length === 1 ? "" : "s"}` : "No metadata attached"} />
          <InfoCell label="Handler" value={task.handlerType === "webhook" ? "Webhook" : task.handlerType === "tools" ? "Tools" : "Code"} detail={handlerDetail(task.handlerConfig)} />
          <InfoCell label="Schedule" value={task.scheduleType} detail={task.timezone} />
        </div>
      </SectionCard>

      <SectionCard
        title="What happens next"
        description="Best-effort view of the next wake-up, delivery target, and follow-through behavior."
      >
        <div className="grid gap-4 px-4 py-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-4">
            <div className="rounded-lg border border-border/40 bg-background/30 p-4">
              <p className="text-sm font-medium text-foreground">{getTaskIntentSummary(task)}</p>
              <p className="mt-2 text-sm text-muted-foreground">{getTaskNextActionSummary(task)}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoCell label="Next scheduled time" value={task.nextRunAt ? formatDateTime(task.nextRunAt) : "None"} detail={task.nextRunAt ? formatRelativeTime(task.nextRunAt) : "No future wake-up scheduled"} />
              <InfoCell label="Callback or destination" value={task.callbackUrl ?? destination ?? "Internal"} detail={task.callbackUrl ? "Agent callback configured" : destination ? "Webhook delivery target" : "No outbound callback"} mono={Boolean(task.callbackUrl || destination)} />
            </div>
          </div>
          <div className="rounded-lg border border-border/40 bg-background/30 p-4">
            <p className="text-sm font-medium text-foreground">Constraints</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>{task.maxRuns !== null ? `Stops after ${task.maxRuns} total run${task.maxRuns === 1 ? "" : "s"}` : "No run count limit configured"}</li>
              <li>{task.expiresAt ? `Expires ${formatRelativeTime(task.expiresAt)}` : "No expiry configured"}</li>
              <li>{task.retryPolicy.maxAttempts} delivery attempts within a {task.retryPolicy.retryWindow} retry window</li>
              <li>{task.timeout} timeout with {task.retryPolicy.backoff} backoff</li>
            </ul>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Recent runs"
        description="Most recent delivery attempts for this task."
        action={
          <Button asChild variant="ghost" size="sm">
            <Link to="/runs">Open runs</Link>
          </Button>
        }
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Status</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Attempt</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runsQuery.isLoading ? (
              <LoadingRows colSpan={5} />
            ) : recentRuns.length > 0 ? (
              recentRuns.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <RunStatusBadge run={run} />
                  </TableCell>
                  <TableCell className="capitalize">{run.trigger}</TableCell>
                  <TableCell>{run.attempt}</TableCell>
                  <TableCell>{formatDuration(run.durationMs)}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="text-sm text-foreground">{formatRelativeTime(run.createdAt)}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(run.createdAt)}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No runs yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard
        title="Wake-up trace"
        description="Linked task, run, and dispatch events showing how this commitment moved forward over time."
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
                  {describeTraceReason(entry) ? (
                    <p className="text-xs text-muted-foreground">{describeTraceReason(entry)}</p>
                  ) : null}
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

      <SectionCard
        title="Configuration"
        description="Raw handler, schedule, and metadata details."
        action={
          <Button variant="outline" asChild size="sm">
            <Link to="/tasks/$taskId/edit" params={{ taskId }}>
              Edit configuration
            </Link>
          </Button>
        }
      >
        <div className="grid gap-4 px-4 py-4 lg:grid-cols-2">
          <div className="space-y-3">
            <InfoCell label="Handler summary" value={handlerDetail(task.handlerConfig)} detail={task.handlerType} />
            <InfoCell label="Schedule summary" value={formatSchedule(task.scheduleConfig)} detail={task.timezone} />
            <InfoCell label="Callback URL" value={task.callbackUrl ?? "Not configured"} mono={Boolean(task.callbackUrl)} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Metadata</p>
            {task.metadata ? (
              <pre className="max-h-[320px] overflow-auto rounded-lg border border-border/40 bg-zinc-950 px-4 py-3 font-mono text-xs text-zinc-300">
                {JSON.stringify(task.metadata, null, 2)}
              </pre>
            ) : (
              <div className="rounded-lg border border-border/40 bg-background/30 px-4 py-3 text-sm text-muted-foreground">
                No metadata attached.
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Danger zone" description="Delete this task and its delivery history permanently.">
        <div className="flex items-center justify-between gap-4 px-4 py-4">
          <div className="text-sm text-muted-foreground">
            This cannot be undone. Historical runs and trace data will be removed.
          </div>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash size={14} className="mr-2" />
            Delete task
          </Button>
        </div>
      </SectionCard>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete task</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-medium text-foreground">{task.name}</span>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskDetailSkeleton() {
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
        <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">{value}</p>
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
      <p className={cn("mt-2 text-sm text-foreground", mono && "font-mono")}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function RunStatusBadge({ run }: { run: RunRecord }) {
  const variant =
    run.status === "success"
      ? "success"
      : ["running", "queued", "leased", "retry_wait"].includes(run.status)
        ? "warning"
        : ["cancelled"].includes(run.status)
          ? "secondary"
          : "error";

  return (
    <div className="flex items-center gap-2">
      <StatusBadge label={run.status.replaceAll("_", " ")} variant={variant} />
      {run.attempt > 1 ? <Badge variant="outline">Retry {run.attempt}</Badge> : null}
    </div>
  );
}

function LoadingRows({ colSpan }: { colSpan: number }) {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <TableRow key={index}>
          <TableCell colSpan={colSpan}>
            <Skeleton className="h-10 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function handlerDetail(config: HandlerConfig): string {
  switch (config.type) {
    case "webhook":
      return `${config.method ?? "POST"} ${config.url}`;
    case "tools":
      return `${config.steps.length} tool step${config.steps.length === 1 ? "" : "s"}`;
    case "code":
      return `${config.runtime} handler`;
  }
}
