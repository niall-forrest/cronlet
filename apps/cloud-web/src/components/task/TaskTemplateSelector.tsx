import { useState } from "react";
import {
  ArrowRight,
  Check,
  ClockCountdown,
  Copy,
  Globe,
  Lightning,
  Package,
  Robot,
  Wrench,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AgentSdkTemplate, TaskTemplate } from "./task-templates";
import {
  AGENT_SDK_TEMPLATES,
  getTemplateRequiredFieldLabels,
  getTemplatesByCategory,
} from "./task-templates";

interface TaskTemplateSelectorProps {
  onSelectTemplate: (template: TaskTemplate) => void;
  onStartFromScratch: () => void;
}

const CATEGORY_CONFIG = [
  {
    id: "popular" as const,
    label: "Popular",
    icon: Lightning,
    description: "Fastest routes to a working automation.",
  },
  {
    id: "monitoring" as const,
    label: "Monitoring",
    icon: ClockCountdown,
    description: "Monitoring-oriented schedules and checks.",
  },
  {
    id: "agent-workflows" as const,
    label: "Agent Workflows",
    icon: Robot,
    description: "Scheduled agent and assistant workflows.",
  },
];

export function TaskTemplateSelector({
  onSelectTemplate,
  onStartFromScratch,
}: TaskTemplateSelectorProps) {
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);

  const handleCopyPrompt = async (template: AgentSdkTemplate) => {
    await navigator.clipboard.writeText(template.prompt);
    setCopiedPromptId(template.id);
    window.setTimeout(() => {
      setCopiedPromptId((current) =>
        current === template.id ? null : current,
      );
    }, 2000);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="meta-label">Templates</p>
          <div>
            <h1 className="display-title">Start from a template</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ready-made automations you can deploy in minutes. Pick one,
              customize it, done.
            </p>
          </div>
        </div>
        <Button variant="ghost" onClick={onStartFromScratch}>
          Or start from scratch
          <ArrowRight size={14} className="ml-2" />
        </Button>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--accent)/0.15)]">
            <Package size={18} className="text-[hsl(var(--accent))]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">
              For Your Product&apos;s Agents
            </h2>
            <p className="text-sm text-muted-foreground">
              Give your AI agents scheduling superpowers. Copy these into your
              codebase.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {AGENT_SDK_TEMPLATES.map((template) => (
            <Card
              key={template.id}
              variant="interactive"
              className="h-full border-[hsl(var(--accent)/0.28)] bg-gradient-to-b from-[hsl(var(--accent)/0.09)] via-card to-card"
            >
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--accent)/0.18)]">
                    <Package size={18} className="text-[hsl(var(--accent))]" />
                  </div>
                  <Badge variant="mcp">SDK</Badge>
                </div>
                <div>
                  <CardTitle className="font-display text-base">
                    {template.name}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {template.description}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="mt-auto space-y-4">
                <div className="flex flex-wrap gap-2">
                  {template.highlights.map((highlight) => (
                    <span
                      key={highlight}
                      className="rounded-full border border-border/40 bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground"
                    >
                      {highlight}
                    </span>
                  ))}
                </div>
                <Button
                  className="w-full"
                  variant={
                    copiedPromptId === template.id ? "outline" : "default"
                  }
                  onClick={() => handleCopyPrompt(template)}
                >
                  {copiedPromptId === template.id ? (
                    <>
                      <Check size={14} className="mr-2" />
                      Prompt Copied
                    </>
                  ) : (
                    <>
                      <Copy size={14} className="mr-2" />
                      Copy Prompt
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <div className="space-y-8">
        {CATEGORY_CONFIG.map((category) => {
          const templates = getTemplatesByCategory(category.id);
          return (
            <section key={category.id} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <category.icon size={18} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{category.label}</h2>
                  <p className="text-sm text-muted-foreground">
                    {category.description}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {templates.map((template) => (
                  <Card
                    key={template.id}
                    variant="interactive"
                    className="h-full bg-gradient-to-b from-card to-card/60"
                  >
                    <CardHeader className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                          {template.handler.type === "tools" ? (
                            <Wrench size={18} className="text-primary" />
                          ) : (
                            <Globe size={18} className="text-primary" />
                          )}
                        </div>
                        <Badge
                          variant={
                            template.handler.type === "tools"
                              ? "tools"
                              : "webhook"
                          }
                        >
                          {template.handler.type.toUpperCase()}
                        </Badge>
                      </div>
                      <div>
                        <CardTitle className="font-display text-base">
                          {template.name}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {template.description}
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="mt-auto space-y-4">
                      <div className="space-y-2">
                        <p className="meta-label">Swap in</p>
                        <div className="flex flex-wrap gap-2">
                          {getTemplateRequiredFieldLabels(template)
                            .slice(0, 3)
                            .map((label) => (
                              <span
                                key={label}
                                className="rounded-full border border-border/40 bg-card/40 px-2.5 py-1 text-[11px] text-muted-foreground"
                              >
                                {label}
                              </span>
                            ))}
                          {template.requiredFields.length > 3 ? (
                            <span className="rounded-full border border-border/40 bg-card/40 px-2.5 py-1 text-[11px] text-muted-foreground">
                              +{template.requiredFields.length - 3} more
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => onSelectTemplate(template)}
                      >
                        Use Template
                        <ArrowRight size={14} className="ml-2" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
