import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Folder, ArrowRight, Info } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loading } from "@/components/Loading";
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

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    // Only auto-generate if slug hasn't been manually edited
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(value));
    }
  };

  const generateSlug = (value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  if (query.isLoading) {
    return <Loading />;
  }

  if (query.error) {
    return <p className="text-sm text-destructive">Failed to load projects: {(query.error as Error).message}</p>;
  }

  const hasProjects = query.data && query.data.length > 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="display-title">Projects</h1>
        <p className="text-muted-foreground mt-1">
          A project groups your jobs together. Most teams create one project per application.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card className="border-border/50 bg-card/60">
          <CardContent className="pt-6">
          {hasProjects ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Project ID</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Folder size={16} className="text-primary" />
                        <span className="font-medium">{project.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                        {project.slug}
                      </code>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/tasks">
                          Create task
                          <ArrowRight size={14} className="ml-1" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Folder size={24} className="text-primary" />
              </div>
              <h3 className="font-medium text-foreground mb-2">No projects yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
                Create your first project to start scheduling HTTP calls to your endpoints.
              </p>
              <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-3 max-w-sm mx-auto">
                <Info size={14} className="inline mr-1.5 -mt-0.5" />
                <strong>Example:</strong> If you have a web app and a data pipeline, create
                two projects: "web-app" and "data-pipeline"
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Create Project</CardTitle>
          <CardDescription>
            Give your project a name. The project ID is used in API calls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim() || !slug.trim()) {
                return;
              }
              createMutation.mutate({ name: name.trim(), slug: slug.trim() });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(event) => handleNameChange(event.target.value)}
                placeholder="My App"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-slug">
                Project ID
                <span className="text-muted-foreground font-normal ml-1">(used in API calls)</span>
              </Label>
              <Input
                id="project-slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder="my-app"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and hyphens only
              </p>
            </div>

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
    </div>
  );
}
