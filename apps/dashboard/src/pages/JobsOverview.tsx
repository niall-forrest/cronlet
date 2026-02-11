import { useQuery } from "@tanstack/react-query";
import { fetchJobs } from "../api/client";
import { JobCard } from "../components/JobCard";

export function JobsOverview() {
  const { data: jobs, isLoading, error } = useQuery({
    queryKey: ["jobs"],
    queryFn: fetchJobs,
  });

  if (isLoading) {
    return (
      <div className="text-center py-12 text-gray-500">
        Loading jobs...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-2">Failed to load jobs</p>
        <p className="text-sm text-gray-500">
          Make sure the cronlet dev server is running
        </p>
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-2">No jobs discovered</p>
        <p className="text-sm text-gray-500">
          Create job files in your jobs directory and restart the dev server
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Jobs</h1>
        <span className="text-sm text-gray-500">
          {jobs.length} job{jobs.length === 1 ? "" : "s"} discovered
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}
