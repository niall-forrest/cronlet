import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getUsage } from "../lib/api";

export function UsagePage() {
  const query = useQuery({
    queryKey: ["usage"],
    queryFn: getUsage,
    refetchInterval: 8000,
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading usage...</p>;
  }

  if (query.error) {
    return <p className="text-sm text-destructive">Failed to load usage: {(query.error as Error).message}</p>;
  }

  if (!query.data) {
    return <p className="text-sm text-muted-foreground">No usage data.</p>;
  }

  const usagePercent = Math.min(100, Math.round((query.data.runAttempts / query.data.runLimit) * 100));

  return (
    <Card className="border-border/70 bg-card/80">
      <CardHeader>
        <CardTitle className="display-title">Usage</CardTitle>
        <CardDescription>Plan limits, billing status, and run-attempt consumption.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Tier: {query.data.tier}</Badge>
          <Badge variant="outline">Month: {query.data.month}</Badge>
          <Badge variant={query.data.delinquent ? "destructive" : "outline"}>
            {query.data.delinquent ? "Delinquent" : "In good standing"}
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Run attempts</span>
            <span>
              {query.data.runAttempts} / {query.data.runLimit}
            </span>
          </div>
          <div className="h-2 w-full rounded-none bg-muted">
            <div className="h-full rounded-none bg-primary" style={{ width: `${usagePercent}%` }} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-none border border-border/70 p-3">
            <p className="text-xs text-muted-foreground">Retention</p>
            <p className="text-sm">{query.data.retentionDays} days</p>
          </div>
          <div className="rounded-none border border-border/70 p-3">
            <p className="text-xs text-muted-foreground">Grace window</p>
            <p className="text-sm">
              {query.data.graceEndsAt ? new Date(query.data.graceEndsAt).toLocaleString() : "Not active"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
