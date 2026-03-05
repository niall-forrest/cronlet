import { useMemo } from "react";
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display-title">Tasks</h1>
          <p className="text-muted-foreground mt-1">
            {tasks.length} task{tasks.length === 1 ? "" : "s"}
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
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="border-border/50 bg-card/80">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="space-y-1.5">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-4 w-32 mb-4" />
                <div className="flex items-center justify-between pt-3 border-t border-border/50">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-8 w-20" />
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
        <div className="grid gap-4 md:grid-cols-2">
          {tasks.map((task) => (
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

  return (
    <Card className="border-border/50 bg-card/80 hover:border-border transition-colors">
      <CardContent className="p-4">
        {/* Header: Name + Status */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-foreground font-medium hover:text-primary transition-colors">
              {task.name}
            </h3>
            <p className="text-sm text-muted-foreground">
              {formatHandlerSummary(task.handlerConfig)}
            </p>
          </div>
          <StatusBadge status={getTaskStatus(task, lastRun)} />
        </div>

        {/* Schedule */}
        <div className="flex items-center gap-4 mb-4 text-sm">
          <div>
            <span className="text-muted-foreground">Schedule:</span>{" "}
            <span className="text-foreground/80">{formatScheduleSummary(task.scheduleConfig)}</span>
          </div>
        </div>

        {/* Footer: Last run + Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <div className="text-sm text-muted-foreground">
            {lastRun ? (
              <span>
                Last run: {formatTimeAgo(lastRun.createdAt)}
                {lastRun.durationMs && ` (${formatDuration(lastRun.durationMs)})`}
              </span>
            ) : (
              <span>Never run</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={onTrigger}
              disabled={isTriggering || isRunning}
              className="h-8"
            >
              {isTriggering ? "Running..." : "Run Now"}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <DotsThree size={18} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
                <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                  <Trash size={14} className="mr-2" />
                  Delete task
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Description if present */}
        {task.description && (
          <p className="text-sm text-muted-foreground mt-3 pt-3 border-t border-border/50">
            {task.description}
          </p>
        )}
      </CardContent>
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

function StatusBadge({ status }: { status: TaskStatus }) {
  const config: Record<TaskStatus, { color: string; text: string }> = {
    idle: { color: "bg-muted-foreground", text: "Idle" },
    running: { color: "bg-yellow-500 animate-pulse", text: "Running" },
    success: { color: "bg-green-500", text: "Success" },
    failed: { color: "bg-red-500", text: "Failed" },
    paused: { color: "bg-muted-foreground/50", text: "Paused" },
  };

  const { color, text } = config[status];

  return (
    <div className="flex items-center gap-2">
      <span className={cn("w-2 h-2 rounded-full", color)} />
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
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
        return "Webhook";
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
