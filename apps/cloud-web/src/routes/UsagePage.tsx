import { useQuery } from "@tanstack/react-query";
import { getUsage } from "@/lib/api";
import { formatDateTime, formatPlanTier } from "@/lib/format";
import { Loading } from "@/components/Loading";
import { MetricTile, PageHeader, SectionCard, StatusBadge } from "@/components/operator-ui";

export function UsagePage() {
  const query = useQuery({
    queryKey: ["usage"],
    queryFn: getUsage,
    refetchInterval: 8000,
  });

  if (query.isLoading) {
    return <Loading />;
  }

  if (query.error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Usage"
          description="Run-attempt consumption, retention, and account state for the current organization."
        />
        <SectionCard title="Usage snapshot" description="Unable to load the latest usage data.">
          <div className="px-4 py-10 text-sm text-destructive">
            Failed to load usage: {(query.error as Error).message}
          </div>
        </SectionCard>
      </div>
    );
  }

  if (!query.data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Usage"
          description="Run-attempt consumption, retention, and account state for the current organization."
        />
        <SectionCard title="Usage snapshot" description="No usage data is available for this organization yet.">
          <div className="px-4 py-10 text-sm text-muted-foreground">No usage data.</div>
        </SectionCard>
      </div>
    );
  }

  const usage = query.data;
  const usagePercent = usage.runLimit > 0 ? Math.min(100, Math.round((usage.runAttempts / usage.runLimit) * 100)) : 0;
  const remaining = Math.max(0, usage.runLimit - usage.runAttempts);
  const graceLabel = usage.graceEndsAt ? formatDateTime(usage.graceEndsAt) : "Not active";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usage"
        description="Run-attempt consumption, retention, and account state for the current organization."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Plan" value={formatPlanTier(usage.tier)} detail={usage.month} />
        <MetricTile label="Run attempts used" value={usage.runAttempts.toLocaleString()} detail={`${usagePercent}% of limit`} />
        <MetricTile label="Remaining" value={remaining.toLocaleString()} detail={`${usage.runLimit.toLocaleString()} total this month`} />
        <MetricTile
          label="Account state"
          value={usage.delinquent ? "Attention needed" : "Healthy"}
          detail={usage.delinquent ? "Grace window is active" : "In good standing"}
        />
      </div>

      <SectionCard
        title="Run attempts"
        description="Tracked against the monthly limit for the current organization."
        action={
          <StatusBadge
            label={usage.delinquent ? "Delinquent" : "In good standing"}
            variant={usage.delinquent ? "error" : "success"}
          />
        }
      >
        <div className="space-y-4 px-4 py-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-2xl font-semibold tracking-tight text-foreground">
                {usage.runAttempts.toLocaleString()}
                <span className="ml-2 text-base font-medium text-muted-foreground">
                  / {usage.runLimit.toLocaleString()}
                </span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {remaining.toLocaleString()} remaining in {usage.month}
              </p>
            </div>
            <p className="text-sm font-medium tabular-nums text-muted-foreground">{usagePercent}% used</p>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-muted/70">
            <div className="h-full rounded-full bg-primary/85" style={{ width: `${usagePercent}%` }} />
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4">
        <SectionCard title="Retention" description="Historical data stays available for this window before cleanup runs.">
          <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border/50 bg-secondary/20 p-3">
              <p className="meta-label">Retention window</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{usage.retentionDays} days</p>
              <p className="mt-1 text-xs text-muted-foreground">Completed runs, task history, and related records.</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-secondary/20 p-3">
              <p className="meta-label">Grace window</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{graceLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {usage.graceEndsAt ? "Billing grace is active for this organization." : "No grace period is currently active."}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
