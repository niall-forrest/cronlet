interface StatusBadgeProps {
  status: "idle" | "running" | "failed" | "failure" | "success" | "timeout";
}

const statusConfig: Record<StatusBadgeProps["status"], { color: string; text: string }> = {
  idle: {
    color: "bg-gray-500",
    text: "Idle",
  },
  running: {
    color: "bg-yellow-500 animate-pulse",
    text: "Running",
  },
  success: {
    color: "bg-green-500",
    text: "Success",
  },
  failed: {
    color: "bg-red-500",
    text: "Failed",
  },
  failure: {
    color: "bg-red-500",
    text: "Failed",
  },
  timeout: {
    color: "bg-orange-500",
    text: "Timeout",
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${config.color}`} />
      <span className="text-sm text-gray-400">{config.text}</span>
    </div>
  );
}
