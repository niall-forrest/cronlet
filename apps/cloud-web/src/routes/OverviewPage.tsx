import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { TaskRecord, RunRecord } from "@cronlet/shared";
import {
  ArrowRight,
  CalendarBlank,
  CaretDown,
  Check,
  CheckCircle,
  Clock,
  Code,
  Copy,
  Globe,
  Lightning,
  Plus,
  Pulse,
  Robot,
  Timer,
  Warning,
  Wrench,
  X,
  XCircle,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton, SkeletonCard, SkeletonRow } from "@/components/Skeleton";
import { listRuns, listTasks, getUsage } from "@/lib/api";
import { isGettingStartedDismissed, setGettingStartedDismissed } from "@/lib/onboarding";
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

export function OverviewPage() {
  const [gettingStartedOpen, setGettingStartedOpen] = useState(false);
  const [gettingStartedDismissed, setGettingStartedDismissedState] = useState(false);

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

  useEffect(() => {
    const dismissed = isGettingStartedDismissed();
    setGettingStartedDismissedState(dismissed);
    setGettingStartedOpen(!dismissed);
  }, []);

  const tasks = tasksQuery.data ?? [];
  const runs = runsQuery.data ?? [];
  const usage = usageQuery.data;
  const hasTasks = tasks.length > 0;

  const lastRunByTask = useMemo(() => {
    const map = new Map<string, RunRecord>();
    for (const run of runs) {
      if (!map.has(run.taskId)) {
        map.set(run.taskId, run);
      }
    }
    return map;
  }, [runs]);

  const activeTasks = tasks.filter((task) => task.active).length;
  const pausedTasks = tasks.filter((task) => !task.active).length;
  const runningNow = runs.filter((run) => run.status === "running" || run.status === "queued").length;
  const successCount = runs.filter((run) => run.status === "success").length;
  const failureCount = runs.filter((run) => run.status === "failure" || run.status === "timeout").length;
  const successRate = runs.length > 0 ? Math.round((successCount / runs.length) * 100) : null;
  const recentRuns = runs.slice(0, 6);
  const upcomingTasks = tasks
    .filter((task) => task.active && task.nextRunAt)
    .sort((a, b) => new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime())
    .slice(0, 5);
  const failingTasks = tasks.filter((task) => {
    const lastRun = lastRunByTask.get(task.id);
    return lastRun?.status === "failure" || lastRun?.status === "timeout";
  });

  if (tasksQuery.isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="mt-2 h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

  if (!hasTasks) {
    return (
      <div className="space-y-10">
        <section className="space-y-3">
          <p className="meta-label">Overview</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
            What do you want to build?
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Choose your path to get started in under a minute.
          </p>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <PathCard
            title="Connect your personal agents"
            description="Your AI agent schedules tasks for you — monitoring, follow-ups, reports — autonomously through MCP"
            whatYouDo="Paste one config into Claude Desktop and start chatting"
            timeEstimate="~30 seconds"
            icon={Robot}
            action={
              <Button asChild className="w-full">
                <Link to="/agent-connect">
                  Connect Agent
                  <ArrowRight size={14} className="ml-2" />
                </Link>
              </Button>
            }
          />
          <PathCard
            title="Build an automation"
            description="You set up the scheduled task — pick a template, customize it, deploy. Uptime checks, AI content pipelines, Slack digests, and more."
            whatYouDo="Pick a template, fill in the details, hit create"
            timeEstimate="~1 minute"
            icon={Lightning}
            action={
              <Button asChild className="w-full">
                <Link to="/tasks/create/templates">
                  Browse Templates
                  <ArrowRight size={14} className="ml-2" />
                </Link>
              </Button>
            }
          />
          <PathCard
            title="Give your agents scheduling"
            description="Your product's AI agents schedule tasks on behalf of your users — follow-ups, reports, alerts — through the SDK"
            whatYouDo="Add the SDK to your app, your agents handle the rest"
            timeEstimate="~2 minutes"
            icon={Code}
            featured
            action={
              <Button asChild className="w-full">
                <a href="/agent-connect#sdk">
                  View SDK Setup
                  <ArrowRight size={14} className="ml-2" />
                </a>
              </Button>
            }
          />
        </section>

        <QuickReferenceCard usage={usage?.runAttempts ?? 0} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="meta-label">Overview</p>
          <div>
            <h1 className="display-title">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {runningNow > 0
                ? `${runningNow} task${runningNow !== 1 ? "s" : ""} running now`
                : `${activeTasks} active task${activeTasks !== 1 ? "s" : ""} with ${successRate ?? 0}% recent success`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {gettingStartedDismissed ? (
            <Button
              variant="outline"
              onClick={() => {
                setGettingStartedDismissed(false);
                setGettingStartedDismissedState(false);
                setGettingStartedOpen(true);
              }}
            >
              Show Getting Started
            </Button>
          ) : null}
          <Button asChild>
            <Link to="/tasks/create">
              <Plus size={16} className="mr-2" />
              New Task
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Active Tasks"
          value={String(activeTasks)}
          subtitle={`${pausedTasks} paused`}
          icon={<Clock size={20} className="text-primary" />}
          iconClassName="bg-primary/10"
          to="/tasks"
        />
        <SummaryCard
          title="Recent Runs"
          value={String(runs.length)}
          subtitle={runningNow > 0 ? `${runningNow} in flight` : "Last 50 executions"}
          icon={<Pulse size={20} className="text-[hsl(var(--accent))]" />}
          iconClassName="bg-[hsl(var(--accent)/0.15)]"
          to="/runs"
        />
        <SummaryCard
          title="Success Rate"
          value={successRate !== null ? `${successRate}%` : "—"}
          subtitle={`${successCount} succeeded`}
          icon={<CheckCircle size={20} weight="fill" className="text-emerald-400" />}
          iconClassName="bg-emerald-500/10"
          to="/runs"
        />
        <SummaryCard
          title="Failures"
          value={String(failureCount)}
          subtitle={failureCount > 0 ? "Needs attention" : "All clear"}
          icon={<XCircle size={20} weight="fill" className="text-red-400" />}
          iconClassName="bg-red-500/10"
          to="/runs"
        />
      </div>

      {!gettingStartedDismissed ? (
        <Collapsible open={gettingStartedOpen} onOpenChange={setGettingStartedOpen}>
          <Card variant="flat" className="border-primary/20 bg-primary/5">
            <CardContent className="py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="meta-label">Getting Started</p>
                  <p className="text-sm text-foreground">
                    Keep exploring the other two paths as you onboard more use cases.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    You already have tasks running, so this stays out of the way unless you want it.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm">
                      {gettingStartedOpen ? "Collapse" : "Expand"}
                      <CaretDown
                        size={14}
                        className={cn("ml-2 transition-transform", gettingStartedOpen && "rotate-180")}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setGettingStartedDismissed(true);
                      setGettingStartedDismissedState(true);
                    }}
                  >
                    <X size={14} />
                  </Button>
                </div>
              </div>
              <CollapsibleContent className="mt-5">
                <div className="grid gap-4 xl:grid-cols-3">
                  <PathCard
                    title="Connect your agent"
                    description="Your AI agent schedules tasks for you — monitoring, follow-ups, reports — autonomously through MCP."
                    whatYouDo="Paste one config into Claude Desktop and start chatting"
                    timeEstimate="~30 seconds"
                    icon={Robot}
                    compact
                    action={
                      <Button asChild className="w-full">
                        <Link to="/agent-connect">
                          Connect Agent
                          <ArrowRight size={14} className="ml-2" />
                        </Link>
                      </Button>
                    }
                  />
                  <PathCard
                    title="Build an automation"
                    description="You set up the scheduled task — pick a template, customize it, deploy. Uptime checks, AI content pipelines, Slack digests, and more."
                    whatYouDo="Pick a template, fill in the details, hit create"
                    timeEstimate="~1 minute"
                    icon={Lightning}
                    compact
                    action={
                      <Button asChild className="w-full">
                        <Link to="/tasks/create/templates">
                          Browse Templates
                          <ArrowRight size={14} className="ml-2" />
                        </Link>
                      </Button>
                    }
                  />
                  <PathCard
                    title="Give your agents scheduling"
                    description="Your product's AI agents schedule tasks on behalf of your users — follow-ups, reports, alerts — through the SDK."
                    whatYouDo="Add the SDK to your app, your agents handle the rest"
                    timeEstimate="~2 minutes"
                    icon={Code}
                    compact
                    featured
                    action={
                      <Button asChild className="w-full">
                        <a href="/agent-connect#sdk">
                          View SDK Setup
                          <ArrowRight size={14} className="ml-2" />
                        </a>
                      </Button>
                    }
                  />
                </div>
              </CollapsibleContent>
            </CardContent>
          </Card>
        </Collapsible>
      ) : null}

      {failingTasks.length > 0 ? (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-start gap-4 py-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
              <Warning size={20} weight="fill" className="text-red-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-red-400">
                {failingTasks.length} task{failingTasks.length !== 1 ? "s" : ""} failing right now
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {failingTasks.map((task) => task.name).join(", ")}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/runs">View runs</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4">
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
          <Card variant="flat">
            <CardContent className="p-0">
              {recentRuns.length > 0 ? (
                <div className="divide-y divide-border/30">
                  {recentRuns.map((run) => (
                    <RecentRunRow
                      key={run.id}
                      run={run}
                      taskName={tasks.find((task) => task.id === run.taskId)?.name ?? "Unknown"}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Clock}
                  title="No runs yet"
                  description="Trigger a task or wait for the schedule."
                />
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
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
          <Card variant="flat">
            <CardContent className="p-0">
              {upcomingTasks.length > 0 ? (
                <div className="divide-y divide-border/30">
                  {upcomingTasks.map((task) => (
                    <UpcomingTaskRow key={task.id} task={task} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={CalendarBlank}
                  title="No upcoming runs"
                  description={pausedTasks > 0 ? `${pausedTasks} task${pausedTasks !== 1 ? "s" : ""} paused` : "Create another scheduled task."}
                />
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <section className="space-y-4">
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
        <Card variant="flat">
          <CardContent className="p-0">
            <div className="divide-y divide-border/30">
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} lastRun={lastRunByTask.get(task.id)} />
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <QuickReferenceCard usage={usage?.runAttempts ?? 0} />
    </div>
  );
}

function PathCard({
  title,
  description,
  whatYouDo,
  timeEstimate,
  icon: Icon,
  action,
  compact = false,
  featured = false,
}: {
  title: string;
  description: string;
  whatYouDo: string;
  timeEstimate: string;
  icon: typeof Robot;
  action: React.ReactNode;
  compact?: boolean;
  featured?: boolean;
}) {
  return (
    <Card
      variant="interactive"
      className={cn(
        "h-full bg-gradient-to-b from-card via-card to-card/60",
        compact ? "border-border/40" : "border-primary/10"
        ,
        featured && "border-[hsl(var(--accent)/0.4)] bg-gradient-to-b from-[hsl(var(--accent)/0.09)] via-card to-card shadow-[0_0_0_1px_hsl(var(--accent)/0.12)]"
      )}
    >
      <CardHeader className={compact ? "pb-2" : undefined}>
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10",
              featured && "bg-[hsl(var(--accent)/0.18)]"
            )}
          >
            <Icon
              size={22}
              className={cn("text-primary", featured && "text-[hsl(var(--accent))]")}
            />
          </div>
          <div className="flex flex-col items-end gap-2">
            {featured ? (
              <Badge className="border-[hsl(var(--accent)/0.35)] bg-[hsl(var(--accent)/0.18)] text-[hsl(var(--accent))] hover:bg-[hsl(var(--accent)/0.18)]">
                Most Powerful
              </Badge>
            ) : null}
            <Badge variant="outline">{timeEstimate}</Badge>
          </div>
        </div>
        <div className="space-y-2">
          <CardTitle className="font-display text-lg mt-4">{title}</CardTitle>
          <CardDescription className="text-sm">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="mt-auto space-y-4">
        <div className="rounded-xl border border-border/40 bg-background/40 p-4">
          <p className="meta-label mb-1">What you’ll do</p>
          <p className="text-sm text-foreground">{whatYouDo}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  iconClassName,
  to,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  iconClassName: string;
  to: string;
}) {
  return (
    <Link to={to}>
      <Card variant="interactive" className="h-full">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconClassName)}>
              {icon}
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tabular-nums">{value}</p>
              <p className="meta-label">{title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function QuickReferenceCard({ usage }: { usage: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-lg">For Developers & Agents</CardTitle>
        <CardDescription>
          Quick reference for the MCP server and SDK, plus a live usage snapshot.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Connect Claude via MCP</p>
          <div className="flex items-center rounded-lg border border-border/50 bg-muted/30 px-4 py-3 font-mono text-sm">
            <code className="flex-1">npx @cronlet/mcp</code>
            <CopyButton text="npx @cronlet/mcp" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Install the SDK</p>
          <div className="flex items-center rounded-lg border border-border/50 bg-muted/30 px-4 py-3 font-mono text-sm">
            <code className="flex-1">npm install @cronlet/sdk</code>
            <CopyButton text="npm install @cronlet/sdk" />
          </div>
        </div>
        <div className="rounded-xl border border-border/40 bg-card/30 p-4">
          <p className="meta-label mb-1.5">Usage This Month</p>
          <p className="text-lg font-semibold tabular-nums">{usage} run attempts</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Keep an eye on volume as you expand beyond the first task.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentRunRow({ run, taskName }: { run: RunRecord; taskName: string }) {
  const statusConfig = {
    success: {
      dot: "status-dot-success",
    },
    failure: {
      dot: "status-dot-failed",
    },
    timeout: {
      dot: "status-dot-failed",
    },
    running: {
      dot: "status-dot-running",
    },
    queued: {
      dot: "status-dot-idle",
    },
  };

  return (
    <Link
      to="/runs/$runId"
      params={{ runId: run.id }}
      className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/30"
    >
      <div className={cn("status-dot", statusConfig[run.status]?.dot ?? "status-dot-idle")} />
      <span className="flex-1 truncate text-sm font-medium transition-colors group-hover:text-primary">
        {taskName}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {formatDuration(run.durationMs)}
      </span>
      <span className="text-xs text-muted-foreground">{formatTimeAgo(run.createdAt)}</span>
    </Link>
  );
}

function UpcomingTaskRow({ task }: { task: TaskRecord }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const Icon = task.handlerType === "webhook" ? Globe : Wrench;

  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: task.id }}
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

function TaskRow({ task, lastRun }: { task: TaskRecord; lastRun?: RunRecord }) {
  const Icon = task.handlerType === "webhook" ? Globe : Wrench;
  const statusDot = !lastRun
    ? "status-dot-idle"
    : lastRun.status === "success"
      ? "status-dot-success"
      : lastRun.status === "failure" || lastRun.status === "timeout"
        ? "status-dot-failed"
        : lastRun.status === "running" || lastRun.status === "queued"
          ? "status-dot-running"
          : "status-dot-idle";

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
          <Icon size={18} className={task.active ? "text-primary" : "text-muted-foreground"} />
        </div>
        <div
          className={cn(
            "status-dot absolute -bottom-0.5 -right-0.5 border-2 border-card",
            statusDot
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">
            {task.name}
          </p>
          <Badge variant={task.handlerType === "tools" ? "tools" : "webhook"}>
            {task.handlerType.toUpperCase()}
          </Badge>
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
        <span className="shrink-0 text-xs text-muted-foreground">{formatTimeAgo(lastRun.createdAt)}</span>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">No runs</span>
      )}
    </Link>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Clock;
  title: string;
  description: string;
}) {
  return (
    <div className="py-12 text-center">
      <Icon size={36} className="mx-auto mb-3 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground/70">{description}</p>
    </div>
  );
}

function formatScheduleShort(config: TaskRecord["scheduleConfig"]): string {
  switch (config.type) {
    case "every":
      return `Every ${config.interval}`;
    case "daily":
      return `Daily at ${config.times[0]}`;
    case "weekly":
      return `Weekly on ${config.days.join(", ")} at ${config.time}`;
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
  if (diffMs < 10000) return "just now";
  if (diffMs < 60000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return `${Math.floor(diffMs / 86400000)}d ago`;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
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
