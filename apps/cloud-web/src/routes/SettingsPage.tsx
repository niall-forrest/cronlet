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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@phosphor-icons/react";
import { LoadingInline } from "@/components/Loading";

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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Lock size={20} />
              Secrets
            </CardTitle>
            <CardDescription>
              Store sensitive values like API tokens for use in tasks
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} className="mr-2" />
            Add Secret
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingInline className="py-8 justify-center w-full" />
        ) : secrets.length === 0 ? (
          <div className="text-center py-8">
            <Lock size={32} className="mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              No secrets yet. Add secrets for Slack tokens, API keys, etc.
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
              <Plus size={14} className="mr-2" />
              Add your first secret
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {secrets.map((secret) => (
                <TableRow key={secret.name}>
                  <TableCell>
                    <code className="bg-muted px-2 py-0.5 rounded text-sm">
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
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
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
                  className="pr-10"
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
    </Card>
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

  const copyToken = () => {
    if (newToken) {
      navigator.clipboard.writeText(newToken);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key size={20} />
              API Keys
            </CardTitle>
            <CardDescription>
              Keys for programmatic access to the Cronlet API
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} className="mr-2" />
            Create Key
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingInline className="py-8 justify-center w-full" />
        ) : apiKeys.length === 0 ? (
          <div className="text-center py-8">
            <Key size={32} className="mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              No API keys yet. Create one to access the API programmatically.
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
              <Plus size={14} className="mr-2" />
              Create your first key
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.label}</TableCell>
                  <TableCell>
                    <code className="bg-muted px-2 py-0.5 rounded text-sm">
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
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <DotsThree size={18} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleRotate(key.id)}>
                          <ArrowsClockwise size={14} className="mr-2" />
                          Rotate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
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

      {/* Create API Key Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => {
        setShowCreate(open);
        if (!open) {
          setNewToken(null);
          setNewLabel("");
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
                <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                  {newToken}
                </code>
                <Button variant="outline" size="sm" onClick={copyToken}>
                  <Copy size={14} />
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
        if (!open) setNewToken(null);
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
              <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                {newToken}
              </code>
              <Button variant="outline" size="sm" onClick={copyToken}>
                <Copy size={14} />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewToken(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
