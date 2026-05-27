import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ScheduleType, TaskRecord, TaskSource } from "@cronlet/shared";
import { CalendarBlank, Robot, WarningCircle } from "@phosphor-icons/react";
import { listTasksWithFilters } from "@/lib/api";
import {
  formatCreatedBy,
  formatDateTime,
  formatRelativeTime,
  formatTaskSource,
  getTaskDestination,
  getTaskIntentSummary,
  getTaskLifecycleSummary,
  getTaskNextActionSummary,
  getTaskPatternLabel,
} from "@/lib/format";
import { FilterMenu, MetricTile, PageHeader, SectionCard, StatusBadge } from "@/components/operator-ui";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ActorFilter = "all" | "agent" | "user";
type ExternalIdFilter = "all" | "with" | "without";
type HorizonFilter = "1h" | "24h" | "7d";

const horizonOptions: Array<{ label: string; value: HorizonFilter }> = [
  { label: "Next 1h", value: "1h" },
  { label: "Next 24h", value: "24h" },
  { label: "Next 7d", value: "7d" },
];

const originOptions: Array<{ label: string; value: TaskSource | "all" }> = [
  { label: "All origins", value: "all" },
  { label: "Dashboard", value: "dashboard" },
  { label: "MCP", value: "mcp" },
  { label: "SDK", value: "sdk" },
];

const actorOptions: Array<{ label: string; value: ActorFilter }> = [
  { label: "All actors", value: "all" },
  { label: "Agents", value: "agent" },
  { label: "Users", value: "user" },
];

const externalIdOptions: Array<{ label: string; value: ExternalIdFilter }> = [
  { label: "All IDs", value: "all" },
  { label: "With external ID", value: "with" },
  { label: "Without external ID", value: "without" },
];

const scheduleOptions: Array<{ label: string; value: ScheduleType | "all" }> = [
  { label: "All schedules", value: "all" },
  { label: "Once", value: "once" },
  { label: "Every", value: "every" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Cron", value: "cron" },
];

function getHorizonEnd(horizon: HorizonFilter): string {
  const now = new Date();
  switch (horizon) {
    case "1h":
      now.setHours(now.getHours() + 1);
      break;
    case "24h":
      now.setHours(now.getHours() + 24);
      break;
    case "7d":
      now.setDate(now.getDate() + 7);
      break;
  }
  return now.toISOString();
}

function getUpcomingState(task: TaskRecord): {
  label: string;
  variant: "success" | "warning" | "error" | "secondary";
} {
  if (!task.active) {
    return { label: "Paused", variant: "secondary" };
  }
  if (task.nextRunAt && new Date(task.nextRunAt).getTime() < Date.now()) {
    return { label: "Overdue", variant: "error" };
  }
  if (task.scheduleType === "once") {
    return { label: "One-off", variant: "warning" };
  }
  return { label: "Scheduled", variant: "success" };
}

export function UpcomingPage() {
  const [horizon, setHorizon] = useState<HorizonFilter>("24h");
  const [query, setQuery] = useState("");
  const [originFilter, setOriginFilter] = useState<TaskSource | "all">("all");
  const [actorFilter, setActorFilter] = useState<ActorFilter>("all");
  const [externalIdFilter, setExternalIdFilter] = useState<ExternalIdFilter>("all");
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleType | "all">("all");

  const tasksQuery = useQuery({
    queryKey: ["upcoming", horizon],
    queryFn: () =>
      listTasksWithFilters({
        nextRunBefore: getHorizonEnd(horizon),
        limit: 500,
      }),
    refetchInterval: 10000,
  });

  const visibleTasks = useMemo(() => {
    return (tasksQuery.data ?? [])
      .filter((task) => task.nextRunAt)
      .filter((task) => {
        if (originFilter !== "all" && task.source !== originFilter) return false;
        if (actorFilter !== "all" && task.createdBy?.type !== actorFilter) return false;
        if (externalIdFilter === "with" && !task.externalId) return false;
        if (externalIdFilter === "without" && task.externalId) return false;
        if (scheduleFilter !== "all" && task.scheduleType !== scheduleFilter) return false;

        if (!query.trim()) return true;
        const haystack = [
          task.name,
          task.externalId ?? "",
          formatCreatedBy(task.createdBy),
          formatTaskSource(task.source),
          getTaskDestination(task) ?? "",
          getTaskIntentSummary(task),
        ].join(" ").toLowerCase();
        return haystack.includes(query.toLowerCase());
      })
      .sort((a, b) => new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime());
  }, [actorFilter, externalIdFilter, horizon, originFilter, query, scheduleFilter, tasksQuery.data]);

  const overdueCount = visibleTasks.filter((task) => task.nextRunAt && new Date(task.nextRunAt).getTime() < Date.now()).length;
  const oneOffCount = visibleTasks.filter((task) => task.scheduleType === "once").length;
  const agentCount = visibleTasks.filter((task) => task.createdBy?.type === "agent").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upcoming"
        description="See what autonomous actors and product workflows are committed to do next."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="In horizon" value={visibleTasks.length} detail={`Window ${horizonOptions.find((option) => option.value === horizon)?.label.toLowerCase()}`} />
        <MetricTile label="Overdue" value={overdueCount} detail={overdueCount > 0 ? "Needs attention now" : "Nothing is drifting"} />
        <MetricTile label="Agent-created" value={agentCount} detail="Owned by autonomous actors" />
        <MetricTile label="One-offs" value={oneOffCount} detail="Single wake-ups in view" />
      </div>

      <SectionCard
        title="Future commitments"
        description="Every row is a scheduled wake-up, grouped by who created it and what happens next."
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search task, actor, destination, or intent"
            className="h-8 min-w-[280px] flex-1 bg-secondary/40"
          />
          <FilterMenu label="Horizon" value={horizon} options={horizonOptions} onChange={setHorizon} widthClassName="w-[150px]" />
          <FilterMenu label="Origin" value={originFilter} options={originOptions} onChange={setOriginFilter} widthClassName="w-[160px]" />
          <FilterMenu label="Actor" value={actorFilter} options={actorOptions} onChange={setActorFilter} widthClassName="w-[160px]" />
          <FilterMenu label="ID" value={externalIdFilter} options={externalIdOptions} onChange={setExternalIdFilter} widthClassName="w-[165px]" />
          <FilterMenu label="Schedule" value={scheduleFilter} options={scheduleOptions} onChange={setScheduleFilter} widthClassName="w-[165px]" />
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Task</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Why</TableHead>
              <TableHead>Next wake-up</TableHead>
              <TableHead>Next action</TableHead>
              <TableHead>Lifecycle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleTasks.length > 0 ? (
              visibleTasks.map((task) => {
                const state = getUpcomingState(task);
                return (
                  <TableRow key={task.id}>
                    <TableCell className="max-w-[240px]">
                      <div className="space-y-1">
                        <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="truncate text-sm font-medium text-foreground hover:text-primary">
                          {task.name}
                        </Link>
                        <div className="flex items-center gap-2">
                          <StatusBadge label={state.label} variant={state.variant} />
                          <span className="text-xs text-muted-foreground">{getTaskPatternLabel(task)}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-sm text-foreground">{formatCreatedBy(task.createdBy)}</p>
                        <p className="text-xs text-muted-foreground">{formatTaskSource(task.source)}</p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="space-y-1">
                        <p className="truncate text-sm text-foreground">{getTaskIntentSummary(task)}</p>
                        <p className="text-xs text-muted-foreground">{task.externalId ? `External ID · ${task.externalId}` : "No external ID"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-sm text-foreground">{formatRelativeTime(task.nextRunAt)}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(task.nextRunAt)}</p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <div className="space-y-1">
                        <p className="text-sm text-foreground">{task.callbackUrl ? "Callback after delivery" : getTaskDestination(task) ? "Webhook delivery" : "Internal delivery"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {task.callbackUrl ?? getTaskDestination(task) ?? getTaskNextActionSummary(task)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <p className="text-sm text-muted-foreground">{getTaskLifecycleSummary(task)}</p>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="whitespace-normal py-12">
                  <div className="mx-auto max-w-md text-center">
                    <CalendarBlank size={28} className="mx-auto text-muted-foreground/50" />
                    <p className="mt-3 text-sm font-medium text-foreground">No upcoming commitments in this window.</p>
                    <p className="mt-1 mx-auto max-w-[32rem] text-sm leading-6 text-muted-foreground">
                      Expand the horizon or clear a filter to see scheduled wake-ups, retries, and overdue work.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Agent-created work"
          description="Tasks created by agents that still have future commitments."
          action={
            <Link to="/agent-activity" className="text-xs font-medium text-primary hover:text-primary/80">
              View agent activity
            </Link>
          }
        >
          <div className="divide-y divide-border/30">
            {visibleTasks.filter((task) => task.createdBy?.type === "agent").slice(0, 5).map((task) => (
              <Link key={task.id} to="/tasks/$taskId" params={{ taskId: task.id }} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/20">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Robot size={16} className="text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{task.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{formatCreatedBy(task.createdBy)} · {getTaskIntentSummary(task)}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(task.nextRunAt)}</span>
              </Link>
            ))}
            {visibleTasks.filter((task) => task.createdBy?.type === "agent").length === 0 ? (
              <div className="px-4 py-8">
                <p className="text-sm font-medium text-foreground">No agent-created commitments in this window.</p>
                <p className="mt-1 max-w-[26rem] text-sm leading-6 text-muted-foreground">
                  This section shows what agents created and what they are waiting to do next.
                </p>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title="Needs attention"
          description="Wake-ups that are overdue or close to hitting their lifecycle limits."
        >
          <div className="divide-y divide-border/30">
            {visibleTasks
              .filter((task) => !task.active || (task.nextRunAt ? new Date(task.nextRunAt).getTime() < Date.now() : false) || task.maxRuns !== null)
              .slice(0, 5)
              .map((task) => (
                <Link key={task.id} to="/tasks/$taskId" params={{ taskId: task.id }} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/20">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
                    <WarningCircle size={16} className="text-red-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{task.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{getTaskLifecycleSummary(task)}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(task.nextRunAt)}</span>
                </Link>
              ))}
            {visibleTasks.filter((task) => !task.active || (task.nextRunAt ? new Date(task.nextRunAt).getTime() < Date.now() : false) || task.maxRuns !== null).length === 0 ? (
              <div className="px-4 py-8">
                <p className="text-sm font-medium text-foreground">Nothing in this window currently needs intervention.</p>
                <p className="mt-1 max-w-[26rem] text-sm leading-6 text-muted-foreground">
                  Overdue, paused, and constrained work will collect here when follow-through is needed.
                </p>
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
