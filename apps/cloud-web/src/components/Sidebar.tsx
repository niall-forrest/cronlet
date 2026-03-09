import { Link, useRouterState } from "@tanstack/react-router";
import {
  House,
  ListChecks,
  ClockCounterClockwise,
  HeadCircuit,
  BookOpenText,
  ArrowSquareOut,
  Gear,
  SquaresFour,
  List,
  X,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  external?: boolean;
  exact?: boolean;
  matchPrefixes?: string[];
  excludePrefixes?: string[];
}

const mainNavItems: NavItem[] = [
  { to: "/", label: "Overview", icon: House, exact: true },
  {
    to: "/tasks",
    label: "Tasks",
    icon: ListChecks,
    matchPrefixes: ["/tasks"],
    excludePrefixes: ["/tasks/create/templates"],
  },
  {
    to: "/tasks/create/templates",
    label: "Templates",
    icon: SquaresFour,
    matchPrefixes: ["/tasks/create/templates"],
  },
  { to: "/runs", label: "Runs", icon: ClockCounterClockwise },
  { to: "/agent-connect", label: "Agent Connect", icon: HeadCircuit },
];

const bottomNavItems: NavItem[] = [
  {
    to: "https://docs.cronlet.dev",
    label: "Docs",
    icon: BookOpenText,
    external: true,
  },
  { to: "/settings", label: "Settings", icon: Gear },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const isActive = (item: NavItem) => {
    if (item.excludePrefixes?.some((prefix) => pathname.startsWith(prefix))) {
      return false;
    }

    if (item.matchPrefixes?.length) {
      return item.matchPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    }

    const { to, exact } = item;
    if (exact) return pathname === to;
    return pathname === to || pathname.startsWith(`${to}/`);
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-border/50 bg-background transition-transform duration-200 ease-out lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-border/50 px-5">
          <Link
            to="/"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <div className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-foreground">
              cronlet
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onClose}
          >
            <X size={20} />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {/* Main nav items */}
          <div className="space-y-1">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <Icon
                    size={20}
                    weight={active ? "fill" : "regular"}
                    className={cn(
                      "shrink-0 transition-colors",
                      active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  <span>{item.label}</span>
                  {active && (
                    <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.5)]" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Bottom nav items */}
          <div className="border-t border-border/30 pt-3">
            {bottomNavItems.map((item) => {
              const Icon = item.icon;
              const active = item.external ? false : isActive(item);
              const itemClasses = cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              );

              if (item.external) {
                return (
                  <a
                    key={item.to}
                    href={item.to}
                    target="_blank"
                    rel="noreferrer"
                    onClick={onClose}
                    className={itemClasses}
                  >
                    <Icon
                      size={20}
                      weight="regular"
                      className="shrink-0 transition-colors text-muted-foreground group-hover:text-foreground"
                    />
                    <span>{item.label}</span>
                    <ArrowSquareOut
                      size={14}
                      className="ml-auto text-muted-foreground/80 transition-colors group-hover:text-foreground"
                    />
                  </a>
                );
              }

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={itemClasses}
                >
                  <Icon
                    size={20}
                    weight={active ? "fill" : "regular"}
                    className={cn(
                      "shrink-0 transition-colors",
                      active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="lg:hidden"
      onClick={onClick}
    >
      <List size={20} />
    </Button>
  );
}
