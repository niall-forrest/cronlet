import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { CircuitBreakerRecord, TaskRecord } from "@cronlet/shared";
import { listCircuitBreakers, listTasksWithFilters } from "@/lib/api";
import { formatCircuitState, formatDateTime, formatRelativeTime, getTaskDestination } from "@/lib/format";
import { MetricTile, PageHeader, SectionCard, StatusBadge } from "@/components/operator-ui";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface DestinationRow {
  key: string;
  tasks: TaskRecord[];
  breaker?: CircuitBreakerRecord;
}

export function DestinationsPage() {
  const [query, setQuery] = useState("");
  const tasksQuery = useQuery({
    queryKey: ["destinations", "tasks"],
    queryFn: () => listTasksWithFilters({ limit: 200 }),
  });
  const breakersQuery = useQuery({
    queryKey: ["destinations", "breakers"],
    queryFn: () => listCircuitBreakers({ limit: 200 }),
    refetchInterval: 10000,
  });

  const rows = useMemo(() => {
    const map = new Map<string, DestinationRow>();
    for (const task of tasksQuery.data ?? []) {
      const key = getTaskDestination(task);
      if (!key) continue;
      const current = map.get(key);
      if (current) current.tasks.push(task);
      else map.set(key, { key, tasks: [task] });
    }

    for (const breaker of breakersQuery.data ?? []) {
      const current = map.get(breaker.destinationKey);
      if (current) current.breaker = breaker;
      else map.set(breaker.destinationKey, { key: breaker.destinationKey, tasks: [], breaker });
    }

    return Array.from(map.values()).filter((row) =>
      row.key.toLowerCase().includes(query.toLowerCase())
    );
  }, [breakersQuery.data, query, tasksQuery.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Destinations"
        description="Monitor outbound endpoints, circuit state, and which tasks are currently mapped to each destination."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Known destinations" value={rows.length} />
        <MetricTile label="Open circuits" value={rows.filter((row) => row.breaker?.state === "open").length} />
        <MetricTile label="Half-open probes" value={rows.filter((row) => row.breaker?.state === "half_open").length} />
        <MetricTile label="Webhook tasks" value={(tasksQuery.data ?? []).filter((task) => task.handlerConfig.type === "webhook").length} />
      </div>

      <SectionCard title="Destination inventory" description="Grouped by normalized host or destination key.">
        <div className="border-b border-border/40 px-5 py-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search destination key or hostname"
            className="h-9 max-w-sm bg-secondary/40"
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Destination</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Failures</TableHead>
              <TableHead>Cooldown</TableHead>
              <TableHead>Tasks</TableHead>
              <TableHead>Last failure</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium text-foreground">{row.key}</TableCell>
                  <TableCell>
                    <StatusBadge
                      label={formatCircuitState(row.breaker?.state ?? "closed")}
                      variant={
                        row.breaker?.state === "open"
                          ? "error"
                          : row.breaker?.state === "half_open"
                            ? "warning"
                            : "success"
                      }
                    />
                  </TableCell>
                  <TableCell>{row.breaker?.consecutiveFailures ?? 0}</TableCell>
                  <TableCell>{row.breaker?.cooldownUntil ? formatRelativeTime(row.breaker.cooldownUntil) : "—"}</TableCell>
                  <TableCell className="max-w-[260px]">
                    <div className="space-y-1">
                      {row.tasks.slice(0, 2).map((task) => (
                        <Link key={task.id} to="/tasks/$taskId" params={{ taskId: task.id }} className="block truncate text-sm text-foreground hover:text-primary">
                          {task.name}
                        </Link>
                      ))}
                      {row.tasks.length === 0 ? <span className="text-sm text-muted-foreground">No current task mapping</span> : null}
                      {row.tasks.length > 2 ? <p className="text-xs text-muted-foreground">+{row.tasks.length - 2} more</p> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p>{formatDateTime(row.breaker?.lastFailureAt)}</p>
                      {row.breaker?.lastFailureReason ? (
                        <p className="max-w-[220px] truncate text-xs text-muted-foreground">{row.breaker.lastFailureReason}</p>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-12">
                  <div className="mx-auto max-w-md text-center">
                    <p className="text-sm font-medium text-foreground">
                      {query ? "No destinations match this search." : "No destinations yet."}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {query
                        ? "Try a different hostname or destination key."
                        : "Destinations appear here once tasks target webhooks or callbacks."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}
