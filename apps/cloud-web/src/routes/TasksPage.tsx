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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  DotsThree,
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
  ArrowClockwise,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/Skeleton";

export function TasksPage() {
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => listTasks(),
  });

  // Fetch recent runs to show status on task cards
  const { data: allRuns = [] } = useQuery({
    queryKey: ["runs"],
    queryFn: () => listRuns(undefined, 100),
    refetchInterval: 3000, // Poll for updates
  });

  // Group runs by taskId for easy lookup
  const runsByTask = useMemo(() => {
    const map = new Map<string, RunRecord[]>();
    for (const run of allRuns) {
      const existing = map.get(run.taskId) ?? [];
      existing.push(run);
      map.set(run.taskId, existing);
    }
    // Sort each task's runs by createdAt descending
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
    <TooltipProvider>
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
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="border-border/50">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-12 w-12 rounded-lg" />
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-12" />
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
          <div className="grid gap-4">
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
    </TooltipProvider>
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
  const handlerIcon = task.handlerType === "webhook" ? Globe : Wrench;
  const HandlerIcon = handlerIcon;

  // Get last 10 runs for this task
  const recentRuns = runs.slice(0, 10);
  const lastRun = recentRuns[0];
  const isRunning = lastRun?.status === "running" || lastRun?.status === "queued";

  // Calculate success rate from recent runs
  const completedRuns = recentRuns.filter(r => r.status === "success" || r.status === "failure" || r.status === "timeout");
  const successCount = completedRuns.filter(r => r.status === "success").length;
  const successRate = completedRuns.length > 0 ? Math.round((successCount / completedRuns.length) * 100) : null;

  return (
    <Card
      className={cn(
        "transition-all border-border/50 hover:border-border",
        !task.active && "opacity-60",
        isRunning && "ring-2 ring-primary/30"
      )}
    >
      <CardContent className="p-0">
        <div className="flex items-stretch">
          {/* Main content area */}
          <div className="flex-1 p-5">
            <div className="flex items-start gap-4">
              {/* Icon with activity indicator */}
              <div className="relative">
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-lg transition-colors",
                    task.active ? "bg-primary/10" : "bg-muted"
                  )}
                >
                  <HandlerIcon
                    size={24}
                    className={cn(
                      task.active ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                </div>
                {isRunning && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                  </span>
                )}
              </div>

              {/* Task info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-foreground truncate">{task.name}</h3>
                  {!task.active && (
                    <Badge variant="outline" className="text-xs shrink-0">Paused</Badge>
                  )}
                </div>

                <p className="text-sm text-muted-foreground mb-3">
                  {formatHandlerSummary(task.handlerConfig)}
                </p>

                {/* Schedule and timing row */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock size={14} />
                    <span>{formatScheduleSummary(task.scheduleConfig)}</span>
                  </div>

                  {task.nextRunAt && task.active && (
                    <NextRunCountdown nextRunAt={task.nextRunAt} />
                  )}
                </div>
              </div>
            </div>

            {/* Recent runs visualization */}
            {recentRuns.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {/* Run history dots */}
                    <div className="flex items-center gap-1">
                      {recentRuns.slice(0, 10).reverse().map((run) => (
                        <Tooltip key={run.id}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "w-2 h-2 rounded-full transition-colors cursor-default",
                                run.status === "success" && "bg-green-500",
                                run.status === "failure" && "bg-red-500",
                                run.status === "timeout" && "bg-yellow-500",
                                run.status === "running" && "bg-blue-500 animate-pulse",
                                run.status === "queued" && "bg-muted-foreground/50"
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">
                            <p className="font-medium capitalize">{run.status}</p>
                            <p className="text-muted-foreground">{formatTimeAgo(run.createdAt)}</p>
                            {run.durationMs && <p>{formatDuration(run.durationMs)}</p>}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>

                    {/* Success rate */}
                    {successRate !== null && completedRuns.length >= 3 && (
                      <span className={cn(
                        "text-xs font-medium",
                        successRate >= 90 ? "text-green-500" :
                        successRate >= 70 ? "text-yellow-500" :
                        "text-red-500"
                      )}>
                        {successRate}% success
                      </span>
                    )}
                  </div>

                  {/* Last run info */}
                  {lastRun && (
                    <div className="flex items-center gap-2 text-sm">
                      <LastRunStatus run={lastRun} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {task.description && (
              <p className="text-sm text-muted-foreground mt-3 line-clamp-1">
                {task.description}
              </p>
            )}
          </div>

          {/* Action sidebar */}
          <div className="flex flex-col items-center justify-between border-l border-border/50 p-3 bg-muted/20">
            <Switch
              checked={task.active}
              onCheckedChange={onToggleActive}
              className="data-[state=checked]:bg-primary"
            />

            <div className="flex flex-col items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0"
                    onClick={onTrigger}
                    disabled={isTriggering}
                  >
                    {isTriggering ? (
                      <ArrowClockwise size={18} className="animate-spin" />
                    ) : (
                      <Lightning size={18} className="text-primary" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">Run now</TooltipContent>
              </Tooltip>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                    <DotsThree size={18} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onTrigger}>
                    <Play size={14} className="mr-2" />
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
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={onDelete}
                  >
                    <Trash size={14} className="mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LastRunStatus({ run }: { run: RunRecord }) {
  const statusConfig = {
    success: { icon: CheckCircle, color: "text-green-500", label: "Success" },
    failure: { icon: XCircle, color: "text-red-500", label: "Failed" },
    timeout: { icon: Timer, color: "text-yellow-500", label: "Timeout" },
    running: { icon: ArrowClockwise, color: "text-blue-500", label: "Running" },
    queued: { icon: Clock, color: "text-muted-foreground", label: "Queued" },
  };

  const config = statusConfig[run.status] ?? statusConfig.queued;
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-1.5">
      <Icon
        size={14}
        weight={run.status === "success" || run.status === "failure" ? "fill" : "regular"}
        className={cn(config.color, run.status === "running" && "animate-spin")}
      />
      <span className={cn("text-xs", config.color)}>{config.label}</span>
      <span className="text-xs text-muted-foreground">·</span>
      <span className="text-xs text-muted-foreground">{formatTimeAgo(run.createdAt)}</span>
    </div>
  );
}

function NextRunCountdown({ nextRunAt }: { nextRunAt: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const targetTime = new Date(nextRunAt).getTime();
  const diff = targetTime - now;

  if (diff <= 0) {
    return (
      <Badge variant="secondary" className="text-xs gap-1 animate-pulse">
        <Lightning size={12} />
        Running soon
      </Badge>
    );
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let timeStr: string;
  if (days > 0) {
    timeStr = `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    timeStr = `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    timeStr = `${minutes}m ${seconds % 60}s`;
  } else {
    timeStr = `${seconds}s`;
  }

  return (
    <Badge variant="outline" className="text-xs gap-1 font-mono tabular-nums">
      <Timer size={12} />
      Next in {timeStr}
    </Badge>
  );
}

function formatHandlerSummary(config: HandlerConfig): string {
  switch (config.type) {
    case "tools":
      return `${config.steps.length} step${config.steps.length === 1 ? "" : "s"}`;
    case "webhook":
      try {
        const url = new URL(config.url);
        return url.hostname;
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
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}min`;
}

