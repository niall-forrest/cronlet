import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { TaskRecord, HandlerConfig, ScheduleConfig, RunRecord } from "@cronlet/cloud-shared";
import {
  listTasks,
  listRuns,
  patchTask,
  deleteTask,
  triggerTask,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  DotsThreeVertical,
  Play,
  Pause,
  Trash,
  Wrench,
  Globe,
  Clock,
  CheckCircle,
  XCircle,
  Timer,
  Lightning,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/Skeleton";

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

  const runsByTask = useMemo(() => {
    const map = new Map<string, RunRecord[]>();
    for (const run of allRuns) {
      const existing = map.get(run.taskId) ?? [];
      existing.push(run);
      map.set(run.taskId, existing);
    }
    for (const [taskId, runs] of map) {
      runs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      map.set(taskId, runs);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display-title">Tasks</h1>
          <p className="text-muted-foreground mt-1">
            Scheduled actions that run automatically
          </p>
        </div>
        <Button asChild>
          <Link to="/tasks/create">
            <Plus size={16} className="mr-2" />
            Create Task
          </Link>
        </Button>
      </div>

      {loadingTasks ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Clock size={48} className="text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">No tasks yet</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              Create your first scheduled task to automate HTTP calls, Slack messages, emails, and more.
            </p>
            <Button asChild>
              <Link to="/tasks/create">
                <Plus size={16} className="mr-2" />
                Create your first task
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              runs={runsByTask.get(task.id) ?? []}
              onToggleActive={() => handleToggleActive(task)}
              onTrigger={() => handleTrigger(task.id)}
              onDelete={() => handleDelete(task.id)}
              isTriggering={triggerMutation.isPending && triggerMutation.variables === task.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TaskCardProps {
  task: TaskRecord;
  runs: RunRecord[];
  onToggleActive: () => void;
  onTrigger: () => void;
  onDelete: () => void;
  isTriggering: boolean;
}

function TaskCard({ task, runs, onToggleActive, onTrigger, onDelete, isTriggering }: TaskCardProps) {
  const HandlerIcon = task.handlerType === "webhook" ? Globe : Wrench;
  const recentRuns = runs.slice(0, 5);
  const lastRun = recentRuns[0];
  const isRunning = lastRun?.status === "running" || lastRun?.status === "queued";

  return (
    <Card
      className={cn(
        "border-border/50 hover:border-border transition-all group",
        !task.active && "opacity-60"
      )}
    >
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg shrink-0 relative",
                task.active ? "bg-primary/10" : "bg-muted"
              )}
            >
              <HandlerIcon
                size={20}
                className={task.active ? "text-primary" : "text-muted-foreground"}
              />
              {isRunning && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-medium text-sm truncate">{task.name}</h3>
              <p className="text-xs text-muted-foreground truncate">
                {formatHandlerSummary(task.handlerConfig)}
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <DotsThreeVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onTrigger} disabled={isTriggering}>
                <Lightning size={14} className="mr-2" />
                Run now
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleActive}>
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
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash size={14} className="mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Schedule row */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <Clock size={12} />
          <span>{formatScheduleSummary(task.scheduleConfig)}</span>
          {!task.active && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              Paused
            </Badge>
          )}
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <div className="flex items-center gap-1">
            {recentRuns.length > 0 ? (
              recentRuns.map((run) => (
                <div
                  key={run.id}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    run.status === "success" && "bg-green-500",
                    run.status === "failure" && "bg-red-500",
                    run.status === "timeout" && "bg-yellow-500",
                    run.status === "running" && "bg-blue-500 animate-pulse",
                    run.status === "queued" && "bg-muted-foreground/50"
                  )}
                />
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No runs</span>
            )}
          </div>

          {lastRun && <LastRunBadge run={lastRun} />}

          {!lastRun && task.active && task.nextRunAt && (
            <NextRunBadge nextRunAt={task.nextRunAt} />
          )}
        </div>

        {/* Description */}
        {task.description && (
          <p className="text-xs text-muted-foreground mt-3 line-clamp-2">
            {task.description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function LastRunBadge({ run }: { run: RunRecord }) {
  const config = {
    success: { icon: CheckCircle, color: "text-green-500", label: "Success" },
    failure: { icon: XCircle, color: "text-red-500", label: "Failed" },
    timeout: { icon: Timer, color: "text-yellow-500", label: "Timeout" },
    running: { icon: Clock, color: "text-blue-500", label: "Running" },
    queued: { icon: Clock, color: "text-muted-foreground", label: "Queued" },
  }[run.status] ?? { icon: Clock, color: "text-muted-foreground", label: run.status };

  const Icon = config.icon;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Icon
        size={12}
        weight={run.status === "success" || run.status === "failure" ? "fill" : "regular"}
        className={config.color}
      />
      <span className={config.color}>{config.label}</span>
      <span className="text-muted-foreground">· {formatTimeAgo(run.createdAt)}</span>
    </div>
  );
}

function NextRunBadge({ nextRunAt }: { nextRunAt: string }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const diff = new Date(nextRunAt).getTime() - Date.now();
  if (diff <= 0) {
    return (
      <span className="text-xs text-primary animate-pulse">Running soon</span>
    );
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  let timeStr: string;
  if (hours > 0) {
    timeStr = `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    timeStr = `${minutes}m`;
  } else {
    timeStr = `${seconds}s`;
  }

  return (
    <span className="text-xs text-muted-foreground font-mono tabular-nums">
      Next in {timeStr}
    </span>
  );
}

function formatHandlerSummary(config: HandlerConfig): string {
  switch (config.type) {
    case "tools":
      return `${config.steps.length} step${config.steps.length === 1 ? "" : "s"}`;
    case "webhook":
      try {
        return new URL(config.url).hostname;
      } catch {
        return config.url;
      }
    case "code":
      return "JavaScript";
  }
}

function formatScheduleSummary(config: ScheduleConfig): string {
  switch (config.type) {
    case "every":
      return `Every ${config.interval}`;
    case "daily":
      return `Daily at ${config.times.join(", ")}`;
    case "weekly":
      return `${config.days.join(", ")} at ${config.time}`;
    case "monthly":
      return `Monthly on ${config.day} at ${config.time}`;
    case "once":
      return `Once at ${new Date(config.at).toLocaleString()}`;
    case "cron":
      return config.expression;
  }
}

function formatTimeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 10) return "just now";
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
