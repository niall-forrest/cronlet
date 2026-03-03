import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listRuns } from "../lib/api";

function statusVariant(status: string): "secondary" | "destructive" | "outline" {
  switch (status) {
    case "success":
      return "secondary";
    case "failure":
    case "timeout":
      return "destructive";
    default:
      return "outline";
  }
}

export function RunsPage() {
  const query = useQuery({
    queryKey: ["runs"],
    queryFn: listRuns,
    refetchInterval: 4000,
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading runs...</p>;
  }

  if (query.error) {
    return <p className="text-sm text-destructive">Failed to load runs: {(query.error as Error).message}</p>;
  }

  return (
    <Card className="border-border/70 bg-card/80">
      <CardHeader>
        <CardTitle className="display-title">Runs</CardTitle>
        <CardDescription>Recent execution attempts across manual and schedule triggers.</CardDescription>
      </CardHeader>
      <CardContent>
        {query.data && query.data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="text-muted-foreground">{run.jobId}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                  </TableCell>
                  <TableCell>{run.attempt}</TableCell>
                  <TableCell className="text-muted-foreground">{run.trigger}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {run.durationMs !== null ? `${run.durationMs}ms` : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
