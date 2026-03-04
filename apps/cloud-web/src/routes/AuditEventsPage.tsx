import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAuditEvents } from "../lib/api";

function localDateTimeToIso(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function compactMetadata(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "-";
  }
  const raw = JSON.stringify(value);
  if (!raw) {
    return "-";
  }
  return raw.length > 120 ? `${raw.slice(0, 120)}...` : raw;
}

export function AuditEventsPage() {
  const [actorType, setActorType] = useState<"all" | "user" | "api_key" | "internal" | "webhook">("all");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState("100");

  const query = useQuery({
    queryKey: ["audit-events", actorType, action, from, to, limit],
    queryFn: () =>
      listAuditEvents({
        actorType: actorType === "all" ? undefined : actorType,
        action: action.trim() || undefined,
        from: localDateTimeToIso(from),
        to: localDateTimeToIso(to),
        limit: Number.parseInt(limit || "100", 10),
      }),
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading audit events...</p>;
  }

  if (query.error) {
    return <p className="text-sm text-destructive">Failed to load audit events: {(query.error as Error).message}</p>;
  }

  return (
    <Card className="border-border/70 bg-card/80">
      <CardHeader>
        <CardTitle className="display-title">Audit Timeline</CardTitle>
        <CardDescription>Track user, API key, internal, and webhook actions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-none border border-border/70 p-3 md:grid-cols-5">
          <div className="space-y-2">
            <Label>Actor</Label>
            <Select value={actorType} onValueChange={(value) => setActorType(value as typeof actorType)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All actors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">all</SelectItem>
                <SelectItem value="user">user</SelectItem>
                <SelectItem value="api_key">api_key</SelectItem>
                <SelectItem value="internal">internal</SelectItem>
                <SelectItem value="webhook">webhook</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Action</Label>
            <Input value={action} onChange={(event) => setAction(event.target.value)} placeholder="api_key.created" />
          </div>
          <div className="space-y-2">
            <Label>From</Label>
            <Input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Limit</Label>
            <Input value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="100" />
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        {query.data && query.data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Payload</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge variant="outline">{event.actorType}</Badge>
                      <p className="text-xs text-muted-foreground">{event.actorId}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{event.action}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {event.targetType}:{event.targetId}
                  </TableCell>
                  <TableCell className="max-w-xl whitespace-normal text-xs text-muted-foreground">
                    {compactMetadata(event.metadata)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No audit events for this filter set.</p>
        )}
      </CardContent>
    </Card>
  );
}
