import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { TaskRecord, RunRecord } from "@cronlet/cloud-shared";
import {
  CheckCircle,
  XCircle,
  ArrowRight,
  Clock,
  Copy,
  Check,
  Plus,
  Wrench,
  Globe,
  Timer,
  Pulse,
  CalendarBlank,
  ArrowClockwise,
  Warning,
  Code,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Skeleton, SkeletonCard, SkeletonRow } from "@/components/Skeleton";
import { listTasks, listRuns, getUsage } from "@/lib/api";
import { cn } from "@/lib/utils";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 inline-flex items-center text-muted-foreground transition-colors hover:text-foreground"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check size={14} weight="bold" className="text-emerald-400" />
      ) : (
        <Copy size={14} />
      )}
    </button>
  );
}

function formatScheduleShort(config: TaskRecord["scheduleConfig"]): string {
  switch (config.type) {
    case "every":
      return `Every ${config.interval}`;
    case "daily":
      return `Daily at ${config.times[0]}`;
    case "weekly":
      return `Weekly`;
    case "monthly":
      return `Monthly`;
    case "once":
      return `Once`;
    case "cron":
      return config.expression;
    default:
      return "Scheduled";
  }
}

function formatTimeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 10) return "just now";
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return then.toLocaleDateString();
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCountdown(targetDate: string): string {
  const now = Date.now();
  const target = new Date(targetDate).getTime();
  const diff = target - now;

  if (diff <= 0) return "now";

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function getHandlerBadge(handlerType: string) {
  switch (handlerType) {
    case "webhook":
      return <Badge variant="webhook">Webhook</Badge>;
    case "tools":
      return <Badge variant="tools">Tools</Badge>;
    case "code":
      return <Badge variant="code">Code</Badge>;
    default:
      return null;
  }
}

export function OverviewPage() {
  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => listTasks(),
  });
  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: () => listRuns(undefined, 50),
    refetchInterval: 3000,
  });
  const usageQuery = useQuery({
    queryKey: ["usage"],
    queryFn: getUsage,
  });

  const isLoading = tasksQuery.isLoading;
  const tasks = tasksQuery.data ?? [];
  const runs = runsQuery.data ?? [];
  const usage = usageQuery.data;

  const hasTasks = tasks.length > 0;

  // Calculate comprehensive stats
  const activeTasks = tasks.filter((t) => t.active).length;
  const pausedTasks = tasks.filter((t) => !t.active).length;
  const runningNow = runs.filter(
    (r) => r.status === "running" || r.status === "queued"
  ).length;
  const completedRuns = runs.filter(
    (r) =>
      r.status === "success" || r.status === "failure" || r.status === "timeout"
  );
  const successCount = completedRuns.filter(
    (r) => r.status === "success"
  ).length;
  const failureCount = completedRuns.filter(
    (r) => r.status === "failure" || r.status === "timeout"
  ).length;
  const successRate =
    completedRuns.length > 0
      ? Math.round((successCount / completedRuns.length) * 100)
      : null;

  // Find failing tasks (last run was failure)
  const taskNames = new Map<string, string>();
  tasks.forEach((t) => taskNames.set(t.id, t.name));

  const lastRunByTask = new Map<string, RunRecord>();
  for (const run of runs) {
    if (!lastRunByTask.has(run.taskId)) {
      lastRunByTask.set(run.taskId, run);
    }
  }

  const failingTasks = tasks.filter((t) => {
    const lastRun = lastRunByTask.get(t.id);
    return (
      lastRun && (lastRun.status === "failure" || lastRun.status === "timeout")
    );
  });

  // Get next scheduled runs
  const upcomingTasks = tasks
    .filter((t) => t.active && t.nextRunAt)
    .sort(
      (a, b) =>
        new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime()
    )
    .slice(0, 5);

  // Show skeleton dashboard while loading
  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="mt-2 h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-28" />
            </CardHeader>
            <CardContent className="space-y-1">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-28" />
            </CardHeader>
            <CardContent className="space-y-1">
              <SkeletonRow />
              <SkeletonRow />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // New user welcome experience
  if (!hasTasks) {
    return (
      <div className="space-y-8">
        {/* Welcome header */}
        <div className="pb-4 pt-8 text-center">
          <h1 className="mb-3 font-display text-3xl font-bold tracking-tight text-foreground">
            Welcome to Cronlet
          </h1>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Scheduled tasks for developers and AI agents. Create a task and
            we'll run it on schedule. No cron syntax. No infrastructure.
          </p>
        </div>

        {/* Get started */}
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle className="font-display text-lg">Get Started</CardTitle>
            <CardDescription>
              Create your first scheduled task in under a minute
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="mb-3 text-sm">
                Create a task to start scheduling automated actions.
              </p>
              <Button asChild>
                <Link to="/tasks/create">
                  <Plus size={16} className="mr-2" />
                  Create Task
                </Link>
              </Button>
            </div>

            <div className="border-t border-border/30 pt-4">
              <p className="meta-label mb-3">What can you build?</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Wrench size={14} className="text-primary" />
                  <span>Chain API calls</span>
                </div>
                <div className="flex items-center gap-2">
                  <Wrench size={14} className="text-primary" />
                  <span>Agent feedback loops</span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe size={14} className="text-primary" />
                  <span>Webhook integrations</span>
                </div>
                <div className="flex items-center gap-2">
                  <Wrench size={14} className="text-primary" />
                  <span>Scheduled monitoring</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick start code */}
        <Card className="mx-auto max-w-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-lg">
              For Developers & Agents
            </CardTitle>
            <CardDescription>
              Use our MCP server with Claude, or integrate via SDK.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Connect Claude via MCP:
              </p>
              <div className="flex items-center rounded-lg border border-border/50 bg-muted/30 px-4 py-3 font-mono text-sm">
                <code className="flex-1">npx @cronlet/mcp</code>
                <CopyButton text="npx @cronlet/mcp" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Or install the SDK:
              </p>
              <div className="flex items-center rounded-lg border border-border/50 bg-muted/30 px-4 py-3 font-mono text-sm">
                <code className="flex-1">npm install @cronlet/sdk</code>
                <CopyButton text="npm install @cronlet/sdk" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Returning user dashboard
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Overview
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {runningNow > 0 ? (
              <span className="text-primary">
                <Pulse size={14} className="mr-1 inline animate-pulse" />
                {runningNow} task{runningNow !== 1 ? "s" : ""} running now
              </span>
            ) : (
              `${activeTasks} active task${activeTasks !== 1 ? "s" : ""}`
            )}
          </p>
        </div>
        <Button asChild>
          <Link to="/tasks/create">
            <Plus size={16} className="mr-2" />
            New Task
          </Link>
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Link to="/tasks">
          <Card
            variant="interactive"
            className="h-full cursor-pointer"
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Clock size={22} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-3xl font-semibold tabular-nums">
                    {activeTasks}
                  </p>
                  <p className="text-xs text-muted-foreground">Active tasks</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/runs">
          <Card
            variant="interactive"
            className="h-full cursor-pointer hover:border-emerald-500/30"
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                  <CheckCircle
                    size={22}
                    weight="fill"
                    className="text-emerald-500"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-3xl font-semibold tabular-nums">
                    {successCount}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Successful runs
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/runs">
          <Card
            variant="interactive"
            className="h-full cursor-pointer hover:border-red-500/30"
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
                  <XCircle size={22} weight="fill" className="text-red-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-3xl font-semibold tabular-nums">
                    {failureCount}
                  </p>
                  <p className="text-xs text-muted-foreground">Failed runs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card className="h-full">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                  successRate === null
                    ? "bg-muted"
                    : successRate >= 90
                      ? "bg-emerald-500/10"
                      : successRate >= 70
                        ? "bg-amber-500/10"
                        : "bg-red-500/10"
                )}
              >
                <Pulse
                  size={22}
                  className={cn(
                    successRate === null
                      ? "text-muted-foreground"
                      : successRate >= 90
                        ? "text-emerald-500"
                        : successRate >= 70
                          ? "text-amber-500"
                          : "text-red-500"
                  )}
                />
              </div>
              <div className="min-w-0">
                <p className="text-3xl font-semibold tabular-nums">
                  {successRate !== null ? `${successRate}%` : "-"}
                </p>
                <p className="text-xs text-muted-foreground">Success rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts for failing tasks */}
      {failingTasks.length > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
                <Warning size={20} weight="fill" className="text-red-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-red-400">
                  {failingTasks.length} task
                  {failingTasks.length !== 1 ? "s" : ""} failing
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {failingTasks.map((t) => t.name).join(", ")}
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link to="/runs">View runs</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Runs & Coming Up */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <SectionHeader
            label="Recent Runs"
            action={
              <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                <Link to="/runs">
                  View all
                  <ArrowRight size={12} className="ml-1" />
                </Link>
              </Button>
            }
          />
          <Card>
            <CardContent className="p-0">
              {runs.length > 0 ? (
                <div className="divide-y divide-border/30">
                  {runs.slice(0, 6).map((run) => (
                    <RecentRunRow
                      key={run.id}
                      run={run}
                      taskName={taskNames.get(run.taskId) ?? "Unknown"}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Clock
                    size={40}
                    className="mx-auto mb-3 text-muted-foreground/30"
                  />
                  <p className="text-sm text-muted-foreground">No runs yet</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Trigger a task or wait for the schedule
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <SectionHeader
            label="Coming Up"
            action={
              <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                <Link to="/tasks">
                  View tasks
                  <ArrowRight size={12} className="ml-1" />
                </Link>
              </Button>
            }
          />
          <Card>
            <CardContent className="p-0">
              {upcomingTasks.length > 0 ? (
                <div className="divide-y divide-border/30">
                  {upcomingTasks.map((task) => (
                    <UpcomingTaskRow key={task.id} task={task} />
                  ))}
                </div>
              ) : pausedTasks > 0 ? (
                <div className="py-12 text-center">
                  <CalendarBlank
                    size={40}
                    className="mx-auto mb-3 text-muted-foreground/30"
                  />
                  <p className="text-sm text-muted-foreground">
                    No upcoming runs
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    {pausedTasks} task{pausedTasks !== 1 ? "s" : ""} paused
                  </p>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <CalendarBlank
                    size={40}
                    className="mx-auto mb-3 text-muted-foreground/30"
                  />
                  <p className="text-sm text-muted-foreground">
                    No scheduled tasks
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-4">
                    <Link to="/tasks/create">
                      <Plus size={14} className="mr-1" />
                      Create task
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* All Tasks */}
      <div className="space-y-4">
        <SectionHeader
          label="All Tasks"
          action={
            <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
              <Link to="/tasks">
                Manage
                <ArrowRight size={12} className="ml-1" />
              </Link>
            </Button>
          }
        />
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border/30">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  lastRun={lastRunByTask.get(task.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Access */}
      <div className="space-y-4">
        <SectionHeader label="Quick Access" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card variant="flat" className="p-4">
            <p className="meta-label mb-1.5">MCP Server</p>
            <code className="text-sm">npx @cronlet/mcp</code>
          </Card>
          <Card variant="flat" className="p-4">
            <p className="meta-label mb-1.5">SDK</p>
            <code className="text-sm">@cronlet/sdk</code>
          </Card>
          <Link to="/settings">
            <Card
              variant="interactive"
              className="h-full cursor-pointer p-4"
            >
              <p className="meta-label mb-1.5">API Keys</p>
              <p className="text-sm font-medium text-primary">Manage keys →</p>
            </Card>
          </Link>
          <Card variant="flat" className="p-4">
            <p className="meta-label mb-1.5">Usage</p>
            <p className="text-sm tabular-nums">
              {usage?.runAttempts ?? 0} runs this month
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function RecentRunRow({
  run,
  taskName,
}: {
  run: RunRecord;
  taskName: string;
}) {
  const statusConfig = {
    success: {
      icon: CheckCircle,
      color: "text-emerald-500",
      dot: "status-dot-success",
    },
    failure: { icon: XCircle, color: "text-red-500", dot: "status-dot-error" },
    timeout: {
      icon: Timer,
      color: "text-amber-500",
      dot: "status-dot-warning",
    },
    running: {
      icon: ArrowClockwise,
      color: "text-primary",
      dot: "status-dot-running",
    },
    queued: {
      icon: Clock,
      color: "text-muted-foreground",
      dot: "status-dot-muted",
    },
  };

  const config = statusConfig[run.status] ?? statusConfig.queued;

  return (
    <Link
      to="/runs"
      className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/30"
    >
      <div className={cn("status-dot", config.dot)} />
      <span className="flex-1 truncate text-sm font-medium transition-colors group-hover:text-primary">
        {taskName}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {formatDuration(run.durationMs)}
      </span>
      <span className="text-xs text-muted-foreground">
        {formatTimeAgo(run.createdAt)}
      </span>
    </Link>
  );
}

function UpcomingTaskRow({ task }: { task: TaskRecord }) {
  const [, setTick] = useState(0);

  // Update countdown every second
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const Icon = task.handlerType === "webhook" ? Globe : Wrench;

  return (
    <Link
      to="/tasks"
      className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/30"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon size={16} className="text-primary" />
      </div>
      <span className="flex-1 truncate text-sm font-medium transition-colors group-hover:text-primary">
        {task.name}
      </span>
      <Badge variant="outline" className="shrink-0 gap-1 font-mono text-xs">
        <Timer size={12} />
        {formatCountdown(task.nextRunAt!)}
      </Badge>
    </Link>
  );
}

function TaskRow({
  task,
  lastRun,
}: {
  task: TaskRecord;
  lastRun?: RunRecord;
}) {
  const Icon =
    task.handlerType === "webhook"
      ? Globe
      : task.handlerType === "code"
        ? Code
        : Wrench;

  const statusDot = !lastRun
    ? "status-dot-muted"
    : lastRun.status === "success"
      ? "status-dot-success"
      : lastRun.status === "failure" || lastRun.status === "timeout"
        ? "status-dot-error"
        : lastRun.status === "running"
          ? "status-dot-running"
          : "status-dot-muted";

  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: task.id }}
      className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/30"
    >
      <div className="relative">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            task.active ? "bg-primary/10" : "bg-muted"
          )}
        >
          <Icon
            size={18}
            className={task.active ? "text-primary" : "text-muted-foreground"}
          />
        </div>
        {/* Status dot */}
        <div
          className={cn(
            "status-dot absolute -bottom-0.5 -right-0.5 border-2 border-card",
            statusDot
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-sans text-sm font-medium transition-colors group-hover:text-primary">
            {task.name}
          </p>
          {getHandlerBadge(task.handlerType)}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {formatScheduleShort(task.scheduleConfig)}
        </p>
      </div>
      {!task.active ? (
        <Badge variant="outline" className="shrink-0 text-xs">
          Paused
        </Badge>
      ) : lastRun ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatTimeAgo(lastRun.createdAt)}
        </span>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">No runs</span>
      )}
    </Link>
  );
}
