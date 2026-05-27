import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ElementType, ReactNode } from "react";
import {
  ArrowsClockwise,
  Calendar,
  BookOpenText,
  ClockCounterClockwise,
  GlobeHemisphereWest,
  HeadCircuit,
  House,
  List,
  ListChecks,
  Robot,
  Pulse,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { getUsage } from "@/lib/api";
import { formatPlanTier } from "@/lib/format";
import { Button } from "@/components/ui/button";

interface NavItem {
  to: string;
  label: string;
  icon: ElementType;
  exact?: boolean;
  matchPrefixes?: string[];
  external?: boolean;
}

const manageNav: NavItem[] = [
  { to: "/", label: "Overview", icon: House, exact: true },
  { to: "/upcoming", label: "Upcoming", icon: Calendar, matchPrefixes: ["/upcoming"] },
  { to: "/tasks", label: "Tasks", icon: ListChecks, matchPrefixes: ["/tasks"] },
  { to: "/runs", label: "Runs", icon: ClockCounterClockwise, matchPrefixes: ["/runs"] },
  { to: "/destinations", label: "Destinations", icon: Pulse, matchPrefixes: ["/destinations"] },
  { to: "/agent-activity", label: "Agent Activity", icon: Robot, matchPrefixes: ["/agent-activity"] },
  { to: "/reconciliation", label: "Reconciliation", icon: ArrowsClockwise, matchPrefixes: ["/reconciliation"] },
  { to: "/security", label: "Security", icon: ShieldCheck, matchPrefixes: ["/security", "/settings"] },
  { to: "/usage", label: "Usage", icon: GlobeHemisphereWest, matchPrefixes: ["/usage", "/billing", "/alerts"] },
];

const utilityNav: NavItem[] = [
  { to: "/agent-connect", label: "Agent Connect", icon: HeadCircuit, matchPrefixes: ["/agent-connect"] },
  { to: "https://docs.cronlet.dev", label: "Docs", icon: BookOpenText, external: true },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const usageQuery = useQuery({
    queryKey: ["usage", "sidebar"],
    queryFn: getUsage,
    refetchInterval: 8000,
  });

  const isActive = (item: NavItem) => {
    if (item.matchPrefixes?.length) {
      return item.matchPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    }
    if (item.exact) return pathname === item.to;
    return pathname === item.to || pathname.startsWith(`${item.to}/`);
  };

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = item.external ? false : isActive(item);
    const classes = cn(
      "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-150",
      active
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
    );

    if (item.external) {
      return (
        <a key={item.to} href={item.to} target="_blank" rel="noreferrer" onClick={onClose} className={classes}>
          <Icon size={18} className="shrink-0" />
          <span>{item.label}</span>
        </a>
      );
    }

    return (
      <Link key={item.to} to={item.to} onClick={onClose} className={classes}>
        <Icon size={18} weight={active ? "fill" : "regular"} className="shrink-0" />
        <span>{item.label}</span>
        {active ? <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" /> : null}
      </Link>
    );
  };

  return (
    <>
      {isOpen ? (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={onClose} />
      ) : null}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-72 flex-col border-r border-border/50 bg-background transition-transform duration-200 ease-out lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border/50 px-5">
          <div className="min-w-0">
            <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <div className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
              </div>
              <span className="font-display text-lg font-semibold tracking-tight text-foreground">cronlet</span>
            </Link>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
          <NavSection label="Manage">{manageNav.map(renderNavItem)}</NavSection>
          <div className="mt-auto space-y-4 border-t border-border/30 pt-4">
            <NavSection label="Utilities">{utilityNav.map(renderNavItem)}</NavSection>
            <SidebarUsage usageQuery={usageQuery} />
          </div>
        </nav>
      </aside>
    </>
  );
}

function SidebarUsage({
  usageQuery,
}: {
  usageQuery: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getUsage>>>>;
}) {
  if (usageQuery.isError || !usageQuery.data) {
    return null;
  }

  const usage = usageQuery.data;
  const usagePercent = usage.runLimit > 0 ? Math.min(100, Math.round((usage.runAttempts / usage.runLimit) * 100)) : 0;
  const graceLabel = usage.graceEndsAt
    ? `Grace until ${new Date(usage.graceEndsAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })}`
    : `${usage.retentionDays} day retention`;

  return (
    <Link
      to="/usage"
      onClick={() => usageQuery.refetch()}
      className="block rounded-lg border border-border/50 bg-card/50 px-3 py-2.5 transition-colors hover:border-border/70 hover:bg-card/70"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-[0.04em] text-muted-foreground">Usage</p>
          <p className="truncate text-sm font-medium text-foreground">{formatPlanTier(usage.tier)}</p>
        </div>
        <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {usage.runAttempts.toLocaleString()} / {usage.runLimit.toLocaleString()}
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/70">
        <div className="h-full rounded-full bg-primary/85" style={{ width: `${usagePercent}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{graceLabel}</p>
    </Link>
  );
}

function NavSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="px-3 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClick}>
      <List size={20} />
    </Button>
  );
}
