import { useState } from "react";
import type { ToolsHandlerConfig } from "@cronlet/cloud-shared";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listSecrets, createSecret } from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CaretDown, Plus, Trash, DotsSixVertical, Key } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface ToolStep {
  tool: string;
  args: Record<string, unknown>;
  outputKey?: string;
}

// Tool definitions with their argument schemas
const TOOLS = [
  {
    name: "http.get",
    label: "HTTP GET",
    description: "Make a GET request",
    args: [
      { name: "url", type: "string", required: true, placeholder: "https://api.example.com/data" },
      { name: "headers", type: "json", required: false, placeholder: '{"Authorization": "Bearer ..."}' },
    ],
  },
  {
    name: "http.post",
    label: "HTTP POST",
    description: "Make a POST request",
    args: [
      { name: "url", type: "string", required: true, placeholder: "https://api.example.com/data" },
      { name: "body", type: "json", required: false, placeholder: '{"key": "value"}' },
      { name: "headers", type: "json", required: false, placeholder: '{"Content-Type": "application/json"}' },
    ],
  },
  {
    name: "slack.post",
    label: "Slack Message",
    description: "Post to Slack channel",
    args: [
      { name: "channel", type: "string", required: true, placeholder: "#general" },
      { name: "text", type: "string", required: true, placeholder: "Hello from Cronlet!" },
      { name: "secretName", type: "string", required: false, placeholder: "SLACK_TOKEN" },
    ],
  },
  {
    name: "email.send",
    label: "Send Email",
    description: "Send an email via Resend",
    args: [
      { name: "to", type: "string", required: true, placeholder: "user@example.com" },
      { name: "subject", type: "string", required: true, placeholder: "Subject line" },
      { name: "text", type: "string", required: false, placeholder: "Plain text body" },
      { name: "html", type: "string", required: false, placeholder: "<p>HTML body</p>" },
      { name: "from", type: "string", required: false, placeholder: "noreply@yourdomain.com" },
      { name: "secretName", type: "string", required: false, placeholder: "RESEND_API_KEY" },
    ],
  },
  {
    name: "log",
    label: "Log",
    description: "Log a message",
    args: [
      { name: "message", type: "string", required: true, placeholder: "Processing complete" },
      { name: "level", type: "select", required: false, options: ["info", "warn", "error"] },
    ],
  },
  {
    name: "sleep",
    label: "Wait",
    description: "Pause execution",
    args: [
      { name: "seconds", type: "number", required: true, placeholder: "5" },
    ],
  },
] as const;

// Secret selector with dropdown and create new functionality
interface SecretSelectorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function SecretSelector({ value, onChange, placeholder }: SecretSelectorProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newSecretName, setNewSecretName] = useState("");
  const [newSecretValue, setNewSecretValue] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: secrets = [], isLoading } = useQuery({
    queryKey: ["secrets"],
    queryFn: listSecrets,
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; value: string }) => createSecret(input),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["secrets"] });
      onChange(created.name);
      setShowCreateDialog(false);
      setNewSecretName("");
      setNewSecretValue("");
      setCreateError(null);
    },
    onError: (err) => {
      setCreateError(err instanceof Error ? err.message : "Failed to create secret");
    },
  });

  const handleCreate = () => {
    if (!newSecretName.trim()) {
      setCreateError("Secret name is required");
      return;
    }
    if (!newSecretValue.trim()) {
      setCreateError("Secret value is required");
      return;
    }
    createMutation.mutate({ name: newSecretName.trim(), value: newSecretValue.trim() });
  };

  return (
    <>
      <Select
        value={value || "_none_"}
        onValueChange={(val) => {
          if (val === "_create_new_") {
            setShowCreateDialog(true);
          } else if (val === "_none_") {
            onChange("");
          } else {
            onChange(val);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={isLoading ? "Loading..." : placeholder}>
            {value ? (
              <span className="flex items-center gap-2">
                <Key size={14} className="text-primary" />
                {value}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder || "Select a secret..."}</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_none_">
            <span className="text-muted-foreground">None</span>
          </SelectItem>
          {secrets.length > 0 && (
            <>
              {secrets.map((secret) => (
                <SelectItem key={secret.name} value={secret.name}>
                  <span className="flex items-center gap-2">
                    <Key size={14} className="text-primary" />
                    {secret.name}
                  </span>
                </SelectItem>
              ))}
            </>
          )}
          <SelectItem value="_create_new_" className="border-t border-border/50 mt-1 pt-1">
            <span className="flex items-center gap-2 text-primary">
              <Plus size={14} />
              Create new secret...
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Create Secret</DialogTitle>
            <DialogDescription>
              Secrets are stored securely and can be used across multiple tasks.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">Name</Label>
              <Input
                value={newSecretName}
                onChange={(e) => {
                  setNewSecretName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"));
                  setCreateError(null);
                }}
                placeholder="RESEND_API_KEY"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Use SCREAMING_SNAKE_CASE (e.g., SLACK_TOKEN, RESEND_API_KEY)
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Value</Label>
              <Input
                type="password"
                value={newSecretValue}
                onChange={(e) => {
                  setNewSecretValue(e.target.value);
                  setCreateError(null);
                }}
                placeholder="re_xxxxxxxxxxxxx"
              />
            </div>

            {createError && (
              <p className="text-xs text-destructive">{createError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Secret"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ToolStepBuilderProps {
  value: ToolsHandlerConfig;
  onChange: (config: ToolsHandlerConfig) => void;
}

export function ToolStepBuilder({ value, onChange }: ToolStepBuilderProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(
    value.steps.length > 0 ? 0 : null
  );

  const updateStep = (index: number, updates: Partial<ToolStep>) => {
    const newSteps = [...value.steps];
    newSteps[index] = { ...newSteps[index], ...updates };
    onChange({ type: "tools", steps: newSteps });
  };

  const addStep = () => {
    const newSteps = [
      ...value.steps,
      { tool: "http.get", args: { url: "" } },
    ];
    onChange({ type: "tools", steps: newSteps });
    setExpandedStep(newSteps.length - 1);
  };

  const removeStep = (index: number) => {
    const newSteps = value.steps.filter((_, i) => i !== index);
    onChange({ type: "tools", steps: newSteps });
    if (expandedStep === index) {
      setExpandedStep(newSteps.length > 0 ? Math.min(index, newSteps.length - 1) : null);
    }
  };

  const moveStep = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= value.steps.length) return;

    const newSteps = [...value.steps];
    [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
    onChange({ type: "tools", steps: newSteps });
    setExpandedStep(newIndex);
  };

  return (
    <div className="space-y-3">
      {value.steps.map((step, index) => {
        const toolDef = TOOLS.find((t) => t.name === step.tool);

        return (
          <Collapsible
            key={index}
            open={expandedStep === index}
            onOpenChange={(open) => setExpandedStep(open ? index : null)}
          >
            <div
              className={cn(
                "rounded-lg border transition-all",
                expandedStep === index
                  ? "border-primary/30 bg-card shadow-sm"
                  : "border-border/50 bg-card/50 hover:border-border"
              )}
            >
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-2 p-3 cursor-pointer">
                  <DotsSixVertical
                    size={16}
                    className="text-muted-foreground/50 shrink-0"
                  />
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs font-medium text-primary">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {toolDef?.label ?? step.tool}
                    </p>
                    {step.outputKey && (
                      <p className="text-xs text-muted-foreground">
                        → {step.outputKey}
                      </p>
                    )}
                  </div>
                  <CaretDown
                    size={14}
                    className={cn(
                      "text-muted-foreground transition-transform",
                      expandedStep === index && "rotate-180"
                    )}
                  />
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t border-border/50 p-4 space-y-4">
                  {/* Tool Selection */}
                  <div className="space-y-2">
                    <Label className="text-xs">Tool</Label>
                    <Select
                      value={step.tool}
                      onValueChange={(tool) => {
                        const newToolDef = TOOLS.find((t) => t.name === tool);
                        const defaultArgs: Record<string, unknown> = {};
                        newToolDef?.args.forEach((arg) => {
                          if (arg.required) {
                            defaultArgs[arg.name] = "";
                          }
                        });
                        updateStep(index, { tool, args: defaultArgs });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TOOLS.map((tool) => (
                          <SelectItem key={tool.name} value={tool.name}>
                            <div>
                              <span className="font-medium">{tool.label}</span>
                              <span className="ml-2 text-muted-foreground text-xs">
                                {tool.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Tool Arguments */}
                  {toolDef?.args.map((argDef) => (
                    <div key={argDef.name} className="space-y-2">
                      <Label className="text-xs capitalize">
                        {argDef.name.replace(/([A-Z])/g, " $1")}
                        {argDef.required && (
                          <span className="text-destructive ml-1">*</span>
                        )}
                      </Label>
                      {argDef.name === "secretName" ? (
                        <SecretSelector
                          value={String(step.args[argDef.name] ?? "")}
                          onChange={(val) =>
                            updateStep(index, {
                              args: { ...step.args, [argDef.name]: val || undefined },
                            })
                          }
                          placeholder={argDef.placeholder}
                        />
                      ) : argDef.type === "json" ? (
                        <Textarea
                          value={
                            typeof step.args[argDef.name] === "object"
                              ? JSON.stringify(step.args[argDef.name], null, 2)
                              : String(step.args[argDef.name] ?? "")
                          }
                          onChange={(e) => {
                            let val: unknown = e.target.value;
                            try {
                              val = JSON.parse(e.target.value);
                            } catch {
                              // Keep as string if not valid JSON
                            }
                            updateStep(index, {
                              args: { ...step.args, [argDef.name]: val },
                            });
                          }}
                          placeholder={argDef.placeholder}
                          className="font-mono text-sm min-h-[80px]"
                        />
                      ) : argDef.type === "select" ? (
                        <Select
                          value={String(step.args[argDef.name] ?? argDef.options?.[0] ?? "")}
                          onValueChange={(val) =>
                            updateStep(index, {
                              args: { ...step.args, [argDef.name]: val },
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {argDef.options?.map((opt) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : argDef.type === "number" ? (
                        <Input
                          type="number"
                          value={String(step.args[argDef.name] ?? "")}
                          onChange={(e) =>
                            updateStep(index, {
                              args: {
                                ...step.args,
                                [argDef.name]: e.target.value ? Number(e.target.value) : "",
                              },
                            })
                          }
                          placeholder={argDef.placeholder}
                        />
                      ) : (
                        <Input
                          value={String(step.args[argDef.name] ?? "")}
                          onChange={(e) =>
                            updateStep(index, {
                              args: { ...step.args, [argDef.name]: e.target.value },
                            })
                          }
                          placeholder={argDef.placeholder}
                        />
                      )}
                      {argDef.name === "text" && index > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Use {"{{stepName.body}}"} to reference previous outputs
                        </p>
                      )}
                    </div>
                  ))}

                  {/* Output Key */}
                  <div className="space-y-2">
                    <Label className="text-xs">
                      Save result as{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      value={step.outputKey ?? ""}
                      onChange={(e) =>
                        updateStep(index, {
                          outputKey: e.target.value || undefined,
                        })
                      }
                      placeholder="response"
                      className="w-40"
                    />
                  </div>

                  {/* Step Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/30">
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={index === 0}
                        onClick={() => moveStep(index, "up")}
                      >
                        ↑ Up
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={index === value.steps.length - 1}
                        onClick={() => moveStep(index, "down")}
                      >
                        ↓ Down
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeStep(index)}
                    >
                      <Trash size={14} className="mr-1" />
                      Remove
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}

      {/* Add Step Button */}
      <Button
        type="button"
        variant="outline"
        className="w-full border-dashed"
        onClick={addStep}
      >
        <Plus size={16} className="mr-2" />
        Add step
      </Button>

      {value.steps.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Add at least one step to define what this task should do
        </p>
      )}
    </div>
  );
}
