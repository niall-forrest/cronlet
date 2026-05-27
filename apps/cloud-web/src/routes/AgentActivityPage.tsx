import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { RunRecord } from "@cronlet/shared";
import { Robot } from "@phosphor-icons/react";
import { listRunsWithFilters, listTasksWithFilters } from "@/lib/api";
import {
  formatCreatedBy,
  formatDateTime,
  formatRelativeTime,
  formatTaskSource,
  getTaskIntentSummary,
} from "@/lib/format";
import { MetricTile, PageHeader, SectionCard, StatusBadge } from "@/components/operator-ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function recentFailure(run: RunRecord): boolean {
  return ["failure", "timeout", "dead_lettered", "terminal_client_error", "retry_window_expired"].includes(run.status);
}

export function AgentActivityPage() {
  const tasksQuery = useQuery({
    queryKey: ["agent-activity", "tasks"],
    queryFn: () => listTasksWithFilters({ limit: 500 }),
    refetchInterval: 10000,
  });
  const runsQuery = useQuery({
    queryKey: ["agent-activity", "runs"],
    queryFn: () => listRunsWithFilters({ limit: 300 }),
    refetchInterval: 6000,
  });

  const tasks = tasksQuery.data ?? [];
  const runs = runsQuery.data ?? [];
  const agentTasks = tasks.filter((task) => task.createdBy?.type === "agent");
  const agentTaskIds = new Set(agentTasks.map((task) => task.id));
  const agentRuns = runs.filter((run) => agentTaskIds.has(run.taskId));
  const agentFailures = agentRuns.filter(recentFailure);

  const topAgents = useMemo(() => {
    return Array.from(
      agentTasks.reduce((map, task) => {
        const key = task.createdBy?.id ?? task.id;
        const existing = map.get(key) ?? {
          id: key,
          name: formatCreatedBy(task.createdBy),
          taskCount: 0,
          runCount: 0,
          nextRunAt: null as string | null,
        };
        existing.taskCount += 1;
        if (!existing.nextRunAt || (task.nextRunAt && new Date(task.nextRunAt).getTime() < new Date(existing.nextRunAt).getTime())) {
          existing.nextRunAt = task.nextRunAt;
        }
        map.set(key, existing);
        return map;
      }, new Map<string, { id: string; name: string; taskCount: number; runCount: number; nextRunAt: string | null }>())
    )
      .map(([id, agent]) => ({
        ...agent,
        runCount: agentRuns.filter((run) => {
          const task = agentTasks.find((candidate) => candidate.id === run.taskId);
          return task?.createdBy?.id === id;
        }).length,
      }))
      .sort((a, b) => b.taskCount - a.taskCount || b.runCount - a.runCount)
      .slice(0, 8);
  }, [agentRuns, agentTasks]);

  const recentAgentSchedules = [...agentTasks]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Activity"
        description="See which agents are scheduling work, what they own, and what is likely to need follow-up."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Agent-created tasks" value={agentTasks.length} />
        <MetricTile label="Recent agent runs" value={agentRuns.length} detail="Last 300 delivery attempts" />
        <MetricTile label="Recent failures" value={agentFailures.length} detail={agentFailures.length > 0 ? "Needs review" : "No current failures"} />
        <MetricTile label="Active agents" value={topAgents.length} detail="Ranked by schedules and recent runs" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Top agents" description="Most active autonomous actors in this organization.">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Agent</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Tasks</TableHead>
                <TableHead>Runs</TableHead>
                <TableHead>Next wake-up</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topAgents.length > 0 ? (
                topAgents.map((agent) => {
                  const representativeTask = agentTasks.find((task) => task.createdBy?.id === agent.id);
                  return (
                    <TableRow key={agent.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">{agent.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{agent.id}</p>
                        </div>
                      </TableCell>
                      <TableCell>{representativeTask ? formatTaskSource(representativeTask.source) : "—"}</TableCell>
                      <TableCell>{agent.taskCount}</TableCell>
                      <TableCell>{agent.runCount}</TableCell>
                      <TableCell>{agent.nextRunAt ? formatRelativeTime(agent.nextRunAt) : "—"}</TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="whitespace-normal py-10">
                    <div className="mx-auto max-w-lg text-center">
                      <p className="text-sm font-medium text-foreground">No agent-created tasks yet.</p>
                      <p className="mt-1 mx-auto max-w-[28rem] text-sm leading-6 text-muted-foreground">
                        This view shows which agents are creating schedules and how much future work each actor owns.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </SectionCard>

        <SectionCard title="Recent autonomous commitments" description="New schedules created by agents, with intent and next wake-up.">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Task</TableHead>
                <TableHead>Intent</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Next wake-up</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentAgentSchedules.length > 0 ? (
                recentAgentSchedules.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="text-sm font-medium text-foreground hover:text-primary">
                        {task.name}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <p className="truncate text-sm text-foreground">{getTaskIntentSummary(task)}</p>
                    </TableCell>
                    <TableCell>{formatDateTime(task.createdAt)}</TableCell>
                    <TableCell>{task.nextRunAt ? formatRelativeTime(task.nextRunAt) : "—"}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="whitespace-normal py-10">
                    <div className="mx-auto max-w-lg text-center">
                      <p className="text-sm font-medium text-foreground">No recent agent-created schedules.</p>
                      <p className="mt-1 mx-auto max-w-[24rem] text-sm leading-6 text-muted-foreground">
                        New commitments created by agents will appear here with their next wake-up.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </SectionCard>
      </div>

      <SectionCard
        title="Recent failures from agent work"
        description="Failures, dead letters, and retry-window expiry from tasks created by agents."
        action={
          <a href="/runs?actor=agent&status=failure" className="text-xs font-medium text-primary hover:text-primary/80">
            Open filtered runs
          </a>
        }
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Task</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Attempt</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agentFailures.length > 0 ? (
              agentFailures.slice(0, 12).map((run) => {
                const task = agentTasks.find((candidate) => candidate.id === run.taskId);
                return (
                  <TableRow key={run.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <Link to="/runs/$runId" params={{ runId: run.id }} className="text-sm font-medium text-foreground hover:text-primary">
                          {task?.name ?? run.taskId}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">{task ? getTaskIntentSummary(task) : "No task summary available"}</p>
                      </div>
                    </TableCell>
                    <TableCell>{task ? formatCreatedBy(task.createdBy) : "Unknown"}</TableCell>
                    <TableCell>
                      <StatusBadge label={run.status.replaceAll("_", " ")} variant="error" />
                    </TableCell>
                    <TableCell>{run.attempt}</TableCell>
                    <TableCell>{formatRelativeTime(run.createdAt)}</TableCell>
                  </TableRow>
                );
              })
            ) : (
                <TableRow>
                  <TableCell colSpan={5} className="whitespace-normal py-10">
                  <div className="mx-auto flex max-w-[36rem] items-start gap-3 text-sm text-muted-foreground">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Robot size={16} className="text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">No recent failures from agent-created work.</p>
                      <p className="mt-1 max-w-[28rem] leading-6">
                        When agent-owned schedules fail or drift, this is where they will surface.
                      </p>
                    </div>
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
