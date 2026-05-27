import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import type { RunRecord, ScheduleType, TaskSource } from "@cronlet/shared";
import { Pause, Play, Plus } from "@phosphor-icons/react";
import { listRunsWithFilters, listTasksWithFilters, patchTask, triggerTask } from "@/lib/api";
import {
  formatCreatedBy,
  formatDateTime,
  formatHandlerSummary,
  formatSchedule,
  formatTaskSource,
  getCreatedByTypeLabel,
  getTaskDestination,
  getTaskStatusTone,
  summarizeMetadata,
} from "@/lib/format";
import { CopyButton, FilterMenu, MetricTile, PageHeader, SectionCard, StatusBadge } from "@/components/operator-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const scheduleTypes: Array<{ label: string; value: ScheduleType | "all" }> = [
  { label: "All", value: "all" },
  { label: "Once", value: "once" },
  { label: "Every", value: "every" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Cron", value: "cron" },
];

const savedViews: Array<{ label: string; value: SavedTaskView }> = [
  { label: "All tasks", value: "all" },
  { label: "Agent-created", value: "agent-created" },
  { label: "Human-created", value: "human-created" },
  { label: "MCP", value: "mcp" },
  { label: "SDK", value: "sdk" },
];

const stateOptions: Array<{ label: string; value: "all" | "active" | "paused" }> = [
  { label: "All states", value: "all" },
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
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

type SavedTaskView = "all" | "agent-created" | "human-created" | "mcp" | "sdk";
type ActorFilter = "all" | "agent" | "user";

export function TasksPage() {
  const locationSearch = useRouterState({ select: (state) => state.location.search });
  const searchParams = useMemo(() => new URLSearchParams(locationSearch), [locationSearch]);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [scheduleType, setScheduleType] = useState<ScheduleType | "all">(
    (searchParams.get("schedule") as ScheduleType | "all" | null) ?? "all"
  );
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "paused">(
    (searchParams.get("status") as "all" | "active" | "paused" | null) ?? "all"
  );
  const [savedView, setSavedView] = useState<SavedTaskView>("all");
  const [sourceFilter, setSourceFilter] = useState<TaskSource | "all">(
    (searchParams.get("origin") as TaskSource | "all" | null) ?? "all"
  );
  const [actorFilter, setActorFilter] = useState<ActorFilter>(
    (searchParams.get("actor") as ActorFilter | null) ?? "all"
  );

  const tasksQuery = useQuery({
    queryKey: ["tasks", "table", scheduleType, activeFilter],
    queryFn: () =>
      listTasksWithFilters({
        scheduleType: scheduleType === "all" ? undefined : scheduleType,
        status: activeFilter === "all" ? undefined : activeFilter,
        limit: 200,
      }),
    refetchInterval: 5000,
  });
  const runsQuery = useQuery({
    queryKey: ["tasks", "latest-runs"],
    queryFn: () => listRunsWithFilters({ limit: 100 }),
    refetchInterval: 3000,
  });

  const patchMutation = useMutation({
    mutationFn: ({ taskId, active }: { taskId: string; active: boolean }) => patchTask(taskId, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
  const triggerMutation = useMutation({
    mutationFn: (taskId: string) => triggerTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });

  const latestRunByTask = useMemo(() => {
    const map = new Map<string, RunRecord>();
    for (const run of runsQuery.data ?? []) {
      const current = map.get(run.taskId);
      if (!current || new Date(run.createdAt) > new Date(current.createdAt)) {
        map.set(run.taskId, run);
      }
    }
    return map;
  }, [runsQuery.data]);

  const applySavedView = (view: SavedTaskView) => {
    setSavedView(view);

    switch (view) {
      case "agent-created":
        setActorFilter("agent");
        setSourceFilter("all");
        break;
      case "human-created":
        setActorFilter("user");
        setSourceFilter("all");
        break;
      case "mcp":
        setActorFilter("all");
        setSourceFilter("mcp");
        break;
      case "sdk":
        setActorFilter("all");
        setSourceFilter("sdk");
        break;
      default:
        setActorFilter("all");
        setSourceFilter("all");
        break;
    }
  };

  const visibleTasks = (tasksQuery.data ?? []).filter((task) => {
    if (sourceFilter !== "all" && task.source !== sourceFilter) return false;
    if (actorFilter !== "all" && task.createdBy?.type !== actorFilter) return false;

    if (!query.trim()) return true;
    const haystack = [
      task.id,
      task.name,
      task.externalId ?? "",
      task.source,
      task.createdBy?.type ?? "",
      task.createdBy?.name ?? "",
      getTaskDestination(task) ?? "",
      summarizeMetadata(task.metadata),
    ].join(" ").toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Create, inspect, and control scheduled tasks."
        actions={
          <Button asChild>
            <Link to="/tasks/create">
              <Plus size={14} className="mr-2" />
              Create Task
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Visible tasks" value={visibleTasks.length} />
        <MetricTile label="Active" value={visibleTasks.filter((task) => task.active).length} />
        <MetricTile label="Paused" value={visibleTasks.filter((task) => !task.active).length} />
        <MetricTile label="Agent-created" value={visibleTasks.filter((task) => task.createdBy?.type === "agent").length}/>
      </div>

      <SectionCard
        title="Task inventory"
        description="Scheduling state, destinations, and external identifiers."
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search task, external ID, actor, destination, or metadata"
            className="h-8 min-w-[280px] flex-1 bg-secondary/40"
          />
          <FilterMenu
            label="View"
            value={savedView}
            options={savedViews}
            onChange={applySavedView}
            widthClassName="w-[170px]"
          />
          <FilterMenu
            label="State"
            value={activeFilter}
            options={stateOptions}
            onChange={setActiveFilter}
            widthClassName="w-[150px]"
          />
          <FilterMenu
            label="Origin"
            value={sourceFilter}
            options={originOptions}
            onChange={(value) => {
              setSourceFilter(value);
              setSavedView(value === "mcp" || value === "sdk" ? value : "all");
            }}
            widthClassName="w-[160px]"
          />
          <FilterMenu
            label="Actor"
            value={actorFilter}
            options={actorOptions}
            onChange={(value) => {
              setActorFilter(value);
              setSavedView(value === "agent" ? "agent-created" : value === "user" ? "human-created" : "all");
            }}
            widthClassName="w-[160px]"
          />
          <FilterMenu
            label="Schedule"
            value={scheduleType}
            options={scheduleTypes}
            onChange={setScheduleType}
            widthClassName="w-[165px]"
          />
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>ID</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Origin</TableHead>
              <TableHead>Created by</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>External ID</TableHead>
              <TableHead>Next run</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleTasks.map((task) => {
              const latestRun = latestRunByTask.get(task.id);
              return (
                <TableRow key={task.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs text-muted-foreground">{task.id}</span>
                      <CopyButton value={task.id} />
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    <div className="space-y-1">
                      <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="truncate text-sm font-medium text-foreground hover:text-primary">
                        {task.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{formatHandlerSummary(task.handlerConfig)}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={task.active ? "active" : "paused"}
                      variant={getTaskStatusTone(task, latestRun)}
                    />
                  </TableCell>
                  <TableCell>{formatTaskSource(task.source)}</TableCell>
                  <TableCell className="max-w-[180px]">
                    <div className="space-y-0.5">
                      <p className="truncate text-sm text-foreground">{formatCreatedBy(task.createdBy)}</p>
                      <p className="text-xs text-muted-foreground">{getCreatedByTypeLabel(task.createdBy)}</p>
                    </div>
                  </TableCell>
                  <TableCell>{formatSchedule(task.scheduleConfig)}</TableCell>
                  <TableCell>{getTaskDestination(task) ?? "internal"}</TableCell>
                  <TableCell>{task.externalId ?? "—"}</TableCell>
                  <TableCell>{task.nextRunAt ? formatDateTime(task.nextRunAt) : "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => triggerMutation.mutate(task.id)}
                        disabled={triggerMutation.isPending}
                      >
                        <Play size={14} className="mr-1" />
                        Run
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => patchMutation.mutate({ taskId: task.id, active: !task.active })}
                        disabled={patchMutation.isPending}
                      >
                        {task.active ? <Pause size={14} className="mr-1" /> : <Play size={14} className="mr-1" />}
                        {task.active ? "Pause" : "Resume"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {visibleTasks.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">No tasks match this view.</div>
        ) : null}
      </SectionCard>
    </div>
  );
}
