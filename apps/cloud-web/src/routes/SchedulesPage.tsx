import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createSchedule, listJobs, listSchedules, patchSchedule } from "../lib/api";

interface ScheduleDraft {
  id: string;
  cron: string;
  timezone: string;
  active: boolean;
}

export function SchedulesPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const [form, setForm] = useState({
    jobId: "",
    cron: "*/5 * * * *",
    timezone: "UTC",
    active: true,
  });

  const jobsQuery = useQuery({ queryKey: ["jobs"], queryFn: listJobs });
  const schedulesQuery = useQuery({ queryKey: ["schedules"], queryFn: listSchedules });

  const createMutation = useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      setForm((current) => ({ ...current, jobId: "", cron: "*/5 * * * *", timezone: "UTC", active: true }));
      void queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });

  const patchMutation = useMutation({
    mutationFn: (payload: ScheduleDraft) =>
      patchSchedule(payload.id, {
        cron: payload.cron,
        timezone: payload.timezone,
        active: payload.active,
      }),
    onSuccess: () => {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });

  if (jobsQuery.isLoading || schedulesQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading schedules...</p>;
  }

  if (jobsQuery.error || schedulesQuery.error) {
    const error = (jobsQuery.error ?? schedulesQuery.error) as Error;
    return <p className="text-sm text-destructive">Failed to load schedules: {error.message}</p>;
  }

  const jobs = jobsQuery.data ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1.9fr_1fr]">
      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="display-title">Schedules</CardTitle>
          <CardDescription>Cron cadence, timezone, and activation state for each job.</CardDescription>
        </CardHeader>
        <CardContent>
          {schedulesQuery.data && schedulesQuery.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Cron</TableHead>
                  <TableHead>Timezone</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedulesQuery.data.map((schedule) => {
                  const isEditing = draft?.id === schedule.id;
                  const model = isEditing ? draft : schedule;
                  return (
                    <TableRow key={schedule.id}>
                      <TableCell className="text-muted-foreground">
                        {jobs.find((job) => job.id === schedule.jobId)?.name ?? schedule.jobId}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={model.cron}
                            onChange={(event) =>
                              setDraft((current) =>
                                current ? { ...current, cron: event.target.value } : current
                              )
                            }
                          />
                        ) : (
                          <code className="text-foreground">{model.cron}</code>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={model.timezone}
                            onChange={(event) =>
                              setDraft((current) =>
                                current ? { ...current, timezone: event.target.value } : current
                              )
                            }
                          />
                        ) : (
                          <span className="text-muted-foreground">{model.timezone}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : "n/a"}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={model.active}
                              onCheckedChange={(checked) =>
                                setDraft((current) =>
                                  current ? { ...current, active: checked } : current
                                )
                              }
                            />
                            <span className="text-muted-foreground">
                              {model.active ? "active" : "paused"}
                            </span>
                          </div>
                        ) : (
                          <Badge variant={model.active ? "secondary" : "outline"}>
                            {model.active ? "active" : "paused"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {isEditing ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => draft && patchMutation.mutate(draft)}
                                disabled={patchMutation.isPending}
                              >
                                Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setDraft(null)}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setDraft({
                                    id: schedule.id,
                                    cron: schedule.cron,
                                    timezone: schedule.timezone,
                                    active: schedule.active,
                                  })
                                }
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant={schedule.active ? "destructive" : "secondary"}
                                onClick={() =>
                                  patchMutation.mutate({
                                    id: schedule.id,
                                    cron: schedule.cron,
                                    timezone: schedule.timezone,
                                    active: !schedule.active,
                                  })
                                }
                              >
                                {schedule.active ? "Pause" : "Resume"}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No schedules yet. Add one to activate job cadence.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Create Schedule</CardTitle>
          <CardDescription>Add cron cadence and timezone for a selected job.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!form.jobId || !form.cron.trim()) {
                return;
              }
              createMutation.mutate({
                jobId: form.jobId,
                cron: form.cron.trim(),
                timezone: form.timezone.trim() || "UTC",
                active: form.active,
              });
            }}
          >
            <div className="space-y-2">
              <Label>Job</Label>
              <Select
                value={form.jobId || undefined}
                onValueChange={(value) => setForm((current) => ({ ...current, jobId: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select job" />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Cron Expression</Label>
              <Input
                value={form.cron}
                onChange={(event) => setForm((current) => ({ ...current, cron: event.target.value }))}
                placeholder="*/5 * * * *"
              />
            </div>

            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input
                value={form.timezone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, timezone: event.target.value }))
                }
                placeholder="UTC"
              />
            </div>

            <div className="flex items-center justify-between rounded-none border border-border/70 px-3 py-2">
              <Label htmlFor="schedule-active">Start active</Label>
              <Switch
                id="schedule-active"
                checked={form.active}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, active: checked }))
                }
              />
            </div>

            <Button className="w-full" type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Schedule"}
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
