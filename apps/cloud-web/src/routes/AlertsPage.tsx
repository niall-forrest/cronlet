import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loading } from "@/components/Loading";
import { createAlert, listAlerts } from "../lib/api";

export function AlertsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    channel: "email" as "email" | "webhook",
    destination: "",
    onFailure: true,
    onTimeout: true,
  });

  const alertsQuery = useQuery({ queryKey: ["alerts"], queryFn: listAlerts });

  const createMutation = useMutation({
    mutationFn: createAlert,
    onSuccess: () => {
      setForm((current) => ({
        ...current,
        destination: "",
        onFailure: true,
        onTimeout: true,
      }));
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  if (alertsQuery.isLoading) {
    return <Loading />;
  }

  if (alertsQuery.error) {
    const error = alertsQuery.error as Error;
    return <p className="text-sm text-destructive">Failed to load alerts: {error.message}</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="display-title">Alerts</CardTitle>
          <CardDescription>Failure and timeout notifications for your tasks.</CardDescription>
        </CardHeader>
        <CardContent>
          {alertsQuery.data && alertsQuery.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Triggers</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alertsQuery.data.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <Badge variant="outline">{alert.channel}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xl whitespace-normal text-muted-foreground">
                      {alert.destination}
                    </TableCell>
                    <TableCell className="space-x-2">
                      {alert.onFailure ? <Badge variant="secondary">failure</Badge> : null}
                      {alert.onTimeout ? <Badge variant="secondary">timeout</Badge> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(alert.updatedAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No alert rules yet.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Create Alert</CardTitle>
          <CardDescription>Add destination and failure policy.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!form.destination.trim()) {
                return;
              }

              createMutation.mutate({
                channel: form.channel,
                destination: form.destination.trim(),
                onFailure: form.onFailure,
                onTimeout: form.onTimeout,
              });
            }}
          >
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select
                value={form.channel}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, channel: value as "email" | "webhook" }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">email</SelectItem>
                  <SelectItem value="webhook">webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Destination</Label>
              <Input
                value={form.destination}
                onChange={(event) => setForm((current) => ({ ...current, destination: event.target.value }))}
                placeholder={form.channel === "email" ? "ops@company.com" : "https://hooks.example.com/alerts"}
              />
            </div>

            <div className="space-y-2 rounded-none border border-border/70 p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="alert-on-failure">On failure</Label>
                <Switch
                  id="alert-on-failure"
                  checked={form.onFailure}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, onFailure: checked }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="alert-on-timeout">On timeout</Label>
                <Switch
                  id="alert-on-timeout"
                  checked={form.onTimeout}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, onTimeout: checked }))}
                />
              </div>
            </div>

            <Button className="w-full" type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Alert"}
            </Button>
            {createMutation.error ? (
              <p className="text-xs text-destructive">{(createMutation.error as Error).message}</p>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
