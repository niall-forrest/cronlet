import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
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
  Robot,
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
import { listRuns, listTasks, seedDemoData } from "@/lib/api";
import { formatCreatedBy, formatRelativeTime, getTaskIntentSummary, getTaskNextActionSummary, getTaskPatternLabel } from "@/lib/format";
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  useEffect(() => {
    const dismissed = isGettingStartedDismissed();
    setGettingStartedDismissedState(dismissed);
    setGettingStartedOpen(!dismissed);
  }, []);

  const demoSeedMutation = useMutation({
    mutationFn: () => seedDemoData(),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      navigate({ to: "/upcoming" });
    },
  });

  const tasks = tasksQuery.data ?? [];
  const runs = runsQuery.data ?? [];
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
  const successCount = runs.filter((run) => run.status === "success").length;
  const successRate = runs.length > 0 ? Math.round((successCount / runs.length) * 100) : null;
  const recentRuns = runs.slice(0, 6);
  const next24Hours = Date.now() + 24 * 60 * 60 * 1000;
  const upcoming24Hours = tasks
    .filter((task) => task.active && task.nextRunAt)
    .filter((task) => new Date(task.nextRunAt!).getTime() <= next24Hours)
    .sort((a, b) => new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime())
    .slice(0, 6);
  const overdueTasks = tasks
    .filter((task) => task.active && task.nextRunAt)
    .filter((task) => new Date(task.nextRunAt!).getTime() < Date.now())
    .sort((a, b) => new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime())
    .slice(0, 6);
  const failingTasks = tasks.filter((task) => {
    const lastRun = lastRunByTask.get(task.id);
    return lastRun?.status === "failure" || lastRun?.status === "timeout";
  });
  const agentCreatedTasks = tasks.filter((task) => task.createdBy?.type === "agent");
  const humanCreatedTasks = tasks.filter((task) => task.createdBy?.type === "user");
  const agentTaskIds = new Set(agentCreatedTasks.map((task) => task.id));
  const agentRuns = runs.filter((run) => agentTaskIds.has(run.taskId));
  const agentFailures = agentRuns.filter((run) =>
    ["failure", "timeout", "dead_lettered", "terminal_client_error", "retry_window_expired"].includes(run.status)
  );
  const recentAgentSchedules = [...agentCreatedTasks]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);
  const topActiveAgents = Array.from(
    agentCreatedTasks.reduce((map, task) => {
      const key = task.createdBy?.id ?? task.id;
      const existing = map.get(key) ?? {
        id: key,
        name: task.createdBy?.name?.trim() || task.createdBy?.id || "Unknown agent",
        taskCount: 0,
        runCount: 0,
      };
      existing.taskCount += 1;
      map.set(key, existing);
      return map;
    }, new Map<string, { id: string; name: string; taskCount: number; runCount: number }>())
  )
    .map(([id, agent]) => ({
      ...agent,
      runCount: agentRuns.filter((run) => {
        const task = tasks.find((candidate) => candidate.id === run.taskId);
        return task?.createdBy?.id === id;
      }).length,
    }))
    .sort((a, b) => b.runCount - a.runCount || b.taskCount - a.taskCount)
    .slice(0, 5);

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
        <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">
              Overview
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              See future commitments, who created them, and what needs follow-through.
            </p>
          </div>
          <div className="flex max-w-sm flex-col items-start gap-2">
            <Button
              variant="outline"
              onClick={() => demoSeedMutation.mutate()}
              disabled={demoSeedMutation.isPending}
            >
              {demoSeedMutation.isPending ? "Loading demo data..." : "Load demo data"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Populate this org with sample schedules, runs, retries, and agent-created work.
            </p>
            {demoSeedMutation.error instanceof Error ? (
              <p className="text-sm text-destructive">
                {demoSeedMutation.error.message}
              </p>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <EmptyOverviewCard
            icon={CalendarBlank}
            title="Future commitments"
            description="One-offs, recurring wake-ups, retries, callbacks, and overdue work will all show in the same future timeline."
            bullets={[
              "See what is scheduled to happen next",
              "Track one-offs, retries, and recurring wake-ups",
              "Understand what is drifting before it is missed",
            ]}
          />
          <EmptyOverviewCard
            icon={Robot}
            title="Ownership"
            description="Cronlet keeps human-created and agent-created work in the same model, so you can see who owns each commitment."
            bullets={[
              "Separate agent-created and user-created schedules",
              "See whether work came from MCP, SDK, or dashboard",
              "Understand which actor is waiting on the next wake-up",
            ]}
          />
          <EmptyOverviewCard
            icon={Warning}
            title="Needs attention"
            description="Paused, overdue, failed, and dead-lettered commitments will surface together when they need follow-through."
            bullets={[
              "Spot wake-ups that are overdue or stuck",
              "See failures and retries tied back to their owner",
              "Know what needs intervention without digging first",
            ]}
          />
        </section>

        <section className="space-y-4">
          <SectionHeader label="Start with" />
          <div className="grid gap-4 xl:grid-cols-3">
            <PathCard
              title="Connect your personal agents"
              description="Your AI agent schedules tasks for you through MCP."
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
              description="Create a scheduled task directly in Cronlet."
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
              description="Add the SDK so your product agents can schedule work on behalf of users."
              whatYouDo="Install the SDK and wire Cronlet into your app"
              timeEstimate="~2 minutes"
              icon={Code}
              compact
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
        </section>

        <QuickReferenceCard />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div>
            <h1 className="display-title">Overview</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {upcoming24Hours.length > 0
                ? `${upcoming24Hours.length} scheduled wake-up${upcoming24Hours.length !== 1 ? "s" : ""} in the next 24 hours`
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
          title="Upcoming in 24h"
          value={String(upcoming24Hours.length)}
          subtitle={upcoming24Hours.length > 0 ? "Committed wake-ups" : "No near-term wake-ups"}
          icon={<Clock size={20} className="text-primary" />}
          iconClassName="bg-primary/10"
          to="/upcoming"
        />
        <SummaryCard
          title="Overdue"
          value={String(overdueTasks.length)}
          subtitle={overdueTasks.length > 0 ? "Needs attention" : "Nothing drifting"}
          icon={<Warning size={20} className="text-red-400" />}
          iconClassName="bg-red-500/10"
          to="/upcoming"
        />
        <SummaryCard
          title="Agent-created"
          value={String(agentCreatedTasks.length)}
          subtitle={`${humanCreatedTasks.length} created by users`}
          icon={<Robot size={20} className="text-[hsl(var(--accent))]" />}
          iconClassName="bg-[hsl(var(--accent)/0.15)]"
          to="/agent-activity"
        />
        <SummaryCard
          title="Agent Failures"
          value={String(agentFailures.length)}
          subtitle={agentFailures.length > 0 ? "Follow-through needed" : "All clear"}
          icon={<XCircle size={20} weight="fill" className="text-red-400" />}
          iconClassName="bg-red-500/10"
          to="/agent-activity"
        />
      </div>

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
            label="Upcoming in the next 24 hours"
            action={
              <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                <Link to="/upcoming">
                  Open upcoming
                  <ArrowRight size={12} className="ml-1" />
                </Link>
              </Button>
            }
          />
          <Card variant="flat">
            <CardContent className="p-0">
              {upcoming24Hours.length > 0 ? (
                <div className="divide-y divide-border/30">
                  {upcoming24Hours.map((task) => (
                    <UpcomingCommitmentRow key={task.id} task={task} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={CalendarBlank}
                  title="No wake-ups scheduled soon"
                  description="The next 24 hours are clear."
                />
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <SectionHeader
            label="Agent activity"
            action={
              <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                <Link to="/agent-activity">
                  View all
                  <ArrowRight size={12} className="ml-1" />
                </Link>
              </Button>
            }
          />
          <Card variant="flat">
            <CardContent className="p-0">
              {topActiveAgents.length > 0 ? (
                <div className="divide-y divide-border/30">
                  {topActiveAgents.map((agent) => (
                    <AgentActivityRow key={agent.id} id={agent.id} name={agent.name} taskCount={agent.taskCount} runCount={agent.runCount} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Robot}
                  title="No active agents yet"
                  description="Agent-created schedules will appear here."
                />
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <section className="space-y-4">
        <SectionHeader
          label="Recent runs"
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
            <div className="divide-y divide-border/30">
              {recentRuns.length > 0 ? (
                recentRuns.map((run) => (
                  <RecentRunRow
                    key={run.id}
                    run={run}
                    taskName={tasks.find((task) => task.id === run.taskId)?.name ?? "Unknown"}
                  />
                ))
              ) : (
                <EmptyState
                  icon={Clock}
                  title="No recent runs"
                  description="Scheduled deliveries and manual triggers will appear here."
                />
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4">
          <SectionHeader
            label="Recent autonomous commitments"
            action={
              <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                <Link to="/agent-activity">
                  View agent activity
                  <ArrowRight size={12} className="ml-1" />
                </Link>
              </Button>
            }
          />
          <Card variant="flat">
            <CardContent className="p-0">
              {recentAgentSchedules.length > 0 ? (
                <div className="divide-y divide-border/30">
                  {recentAgentSchedules.map((task) => (
                    <UpcomingCommitmentRow key={task.id} task={task} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Robot}
                  title="No recent agent schedules"
                  description="Agent-created schedules will show up here."
                />
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <SectionHeader
            label="Needs attention"
            action={
              <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
                <Link to="/upcoming">
                  View upcoming
                  <ArrowRight size={12} className="ml-1" />
                </Link>
              </Button>
            }
          />
          <Card variant="flat">
            <CardContent className="p-0">
              {overdueTasks.length > 0 ? (
                <div className="divide-y divide-border/30">
                  {overdueTasks.map((task) => (
                    <UpcomingCommitmentRow key={task.id} task={task} attention="Overdue" />
                  ))}
                </div>
              ) : agentFailures.length > 0 ? (
                <div className="divide-y divide-border/30">
                  {agentFailures.slice(0, 5).map((run) => {
                    const task = tasks.find((candidate) => candidate.id === run.taskId);
                    return (
                      <Link
                        key={run.id}
                        to="/runs/$runId"
                        params={{ runId: run.id }}
                        className="group flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/30"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">
                            {task?.name ?? run.taskId}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {task ? getTaskIntentSummary(task) : "No task summary available"}
                          </p>
                        </div>
                        <Badge variant="error">{run.status.replaceAll("_", " ")}</Badge>
                      </Link>
                    );
                  })}
                </div>
                ) : (
                  <EmptyState
                    icon={CheckCircle}
                    title="Nothing needs attention"
                    description="No overdue wake-ups or recent agent-originated failures."
                  />
                )}
          </CardContent>
        </Card>
      </section>
    </div>

      {!gettingStartedDismissed ? (
        <Collapsible open={gettingStartedOpen} onOpenChange={setGettingStartedOpen}>
          <Card variant="flat" className="border-primary/20 bg-primary/5">
            <CardContent className="py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Getting started</p>
                  <p className="text-sm text-foreground">
                    Setup stays here once you’re ready. The top of the page is now about what is already committed next.
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

      <section className="space-y-4">
        <SectionHeader
          label="All tasks"
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

      <QuickReferenceCard />
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

function EmptyOverviewCard({
  icon: Icon,
  title,
  description,
  bullets,
}: {
  icon: typeof CalendarBlank;
  title: string;
  description: string;
  bullets: string[];
}) {
  return (
    <Card variant="flat" className="h-full">
      <CardHeader className="pb-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon size={18} className="text-primary" />
        </div>
        <div className="space-y-2 pt-3">
          <CardTitle className="font-display text-lg">{title}</CardTitle>
          <CardDescription className="text-sm">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-1">
        {bullets.map((bullet) => (
          <div key={bullet} className="flex items-start gap-2 text-sm text-muted-foreground">
            <span className="mt-[7px] h-1 w-1 rounded-full bg-muted-foreground/60" />
            <span>{bullet}</span>
          </div>
        ))}
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

function QuickReferenceCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-lg">For developers and agents</CardTitle>
        <CardDescription>
          Quick setup for the SDK and MCP server.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Install the SDK</p>
          <div className="flex items-center rounded-lg border border-border/50 bg-muted/30 px-4 py-3 font-mono text-sm">
            <code className="flex-1">npm install @cronlet/sdk</code>
            <CopyButton text="npm install @cronlet/sdk" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Connect Claude via MCP</p>
          <div className="flex items-center rounded-lg border border-border/50 bg-muted/30 px-4 py-3 font-mono text-sm">
            <code className="flex-1">npx @cronlet/mcp</code>
            <CopyButton text="npx @cronlet/mcp" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentRunRow({ run, taskName }: { run: RunRecord; taskName: string }) {
  const statusConfig: Partial<Record<RunRecord["status"], { dot: string }>> = {
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
    leased: {
      dot: "status-dot-running",
    },
    retry_wait: {
      dot: "status-dot-idle",
    },
    cancelled: {
      dot: "status-dot-idle",
    },
    dead_lettered: {
      dot: "status-dot-failed",
    },
    terminal_client_error: {
      dot: "status-dot-failed",
    },
    retry_window_expired: {
      dot: "status-dot-failed",
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

function UpcomingCommitmentRow({
  task,
  attention,
}: {
  task: TaskRecord;
  attention?: string;
}) {
  return (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: task.id }}
      className="group grid gap-2 px-4 py-3 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_180px_220px]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">{task.name}</p>
          <Badge variant={attention ? "error" : "outline"}>{attention ?? getTaskPatternLabel(task)}</Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {formatCreatedBy(task.createdBy)} · {getTaskIntentSummary(task)}
        </p>
      </div>
      <div>
        <p className="text-sm text-foreground">{formatRelativeTime(task.nextRunAt)}</p>
        <p className="text-xs text-muted-foreground">{task.externalId ?? "No external ID"}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-foreground">{getTaskNextActionSummary(task)}</p>
      </div>
    </Link>
  );
}

function AgentActivityRow({
  id,
  name,
  taskCount,
  runCount,
}: {
  id: string;
  name: string;
  taskCount: number;
  runCount: number;
}) {
  return (
    <Link
      to="/agent-activity"
      className="group flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/30"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{id}</p>
      </div>
      <div className="shrink-0 text-right text-xs text-muted-foreground">
        <p>{taskCount} task{taskCount !== 1 ? "s" : ""}</p>
        <p>{runCount} run{runCount !== 1 ? "s" : ""}</p>
      </div>
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
