import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { createJob, listEndpoints, listJobs, listProjects, patchJob, triggerJob } from "../lib/api";

interface JobDraft {
  id: string;
  name: string;
  concurrency: "allow" | "skip" | "queue";
  catchup: boolean;
  retryAttempts: number;
  retryBackoff: "linear" | "exponential";
  retryInitialDelay: string;
  timeout: string;
  active: boolean;
}

export function JobsPage() {
  const queryClient = useQueryClient();
  const [editingJob, setEditingJob] = useState<JobDraft | null>(null);
  const [form, setForm] = useState({
    projectId: "",
    environment: "prod",
    endpointId: "",
    name: "",
    key: "",
    concurrency: "skip" as "allow" | "skip" | "queue",
    retryAttempts: "1",
    retryBackoff: "linear" as "linear" | "exponential",
    retryInitialDelay: "1s",
    timeout: "30s",
    catchup: false,
  });

  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const endpointsQuery = useQuery({ queryKey: ["endpoints"], queryFn: listEndpoints });
  const jobsQuery = useQuery({ queryKey: ["jobs"], queryFn: listJobs });

  const createMutation = useMutation({
    mutationFn: createJob,
    onSuccess: () => {
      setForm((current) => ({
        ...current,
        name: "",
        key: "",
      }));
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const patchMutation = useMutation({
    mutationFn: (draft: JobDraft) =>
      patchJob(draft.id, {
        name: draft.name,
        concurrency: draft.concurrency,
        catchup: draft.catchup,
        retryAttempts: draft.retryAttempts,
        retryBackoff: draft.retryBackoff,
        retryInitialDelay: draft.retryInitialDelay,
        timeout: draft.timeout,
        active: draft.active,
      }),
    onSuccess: () => {
      setEditingJob(null);
      void queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const triggerMutation = useMutation({
    mutationFn: triggerJob,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });

  const projectNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projectsQuery.data ?? []) {
      map.set(project.id, project.name);
    }
    return map;
  }, [projectsQuery.data]);

  const endpointNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const endpoint of endpointsQuery.data ?? []) {
      map.set(endpoint.id, endpoint.name);
    }
    return map;
  }, [endpointsQuery.data]);

  const filteredEndpoints = useMemo(() => {
    if (!form.projectId) {
      return endpointsQuery.data ?? [];
    }

    return (endpointsQuery.data ?? []).filter((endpoint) => endpoint.projectId === form.projectId);
  }, [form.projectId, endpointsQuery.data]);

  if (projectsQuery.isLoading || endpointsQuery.isLoading || jobsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading jobs...</p>;
  }

  if (projectsQuery.error || endpointsQuery.error || jobsQuery.error) {
    const error = (projectsQuery.error ?? endpointsQuery.error ?? jobsQuery.error) as Error;
    return <p className="text-sm text-destructive">Failed to load job controls: {error.message}</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="display-title">Jobs</CardTitle>
          <CardDescription>Manage runtime behavior, retries, and one-off manual triggers.</CardDescription>
        </CardHeader>
        <CardContent>
          {jobsQuery.data && jobsQuery.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Concurrency</TableHead>
                  <TableHead>Retry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobsQuery.data.map((job) => {
                  const isEditing = editingJob?.id === job.id;
                  const model = isEditing ? editingJob : job;

                  return (
                    <TableRow key={job.id}>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={model.name}
                            onChange={(event) =>
                              setEditingJob((current) =>
                                current ? { ...current, name: event.target.value } : current
                              )
                            }
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span>{model.name}</span>
                            {model.catchup ? <Badge variant="secondary">catchup</Badge> : null}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {projectNames.get(job.projectId) ?? job.projectId}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {endpointNames.get(job.endpointId) ?? job.endpointId}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Select
                            value={model.concurrency}
                            onValueChange={(value) =>
                              setEditingJob((current) =>
                                current
                                  ? {
                                      ...current,
                                      concurrency: value as "allow" | "skip" | "queue",
                                    }
                                  : current
                              )
                            }
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue placeholder="Concurrency" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="allow">allow</SelectItem>
                              <SelectItem value="skip">skip</SelectItem>
                              <SelectItem value="queue">queue</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline">{model.concurrency}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {isEditing ? (
                          <div className="flex w-full max-w-60 items-center gap-2">
                            <Input
                              value={String(model.retryAttempts)}
                              onChange={(event) =>
                                setEditingJob((current) =>
                                  current
                                    ? {
                                        ...current,
                                        retryAttempts: Math.max(
                                          1,
                                          Number.parseInt(event.target.value || "1", 10)
                                        ),
                                      }
                                    : current
                                )
                              }
                            />
                            <Select
                              value={model.retryBackoff}
                              onValueChange={(value) =>
                                setEditingJob((current) =>
                                  current
                                    ? {
                                        ...current,
                                        retryBackoff: value as "linear" | "exponential",
                                      }
                                    : current
                                )
                              }
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue placeholder="Backoff" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="linear">linear</SelectItem>
                                <SelectItem value="exponential">exponential</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          `${model.retryAttempts}x ${model.retryBackoff}`
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={model.active}
                              onCheckedChange={(checked) =>
                                setEditingJob((current) =>
                                  current
                                    ? {
                                        ...current,
                                        active: checked,
                                      }
                                    : current
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
                                onClick={() => editingJob && patchMutation.mutate(editingJob)}
                                disabled={patchMutation.isPending}
                              >
                                Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingJob(null)}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setEditingJob({
                                    id: job.id,
                                    name: job.name,
                                    concurrency: job.concurrency,
                                    catchup: job.catchup,
                                    retryAttempts: job.retryAttempts,
                                    retryBackoff: job.retryBackoff,
                                    retryInitialDelay: job.retryInitialDelay,
                                    timeout: job.timeout,
                                    active: job.active,
                                  })
                                }
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => triggerMutation.mutate(job.id)}
                                disabled={triggerMutation.isPending}
                              >
                                Run now
                              </Button>
                              <Button
                                size="sm"
                                variant={job.active ? "destructive" : "secondary"}
                                onClick={() =>
                                  patchMutation.mutate({
                                    id: job.id,
                                    name: job.name,
                                    concurrency: job.concurrency,
                                    catchup: job.catchup,
                                    retryAttempts: job.retryAttempts,
                                    retryBackoff: job.retryBackoff,
                                    retryInitialDelay: job.retryInitialDelay,
                                    timeout: job.timeout,
                                    active: !job.active,
                                  })
                                }
                              >
                                {job.active ? "Pause" : "Resume"}
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
            <p className="text-sm text-muted-foreground">No jobs yet. Create one, then attach schedules.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Create Job</CardTitle>
          <CardDescription>Define runtime policy and endpoint binding in one step.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!form.projectId || !form.endpointId || !form.name.trim() || !form.key.trim()) {
                return;
              }

              createMutation.mutate({
                projectId: form.projectId,
                environment: form.environment,
                endpointId: form.endpointId,
                name: form.name.trim(),
                key: form.key.trim(),
                concurrency: form.concurrency,
                catchup: form.catchup,
                retryAttempts: Number(form.retryAttempts),
                retryBackoff: form.retryBackoff,
                retryInitialDelay: form.retryInitialDelay,
                timeout: form.timeout,
              });
            }}
          >
            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={form.projectId || undefined}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, projectId: value, endpointId: "" }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {(projectsQuery.data ?? []).map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Environment</Label>
              <Input
                value={form.environment}
                onChange={(event) =>
                  setForm((current) => ({ ...current, environment: event.target.value }))
                }
                placeholder="prod"
              />
            </div>

            <div className="space-y-2">
              <Label>Endpoint</Label>
              <Select
                value={form.endpointId || undefined}
                onValueChange={(value) => setForm((current) => ({ ...current, endpointId: value }))}
                disabled={filteredEndpoints.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      form.projectId
                        ? "Select endpoint"
                        : "Select a project first"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {filteredEndpoints.map((endpoint) => (
                    <SelectItem key={endpoint.id} value={endpoint.id}>
                      {endpoint.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Weekly Digest"
              />
            </div>

            <div className="space-y-2">
              <Label>Stable Key</Label>
              <Input
                value={form.key}
                onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
                placeholder="weekly-digest"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Concurrency</Label>
                <Select
                  value={form.concurrency}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      concurrency: value as "allow" | "skip" | "queue",
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Concurrency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow">allow</SelectItem>
                    <SelectItem value="skip">skip</SelectItem>
                    <SelectItem value="queue">queue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Retry Attempts</Label>
                <Input
                  value={form.retryAttempts}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, retryAttempts: event.target.value }))
                  }
                  placeholder="1"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Retry Backoff</Label>
                <Select
                  value={form.retryBackoff}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      retryBackoff: value as "linear" | "exponential",
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Backoff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linear">linear</SelectItem>
                    <SelectItem value="exponential">exponential</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Initial Delay</Label>
                <Input
                  value={form.retryInitialDelay}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, retryInitialDelay: event.target.value }))
                  }
                  placeholder="1s"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Timeout</Label>
              <Input
                value={form.timeout}
                onChange={(event) =>
                  setForm((current) => ({ ...current, timeout: event.target.value }))
                }
                placeholder="30s"
              />
            </div>

            <div className="flex items-center justify-between rounded-none border border-border/70 px-3 py-2">
              <Label htmlFor="catchup">Enable catchup</Label>
              <Switch
                id="catchup"
                checked={form.catchup}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, catchup: checked }))
                }
              />
            </div>

            <Button className="w-full" type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Job"}
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
