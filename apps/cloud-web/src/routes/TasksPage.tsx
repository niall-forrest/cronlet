import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { TaskRecord, HandlerConfig, ScheduleConfig } from "@cronlet/cloud-shared";
import {
  listTasks,
  patchTask,
  deleteTask,
  triggerTask,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  DotsThree,
  Play,
  Pause,
  Trash,
  Wrench,
  Globe,
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
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-12" />
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Skeleton className="h-4 w-40" />
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
              onToggleActive={() => handleToggleActive(task)}
              onTrigger={() => handleTrigger(task.id)}
              onDelete={() => handleDelete(task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TaskCardProps {
  task: TaskRecord;
  onToggleActive: () => void;
  onTrigger: () => void;
  onDelete: () => void;
}

function TaskCard({ task, onToggleActive, onTrigger, onDelete }: TaskCardProps) {
  const handlerIcon = task.handlerType === "webhook" ? Globe : Wrench;
  const HandlerIcon = handlerIcon;

  return (
    <Card
      className={cn(
        "transition-all",
        !task.active && "opacity-60"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg",
                task.active ? "bg-primary/10" : "bg-muted"
              )}
            >
              <HandlerIcon
                size={20}
                className={cn(
                  task.active ? "text-primary" : "text-muted-foreground"
                )}
              />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base truncate">{task.name}</CardTitle>
              <p className="text-sm text-muted-foreground truncate">
                {formatHandlerSummary(task.handlerConfig)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={task.active}
              onCheckedChange={onToggleActive}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
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
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock size={14} />
            <span>{formatScheduleSummary(task.scheduleConfig)}</span>
          </div>

          {task.nextRunAt && task.active && (
            <div className="text-muted-foreground">
              Next: {formatRelativeTime(task.nextRunAt)}
            </div>
          )}
        </div>

        {task.description && (
          <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
            {task.description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function formatHandlerSummary(config: HandlerConfig): string {
  switch (config.type) {
    case "tools":
      return `${config.steps.length} step${config.steps.length === 1 ? "" : "s"}`;
    case "webhook":
      return config.url;
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

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `in ${diffMins}m`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `in ${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  return `in ${diffDays}d`;
}
