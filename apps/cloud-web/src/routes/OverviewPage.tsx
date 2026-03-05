import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { TaskRecord } from "@cronlet/cloud-shared";
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
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton, SkeletonCard, SkeletonRow } from "@/components/Skeleton";
import { listTasks, listRuns, listProjects } from "@/lib/api";

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

function RecentRun({
  name,
  status,
  time,
  duration,
}: {
  name: string;
  status: string;
  time: string;
  duration: string;
}) {
  const statusColors: Record<string, string> = {
    success: "text-green-400",
    failure: "text-red-400",
    timeout: "text-yellow-400",
    running: "text-blue-400",
    queued: "text-muted-foreground",
  };

  const statusIcons: Record<string, React.ReactNode> = {
    success: <CheckCircle size={16} weight="fill" className={statusColors.success} />,
    failure: <XCircle size={16} weight="fill" className={statusColors.failure} />,
    timeout: <Timer size={16} weight="fill" className={statusColors.timeout} />,
    running: <Clock size={16} className="text-blue-400 animate-pulse" />,
    queued: <Clock size={16} className={statusColors.queued} />,
  };

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-card/50 transition-colors">
      {statusIcons[status] ?? statusIcons.queued}
      <span className="flex-1 font-medium text-sm truncate">{name}</span>
      <span className="text-xs text-muted-foreground">{time}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{duration}</span>
    </div>
  );
}

function TaskPreview({ task }: { task: TaskRecord }) {
  const Icon = task.handlerType === "webhook" ? Globe : Wrench;

  return (
    <Link
      to="/tasks"
      className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-card/50 transition-colors group"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10">
        <Icon size={16} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{task.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {formatScheduleShort(task.scheduleConfig)}
        </p>
      </div>
      {task.active ? (
        <Badge variant="secondary" className="text-xs">Active</Badge>
      ) : (
        <Badge variant="outline" className="text-xs">Paused</Badge>
      )}
    </Link>
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
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return then.toLocaleDateString();
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function OverviewPage() {
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const tasksQuery = useQuery({ queryKey: ["tasks"], queryFn: () => listTasks() });
  const runsQuery = useQuery({
    queryKey: ["runs"],
    queryFn: () => listRuns(undefined, 10),
    refetchInterval: 5000,
  });

  const isLoading = projectsQuery.isLoading || tasksQuery.isLoading;
  const projects = projectsQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const runs = runsQuery.data ?? [];

  const hasTasks = tasks.length > 0;
  const hasProjects = projects.length > 0;

  // Calculate stats
  const activeTasks = tasks.filter((t) => t.active).length;
  const recentSuccesses = runs.filter((r) => r.status === "success").length;
  const recentFailures = runs.filter((r) => r.status === "failure" || r.status === "timeout").length;

  // Task name lookup
  const taskNames = new Map<string, string>();
  tasks.forEach((t) => taskNames.set(t.id, t.name));

  // Format recent runs
  const recentRuns = runs.slice(0, 5).map((run) => ({
    id: run.id,
    name: taskNames.get(run.taskId) ?? run.taskId,
    status: run.status,
    time: formatTimeAgo(run.createdAt),
    duration: formatDuration(run.durationMs),
  }));

  // Show skeleton dashboard while loading (LCP optimization)
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
        <div className="grid grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
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
              <Skeleton className="h-5 w-16" />
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

  // New user experience
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
            {!hasProjects && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm mb-3">
                  First, create a project to organize your tasks.
                </p>
                <Button asChild size="sm">
                  <Link to="/projects">
                    <Plus size={14} className="mr-2" />
                    Create Project
                  </Link>
                </Button>
              </div>
            )}

            {hasProjects && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm mb-3">
                  Create a task to start scheduling automated actions.
                </p>
                <Button asChild size="sm">
                  <Link to="/tasks">
                    <Plus size={14} className="mr-2" />
                    Create Task
                  </Link>
                </Button>
              </div>
            )}

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
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display-title">Overview</h1>
          <p className="text-muted-foreground mt-1">
            {activeTasks} active task{activeTasks !== 1 ? "s" : ""} running
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/tasks">
            <Plus size={14} className="mr-2" />
            New Task
          </Link>
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-border/50 bg-card/60">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Clock size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{activeTasks}</p>
                <p className="text-xs text-muted-foreground">Active tasks</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/60">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle size={20} weight="fill" className="text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{recentSuccesses}</p>
                <p className="text-xs text-muted-foreground">Successful</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/60">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <XCircle size={20} weight="fill" className="text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{recentFailures}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Recent runs */}
        <Card className="border-border/50 bg-card/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Recent Runs</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/runs">
                  View all
                  <ArrowRight size={14} className="ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recentRuns.length > 0 ? (
              <div className="space-y-1">
                {recentRuns.map((run) => (
                  <RecentRun
                    key={run.id}
                    name={run.name}
                    status={run.status}
                    time={run.time}
                    duration={run.duration}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No runs yet. Trigger a task or wait for the schedule.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Active tasks */}
        <Card className="border-border/50 bg-card/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Tasks</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/tasks">
                  View all
                  <ArrowRight size={14} className="ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {tasks.slice(0, 5).map((task) => (
                <TaskPreview key={task.id} task={task} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
