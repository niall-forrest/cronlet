import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { TaskRecord, ScheduleConfig, RunRecord } from "@cronlet/cloud-shared";
import {
  listTasks,
  listRuns,
  patchTask,
  deleteTask,
  triggerTask,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardFooter, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  DotsThree,
  Play,
  Pause,
  Trash,
  Clock,
  PencilSimple,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/Skeleton";
import { SectionHeader } from "@/components/ui/section-header";

export function TasksPage() {
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => listTasks(),
  });

  const { data: allRuns = [] } = useQuery({
    queryKey: ["runs"],
    queryFn: () => listRuns(undefined, 100),
    refetchInterval: 3000,
  });

  // Get last run per task
  const lastRunByTask = useMemo(() => {
    const map = new Map<string, RunRecord>();
    for (const run of allRuns) {
      if (!map.has(run.taskId) || new Date(run.createdAt) > new Date(map.get(run.taskId)!.createdAt)) {
        map.set(run.taskId, run);
      }
    }
    return map;
  }, [allRuns]);

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
    },
  });

  const triggerMutation = useMutation({
    mutationFn: triggerTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });

  const handleToggleActive = (task: TaskRecord) => {
    patchMutation.mutate({ id: task.id, input: { active: !task.active } });
  };

  const handleDelete = (taskId: string) => {
    if (confirm("Are you sure you want to delete this task?")) {
      deleteMutation.mutate(taskId);
    }
  };

  const handleTrigger = (taskId: string) => {
    triggerMutation.mutate(taskId);
  };

  // Separate active and paused tasks
  const activeTasks = tasks.filter((t) => t.active);
  const pausedTasks = tasks.filter((t) => !t.active);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display-title">Tasks</h1>
          <p className="text-muted-foreground mt-1">
            Manage your scheduled tasks
          </p>
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
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} variant="flat">
                <CardContent>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-2.5 w-2.5 rounded-full" />
                      <Skeleton className="h-5 w-40" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-md" />
                  </div>
                  <Skeleton className="h-4 w-48 mb-5" />
                  <div className="grid grid-cols-2 gap-4 mb-4">
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
            <h3 className="text-lg font-semibold mb-2">No tasks yet</h3>
            <p className="text-muted-foreground text-center mb-6 max-w-md text-sm">
              Create your first scheduled task to automate HTTP calls, Slack messages, emails, and more.
            </p>
            <Button asChild>
              <Link to="/tasks/create">
                <Plus size={16} weight="bold" className="mr-2" />
                Create your first task
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Active Tasks */}
          {activeTasks.length > 0 && (
            <section className="space-y-4">
              <SectionHeader label="Active Tasks" />
              <div className="grid gap-4 md:grid-cols-2">
                {activeTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    lastRun={lastRunByTask.get(task.id)}
                    onToggleActive={() => handleToggleActive(task)}
                    onTrigger={() => handleTrigger(task.id)}
                    onDelete={() => handleDelete(task.id)}
                    isTriggering={triggerMutation.isPending && triggerMutation.variables === task.id}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Paused Tasks */}
          {pausedTasks.length > 0 && (
            <section className="space-y-4">
              <SectionHeader label="Paused Tasks" />
              <div className="grid gap-4 md:grid-cols-2">
                {pausedTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    lastRun={lastRunByTask.get(task.id)}
                    onToggleActive={() => handleToggleActive(task)}
                    onTrigger={() => handleTrigger(task.id)}
                    onDelete={() => handleDelete(task.id)}
                    isTriggering={triggerMutation.isPending && triggerMutation.variables === task.id}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

interface TaskCardProps {
  task: TaskRecord;
  lastRun?: RunRecord;
  onToggleActive: () => void;
  onTrigger: () => void;
  onDelete: () => void;
  isTriggering: boolean;
}

function TaskCard({ task, lastRun, onToggleActive, onTrigger, onDelete, isTriggering }: TaskCardProps) {
  const isRunning = lastRun?.status === "running" || lastRun?.status === "queued";
  const taskStatus = getTaskStatus(task, lastRun);

  return (
    <Card variant="interactive" className={cn("p-0", !task.active && "opacity-60")}>
      {/* Header */}
      <CardHeader className="border-b border-border/30">
        <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="flex items-center gap-2.5 min-w-0 group/link">
          <StatusDot status={taskStatus} />
          <h2 className="font-display text-base text-foreground font-semibold truncate group-hover/link:text-primary transition-colors">
            {task.name}
          </h2>
        </Link>
        <CardAction>
          <HandlerBadge type={task.handlerType} />
        </CardAction>
      </CardHeader>

      {/* Content */}
      <CardContent className="px-5 py-4 space-y-4">
        {/* Schedule */}
        <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="block">
          <p className="text-sm text-muted-foreground">
            {formatScheduleSummary(task.scheduleConfig)}
          </p>
        </Link>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="meta-label">Last Run</span>
            <p className="text-sm text-foreground mt-0.5">
              {lastRun ? formatTimeAgo(lastRun.createdAt) : "Never"}
            </p>
          </div>
          <div>
            <span className="meta-label">Duration</span>
            <p className="text-sm text-foreground mt-0.5">
              {lastRun?.durationMs ? formatDuration(lastRun.durationMs) : "—"}
            </p>
          </div>
        </div>

        {/* Description if present */}
        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}
      </CardContent>

      {/* Footer with actions */}
      <CardFooter className="gap-2">
        <Button
          className="flex-1"
          onClick={onTrigger}
          disabled={isTriggering || isRunning || !task.active}
        >
          {isTriggering ? (
            "Running..."
          ) : isRunning ? (
            "Running..."
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
              <Link to="/tasks/$taskId" params={{ taskId: task.id }}>
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
  return num === "1" ? `${unitName}` : `${num} ${unitName}s`;
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatTimeAgo(date: string): string {
  const diffMs = Date.now() - new Date(date).getTime();
  if (diffMs < 60000) return "Just now";
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return `${Math.floor(diffMs / 86400000)}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
