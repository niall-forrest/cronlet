import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { AuditEventRecord } from "@cronlet/cloud-shared";
import {
  Lightning,
  CheckCircle,
  XCircle,
  Plus,
  Trash,
  PencilSimple,
  Key,
  Lock,
  Play,
  Clock,
  ArrowRight,
  User,
  Robot,
  Globe,
} from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/Skeleton";
import { SectionHeader } from "@/components/ui/section-header";
import { listAuditEvents, listTasks } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ActivityItem {
  id: string;
  type: "task" | "run" | "secret" | "api_key" | "alert";
  action: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  time: string;
  actor: {
    type: string;
    name?: string;
  };
  metadata?: Record<string, unknown>;
}

function parseActivityItems(events: AuditEventRecord[], taskNames: Map<string, string>): ActivityItem[] {
  return events.map((event) => {
    const parts = event.action.split(".");
    const entityType = parts[0] as "task" | "run" | "secret" | "api_key" | "alert";
    const actionVerb = parts[parts.length - 1];

    let icon: React.ReactNode = <Lightning size={16} weight="fill" />;
    let iconBg = "bg-primary/10 text-primary";
    let title = event.action;
    let description = "";

    switch (entityType) {
      case "task":
        switch (actionVerb) {
          case "created":
            icon = <Plus size={16} weight="bold" />;
            iconBg = "bg-emerald-500/10 text-emerald-400";
            title = "Task created";
            description = taskNames.get(event.targetId) ?? event.targetId;
            break;
          case "updated":
            icon = <PencilSimple size={16} weight="fill" />;
            iconBg = "bg-primary/10 text-primary";
            title = "Task updated";
            description = taskNames.get(event.targetId) ?? event.targetId;
            break;
          case "deleted":
            icon = <Trash size={16} weight="fill" />;
            iconBg = "bg-red-500/10 text-red-400";
            title = "Task deleted";
            description = event.targetId;
            break;
          case "triggered":
            icon = <Play size={16} weight="fill" />;
            iconBg = "bg-amber-500/10 text-amber-400";
            title = "Task triggered";
            description = taskNames.get(event.targetId) ?? event.targetId;
            break;
        }
        break;
      case "run":
        switch (actionVerb) {
          case "completed":
            icon = <CheckCircle size={16} weight="fill" />;
            iconBg = "bg-emerald-500/10 text-emerald-400";
            title = "Run completed";
            description = `Run ${event.targetId.slice(0, 8)}`;
            break;
          case "failed":
            icon = <XCircle size={16} weight="fill" />;
            iconBg = "bg-red-500/10 text-red-400";
            title = "Run failed";
            description = `Run ${event.targetId.slice(0, 8)}`;
            break;
          case "started":
            icon = <Clock size={16} />;
            iconBg = "bg-amber-500/10 text-amber-400";
            title = "Run started";
            description = `Run ${event.targetId.slice(0, 8)}`;
            break;
        }
        break;
      case "secret":
        switch (actionVerb) {
          case "created":
            icon = <Lock size={16} weight="fill" />;
            iconBg = "bg-primary/10 text-primary";
            title = "Secret created";
            description = event.targetId;
            break;
          case "deleted":
            icon = <Lock size={16} weight="fill" />;
            iconBg = "bg-red-500/10 text-red-400";
            title = "Secret deleted";
            description = event.targetId;
            break;
        }
        break;
      case "api_key":
        switch (actionVerb) {
          case "created":
            icon = <Key size={16} weight="fill" />;
            iconBg = "bg-[hsl(var(--accent)/0.15)] text-[hsl(var(--accent))]";
            title = "API key created";
            description = event.targetId.slice(0, 8);
            break;
          case "rotated":
            icon = <Key size={16} weight="fill" />;
            iconBg = "bg-amber-500/10 text-amber-400";
            title = "API key rotated";
            description = event.targetId.slice(0, 8);
            break;
          case "revoked":
            icon = <Key size={16} weight="fill" />;
            iconBg = "bg-red-500/10 text-red-400";
            title = "API key revoked";
            description = event.targetId.slice(0, 8);
            break;
        }
        break;
    }

    return {
      id: event.id,
      type: entityType,
      action: event.action,
      title,
      description,
      icon,
      iconBg,
      time: event.createdAt,
      actor: {
        type: event.actorType,
        name: event.actorId,
      },
      metadata: event.metadata ?? undefined,
    };
  });
}

function formatTimeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

function ActorBadge({ type }: { type: string }) {
  const config: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
    user: {
      icon: <User size={10} weight="fill" />,
      label: "User",
      className: "bg-primary/10 text-primary",
    },
    api_key: {
      icon: <Key size={10} weight="fill" />,
      label: "API",
      className: "bg-[hsl(var(--accent)/0.15)] text-[hsl(var(--accent))]",
    },
    agent: {
      icon: <Robot size={10} weight="fill" />,
      label: "Agent",
      className: "bg-[hsl(var(--accent)/0.15)] text-[hsl(var(--accent))]",
    },
    internal: {
      icon: <Clock size={10} />,
      label: "System",
      className: "bg-muted text-muted-foreground",
    },
    webhook: {
      icon: <Globe size={10} weight="fill" />,
      label: "Webhook",
      className: "bg-amber-500/10 text-amber-400",
    },
  };

  const { icon, label, className } = config[type] ?? config.internal;

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", className)}>
      {icon}
      {label}
    </span>
  );
}

export function ActivityPage() {
  const { data: events = [], isLoading: loadingEvents } = useQuery({
    queryKey: ["auditEvents", "activity"],
    queryFn: () => listAuditEvents({ limit: 50 }),
    refetchInterval: 5000,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => listTasks(),
  });

  const taskNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      map.set(task.id, task.name);
    }
    return map;
  }, [tasks]);

  const activities = useMemo(
    () => parseActivityItems(events, taskNames),
    [events, taskNames]
  );

  // Group activities by day
  const groupedActivities = useMemo(() => {
    const groups: { label: string; items: ActivityItem[] }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let currentGroup: { label: string; items: ActivityItem[] } | null = null;

    for (const activity of activities) {
      const activityDate = new Date(activity.time);
      activityDate.setHours(0, 0, 0, 0);

      let label: string;
      if (activityDate.getTime() === today.getTime()) {
        label = "Today";
      } else if (activityDate.getTime() === yesterday.getTime()) {
        label = "Yesterday";
      } else {
        label = activityDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
      }

      if (!currentGroup || currentGroup.label !== label) {
        currentGroup = { label, items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(activity);
    }

    return groups;
  }, [activities]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display-title">Activity</h1>
          <p className="text-muted-foreground mt-1">
            Real-time events from your organization
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/audit-events">
            View full audit log
            <ArrowRight size={14} className="ml-2" />
          </Link>
        </Button>
      </div>

      {/* Activity Feed */}
      {loadingEvents ? (
        <div className="space-y-6">
          <SectionHeader label="Today" />
          <Card variant="flat">
            <CardContent className="p-0 divide-y divide-border/30">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-start gap-4 p-4">
                  <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : activities.length === 0 ? (
        <Card variant="flat" className="border-dashed border-border/30">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Lightning size={28} weight="duotone" className="text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No activity yet</h3>
            <p className="text-muted-foreground text-center mb-6 max-w-md text-sm">
              Activity will appear here as you create tasks, run jobs, and manage your organization.
            </p>
            <Button asChild>
              <Link to="/tasks/create">
                <Plus size={14} weight="bold" className="mr-2" />
                Create your first task
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedActivities.map((group) => (
            <section key={group.label} className="space-y-4">
              <SectionHeader label={group.label} />
              <Card variant="flat">
                <CardContent className="p-0 divide-y divide-border/30">
                  {group.items.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl shrink-0", activity.iconBg)}>
                        {activity.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-foreground">{activity.title}</span>
                          <ActorBadge type={activity.actor.type} />
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {activity.description}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatTimeAgo(activity.time)}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
