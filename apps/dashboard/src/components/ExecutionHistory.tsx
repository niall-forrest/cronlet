import type { JobRun } from "../api/client";
import { StatusBadge } from "./StatusBadge";

interface ExecutionHistoryProps {
  runs: JobRun[];
}

function formatDateTime(date: string): string {
  return new Date(date).toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function ExecutionHistory({ runs }: ExecutionHistoryProps) {
  if (runs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No execution history yet
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-left text-sm text-gray-500 border-b border-gray-800">
            <th className="pb-3 font-medium">Time</th>
            <th className="pb-3 font-medium">Status</th>
            <th className="pb-3 font-medium">Duration</th>
            <th className="pb-3 font-medium">Attempt</th>
            <th className="pb-3 font-medium">Run ID</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.runId} className="border-b border-gray-800/50 hover:bg-gray-800/30">
              <td className="py-3 text-sm text-gray-300">
                {formatDateTime(run.completedAt)}
              </td>
              <td className="py-3">
                <StatusBadge status={run.status} />
              </td>
              <td className="py-3 text-sm text-gray-300">
                {formatDuration(run.duration)}
              </td>
              <td className="py-3 text-sm text-gray-400">
                {run.attempt}
              </td>
              <td className="py-3 text-sm text-gray-500 font-mono">
                {run.runId.slice(0, 16)}...
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
