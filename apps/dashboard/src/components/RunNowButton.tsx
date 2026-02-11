import { useMutation, useQueryClient } from "@tanstack/react-query";
import { triggerJob } from "../api/client";

interface RunNowButtonProps {
  jobId: string;
  disabled?: boolean;
}

export function RunNowButton({ jobId, disabled }: RunNowButtonProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => triggerJob(jobId),
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
      queryClient.invalidateQueries({ queryKey: ["jobRuns", jobId] });
    },
  });

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={disabled || mutation.isPending}
      className="px-3 py-1.5 text-sm bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
    >
      {mutation.isPending ? "Running..." : "Run Now"}
    </button>
  );
}
