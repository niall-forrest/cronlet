import { Link } from "react-router-dom";
import type { Job } from "../api/client";
import { StatusBadge } from "./StatusBadge";
import { RunNowButton } from "./RunNowButton";

interface JobCardProps {
  job: Job;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatRelativeTime(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();

  if (diffMs < 60000) return "just now";
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return `${Math.floor(diffMs / 86400000)}d ago`;
}

export function JobCard({ job }: JobCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <Link to={`/jobs/${encodeURIComponent(job.id)}`} className="group">
          <h3 className="text-white font-medium group-hover:text-cyan-400 transition-colors">
            {job.name}
          </h3>
          <p className="text-sm text-gray-500 font-mono">{job.id}</p>
        </Link>
        <StatusBadge status={job.status} />
      </div>

      <div className="flex items-center gap-4 mb-4 text-sm">
        <div>
          <span className="text-gray-500">Schedule:</span>{" "}
          <span className="text-gray-300">{job.schedule}</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-gray-800">
        <div className="text-sm text-gray-500">
          {job.lastRun ? (
            <span>
              Last run: {formatRelativeTime(job.lastRun.completedAt)} ({formatDuration(job.lastRun.duration)})
            </span>
          ) : (
            <span>Never run</span>
          )}
        </div>
        <RunNowButton jobId={job.id} disabled={job.status === "running"} />
      </div>
    </div>
  );
}
