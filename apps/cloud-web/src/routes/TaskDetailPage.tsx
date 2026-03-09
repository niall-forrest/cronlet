import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { TaskRecord, RunRecord, HandlerConfig, ScheduleConfig } from "@cronlet/shared";
import {
  getTask,
  listRuns,
  patchTask,
  deleteTask,
  triggerTask,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Play,
  Pause,
  Trash,
  PencilSimple,
  Clock,
  CheckCircle,
  XCircle,
  Timer,
  CaretRight,
  Globe,
  Code,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/Skeleton";

interface TaskDetailPageProps {
  taskId: string;
}

export function TaskDetailPage({ taskId }: TaskDetailPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null);

  const { data: task, isLoading: loadingTask, error: taskError } = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => getTask(taskId),
  });

  const { data: runs = [], isLoading: loadingRuns } = useQuery({
    queryKey: ["runs", taskId],
    queryFn: () => listRuns(taskId, 50),
    refetchInterval: 3000,
  });

  const recentRuns = useMemo(() => runs.slice(0, 5), [runs]);

  const patchMutation = useMutation({
    mutationFn: (input: { active?: boolean }) =>
      patchTask(taskId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
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
    },
  });

  if (taskError) {
    return (
      <div className="space-y-4">
        <Link to="/tasks" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} className="mr-1" />
          Back to Tasks
        </Link>
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-destructive">Failed to load task: {(taskError as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const lastRun = runs[0];
  const isRunning = lastRun?.status === "running" || lastRun?.status === "queued";
  const successCount = runs.filter((r) => r.status === "success").length;
  const successRate = runs.length > 0 ? Math.round((successCount / runs.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/tasks" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft size={16} className="mr-1" />
        Back to Tasks
      </Link>

      {loadingTask ? (
        <TaskDetailSkeleton />
      ) : task ? (
        <>
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">{task.name}</h1>
                <TaskStatusBadge task={task} lastRun={lastRun} />
              </div>
              {task.description && (
                <p className="text-muted-foreground max-w-2xl">{task.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => triggerMutation.mutate()}
                disabled={triggerMutation.isPending || isRunning}
              >
                <Play size={16} className="mr-2" />
                {triggerMutation.isPending ? "Running..." : "Run Now"}
              </Button>
              <Button variant="outline" asChild>
                <Link to="/tasks/$taskId/edit" params={{ taskId }}>
                  <PencilSimple size={16} className="mr-2" />
                  Edit
                </Link>
              </Button>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="border-border/50 bg-card/60">
              <CardContent>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Runs</p>
                <p className="text-2xl font-semibold mt-1">{task.runCount}</p>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/60">
              <CardContent>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Success Rate</p>
                <p className="text-2xl font-semibold mt-1">{successRate}%</p>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/60">
              <CardContent>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Next Run</p>
                <p className="text-lg font-medium mt-1">
                  {task.active && task.nextRunAt
                    ? formatNextRun(task.nextRunAt)
                    : task.active
                    ? "Calculating..."
                    : "Paused"}
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/60">
              <CardContent>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                <div className="mt-2">
                  <Button
                    variant={task.active ? "outline" : "default"}
                    size="sm"
                    onClick={() => patchMutation.mutate({ active: !task.active })}
                    disabled={patchMutation.isPending}
                  >
                    {task.active ? (
                      <>
                        <Pause size={14} className="mr-1" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play size={14} className="mr-1" />
                        Resume
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Configuration */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Handler */}
            <Card className="border-border/50 bg-card/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <HandlerIcon type={task.handlerType} />
                  Handler
                </CardTitle>
                <CardAction>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/tasks/$taskId/edit" params={{ taskId }}>
                      Edit
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <HandlerDisplay config={task.handlerConfig} />
              </CardContent>
            </Card>

            {/* Schedule */}
            <Card className="border-border/50 bg-card/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock size={16} />
                  Schedule
                </CardTitle>
                <CardAction>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/tasks/$taskId/edit" params={{ taskId }}>
                      Edit
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <ScheduleDisplay config={task.scheduleConfig} timezone={task.timezone} />
              </CardContent>
            </Card>
          </div>

          {/* Advanced settings */}
          <Card className="border-border/50 bg-card/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">State</p>
                  <p className="font-medium">{task.active ? "Active" : "Paused"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Timezone</p>
                  <p className="font-medium">{task.timezone}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Timeout</p>
                  <p className="font-medium">{task.timeout}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Retry Attempts</p>
                  <p className="font-medium">{task.retryAttempts}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Retry Backoff</p>
                  <p className="font-medium capitalize">{task.retryBackoff}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Retry Delay</p>
                  <p className="font-medium">{task.retryDelay}</p>
                </div>
                {task.maxRuns && (
                  <div>
                    <p className="text-muted-foreground">Max Runs</p>
                    <p className="font-medium">{task.runCount} / {task.maxRuns}</p>
                  </div>
                )}
                {task.expiresAt && (
                  <div>
                    <p className="text-muted-foreground">Expires</p>
                    <p className="font-medium">{new Date(task.expiresAt).toLocaleDateString()}</p>
                  </div>
                )}
                {task.callbackUrl && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Callback URL</p>
                    <p className="font-medium break-all">{task.callbackUrl}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <p className="text-muted-foreground">Metadata</p>
                  <p className="font-medium">
                    {task.metadata ? `${Object.keys(task.metadata).length} field${Object.keys(task.metadata).length === 1 ? "" : "s"}` : "Not set"}
                  </p>
                </div>
              </div>

              {task.metadata ? (
                <div className="mt-4 space-y-2">
                  <p className="text-muted-foreground text-sm">Metadata Value</p>
                  <pre className="rounded-xl border border-border/40 bg-zinc-950 p-4 text-xs text-zinc-300 overflow-x-auto">
                    {JSON.stringify(task.metadata, null, 2)}
                  </pre>
                </div>
              ) : null}

              <div className="mt-4 flex justify-end">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/tasks/$taskId/edit" params={{ taskId }}>
                    <PencilSimple size={14} className="mr-2" />
                    Edit Configuration
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Runs */}
          <Card className="border-border/50 bg-card/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="text-sm font-medium">Recent Runs</CardTitle>
                <Button variant="ghost" size="sm" asChild>
                  <a href={`/runs?taskId=${task.id}`}>View all runs →</a>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingRuns ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : recentRuns.length === 0 ? (
                <div className="text-center py-8">
                  <Clock size={32} className="mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">No runs yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentRuns.map((run) => (
                      <TableRow
                        key={run.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedRun(run)}
                      >
                        <TableCell>
                          <RunStatusBadge status={run.status} attempt={run.attempt} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground capitalize">
                          {run.trigger}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {formatDuration(run.durationMs)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div className="space-y-1">
                            <p>{formatTimeAgo(run.createdAt)}</p>
                            {run.status === "failure" || run.status === "timeout" ? (
                              <p className="max-w-[22rem] truncate text-xs text-destructive/80">
                                {run.errorMessage ?? "Execution failed"}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <CaretRight size={14} className="text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Danger zone */}
          <Card className="border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-destructive">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Delete this task</p>
                  <p className="text-sm text-muted-foreground">
                    This action cannot be undone. All run history will be lost.
                  </p>
                </div>
                <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash size={16} className="mr-2" />
                  Delete Task
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Delete Confirmation Dialog */}
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent size="sm">
              <DialogHeader>
                <DialogTitle>Delete Task</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground py-2">
                Are you sure you want to delete <span className="font-medium text-foreground">{task.name}</span>?
                This action cannot be undone and all run history will be permanently deleted.
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
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Run Detail Dialog */}
          <RunDetailDialog run={selectedRun} onClose={() => setSelectedRun(null)} />
        </>
      ) : null}
    </div>
  );
}

// Sub-components

function TaskDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-20" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-border/50">
            <CardContent>
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TaskStatusBadge({ task, lastRun }: { task: TaskRecord; lastRun?: RunRecord }) {
  if (!task.active) {
    return <Badge variant="secondary">Paused</Badge>;
  }
  if (!lastRun) {
    return <Badge variant="outline">Ready</Badge>;
  }
  if (lastRun.status === "running" || lastRun.status === "queued") {
    return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">Running</Badge>;
  }
  if (lastRun.status === "success") {
    return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Healthy</Badge>;
  }
  return <Badge variant="destructive">Failing</Badge>;
}

function RunStatusBadge({ status, attempt }: { status: string; attempt: number }) {
  const config: Record<string, { icon: React.ReactNode; className: string }> = {
    success: {
      icon: <CheckCircle size={14} weight="fill" />,
      className: "bg-green-500/20 text-green-500 border-green-500/30",
    },
    failure: {
      icon: <XCircle size={14} weight="fill" />,
      className: "bg-red-500/20 text-red-500 border-red-500/30",
    },
    timeout: {
      icon: <Timer size={14} weight="fill" />,
      className: "bg-orange-500/20 text-orange-500 border-orange-500/30",
    },
    running: {
      icon: <Clock size={14} className="animate-pulse" />,
      className: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
    },
    queued: {
      icon: <Clock size={14} />,
      className: "bg-muted text-muted-foreground",
    },
  };

  const { icon, className } = config[status] ?? config.queued;

  return (
    <div className="flex items-center gap-2">
      <Badge className={cn("gap-1", className)}>
        {icon}
        {status}
      </Badge>
      {attempt > 1 && (
        <Badge variant="outline" className="text-xs">
          Retry {attempt}
        </Badge>
      )}
    </div>
  );
}

function HandlerIcon({ type }: { type: string }) {
  switch (type) {
    case "webhook":
      return <ArrowSquareOut size={16} />;
    case "tools":
      return <Globe size={16} />;
    case "code":
      return <Code size={16} />;
    default:
      return <Globe size={16} />;
  }
}

function HandlerDisplay({ config }: { config: HandlerConfig }) {
  switch (config.type) {
    case "webhook":
      return (
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">URL:</span>{" "}
            <span className="font-mono text-xs break-all">{config.url}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Method:</span>{" "}
            <Badge variant="outline">{config.method ?? "POST"}</Badge>
          </div>
          {config.headers && Object.keys(config.headers).length > 0 ? (
            <div>
              <span className="text-muted-foreground">Headers:</span>{" "}
              <span>{Object.keys(config.headers).length} configured</span>
            </div>
          ) : null}
          {config.body ? (
            <div>
              <span className="text-muted-foreground">Payload:</span>{" "}
              <span>Custom body</span>
            </div>
          ) : (
            <div>
              <span className="text-muted-foreground">Payload:</span>{" "}
              <span>Default run payload</span>
            </div>
          )}
          {config.auth && (
            <div>
              <span className="text-muted-foreground">Auth:</span>{" "}
              <span className="capitalize">{config.auth.type}</span> using {config.auth.secretName}
            </div>
          )}
        </div>
      );
    case "tools":
      return (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">{config.steps.length} step{config.steps.length === 1 ? "" : "s"}</p>
          <div className="space-y-1">
            {config.steps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{idx + 1}.</span>
                <code className="bg-muted px-1.5 py-0.5 rounded">{step.tool}</code>
                {step.outputKey && (
                  <span className="text-muted-foreground">→ {step.outputKey}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    case "code":
      return (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">JavaScript runtime</p>
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32">
            {config.code.slice(0, 200)}{config.code.length > 200 ? "..." : ""}
          </pre>
        </div>
      );
  }
}

function ScheduleDisplay({ config, timezone }: { config: ScheduleConfig; timezone: string }) {
  const tz = timezone === "UTC" ? "UTC" : timezone.split("/").pop()?.replace(/_/g, " ");

  const description = (() => {
    switch (config.type) {
      case "every":
        return `Every ${formatInterval(config.interval)}`;
      case "daily":
        return `Daily at ${config.times.join(", ")}`;
      case "weekly":
        const days = config.days.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ");
        return `${days} at ${config.time}`;
      case "monthly":
        const day = typeof config.day === "number" ? `day ${config.day}` : config.day.replace("-", " ");
        return `Monthly on ${day} at ${config.time}`;
      case "once":
        return `Once at ${new Date(config.at).toLocaleString()}`;
      case "cron":
        return config.expression;
    }
  })();

  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">{description}</p>
      <p className="text-muted-foreground">Timezone: {tz}</p>
      <p className="text-muted-foreground">Editable from the full task editor.</p>
    </div>
  );
}

function formatInterval(interval: string): string {
  const match = interval.match(/^(\d+)([smhd])$/);
  if (!match) return interval;
  const [, num, unit] = match;
  const n = parseInt(num, 10);
  const units: Record<string, [string, string]> = {
    s: ["second", "seconds"],
    m: ["minute", "minutes"],
    h: ["hour", "hours"],
    d: ["day", "days"],
  };
  const [singular, plural] = units[unit] ?? ["unit", "units"];
  return `${n} ${n === 1 ? singular : plural}`;
}

interface RunDetailDialogProps {
  run: RunRecord | null;
  onClose: () => void;
}

function RunDetailDialog({ run, onClose }: RunDetailDialogProps) {
  if (!run) return null;

  return (
    <Dialog open={!!run} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="2xl" className="max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-3">
            Run Details
            <RunStatusBadge status={run.status} attempt={run.attempt} />
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-2">
          {/* Run metadata */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="meta-label">Trigger</p>
              <p className="text-sm font-medium capitalize">{run.trigger}</p>
            </div>
            <div className="space-y-1">
              <p className="meta-label">Attempt</p>
              <p className="text-sm font-medium">{run.attempt}</p>
            </div>
            <div className="space-y-1">
              <p className="meta-label">Duration</p>
              <p className="text-sm font-medium tabular-nums">{formatDuration(run.durationMs)}</p>
            </div>
            <div className="space-y-1">
              <p className="meta-label">Started</p>
              <p className="text-sm font-medium">
                {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
              </p>
            </div>
          </div>

          {/* Error message */}
          {run.errorMessage && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-xs font-semibold text-destructive uppercase tracking-wide mb-2">Error</p>
              <p className="text-sm text-destructive/90 font-mono break-words whitespace-pre-wrap">{run.errorMessage}</p>
            </div>
          )}

          {/* Output */}
          {run.output && (
            <div className="space-y-2">
              <p className="meta-label">Output</p>
              <pre className="rounded-xl bg-zinc-950 border border-border/50 p-4 text-xs text-zinc-300 font-mono overflow-x-auto max-h-48">
                {JSON.stringify(run.output, null, 2)}
              </pre>
            </div>
          )}

          {/* Logs */}
          {run.logs && (
            <div className="space-y-2">
              <p className="meta-label">Logs</p>
              <pre className="rounded-xl bg-zinc-950 border border-border/50 p-4 text-xs text-zinc-300 font-mono overflow-x-auto whitespace-pre-wrap max-h-64">
                {run.logs}
              </pre>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}min`;
}

function formatTimeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

function formatNextRun(nextRunAt: string): string {
  const now = new Date();
  const next = new Date(nextRunAt);
  const diffMs = next.getTime() - now.getTime();

  if (diffMs < 0) return "Any moment";
  if (diffMs < 60000) return "< 1 min";
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h`;
  return next.toLocaleDateString();
}
