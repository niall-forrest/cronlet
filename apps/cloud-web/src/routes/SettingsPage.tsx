import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createApiKey,
  createSecret,
  deleteSecret,
  getCallbackSigningSecret,
  getOutboundPolicy,
  listApiKeys,
  listSecrets,
  patchOutboundPolicy,
  revokeApiKey,
  rotateApiKey,
  rotateCallbackSigningSecret,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { CopyButton, PageHeader, SectionCard } from "@/components/operator-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash, Eye, EyeSlash } from "@phosphor-icons/react";
import { Textarea } from "@/components/ui/textarea";

export function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Security"
        description="Manage signing, secrets, allowlists, and API access."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <CallbackSigningSection />
        <OutboundPolicySection />
      </div>

      <SecretsSection />
      <ApiKeysSection />
    </div>
  );
}

function CallbackSigningSection() {
  const queryClient = useQueryClient();
  const [showSecret, setShowSecret] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["callback-signing-secret"],
    queryFn: getCallbackSigningSecret,
  });
  const rotateMutation = useMutation({
    mutationFn: rotateCallbackSigningSecret,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["callback-signing-secret"] }),
  });

  return (
    <SectionCard
      title="Callback signing"
      description="Verify Cronlet callbacks with a timestamped signature."
      action={
        <Button variant="outline" onClick={() => rotateMutation.mutate()} disabled={rotateMutation.isPending}>
          {rotateMutation.isPending ? "Rotating..." : "Rotate secret"}
        </Button>
      }
    >
      <div className="space-y-4 p-5">
        {isLoading ? (
          <div className="h-10 animate-pulse rounded-lg bg-secondary/60" />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Input
                readOnly
                type={showSecret ? "text" : "password"}
                value={data?.secret ?? ""}
                className="pr-10 font-mono text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 h-7 w-7 p-0"
                onClick={() => setShowSecret((current) => !current)}
              >
                {showSecret ? <EyeSlash size={14} /> : <Eye size={14} />}
              </Button>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Rotated: {formatDateTime(data?.rotatedAt)}</span>
              {data?.secret ? <CopyButton value={data.secret} /> : null}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function OutboundPolicySection() {
  const queryClient = useQueryClient();
  const policyQuery = useQuery({
    queryKey: ["outbound-policy"],
    queryFn: getOutboundPolicy,
  });
  const [value, setValue] = useState("");

  useEffect(() => {
    if (policyQuery.data) {
      setValue(policyQuery.data.allowedHosts.join("\n"));
    }
  }, [policyQuery.data]);

  const patchMutation = useMutation({
    mutationFn: () =>
      patchOutboundPolicy({
        allowedHosts: value
          .split(/\n|,/)
          .map((item) => item.trim())
          .filter(Boolean),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["outbound-policy"] }),
  });

  return (
    <SectionCard
      title="Outbound allowlist"
      description="Optional host-level guardrail layered on top of Cronlet’s built-in SSRF protections."
      action={
        <Button onClick={() => patchMutation.mutate()} disabled={patchMutation.isPending}>
          {patchMutation.isPending ? "Saving..." : "Save policy"}
        </Button>
      }
    >
      <div className="space-y-3 p-5">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={7}
          className="font-mono text-xs"
          placeholder="api.example.org&#10;hooks.slack.com"
        />
        <p className="text-sm text-muted-foreground">
          One host per line. Leave empty to use Cronlet’s default outbound restrictions without an explicit allowlist.
        </p>
      </div>
    </SectionCard>
  );
}

function SecretsSection() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [showValue, setShowValue] = useState(false);

  const { data: secrets = [] } = useQuery({
    queryKey: ["secrets"],
    queryFn: listSecrets,
  });

  const createMutation = useMutation({
    mutationFn: createSecret,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secrets"] });
      setShowCreate(false);
      setNewName("");
      setNewValue("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSecret,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["secrets"] }),
  });

  return (
    <SectionCard
      title="Secrets"
      description="Encrypted values used by webhook auth and integrations."
      action={
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} className="mr-2" />
          Add Secret
        </Button>
      }
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Key version</TableHead>
            <TableHead>Last rotated</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {secrets.map((secret) => (
            <TableRow key={secret.name}>
              <TableCell>
                <code className="rounded-md border border-border/50 bg-zinc-950 px-2.5 py-1 font-mono text-xs text-primary">
                  {secret.name}
                </code>
              </TableCell>
              <TableCell>{secret.keyVersion}</TableCell>
              <TableCell>{formatDateTime(secret.lastRotatedAt)}</TableCell>
              <TableCell>{formatDateTime(secret.updatedAt)}</TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(secret.name)}>
                  <Trash size={14} />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Add Secret</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
                placeholder="WEBHOOK_AUTH_TOKEN"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>Value</Label>
              <div className="relative">
                <Input
                  type={showValue ? "text" : "password"}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="pr-10 font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-7 w-7 p-0"
                  onClick={() => setShowValue(!showValue)}
                >
                  {showValue ? <EyeSlash size={14} /> : <Eye size={14} />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate({ name: newName, value: newValue })}
              disabled={!newName || !newValue || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function ApiKeysSection() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState("tasks:read,runs:read,tasks:write,runs:write");

  const { data: apiKeys = [] } = useQuery({
    queryKey: ["api-keys"],
    queryFn: listApiKeys,
  });

  const createMutation = useMutation({
    mutationFn: createApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setShowCreate(false);
      setLabel("");
    },
  });

  const rotateMutation = useMutation({
    mutationFn: (apiKeyId: string) => rotateApiKey(apiKeyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  return (
    <SectionCard
      title="API keys"
      description="Machine credentials for integrations and automation."
      action={
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} className="mr-2" />
          Create API key
        </Button>
      }
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Label</TableHead>
            <TableHead>Preview</TableHead>
            <TableHead>Scopes</TableHead>
            <TableHead>Last used</TableHead>
            <TableHead className="w-[180px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {apiKeys.map((apiKey) => (
            <TableRow key={apiKey.id}>
              <TableCell>{apiKey.label}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{apiKey.keyPreview}</TableCell>
              <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">{apiKey.scopes.join(", ")}</TableCell>
              <TableCell>{formatDateTime(apiKey.lastUsedAt)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => rotateMutation.mutate(apiKey.id)}>
                    Rotate
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => revokeMutation.mutate(apiKey.id)}>
                    Revoke
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Production scheduler" />
            </div>
            <div className="space-y-2">
              <Label>Scopes</Label>
              <Input value={scopes} onChange={(event) => setScopes(event.target.value)} className="font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                createMutation.mutate({
                  label,
                  scopes: scopes.split(",").map((scope) => scope.trim()).filter(Boolean),
                })
              }
              disabled={!label || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create API key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
