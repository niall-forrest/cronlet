import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import type { RunStatus, TaskSource } from "@cronlet/shared";
import { Funnel, Play, WarningCircle } from "@phosphor-icons/react";
import { bulkReplayRuns, listRunsWithFilters, listTasksWithFilters } from "@/lib/api";
import {
  formatCreatedBy,
  formatDateTime,
  formatDuration,
  formatRelativeTime,
  formatTaskSource,
  getCreatedByTypeLabel,
  getRunDestination,
  getRunStatusTone,
} from "@/lib/format";
import { CopyButton, FilterMenu, MetricTile, PageHeader, SectionCard, StatusBadge } from "@/components/operator-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statuses: Array<{ label: string; value: RunStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Running", value: "running" },
  { label: "Retry wait", value: "retry_wait" },
  { label: "Failed", value: "failure" },
  { label: "Dead-lettered", value: "dead_lettered" },
  { label: "Success", value: "success" },
];

const savedViews: Array<{ label: string; value: SavedRunView }> = [
  { label: "All runs", value: "all" },
  { label: "Agent-created", value: "agent-created" },
  { label: "Human-created", value: "human-created" },
  { label: "MCP", value: "mcp" },
  { label: "SDK", value: "sdk" },
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

type SavedRunView = "all" | "agent-created" | "human-created" | "mcp" | "sdk";
type ActorFilter = "all" | "agent" | "user";

export function RunsPage() {
  const locationSearch = useRouterState({ select: (state) => state.location.search });
  const searchParams = useMemo(() => new URLSearchParams(locationSearch), [locationSearch]);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RunStatus | "all">(
    (searchParams.get("status") as RunStatus | "all" | null) ?? "all"
  );
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [savedView, setSavedView] = useState<SavedRunView>("all");
  const [sourceFilter, setSourceFilter] = useState<TaskSource | "all">(
    (searchParams.get("origin") as TaskSource | "all" | null) ?? "all"
  );
  const [actorFilter, setActorFilter] = useState<ActorFilter>(
    (searchParams.get("actor") as ActorFilter | null) ?? "all"
  );

  const runsQuery = useQuery({
    queryKey: ["runs", "dense", status],
    queryFn: () => listRunsWithFilters({ status: status === "all" ? undefined : status, limit: 200 }),
    refetchInterval: 4000,
  });
  const tasksQuery = useQuery({
    queryKey: ["tasks", "lookup"],
    queryFn: () => listTasksWithFilters({ limit: 200 }),
  });

  const replayMutation = useMutation({
    mutationFn: (runIds: string[]) => bulkReplayRuns({ runIds }),
    onSuccess: () => {
      setSelected({});
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });

  const taskMap = useMemo(
    () => new Map((tasksQuery.data ?? []).map((task) => [task.id, task])),
    [tasksQuery.data]
  );

  const applySavedView = (view: SavedRunView) => {
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

  const visibleRuns = (runsQuery.data ?? []).filter((run) => {
    const task = taskMap.get(run.taskId);

    if (sourceFilter !== "all" && task?.source !== sourceFilter) return false;
    if (actorFilter !== "all" && task?.createdBy?.type !== actorFilter) return false;

    if (!query.trim()) return true;
    const haystack = [
      run.id,
      task?.name ?? "",
      task?.externalId ?? "",
      task?.source ?? "",
      task?.createdBy?.type ?? "",
      task?.createdBy?.name ?? "",
      getRunDestination(task),
    ].join(" ").toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  const selectedRunIds = Object.entries(selected)
    .filter(([, value]) => value)
    .map(([runId]) => runId);

  const failureCount = visibleRuns.filter((run) =>
    ["failure", "timeout", "dead_lettered", "terminal_client_error", "retry_window_expired"].includes(run.status)
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Runs"
        description="Delivery history for scheduled attempts, retries, dead-lettered callbacks, and replay."
        actions={
          selectedRunIds.length > 0 ? (
            <Button onClick={() => replayMutation.mutate(selectedRunIds)} disabled={replayMutation.isPending}>
              <Play size={14} className="mr-2" />
              {replayMutation.isPending ? "Replaying..." : `Replay ${selectedRunIds.length}`}
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Visible runs" value={visibleRuns.length} />
        <MetricTile label="Failures" value={failureCount} detail="Terminal or retryable failures" />
        <MetricTile
          label="Running"
          value={visibleRuns.filter((run) => ["queued", "leased", "running"].includes(run.status)).length}
          detail="Currently in-flight"
        />
        <MetricTile
          label="Agent-originated"
          value={visibleRuns.filter((run) => taskMap.get(run.taskId)?.createdBy?.type === "agent").length}
          detail="Runs from agent-created tasks"
        />
      </div>

      <SectionCard
        title="Run history"
        description="Searchable, filterable, and bulk-actionable delivery attempts."
        action={
          <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
            <WarningCircle size={14} />
            Bulk replay is available for selected runs
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3">
          <div className="relative min-w-[280px] flex-1">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search run ID, task, actor, external ID, or destination"
              className="h-8 bg-secondary/40 pl-9"
            />
            <Funnel size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
          <FilterMenu
            label="View"
            value={savedView}
            options={savedViews}
            onChange={applySavedView}
            widthClassName="w-[170px]"
          />
          <FilterMenu
            label="Status"
            value={status}
            options={statuses}
            onChange={setStatus}
            widthClassName="w-[165px]"
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
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <span className="sr-only">Select</span>
              </TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Origin</TableHead>
              <TableHead>Created by</TableHead>
              <TableHead>Attempt</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRuns.map((run) => {
              const task = taskMap.get(run.taskId);
              return (
                <TableRow key={run.id}>
                  <TableCell>
                    <Checkbox
                      checked={Boolean(selected[run.id])}
                      onCheckedChange={(value) =>
                        setSelected((current) => ({ ...current, [run.id]: Boolean(value) }))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Link to="/runs/$runId" params={{ runId: run.id }} className="font-medium text-foreground hover:text-primary">
                        {run.id}
                      </Link>
                      <CopyButton value={run.id} />
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    <div className="space-y-1">
                      <p className="truncate text-sm font-medium text-foreground">{task?.name ?? run.taskId}</p>
                      <p className="truncate text-xs text-muted-foreground">{task?.externalId ?? "No external ID"}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={run.status.replaceAll("_", " ")} variant={getRunStatusTone(run.status)} />
                  </TableCell>
                  <TableCell>{task ? formatTaskSource(task.source) : "—"}</TableCell>
                  <TableCell className="max-w-[180px]">
                    <div className="space-y-0.5">
                      <p className="truncate text-sm text-foreground">{formatCreatedBy(task?.createdBy)}</p>
                      <p className="text-xs text-muted-foreground">{getCreatedByTypeLabel(task?.createdBy)}</p>
                    </div>
                  </TableCell>
                  <TableCell>{run.attempt}</TableCell>
                  <TableCell>{getRunDestination(task)}</TableCell>
                  <TableCell>{formatDuration(run.durationMs)}</TableCell>
                  <TableCell>{run.scheduledAt ? formatDateTime(run.scheduledAt) : "—"}</TableCell>
                  <TableCell>{formatRelativeTime(run.createdAt)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {visibleRuns.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            No runs match this view.
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
