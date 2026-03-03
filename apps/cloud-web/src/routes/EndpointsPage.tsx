import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createEndpoint, listEndpoints, listProjects, patchEndpoint } from "../lib/api";

interface EndpointDraft {
  id: string;
  name: string;
  url: string;
  timeoutMs: number;
}

export function EndpointsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    projectId: "",
    environment: "prod",
    name: "",
    url: "",
    timeoutMs: "30000",
  });
  const [editing, setEditing] = useState<EndpointDraft | null>(null);

  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const endpointsQuery = useQuery({ queryKey: ["endpoints"], queryFn: listEndpoints });

  const createMutation = useMutation({
    mutationFn: createEndpoint,
    onSuccess: () => {
      setForm((current) => ({ ...current, name: "", url: "" }));
      void queryClient.invalidateQueries({ queryKey: ["endpoints"] });
    },
  });

  const patchMutation = useMutation({
    mutationFn: (draft: EndpointDraft) =>
      patchEndpoint(draft.id, {
        name: draft.name,
        url: draft.url,
        timeoutMs: draft.timeoutMs,
      }),
    onSuccess: () => {
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["endpoints"] });
    },
  });

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projectsQuery.data ?? []) {
      map.set(project.id, project.name);
    }
    return map;
  }, [projectsQuery.data]);

  if (projectsQuery.isLoading || endpointsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading endpoints...</p>;
  }

  if (projectsQuery.error || endpointsQuery.error) {
    const error = (projectsQuery.error ?? endpointsQuery.error) as Error;
    return <p className="text-sm text-destructive">Failed to load endpoints: {error.message}</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
      <Card className="border border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="display-title">Endpoints</CardTitle>
        </CardHeader>
        <CardContent>
          {endpointsQuery.data && endpointsQuery.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Timeout</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpointsQuery.data.map((endpoint) => {
                  const isEditing = editing?.id === endpoint.id;
                  const model = isEditing ? editing : endpoint;

                  return (
                    <TableRow key={endpoint.id}>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={model.name}
                            onChange={(event) =>
                              setEditing((current) => (current ? { ...current, name: event.target.value } : current))
                            }
                          />
                        ) : (
                          model.name
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {projectNameById.get(endpoint.projectId) ?? endpoint.projectId}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{endpoint.environment}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {isEditing ? (
                          <Input
                            value={String(model.timeoutMs)}
                            onChange={(event) =>
                              setEditing((current) =>
                                current
                                  ? {
                                      ...current,
                                      timeoutMs: Number.parseInt(event.target.value || "0", 10),
                                    }
                                  : current
                              )
                            }
                          />
                        ) : (
                          `${model.timeoutMs}ms`
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {isEditing ? (
                            <>
                              <Button size="sm" onClick={() => editing && patchMutation.mutate(editing)}>
                                Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setEditing({
                                  id: endpoint.id,
                                  name: endpoint.name,
                                  url: endpoint.url,
                                  timeoutMs: endpoint.timeoutMs,
                                })
                              }
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No endpoints yet.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Add Endpoint</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!form.projectId || !form.name.trim() || !form.url.trim()) {
                return;
              }
              createMutation.mutate({
                projectId: form.projectId,
                environment: form.environment,
                name: form.name.trim(),
                url: form.url.trim(),
                authMode: "none",
                timeoutMs: Number.parseInt(form.timeoutMs, 10),
              });
            }}
          >
            <Select value={form.projectId} onValueChange={(value) => setForm((current) => ({ ...current, projectId: value }))}>
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
            <Input
              value={form.environment}
              onChange={(event) => setForm((current) => ({ ...current, environment: event.target.value }))}
              placeholder="Environment"
            />
            <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Endpoint name" />
            <Input value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://your-app.dev/cron" />
            <Input value={form.timeoutMs} onChange={(event) => setForm((current) => ({ ...current, timeoutMs: event.target.value }))} placeholder="Timeout ms" />
            <Button className="w-full" type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Endpoint"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
