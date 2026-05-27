import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReconciliationCompareResult, TaskRecord } from "@cronlet/shared";
import { bulkCancelTasks, compareReconciliation } from "@/lib/api";
import { formatDateTime, formatSchedule } from "@/lib/format";
import { MetricTile, PageHeader, SectionCard, StatusBadge } from "@/components/operator-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AttentionReason = "pending_once" | "overdue";

interface AttentionTask {
  task: TaskRecord;
  reason: AttentionReason;
}

function buildAttentionTasks(result?: ReconciliationCompareResult): AttentionTask[] {
  if (!result) return [];

  const rows = new Map<string, AttentionTask>();

  for (const task of result.pendingOneOffTasks) {
    rows.set(task.id, { task, reason: "pending_once" });
  }

  for (const task of result.overdueTasks) {
    const existing = rows.get(task.id);
    if (existing) {
      rows.set(task.id, { task, reason: "overdue" });
    } else {
      rows.set(task.id, { task, reason: "overdue" });
    }
  }

  return Array.from(rows.values());
}

function getReasonLabel(reason: AttentionReason) {
  return reason === "overdue" ? "overdue" : "pending one-off";
}

function getReasonVariant(reason: AttentionReason): "warning" | "error" {
  return reason === "overdue" ? "error" : "warning";
}

export function ReconciliationPage() {
  const [lookupValue, setLookupValue] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const automaticChecksQuery = useQuery({
    queryKey: ["reconciliation", "automatic-checks"],
    queryFn: () =>
      compareReconciliation({
        includePendingOnce: true,
        includeOverdue: true,
        limit: 100,
      }),
    refetchInterval: 15000,
  });

  const lookupMutation = useMutation({
    mutationFn: () =>
      compareReconciliation({
        externalIds: lookupValue
          .split(/\n|,/)
          .map((value) => value.trim())
          .filter(Boolean),
        includePendingOnce: false,
        includeOverdue: false,
        limit: 100,
      }),
  });

  const cancelMutation = useMutation({
    mutationFn: (taskIds: string[]) => bulkCancelTasks({ taskIds }),
    onSuccess: () => setSelected({}),
  });

  const automaticChecks = automaticChecksQuery.data;
  const attentionTasks = useMemo(() => buildAttentionTasks(automaticChecks), [automaticChecks]);

  const selectedIds = Object.entries(selected)
    .filter(([, value]) => value)
    .map(([taskId]) => taskId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reconciliation"
        description="Review overdue schedules, pending one-offs, duplicate external IDs, and specific external ID lookups."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Duplicate external IDs"
          value={automaticChecks?.duplicateExternalIds.length ?? 0}
          detail="More than one task shares the same external ID"
        />
        <MetricTile
          label="Pending one-offs"
          value={automaticChecks?.pendingOneOffTasks.length ?? 0}
          detail="Scheduled once and still pending"
        />
        <MetricTile
          label="Overdue tasks"
          value={automaticChecks?.overdueTasks.length ?? 0}
          detail="Next run time is already in the past"
        />
        <MetricTile
          label="Lookup misses"
          value={lookupMutation.data?.missingExternalIds.length ?? 0}
          detail="From the most recent external ID lookup"
        />
      </div>

      <SectionCard
        title="Automatic checks"
        description="These checks run without any input. Start here to find schedules that may need attention."
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Check</TableHead>
              <TableHead>Count</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium text-foreground">Duplicate external IDs</TableCell>
              <TableCell>{automaticChecks?.duplicateExternalIds.length ?? 0}</TableCell>
              <TableCell className="text-muted-foreground">
                {automaticChecks?.duplicateExternalIds.length
                  ? automaticChecks.duplicateExternalIds.slice(0, 3).join(", ")
                  : "No duplicates found"}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium text-foreground">Pending one-offs</TableCell>
              <TableCell>{automaticChecks?.pendingOneOffTasks.length ?? 0}</TableCell>
              <TableCell className="text-muted-foreground">One-time tasks that have not completed yet</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium text-foreground">Overdue tasks</TableCell>
              <TableCell>{automaticChecks?.overdueTasks.length ?? 0}</TableCell>
              <TableCell className="text-muted-foreground">Tasks whose next run time is already in the past</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </SectionCard>

      <SectionCard
        title="Tasks needing attention"
        description="Pending one-offs and overdue tasks that may need cancellation or manual review."
        action={
          selectedIds.length > 0 ? (
            <Button variant="outline" onClick={() => cancelMutation.mutate(selectedIds)} disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? "Cancelling..." : `Cancel ${selectedIds.length}`}
            </Button>
          ) : null
        }
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">
                <span className="sr-only">Select</span>
              </TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>External ID</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Next run</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attentionTasks.map(({ task, reason }) => (
              <TableRow key={task.id}>
                <TableCell>
                  <Checkbox
                    checked={Boolean(selected[task.id])}
                    onCheckedChange={(value) =>
                      setSelected((current) => ({ ...current, [task.id]: Boolean(value) }))
                    }
                  />
                </TableCell>
                <TableCell>
                  <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="font-medium text-foreground hover:text-primary">
                    {task.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge label={getReasonLabel(reason)} variant={getReasonVariant(reason)} />
                </TableCell>
                <TableCell>{task.externalId ?? "—"}</TableCell>
                <TableCell>{formatSchedule(task.scheduleConfig)}</TableCell>
                <TableCell>{task.nextRunAt ? formatDateTime(task.nextRunAt) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {attentionTasks.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            No pending one-offs or overdue tasks right now.
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Lookup by external ID"
        description="Check whether a specific external ID already has a matching task."
        action={
          <Button
            onClick={() => lookupMutation.mutate()}
            disabled={lookupMutation.isPending || lookupValue.trim().length === 0}
          >
            {lookupMutation.isPending ? "Checking..." : "Check IDs"}
          </Button>
        }
      >
        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <Input
              value={lookupValue}
              onChange={(event) => setLookupValue(event.target.value)}
              placeholder="email-send-123"
              className="h-9 bg-secondary/40"
            />
            <p className="text-sm text-muted-foreground">
              You can paste more than one identifier, separated by commas or line breaks.
            </p>
          </div>

          {lookupMutation.data ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-border/40 bg-background/40 p-4">
                <p className="meta-label">Matched tasks</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{lookupMutation.data.matchedTasks.length}</p>
                <p className="mt-1 text-sm text-muted-foreground">Tasks found for the identifiers you entered.</p>
              </div>
              <div className="rounded-lg border border-border/40 bg-background/40 p-4">
                <p className="meta-label">Missing IDs</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{lookupMutation.data.missingExternalIds.length}</p>
                <p className="mt-1 text-sm text-muted-foreground">Identifiers with no matching task.</p>
              </div>
              <div className="rounded-lg border border-border/40 bg-background/40 p-4">
                <p className="meta-label">Duplicates</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{lookupMutation.data.duplicateExternalIds.length}</p>
                <p className="mt-1 text-sm text-muted-foreground">Identifiers currently attached to more than one task.</p>
              </div>
            </div>
          ) : null}

          {lookupMutation.data?.matchedTasks.length ? (
            <div className="rounded-lg border border-border/40">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Task</TableHead>
                    <TableHead>External ID</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Next run</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lookupMutation.data.matchedTasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell>
                        <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="font-medium text-foreground hover:text-primary">
                          {task.name}
                        </Link>
                      </TableCell>
                      <TableCell>{task.externalId ?? "—"}</TableCell>
                      <TableCell>{formatSchedule(task.scheduleConfig)}</TableCell>
                      <TableCell>{task.nextRunAt ? formatDateTime(task.nextRunAt) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {lookupMutation.data?.missingExternalIds.length ? (
            <div className="rounded-lg border border-border/40 bg-background/40 p-4">
              <p className="text-sm font-medium text-foreground">Missing external IDs</p>
              <p className="mt-2 text-sm text-muted-foreground">{lookupMutation.data.missingExternalIds.join(", ")}</p>
            </div>
          ) : null}

          {lookupMutation.data?.duplicateExternalIds.length ? (
            <div className="rounded-lg border border-border/40 bg-background/40 p-4">
              <p className="text-sm font-medium text-foreground">Duplicate external IDs</p>
              <p className="mt-2 text-sm text-muted-foreground">{lookupMutation.data.duplicateExternalIds.join(", ")}</p>
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
