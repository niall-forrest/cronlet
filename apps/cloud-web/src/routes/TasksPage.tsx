import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { RunRecord, ScheduleConfig, TaskRecord } from "@cronlet/shared";
import {
  CaretDown,
  DotsThree,
  Pause,
  PencilSimple,
  Play,
  Plus,
  Spinner,
  Trash,
  Clock,
  X,
} from "@phosphor-icons/react";
import {
  listRuns,
  listTasks,
  patchTask,
  deleteTask,
  triggerTask,
} from "@/lib/api";
import { hasSeenFirstTaskSuccess, isFirstTaskPending, markFirstTaskSuccessSeen } from "@/lib/onboarding";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/Skeleton";
import { SectionHeader } from "@/components/ui/section-header";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function TasksPage() {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<TaskRecord | null>(null);
  const [pendingRunByTask, setPendingRunByTask] = useState<Record<string, string>>({});
  const [resultOpenByTask, setResultOpenByTask] = useState<Record<string, boolean>>({});
  const [celebrationVisible, setCelebrationVisible] = useState(false);

  const { data: tasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => listTasks(),
  });

  const { data: allRuns = [] } = useQuery({
    queryKey: ["runs"],
    queryFn: () => listRuns(undefined, 100),
    refetchInterval: Object.keys(pendingRunByTask).length > 0 ? 1500 : 3000,
  });

  const lastRunByTask = useMemo(() => {
    const map = new Map<string, RunRecord>();
    for (const run of allRuns) {
      const current = map.get(run.taskId);
      if (!current || new Date(run.createdAt) > new Date(current.createdAt)) {
        map.set(run.taskId, run);
      }
    }
    return map;
  }, [allRuns]);

  useEffect(() => {
    setPendingRunByTask((current) => {
      let changed = false;
      const next = { ...current };

      for (const [taskId, runId] of Object.entries(current)) {
        const run = allRuns.find((candidate) => candidate.id === runId);
        if (run && isTerminalRun(run)) {
          delete next[taskId];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [allRuns]);

  useEffect(() => {
    if (!isFirstTaskPending() || hasSeenFirstTaskSuccess()) {
      return;
    }

    if (tasks.length !== 1) {
      return;
    }

    const firstTaskId = tasks[0]?.id;
    const firstSuccess = allRuns.find(
      (run) => run.taskId === firstTaskId && run.status === "success"
    );

    if (!firstSuccess) {
      return;
    }

    markFirstTaskSuccessSeen();
    setCelebrationVisible(true);

    const timeout = window.setTimeout(() => {
      setCelebrationVisible(false);
    }, 6000);

    return () => window.clearTimeout(timeout);
  }, [allRuns, tasks]);

  const patchMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { active?: boolean } }) =>
      patchTask(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setDeleteTarget(null);
    },
  });

  const triggerMutation = useMutation({
    mutationFn: triggerTask,
    onSuccess: (run, taskId) => {
      setPendingRunByTask((current) => ({ ...current, [taskId]: run.id }));
      setResultOpenByTask((current) => ({ ...current, [taskId]: true }));
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });

  const activeTasks = tasks.filter((task) => task.active);
  const pausedTasks = tasks.filter((task) => !task.active);

  const handleToggleActive = (task: TaskRecord) => {
    patchMutation.mutate({ id: task.id, input: { active: !task.active } });
  };

  const handleDelete = (task: TaskRecord) => {
    setDeleteTarget(task);
  };

  const handleTrigger = (taskId: string) => {
    triggerMutation.mutate(taskId);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.id);
    }
  };

  return (
    <div className="space-y-8">
      {celebrationVisible ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start justify-between gap-4 py-5">
            <div className="space-y-1">
              <p className="font-medium text-foreground">Your first task is running.</p>
              <p className="text-sm text-muted-foreground">
                Next: connect an agent so Claude or another MCP client can create tasks automatically.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild size="sm">
                <Link to="/agent-connect">Connect an Agent</Link>
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setCelebrationVisible(false)}>
                <X size={14} />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="display-title">Tasks</h1>
          <p className="mt-1 text-muted-foreground">Manage your scheduled tasks</p>
        </div>
        <Button asChild>
          <Link to="/tasks/create">
            <Plus size={16} weight="bold" className="mr-2" />
            Create Task
          </Link>
        </Button>
      </div>

      {loadingTasks ? (
        <div className="space-y-6">
          <SectionHeader label="Active Tasks" />
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((index) => (
              <Card key={index} variant="flat">
                <CardContent>
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-2.5 w-2.5 rounded-full" />
                      <Skeleton className="h-5 w-40" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-md" />
                  </div>
                  <Skeleton className="mb-5 h-4 w-48" />
                  <div className="mb-4 grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-9 w-full rounded-lg" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <Card variant="flat" className="border-dashed border-border/30">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Clock size={28} weight="duotone" className="text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">No tasks yet</h3>
            <p className="mb-6 max-w-md text-center text-sm text-muted-foreground">
              Create your first scheduled task to automate HTTP calls, Slack messages, emails, and more.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button asChild>
                <Link to="/tasks/create">
                  <Plus size={16} weight="bold" className="mr-2" />
                  Create from scratch
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/tasks/create/templates">Browse templates</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {activeTasks.length > 0 ? (
            <section className="space-y-4">
              <SectionHeader label="Active Tasks" />
              <div className="grid gap-4 md:grid-cols-2">
                {activeTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    lastRun={lastRunByTask.get(task.id)}
                    pendingRunId={pendingRunByTask[task.id]}
                    hasInlineResult={task.id in resultOpenByTask}
                    resultOpen={!!resultOpenByTask[task.id]}
                    onResultOpenChange={(open) =>
                      setResultOpenByTask((current) => ({ ...current, [task.id]: open }))
                    }
                    onToggleActive={() => handleToggleActive(task)}
                    onTrigger={() => handleTrigger(task.id)}
                    onDelete={() => handleDelete(task)}
                    isTriggering={triggerMutation.isPending && triggerMutation.variables === task.id}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {pausedTasks.length > 0 ? (
            <section className="space-y-4">
              <SectionHeader label="Paused Tasks" />
              <div className="grid gap-4 md:grid-cols-2">
                {pausedTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    lastRun={lastRunByTask.get(task.id)}
                    pendingRunId={pendingRunByTask[task.id]}
                    hasInlineResult={task.id in resultOpenByTask}
                    resultOpen={!!resultOpenByTask[task.id]}
                    onResultOpenChange={(open) =>
                      setResultOpenByTask((current) => ({ ...current, [task.id]: open }))
                    }
                    onToggleActive={() => handleToggleActive(task)}
                    onTrigger={() => handleTrigger(task.id)}
                    onDelete={() => handleDelete(task)}
                    isTriggering={triggerMutation.isPending && triggerMutation.variables === task.id}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Task"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone. All run history for this task will also be deleted.`}
        confirmLabel="Delete Task"
        variant="danger"
        onConfirm={confirmDelete}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

interface TaskCardProps {
  task: TaskRecord;
  lastRun?: RunRecord;
  pendingRunId?: string;
  hasInlineResult: boolean;
  resultOpen: boolean;
  onResultOpenChange: (open: boolean) => void;
  onToggleActive: () => void;
  onTrigger: () => void;
  onDelete: () => void;
  isTriggering: boolean;
}

function TaskCard({
  task,
  lastRun,
  pendingRunId,
  hasInlineResult,
  resultOpen,
  onResultOpenChange,
  onToggleActive,
  onTrigger,
  onDelete,
  isTriggering,
}: TaskCardProps) {
  const isRunning = lastRun?.status === "running" || lastRun?.status === "queued" || (!!pendingRunId && !isTerminalRun(lastRun));
  const taskStatus = getTaskStatus(task, lastRun);
  const inlineResult = lastRun ? buildInlineResult(lastRun) : null;
  const canShowInlineResult = !!inlineResult && hasInlineResult && isTerminalRun(lastRun);

  return (
    <Card variant="interactive" className={cn("p-0", !task.active && "opacity-60")}>
      <CardHeader className="border-b border-border/30 px-5 py-4">
        <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="group/link flex min-w-0 items-center gap-2.5">
          <StatusDot status={taskStatus} />
          <h2 className="truncate font-display text-base font-semibold text-foreground transition-colors group-hover/link:text-primary">
            {task.name}
          </h2>
        </Link>
        <CardAction>
          <HandlerBadge type={task.handlerType} />
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4 px-5 py-4">
        <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="block">
          <p className="text-sm text-muted-foreground">
            {formatScheduleSummary(task.scheduleConfig)}
          </p>
        </Link>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="meta-label">Last Run</span>
            <p className="mt-0.5 text-sm text-foreground">
              {lastRun ? formatTimeAgo(lastRun.createdAt) : "Never"}
            </p>
          </div>
          <div>
            <span className="meta-label">Duration</span>
            <p className="mt-0.5 text-sm text-foreground">
              {lastRun?.durationMs !== null && lastRun?.durationMs !== undefined
                ? formatDuration(lastRun.durationMs)
                : "—"}
            </p>
          </div>
        </div>

        {task.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {task.description}
          </p>
        ) : null}

        {canShowInlineResult ? (
          <Collapsible open={resultOpen} onOpenChange={onResultOpenChange}>
            <div className="rounded-xl border border-border/40 bg-card/40">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">View Result</p>
                    <p className="text-xs text-muted-foreground">
                      {inlineResult.statusLabel ? `${inlineResult.statusLabel} • ` : ""}
                      {inlineResult.durationLabel}
                    </p>
                  </div>
                  <CaretDown
                    size={14}
                    className={cn("text-muted-foreground transition-transform", resultOpen && "rotate-180")}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-3 border-t border-border/40 px-4 py-4">
                  {inlineResult.statusLabel ? (
                    <InlineResultRow label="Status" value={inlineResult.statusLabel} />
                  ) : null}
                  <InlineResultRow label="Response time" value={inlineResult.durationLabel} />
                  {inlineResult.preview ? (
                    <div className="space-y-1">
                      <span className="meta-label">Output</span>
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                        {inlineResult.preview}
                      </pre>
                    </div>
                  ) : null}
                  <Button asChild variant="link" className="h-auto p-0">
                    <Link to="/runs/$runId" params={{ runId: lastRun!.id }}>
                      View full run
                      <span className="ml-1">→</span>
                    </Link>
                  </Button>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ) : null}
      </CardContent>

      <CardFooter className="gap-2">
        <Button
          className="flex-1"
          onClick={onTrigger}
          disabled={isTriggering || isRunning || !task.active}
        >
          {isTriggering || isRunning ? (
            <>
              <Spinner size={14} className="mr-2 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play size={14} weight="fill" className="mr-2" />
              Run Now
            </>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0">
              <DotsThree size={18} weight="bold" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to="/tasks/$taskId/edit" params={{ taskId: task.id }}>
                <PencilSimple size={14} className="mr-2" />
                Edit task
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleActive}>
              {task.active ? (
                <>
                  <Pause size={14} className="mr-2" />
                  Pause task
                </>
              ) : (
                <>
                  <Play size={14} className="mr-2" />
                  Resume task
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
              <Trash size={14} className="mr-2" />
              Delete task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardFooter>
    </Card>
  );
}

function InlineResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="meta-label">{label}</span>
      <p className="mt-0.5 text-sm text-foreground">{value}</p>
    </div>
  );
}

type TaskStatus = "idle" | "running" | "success" | "failed" | "paused";

function getTaskStatus(task: TaskRecord, lastRun?: RunRecord): TaskStatus {
  if (!task.active) return "paused";
  if (!lastRun) return "idle";
  if (lastRun.status === "running" || lastRun.status === "queued") return "running";
  if (lastRun.status === "success") return "success";
  if (lastRun.status === "failure" || lastRun.status === "timeout") return "failed";
  return "idle";
}

function StatusDot({ status }: { status: TaskStatus }) {
  const statusClasses: Record<TaskStatus, string> = {
    idle: "status-dot-idle",
    running: "status-dot-running",
    success: "status-dot-success",
    failed: "status-dot-failed",
    paused: "status-dot-paused",
  };

  return <span className={cn("status-dot", statusClasses[status])} />;
}

function HandlerBadge({ type }: { type: string }) {
  const variantMap: Record<string, "webhook" | "tools" | "code"> = {
    webhook: "webhook",
    tools: "tools",
    code: "code",
  };

  const variant = variantMap[type] ?? "tools";

  return (
    <Badge variant={variant}>
      {type.toUpperCase()}
    </Badge>
  );
}

function formatScheduleSummary(config: ScheduleConfig): string {
  switch (config.type) {
    case "every":
      return `Every ${formatInterval(config.interval)}`;
    case "daily":
      return `Daily at ${config.times.join(", ")}`;
    case "weekly":
      return `${capitalizeFirst(config.days.join(", "))} at ${config.time}`;
    case "monthly":
      return `Monthly on ${config.day} at ${config.time}`;
    case "once":
      return `Once at ${new Date(config.at).toLocaleString()}`;
    case "cron":
      return config.expression;
  }
}

function formatInterval(interval: string): string {
  const match = interval.match(/^(\d+)([smhd])$/);
  if (!match) return interval;
  const [, num, unit] = match;
  const units: Record<string, string> = { s: "second", m: "minute", h: "hour", d: "day" };
  const unitName = units[unit] ?? unit;
  return num === "1" ? unitName : `${num} ${unitName}s`;
}

function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatTimeAgo(date: string): string {
  const diffMs = Date.now() - new Date(date).getTime();
  if (diffMs < 60000) return "just now";
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return `${Math.floor(diffMs / 86400000)}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function isTerminalRun(run?: RunRecord): boolean {
  return run?.status === "success" || run?.status === "failure" || run?.status === "timeout";
}

function buildInlineResult(run: RunRecord): {
  statusLabel: string | null;
  durationLabel: string;
  preview: string | null;
} | null {
  const durationLabel = formatDuration(run.durationMs ?? 0);
  const statusCode = findStatusCode(run.output) ?? extractStatusCodeFromLogs(run.logs);
  const previewSource = findPreviewSource(run.output) ?? run.errorMessage ?? run.logs;
  const preview = previewSource ? truncate(previewSource, 200) : null;

  return {
    statusLabel: statusCode ? `${statusCode} ${statusLabelForCode(statusCode)}` : null,
    durationLabel,
    preview,
  };
}

function findStatusCode(value: unknown): number | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const direct = record.statusCode ?? record.status;
  if (typeof direct === "number") {
    return direct;
  }

  for (const nested of Object.values(record)) {
    const result = findStatusCode(nested);
    if (result !== null) {
      return result;
    }
  }

  return null;
}

function extractStatusCodeFromLogs(logs: string | null): number | null {
  if (!logs) {
    return null;
  }

  const match = logs.match(/->\s(\d{3})\b/);
  return match ? Number(match[1]) : null;
}

function findPreviewSource(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.body === "string") {
    return record.body;
  }

  if (record.body && typeof record.body === "object") {
    return JSON.stringify(record.body);
  }

  const nestedBody = Object.values(record)
    .map((nested) => findPreviewSource(nested))
    .find(Boolean);

  if (nestedBody) {
    return nestedBody;
  }

  return JSON.stringify(record);
}

function statusLabelForCode(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return "OK";
  if (statusCode === 301 || statusCode === 302) return "Redirect";
  if (statusCode === 401) return "Unauthorized";
  if (statusCode === 403) return "Forbidden";
  if (statusCode === 404) return "Not Found";
  if (statusCode >= 500) return "Server Error";
  return "Response";
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}
