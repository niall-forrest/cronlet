import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

const FALLBACK_POLLING_INTERVAL_MS = 5000;

interface RealtimeContextValue {
  pollingInterval: number | false;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  pollingInterval: false,
});

interface DashboardEvent {
  type?: string;
  jobId?: string;
}

const engineEventTypes = new Set([
  "job:start",
  "job:success",
  "job:failure",
  "job:timeout",
  "job:retry",
]);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [pollingInterval, setPollingInterval] = useState<number | false>(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (typeof window.EventSource === "undefined") {
      setPollingInterval(FALLBACK_POLLING_INTERVAL_MS);
      return;
    }

    const source = new window.EventSource("/api/events");

    source.onopen = () => {
      setPollingInterval(false);
    };

    source.onmessage = (message) => {
      let payload: DashboardEvent;
      try {
        payload = JSON.parse(message.data) as DashboardEvent;
      } catch {
        return;
      }

      if (!payload.type || !engineEventTypes.has(payload.type)) {
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["jobs"] });

      if (payload.jobId) {
        queryClient.invalidateQueries({ queryKey: ["job", payload.jobId] });
        queryClient.invalidateQueries({ queryKey: ["jobRuns", payload.jobId] });
      }
    };

    source.onerror = () => {
      // EventSource will attempt reconnects automatically.
      // While disconnected, fall back to polling.
      setPollingInterval(FALLBACK_POLLING_INTERVAL_MS);
    };

    return () => {
      source.close();
    };
  }, [queryClient]);

  const value = useMemo(
    () => ({ pollingInterval }),
    [pollingInterval]
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function usePollingInterval(): number | false {
  return useContext(RealtimeContext).pollingInterval;
}
