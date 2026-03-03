import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", label: "Projects" },
  { to: "/endpoints", label: "Endpoints" },
  { to: "/jobs", label: "Jobs" },
  { to: "/schedules", label: "Schedules" },
  { to: "/runs", label: "Runs" },
  { to: "/api-keys", label: "API Keys" },
  { to: "/usage", label: "Usage" },
] as const;

export function Layout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <strong className="text-sm font-semibold tracking-wide text-primary">Cronlet Cloud</strong>
            <Badge variant="outline">Control Plane</Badge>
          </div>
          <nav className="ml-auto flex flex-wrap items-center gap-1">
            {navItems.map((item) => {
              const active = pathname === item.to;
              return (
                <Button
                  key={item.to}
                  asChild
                  size="sm"
                  variant={active ? "secondary" : "ghost"}
                  className="font-medium"
                >
                  <Link to={item.to}>{item.label}</Link>
                </Button>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
