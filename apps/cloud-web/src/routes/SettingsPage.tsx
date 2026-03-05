import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listSecrets,
  createSecret,
  deleteSecret,
  listApiKeys,
  createApiKey,
  rotateApiKey,
  revokeApiKey,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  DotsThree,
  Trash,
  Key,
  Lock,
  Eye,
  EyeSlash,
  Copy,
  ArrowsClockwise,
  CheckCircle,
} from "@phosphor-icons/react";
import { Skeleton } from "@/components/Skeleton";
import { SectionHeader } from "@/components/ui/section-header";

export function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="display-title">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage secrets and API keys for your organization
        </p>
      </div>

      <SecretsSection />
      <ApiKeysSection />
    </div>
  );
}

// ============================================
// SECRETS SECTION
// ============================================

function SecretsSection() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [showValue, setShowValue] = useState(false);

  const { data: secrets = [], isLoading } = useQuery({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["secrets"] });
    },
  });

  const handleCreate = () => {
    if (newName && newValue) {
      createMutation.mutate({ name: newName, value: newValue });
    }
  };

  const handleDelete = (name: string) => {
    if (confirm(`Delete secret ${name}? This cannot be undone.`)) {
      deleteMutation.mutate(name);
    }
  };

  return (
    <section className="space-y-4">
      <SectionHeader
        label="Secrets"
        action={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} weight="bold" className="mr-2" />
            Add Secret
          </Button>
        }
      />

      <Card variant="flat">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 py-2">
                  <Skeleton className="h-5 w-32 rounded" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : secrets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Lock size={28} weight="duotone" className="text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No secrets yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto text-center mb-6">
                Add secrets for Slack tokens, API keys, database credentials, and other sensitive values.
              </p>
              <Button variant="outline" onClick={() => setShowCreate(true)}>
                <Plus size={14} weight="bold" className="mr-2" />
                Add your first secret
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Name</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Created</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Updated</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {secrets.map((secret) => (
                  <TableRow key={secret.name} className="group">
                    <TableCell>
                      <code className="bg-zinc-950 border border-border/50 px-2.5 py-1 rounded-md text-xs font-mono text-primary">
                        {secret.name}
                      </code>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(secret.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(secret.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(secret.name)}
                      >
                        <Trash size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Secret Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Secret</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
                placeholder="SLACK_TOKEN"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Uppercase letters, numbers, and underscores only
              </p>
            </div>
            <div className="space-y-2">
              <Label>Value</Label>
              <div className="relative">
                <Input
                  type={showValue ? "text" : "password"}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="xoxb-..."
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
              onClick={handleCreate}
              disabled={!newName || !newValue || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ============================================
// API KEYS SECTION
// ============================================

function ApiKeysSection() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: apiKeys = [], isLoading } = useQuery({
    queryKey: ["apiKeys"],
    queryFn: listApiKeys,
  });

  const createMutation = useMutation({
    mutationFn: createApiKey,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
      setNewToken(data.token);
      setNewLabel("");
    },
  });

  const rotateMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => rotateApiKey(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
      setNewToken(data.token);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
  });

  const handleCreate = () => {
    if (newLabel) {
      createMutation.mutate({ label: newLabel, scopes: ["*"] });
    }
  };

  const handleRotate = (id: string) => {
    if (confirm("Rotate this API key? The old key will stop working immediately.")) {
      rotateMutation.mutate({ id });
    }
  };

  const handleRevoke = (id: string) => {
    if (confirm("Revoke this API key? This cannot be undone.")) {
      revokeMutation.mutate(id);
    }
  };

  const copyToken = async () => {
    if (newToken) {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section className="space-y-4">
      <SectionHeader
        label="API Keys"
        action={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} weight="bold" className="mr-2" />
            Create Key
          </Button>
        }
      />

      <Card variant="flat">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-4 py-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-5 w-24 rounded" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--accent)/0.15)]">
                <Key size={28} weight="duotone" className="text-[hsl(var(--accent))]" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No API keys yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto text-center mb-6">
                Create an API key to access the Cronlet API programmatically or configure the MCP server.
              </p>
              <Button variant="outline" onClick={() => setShowCreate(true)}>
                <Plus size={14} weight="bold" className="mr-2" />
                Create your first key
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Label</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Prefix</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Created</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Last Used</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((key) => (
                  <TableRow key={key.id} className="group">
                    <TableCell className="font-medium">{key.label}</TableCell>
                    <TableCell>
                      <code className="bg-zinc-950 border border-border/50 px-2.5 py-1 rounded-md text-xs font-mono text-muted-foreground">
                        {key.keyPreview}
                      </code>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(key.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {key.lastUsedAt
                        ? new Date(key.lastUsedAt).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <DotsThree size={18} weight="bold" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleRotate(key.id)}>
                            <ArrowsClockwise size={14} className="mr-2" />
                            Rotate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleRevoke(key.id)}
                          >
                            <Trash size={14} className="mr-2" />
                            Revoke
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create API Key Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => {
        setShowCreate(open);
        if (!open) {
          setNewToken(null);
          setNewLabel("");
          setCopied(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {newToken ? "API Key Created" : "Create API Key"}
            </DialogTitle>
          </DialogHeader>

          {newToken ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Copy your API key now. You won't be able to see it again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-zinc-950 border border-border/50 px-3 py-2.5 rounded-lg text-sm font-mono break-all text-primary">
                  {newToken}
                </code>
                <Button variant="outline" size="icon" onClick={copyToken}>
                  {copied ? <CheckCircle size={16} className="text-emerald-400" /> : <Copy size={16} />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Label</Label>
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="My API Key"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {newToken ? (
              <Button onClick={() => {
                setShowCreate(false);
                setNewToken(null);
                setCopied(false);
              }}>
                Done
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newLabel || createMutation.isPending}
                >
                  {createMutation.isPending ? "Creating..." : "Create Key"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Token Display Dialog (for rotated keys) */}
      <Dialog open={!!newToken && !showCreate} onOpenChange={(open) => {
        if (!open) {
          setNewToken(null);
          setCopied(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Copy your new API key now. You won't be able to see it again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-zinc-950 border border-border/50 px-3 py-2.5 rounded-lg text-sm font-mono break-all text-primary">
                {newToken}
              </code>
              <Button variant="outline" size="icon" onClick={copyToken}>
                {copied ? <CheckCircle size={16} className="text-emerald-400" /> : <Copy size={16} />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => {
              setNewToken(null);
              setCopied(false);
            }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
