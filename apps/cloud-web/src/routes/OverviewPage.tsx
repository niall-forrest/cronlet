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
  Sparkle,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      className="ml-2 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check size={14} weight="bold" className="text-green-400" /> : <Copy size={14} />}
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

export function OverviewPage() {
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: () => listTasks() });
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
  const runningNow = runs.filter((r) => r.status === "running" || r.status === "queued").length;
  const completedRuns = runs.filter((r) => r.status === "success" || r.status === "failure" || r.status === "timeout");
  const successCount = completedRuns.filter((r) => r.status === "success").length;
  const failureCount = completedRuns.filter((r) => r.status === "failure" || r.status === "timeout").length;
  const successRate = completedRuns.length > 0 ? Math.round((successCount / completedRuns.length) * 100) : null;

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
    return lastRun && (lastRun.status === "failure" || lastRun.status === "timeout");
  });

  // Get next scheduled runs
  const upcomingTasks = tasks
    .filter((t) => t.active && t.nextRunAt)
    .sort((a, b) => new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime())
    .slice(0, 5);

  // Show skeleton dashboard while loading
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="display-title">Overview</h1>
            <Skeleton className="h-4 w-32 mt-2" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card className="border-border/50 bg-card/60">
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-28" />
            </CardHeader>
            <CardContent className="space-y-1">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/60">
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
        <div className="text-center pt-8 pb-4">
          <h1 className="display-title text-3xl mb-3">Welcome to Cronlet</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Scheduled tasks for developers and AI agents. Create a task and we'll run it on schedule.
            No cron syntax. No infrastructure. Works with Claude via MCP.
          </p>
        </div>

        {/* Get started */}
        <Card className="border-border/50 bg-card/60 max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Get Started</CardTitle>
            <CardDescription>
              Create your first scheduled task in under a minute
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm mb-3">
                Create a task to start scheduling automated actions.
              </p>
              <Button asChild size="sm">
                <Link to="/tasks/create">
                  <Plus size={14} className="mr-2" />
                  Create Task
                </Link>
              </Button>
            </div>

            <div className="pt-4 border-t border-border/50">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
                What can you build?
              </p>
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
        <Card className="border-border/50 bg-card/60 max-w-2xl mx-auto">
          <CardHeader className="pb-2">
            <CardTitle>For Developers & Agents</CardTitle>
            <CardDescription>
              Use our MCP server with Claude, or integrate via SDK. Tasks support callbacks for autonomous agent loops.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Connect Claude via MCP:</p>
              <div className="flex items-center bg-background/50 rounded-md px-4 py-3 font-mono text-sm">
                <code className="flex-1">npx @cronlet/mcp</code>
                <CopyButton text="npx @cronlet/mcp" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Or install the SDK:</p>
              <div className="flex items-center bg-background/50 rounded-md px-4 py-3 font-mono text-sm">
                <code className="flex-1">npm install @cronlet/sdk</code>
                <CopyButton text="npm install @cronlet/sdk" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground pt-2 border-t border-border/50">
              Agents can create tasks, receive callbacks on completion, and store metadata across runs.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Returning user dashboard
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display-title">Overview</h1>
          <p className="text-muted-foreground mt-1">
            {runningNow > 0 ? (
              <span className="text-primary">
                <Pulse size={14} className="inline mr-1 animate-pulse" />
                {runningNow} task{runningNow !== 1 ? "s" : ""} running now
              </span>
            ) : (
              `${activeTasks} active task${activeTasks !== 1 ? "s" : ""}`
            )}
          </p>
        </div>
        <Button asChild>
          <Link to="/tasks/create">
            <Plus size={14} className="mr-2" />
            New Task
          </Link>
        </Button>
      </div>

      {/* Stats cards - clickable */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to="/tasks">
          <Card className="border-border/50 bg-card/60 hover:border-primary/50 hover:bg-card/80 transition-all cursor-pointer h-full">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Clock size={20} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-semibold tabular-nums">{activeTasks}</p>
                  <p className="text-xs text-muted-foreground">Active tasks</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/runs">
          <Card className="border-border/50 bg-card/60 hover:border-green-500/50 hover:bg-card/80 transition-all cursor-pointer h-full">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                  <CheckCircle size={20} weight="fill" className="text-green-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-semibold tabular-nums">{successCount}</p>
                  <p className="text-xs text-muted-foreground">Successful runs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/runs">
          <Card className="border-border/50 bg-card/60 hover:border-red-500/50 hover:bg-card/80 transition-all cursor-pointer h-full">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                  <XCircle size={20} weight="fill" className="text-red-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-semibold tabular-nums">{failureCount}</p>
                  <p className="text-xs text-muted-foreground">Failed runs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card className="border-border/50 bg-card/60 h-full">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                successRate === null ? "bg-muted" :
                successRate >= 90 ? "bg-green-500/10" :
                successRate >= 70 ? "bg-yellow-500/10" :
                "bg-red-500/10"
              )}>
                <Pulse size={20} className={cn(
                  successRate === null ? "text-muted-foreground" :
                  successRate >= 90 ? "text-green-500" :
                  successRate >= 70 ? "text-yellow-500" :
                  "text-red-500"
                )} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold tabular-nums">
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
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Warning size={20} weight="fill" className="text-red-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-red-500">
                  {failingTasks.length} task{failingTasks.length !== 1 ? "s" : ""} failing
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent runs - clickable rows */}
        <Card className="border-border/50 bg-card/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Recent Runs</CardTitle>
              <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                <Link to="/runs">
                  View all
                  <ArrowRight size={12} className="ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {runs.length > 0 ? (
              <div className="space-y-1">
                {runs.slice(0, 6).map((run) => (
                  <RecentRunRow
                    key={run.id}
                    run={run}
                    taskName={taskNames.get(run.taskId) ?? "Unknown"}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Clock size={32} className="text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No runs yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Trigger a task or wait for the schedule
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming runs */}
        <Card className="border-border/50 bg-card/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Coming Up</CardTitle>
              <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                <Link to="/tasks">
                  View tasks
                  <ArrowRight size={12} className="ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {upcomingTasks.length > 0 ? (
              <div className="space-y-1">
                {upcomingTasks.map((task) => (
                  <UpcomingTaskRow key={task.id} task={task} />
                ))}
              </div>
            ) : pausedTasks > 0 ? (
              <div className="text-center py-8">
                <CalendarBlank size={32} className="text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No upcoming runs</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {pausedTasks} task{pausedTasks !== 1 ? "s" : ""} paused
                </p>
              </div>
            ) : (
              <div className="text-center py-8">
                <CalendarBlank size={32} className="text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No scheduled tasks</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link to="/tasks/create">
                    <Plus size={12} className="mr-1" />
                    Create task
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Task list */}
      <Card className="border-border/50 bg-card/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">All Tasks</CardTitle>
            <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
              <Link to="/tasks">
                Manage
                <ArrowRight size={12} className="ml-1" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-1">
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

      {/* Developer quick access */}
      <Card className="border-border/50 bg-card/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkle size={16} className="text-primary" />
            <CardTitle className="text-base font-semibold">Quick Access</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">MCP Server</p>
              <code className="text-xs font-mono">npx @cronlet/mcp</code>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">SDK</p>
              <code className="text-xs font-mono">@cronlet/sdk</code>
            </div>
            <Link to="/settings" className="rounded-lg border border-border/50 bg-muted/30 p-3 hover:border-primary/50 transition-colors">
              <p className="text-xs text-muted-foreground mb-1">API Keys</p>
              <p className="text-xs font-medium text-primary">Manage keys →</p>
            </Link>
            <Link to="/settings" className="rounded-lg border border-border/50 bg-muted/30 p-3 hover:border-primary/50 transition-colors">
              <p className="text-xs text-muted-foreground mb-1">Usage</p>
              <p className="text-xs font-medium tabular-nums">
                {usage?.runAttempts ?? 0} runs this month
              </p>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RecentRunRow({ run, taskName }: { run: RunRecord; taskName: string }) {
  const statusConfig = {
    success: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-500" },
    failure: { icon: XCircle, color: "text-red-500", bg: "bg-red-500" },
    timeout: { icon: Timer, color: "text-yellow-500", bg: "bg-yellow-500" },
    running: { icon: ArrowClockwise, color: "text-blue-500", bg: "bg-blue-500" },
    queued: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted-foreground" },
  };

  const config = statusConfig[run.status] ?? statusConfig.queued;
  const Icon = config.icon;

  return (
    <Link
      to="/runs"
      className="flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-md hover:bg-muted/50 transition-colors group"
    >
      <Icon
        size={16}
        weight={run.status === "success" || run.status === "failure" ? "fill" : "regular"}
        className={cn(config.color, run.status === "running" && "animate-spin")}
      />
      <span className="flex-1 text-sm font-medium truncate group-hover:text-primary transition-colors">
        {taskName}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
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
      className="flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-md hover:bg-muted/50 transition-colors group"
    >
      <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
        <Icon size={14} className="text-primary" />
      </div>
      <span className="flex-1 text-sm font-medium truncate group-hover:text-primary transition-colors">
        {task.name}
      </span>
      <Badge variant="outline" className="text-xs font-mono tabular-nums gap-1 shrink-0">
        <Timer size={10} />
        {formatCountdown(task.nextRunAt!)}
      </Badge>
    </Link>
  );
}

function TaskRow({ task, lastRun }: { task: TaskRecord; lastRun?: RunRecord }) {
  const Icon = task.handlerType === "webhook" ? Globe : Wrench;

  const statusColor = !lastRun ? "bg-muted-foreground/50" :
    lastRun.status === "success" ? "bg-green-500" :
    lastRun.status === "failure" || lastRun.status === "timeout" ? "bg-red-500" :
    lastRun.status === "running" ? "bg-blue-500" :
    "bg-muted-foreground/50";

  return (
    <Link
      to="/tasks"
      className="flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-md hover:bg-muted/50 transition-colors group"
    >
      <div className="relative">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
          task.active ? "bg-primary/10" : "bg-muted"
        )}>
          <Icon size={16} className={task.active ? "text-primary" : "text-muted-foreground"} />
        </div>
        {/* Status dot */}
        <div className={cn(
          "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card",
          statusColor
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
          {task.name}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {formatScheduleShort(task.scheduleConfig)}
        </p>
      </div>
      {!task.active ? (
        <Badge variant="outline" className="text-xs shrink-0">Paused</Badge>
      ) : lastRun ? (
        <span className="text-xs text-muted-foreground shrink-0">
          {formatTimeAgo(lastRun.createdAt)}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground shrink-0">No runs</span>
      )}
    </Link>
  );
}
