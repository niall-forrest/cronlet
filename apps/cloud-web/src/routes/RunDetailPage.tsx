import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle, Clock, Spinner, Timer, XCircle } from "@phosphor-icons/react";
import type { RunRecord } from "@cronlet/shared";
import { getRun, listTasks } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/Skeleton";

interface RunDetailPageProps {
  runId: string;
}

export function RunDetailPage({ runId }: RunDetailPageProps) {
  const runQuery = useQuery({
    queryKey: ["run", runId],
    queryFn: () => getRun(runId),
    refetchInterval: (query) => {
      const run = query.state.data;
      return run?.status === "running" || run?.status === "queued" ? 2000 : false;
    },
  });

  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => listTasks(),
  });

  const taskName = useMemo(() => {
    const run = runQuery.data;
    if (!run) {
      return undefined;
    }

    return tasksQuery.data?.find((task) => task.id === run.taskId)?.name;
  }, [runQuery.data, tasksQuery.data]);

  if (runQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="space-y-4 py-6">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (runQuery.error || !runQuery.data) {
    return (
      <div className="space-y-4">
        <h1 className="display-title">Run not found</h1>
        <p className="text-sm text-destructive">
          {runQuery.error instanceof Error ? runQuery.error.message : "Failed to load this run."}
        </p>
        <Button asChild variant="outline">
          <Link to="/runs">Back to Runs</Link>
        </Button>
      </div>
    );
  }

  const run = runQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="meta-label">Run Detail</p>
          <div className="flex items-center gap-3">
            <h1 className="display-title">{taskName ?? run.taskId}</h1>
            <StatusBadge status={run.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Manual or scheduled execution details, including output and logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/tasks/$taskId" params={{ taskId: run.taskId }}>
              View Task
            </Link>
          </Button>
          <Button asChild>
            <Link to="/runs">All Runs</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Status" value={run.status} />
        <StatCard label="Trigger" value={run.trigger} />
        <StatCard label="Attempt" value={String(run.attempt)} />
        <StatCard label="Duration" value={formatDuration(run.durationMs)} />
      </div>

      <Card variant="flat">
        <CardHeader>
          <CardTitle className="font-display text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <TimelineValue label="Created" value={new Date(run.createdAt).toLocaleString()} />
          <TimelineValue label="Started" value={run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"} />
          <TimelineValue label="Completed" value={run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"} />
        </CardContent>
      </Card>

      {run.errorMessage ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
              {run.errorMessage}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      {run.output ? (
        <Card variant="flat">
          <CardHeader>
            <CardTitle className="font-display text-base">Output</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[360px] overflow-auto rounded-xl bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
              {JSON.stringify(run.output, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      {run.logs ? (
        <Card variant="flat">
          <CardHeader>
            <CardTitle className="font-display text-base">Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
              {run.logs}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: RunRecord["status"] }) {
  const variantMap: Record<RunRecord["status"], "success" | "error" | "warning" | "secondary"> = {
    success: "success",
    failure: "error",
    timeout: "error",
    queued: "secondary",
    running: "warning",
  };

  const icons: Record<RunRecord["status"], React.ReactNode> = {
    success: <CheckCircle size={12} weight="fill" />,
    failure: <XCircle size={12} weight="fill" />,
    timeout: <Timer size={12} weight="fill" />,
    queued: <Clock size={12} />,
    running: <Spinner size={12} className="animate-spin" />,
  };

  return (
    <Badge variant={variantMap[status]} className="gap-1.5 capitalize">
      {icons[status]}
      {status}
    </Badge>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card variant="flat">
      <CardContent className="p-4">
        <p className="meta-label">{label}</p>
        <p className="mt-2 text-lg font-semibold capitalize">{value}</p>
      </CardContent>
    </Card>
  );
}

function TimelineValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="meta-label">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) {
    return "—";
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${(ms / 60000).toFixed(1)}m`;
}
