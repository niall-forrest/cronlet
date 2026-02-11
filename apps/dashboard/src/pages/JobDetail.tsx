import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchJob, fetchJobRuns } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { RunNowButton } from "../components/RunNowButton";
import { ExecutionHistory } from "../components/ExecutionHistory";

export function JobDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ["job", id],
    queryFn: () => fetchJob(id!),
    enabled: !!id,
  });

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ["jobRuns", id],
    queryFn: () => fetchJobRuns(id!),
    enabled: !!id,
  });

  if (jobLoading) {
    return (
      <div className="text-center py-12 text-gray-500">
        Loading job details...
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">Job not found</p>
        <Link to="/" className="text-cyan-400 hover:underline">
          Back to jobs
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-300 mb-2 inline-block">
          ← Back to jobs
        </Link>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-white mb-1">{job.name}</h1>
            <p className="text-gray-500 font-mono text-sm">{job.id}</p>
          </div>
          <div className="flex items-center gap-4">
            <StatusBadge status={job.status} />
            <RunNowButton jobId={job.id} disabled={job.status === "running"} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-4 border-t border-gray-800">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Schedule</p>
            <p className="text-gray-200">{job.schedule}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Cron</p>
            <p className="text-gray-200 font-mono text-sm">{job.cron}</p>
          </div>
          {job.config.timeout && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Timeout</p>
              <p className="text-gray-200">{job.config.timeout}</p>
            </div>
          )}
          {job.config.retry && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Retry</p>
              <p className="text-gray-200">
                {job.config.retry.attempts} attempts
                {job.config.retry.backoff && ` (${job.config.retry.backoff})`}
              </p>
            </div>
          )}
          {job.nextRun && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Next Run</p>
              <p className="text-gray-200">
                {new Date(job.nextRun).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Execution History</h2>
        {runsLoading ? (
          <div className="text-center py-8 text-gray-500">Loading history...</div>
        ) : (
          <ExecutionHistory runs={runs || []} />
        )}
      </div>
    </div>
  );
}
