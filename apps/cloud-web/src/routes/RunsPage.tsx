import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { RunRecord } from "@cronlet/cloud-shared";
import {
  Clock,
  CheckCircle,
  XCircle,
  Timer,
  ArrowRight,
  Play,
  Funnel,
  CaretRight,
  Spinner,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/Skeleton";
import { SectionHeader } from "@/components/ui/section-header";
import { listRuns, listTasks } from "@/lib/api";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, "success" | "error" | "warning" | "secondary"> = {
    success: "success",
    failure: "error",
    timeout: "error",
    queued: "secondary",
    running: "warning",
  };

  const variant = variantMap[status] ?? "secondary";

  const icons: Record<string, React.ReactNode> = {
    success: <CheckCircle size={12} weight="fill" />,
    failure: <XCircle size={12} weight="fill" />,
    timeout: <Timer size={12} weight="fill" />,
    queued: <Clock size={12} />,
    running: <Spinner size={12} className="animate-spin" />,
  };

  return (
    <Badge variant={variant} className="gap-1.5 capitalize">
      {icons[status] ?? icons.queued}
      {status}
    </Badge>
  );
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}min`;
}

function formatTimeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

export function RunsPage() {
  const [taskFilter, setTaskFilter] = useState<string>("all");
  const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null);

  const runsQuery = useQuery({
    queryKey: ["runs", taskFilter],
    queryFn: () => listRuns(taskFilter === "all" ? undefined : taskFilter, 100),
    refetchInterval: 4000,
  });

  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => listTasks(),
  });

  const taskNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasksQuery.data ?? []) {
      map.set(task.id, task.name);
    }
    return map;
  }, [tasksQuery.data]);

  const isLoading = runsQuery.isLoading || tasksQuery.isLoading;

  if (runsQuery.error) {
    return <p className="text-sm text-destructive">Failed to load runs: {(runsQuery.error as Error).message}</p>;
  }

  const runs = runsQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const hasRuns = runs.length > 0;
  const hasTasks = tasks.length > 0;

  // Calculate stats
  const successCount = runs.filter((r) => r.status === "success").length;
  const failureCount = runs.filter((r) => r.status === "failure" || r.status === "timeout").length;
  const runningCount = runs.filter((r) => r.status === "running" || r.status === "queued").length;
  const successRate = runs.length > 0 ? Math.round((successCount / runs.length) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display-title">Runs</h1>
          <p className="text-muted-foreground mt-1">
            Execution history for your scheduled tasks
          </p>
        </div>

        {hasTasks && (
          <Select value={taskFilter} onValueChange={setTaskFilter}>
            <SelectTrigger className="w-[200px]">
              <Funnel size={14} className="mr-2 text-muted-foreground" />
              <SelectValue placeholder="Filter by task" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tasks</SelectItem>
              {tasks.map((task) => (
                <SelectItem key={task.id} value={task.id}>
                  {task.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Stats */}
      <section className="space-y-4">
        <SectionHeader label="Overview" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card variant="flat">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Clock size={20} className="text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{runs.length}</p>
                  <p className="meta-label">Total Runs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card variant="flat">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                  <CheckCircle size={20} weight="fill" className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{successCount}</p>
                  <p className="meta-label">Successful</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card variant="flat">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                  <XCircle size={20} weight="fill" className="text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{failureCount}</p>
                  <p className="meta-label">Failed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card variant="flat">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--accent)/0.15)]">
                  <span className="text-lg font-bold text-[hsl(var(--accent))]">{successRate}%</span>
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{runningCount}</p>
                  <p className="meta-label">Running</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Runs table */}
      <section className="space-y-4">
        <SectionHeader label="Run History" />
        <Card variant="flat">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4 py-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-16 rounded-md" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : hasRuns ? (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Task</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Status</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Trigger</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Duration</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Time</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow
                      key={run.id}
                      className="cursor-pointer group"
                      onClick={() => setSelectedRun(run)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                            {taskNames.get(run.taskId) ?? run.taskId.slice(0, 8)}
                          </span>
                          {run.attempt > 1 && (
                            <Badge variant="outline" className="text-[10px] px-1.5">
                              Retry {run.attempt}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={run.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">
                        {run.trigger}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {formatDuration(run.durationMs)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span title={new Date(run.createdAt).toLocaleString()}>
                          {formatTimeAgo(run.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <CaretRight size={16} className="text-muted-foreground/50 group-hover:text-foreground transition-colors" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Clock size={28} weight="duotone" className="text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No runs yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto text-center mb-6">
                  {hasTasks
                    ? "Trigger a task manually or wait for a scheduled run to appear here."
                    : "Create a task and schedule to start seeing runs."}
                </p>
                {hasTasks ? (
                  <Button asChild variant="outline">
                    <Link to="/tasks">
                      <Play size={14} weight="fill" className="mr-2" />
                      View tasks
                    </Link>
                  </Button>
                ) : (
                  <Button asChild>
                    <Link to="/tasks/create">
                      Create a task
                      <ArrowRight size={14} className="ml-2" />
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Run Detail Dialog */}
      <RunDetailDialog
        run={selectedRun}
        taskName={selectedRun ? taskNames.get(selectedRun.taskId) : undefined}
        onClose={() => setSelectedRun(null)}
      />
    </div>
  );
}

interface RunDetailDialogProps {
  run: RunRecord | null;
  taskName?: string;
  onClose: () => void;
}

function RunDetailDialog({ run, taskName, onClose }: RunDetailDialogProps) {
  if (!run) return null;

  return (
    <Dialog open={!!run} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-semibold">{taskName ?? run.taskId}</span>
            <StatusBadge status={run.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Run metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="meta-label">Trigger</span>
              <p className="text-sm font-medium capitalize">{run.trigger}</p>
            </div>
            <div>
              <span className="meta-label">Attempt</span>
              <p className="text-sm font-medium">{run.attempt}</p>
            </div>
            <div>
              <span className="meta-label">Duration</span>
              <p className="text-sm font-medium tabular-nums">{formatDuration(run.durationMs)}</p>
            </div>
            <div>
              <span className="meta-label">Started</span>
              <p className="text-sm font-medium">
                {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
              </p>
            </div>
          </div>

          {/* Error message */}
          {run.errorMessage && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive mb-1">Error</p>
              <p className="text-sm text-destructive/80 font-mono">{run.errorMessage}</p>
            </div>
          )}

          {/* Output */}
          {run.output && (
            <div className="space-y-2">
              <span className="meta-label">Output</span>
              <pre className="rounded-xl bg-zinc-950 border border-border/50 p-4 text-xs text-zinc-300 font-mono overflow-x-auto">
                {JSON.stringify(run.output, null, 2)}
              </pre>
            </div>
          )}

          {/* Logs */}
          {run.logs && (
            <div className="space-y-2">
              <span className="meta-label">Logs</span>
              <pre className={cn(
                "rounded-xl bg-zinc-950 border border-border/50 p-4 text-xs text-zinc-300 font-mono overflow-x-auto whitespace-pre-wrap",
                "max-h-64"
              )}>
                {run.logs}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
