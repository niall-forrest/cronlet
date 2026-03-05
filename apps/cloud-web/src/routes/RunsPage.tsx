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
  CaretDown,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { listRuns, listTasks } from "@/lib/api";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    success: { variant: "secondary", icon: <CheckCircle size={12} weight="fill" className="text-green-400" /> },
    failure: { variant: "destructive", icon: <XCircle size={12} weight="fill" /> },
    timeout: { variant: "destructive", icon: <Timer size={12} weight="fill" /> },
    queued: { variant: "outline", icon: <Clock size={12} /> },
    running: { variant: "outline", icon: <Clock size={12} className="animate-pulse" /> },
  };

  const config = variants[status] ?? variants.queued;

  return (
    <Badge variant={config.variant} className="gap-1">
      {config.icon}
      {status}
    </Badge>
  );
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "-";
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

  return (
    <div className="space-y-6">
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
              <Funnel size={14} className="mr-2" />
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

      {/* Stats header */}
      {hasRuns && (
        <div className="flex gap-4">
          <Card className="border-border/50 bg-card/60 flex-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle size={20} weight="fill" className="text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{successCount}</p>
                  <p className="text-xs text-muted-foreground">Successful</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/60 flex-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                  <XCircle size={20} weight="fill" className="text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{failureCount}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50 bg-card/60 flex-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Clock size={20} className="text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{runs.length}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Runs table */}
      <Card className="border-border/50 bg-card/60">
        <CardHeader>
          <CardTitle className="display-title">Run History</CardTitle>
          <CardDescription>
            Recent task executions across manual triggers and schedules.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 py-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : hasRuns ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow
                    key={run.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedRun(run)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-primary" />
                        <span className="font-medium">
                          {taskNames.get(run.taskId) ?? run.taskId}
                        </span>
                        {run.attempt > 1 && (
                          <Badge variant="outline" className="text-xs">
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
                    <TableCell className="text-sm tabular-nums">
                      {formatDuration(run.durationMs)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span title={new Date(run.createdAt).toLocaleString()}>
                        {formatTimeAgo(run.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-7 px-2">
                        <CaretDown size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Clock size={24} className="text-primary" />
              </div>
              <h3 className="font-medium text-foreground mb-2">No runs yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
                {hasTasks
                  ? "Trigger a task manually or wait for a scheduled run to appear here."
                  : "Create a task and schedule to start seeing runs."}
              </p>
              {hasTasks ? (
                <Button asChild variant="outline" size="sm">
                  <Link to="/tasks">
                    <Play size={14} className="mr-1" />
                    View tasks
                  </Link>
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link to="/tasks">
                    Create a task
                    <ArrowRight size={14} className="ml-1" />
                  </Link>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
            <span>{taskName ?? run.taskId}</span>
            <StatusBadge status={run.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Run metadata */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Trigger</p>
              <p className="font-medium capitalize">{run.trigger}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Attempt</p>
              <p className="font-medium">{run.attempt}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Duration</p>
              <p className="font-medium">{formatDuration(run.durationMs)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Started</p>
              <p className="font-medium">
                {run.startedAt ? new Date(run.startedAt).toLocaleString() : "-"}
              </p>
            </div>
          </div>

          {/* Error message */}
          {run.errorMessage && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive mb-1">Error</p>
              <p className="text-sm text-destructive/80">{run.errorMessage}</p>
            </div>
          )}

          {/* Output */}
          {run.output && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Output</p>
              <pre className="rounded-lg bg-muted p-4 text-xs overflow-x-auto">
                {JSON.stringify(run.output, null, 2)}
              </pre>
            </div>
          )}

          {/* Logs */}
          {run.logs && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Logs</p>
              <pre className="rounded-lg bg-muted p-4 text-xs overflow-x-auto whitespace-pre-wrap">
                {run.logs}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
