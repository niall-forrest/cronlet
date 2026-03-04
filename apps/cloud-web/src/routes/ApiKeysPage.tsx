import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { createApiKey, listApiKeys, revokeApiKey, rotateApiKey } from "../lib/api";

const scopeTemplates = {
  readonly: ["projects:read", "endpoints:read", "jobs:read", "schedules:read", "runs:read", "usage:read", "audit:read"],
  operator: ["projects:read", "endpoints:read", "jobs:read", "jobs:write", "schedules:read", "schedules:write", "runs:read", "runs:write"],
  full: ["*"],
} as const;

export function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [scopesInput, setScopesInput] = useState("jobs:read,jobs:write,schedules:read,schedules:write");
  const [freshToken, setFreshToken] = useState<string | null>(null);

  const keysQuery = useQuery({
    queryKey: ["api-keys"],
    queryFn: listApiKeys,
  });

  const createMutation = useMutation({
    mutationFn: createApiKey,
    onSuccess: (result) => {
      setFreshToken(result.token);
      setLabel("");
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const rotateMutation = useMutation({
    mutationFn: (apiKeyId: string) => rotateApiKey(apiKeyId),
    onSuccess: (result) => {
      setFreshToken(result.token);
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  if (keysQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading API keys...</p>;
  }
  if (keysQuery.error) {
    return <p className="text-sm text-destructive">Failed to load API keys: {(keysQuery.error as Error).message}</p>;
  }

  const scopes = scopesInput
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="display-title">API Keys</CardTitle>
          <CardDescription>Scoped credentials for CI, agents, and service-to-service automation.</CardDescription>
        </CardHeader>
        <CardContent>
          {freshToken ? (
            <div className="mb-4 space-y-2 rounded-none border border-primary/40 bg-primary/10 p-3">
              <Badge variant="secondary">Copy once</Badge>
              <p className="break-all text-xs text-primary">{freshToken}</p>
            </div>
          ) : null}
          {keysQuery.data && keysQuery.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Preview</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keysQuery.data.map((apiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell>{apiKey.label}</TableCell>
                    <TableCell className="max-w-xl whitespace-normal text-muted-foreground">
                      {apiKey.scopes.join(", ")}
                    </TableCell>
                    <TableCell className="font-medium text-primary">{apiKey.keyPreview}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleString() : "Never"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => rotateMutation.mutate(apiKey.id)}
                          disabled={rotateMutation.isPending}
                        >
                          Rotate
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => revokeMutation.mutate(apiKey.id)}
                          disabled={revokeMutation.isPending}
                        >
                          Revoke
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No API keys created yet.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Create API Key</CardTitle>
          <CardDescription>Use the smallest scope set needed for each integration.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!label.trim() || scopes.length === 0) {
                return;
              }
              createMutation.mutate({
                label: label.trim(),
                scopes,
              });
            }}
          >
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="GitHub Actions"
              />
            </div>
            <div className="space-y-2">
              <Label>Scopes</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setScopesInput(scopeTemplates.readonly.join(","))}
                >
                  Read-Only
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setScopesInput(scopeTemplates.operator.join(","))}
                >
                  Operator
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setScopesInput(scopeTemplates.full.join(","))}
                >
                  Full Access
                </Button>
              </div>
              <Textarea
                className="min-h-24"
                value={scopesInput}
                onChange={(event) => setScopesInput(event.target.value)}
                placeholder="Comma-separated scopes"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Examples: `jobs:read`, `jobs:write`, `schedules:write`, `api_keys:read`, `*`
            </p>
            <Button className="w-full" type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Key"}
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
