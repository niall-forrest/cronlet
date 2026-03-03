import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createProject, listProjects } from "../lib/api";

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const query = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      setName("");
      setSlug("");
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading projects...</p>;
  }

  if (query.error) {
    return <p className="text-sm text-destructive">Failed to load projects: {(query.error as Error).message}</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="display-title">Projects</CardTitle>
          <CardDescription>Top-level containers for endpoints, jobs, schedules, and usage.</CardDescription>
        </CardHeader>
        <CardContent>
          {query.data && query.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>{project.name}</TableCell>
                    <TableCell className="text-muted-foreground">{project.slug}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(project.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              No projects yet. Create your first project to start wiring endpoints and jobs.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Create Project</CardTitle>
          <CardDescription>Choose a durable slug used by automation and API clients.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim() || !slug.trim()) {
                return;
              }
              createMutation.mutate({ name: name.trim(), slug: slug.trim() });
            }}
          >
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" />
            <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="project-slug" />
            <Button className="w-full" type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Project"}
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
