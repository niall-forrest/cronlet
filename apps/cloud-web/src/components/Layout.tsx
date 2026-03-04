import {
  OrganizationSwitcher,
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/clerk-react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Simplified navigation - Task-centric model
interface NavItem {
  to: string;
  label: string;
  exact?: boolean;
}

const navItems: NavItem[] = [
  { to: "/", label: "Overview", exact: true },
  { to: "/tasks", label: "Tasks" },
  { to: "/runs", label: "Runs" },
  { to: "/projects", label: "Projects" },
  { to: "/settings", label: "Settings" },
];

export function Layout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const isActive = (to: string, exact?: boolean) => {
    if (exact) return pathname === to;
    return pathname === to || pathname.startsWith(`${to}/`);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <strong className="text-sm font-semibold tracking-wide text-primary">Cronlet</strong>
          </Link>
          <SignedOut>
            <div className="ml-auto flex items-center gap-2">
              <SignInButton mode="modal">
                <Button size="sm" variant="secondary">
                  Sign in
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button size="sm" variant="outline">
                  Sign up
                </Button>
              </SignUpButton>
            </div>
          </SignedOut>
          <SignedIn>
            <nav className="ml-4 flex flex-wrap items-center gap-1">
              {navItems.map((item) => (
                <Button
                  key={item.to}
                  asChild
                  size="sm"
                  variant={isActive(item.to, item.exact) ? "secondary" : "ghost"}
                  className={cn(
                    "font-medium",
                    isActive(item.to, item.exact) && "bg-secondary"
                  )}
                >
                  <Link to={item.to}>{item.label}</Link>
                </Button>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <OrganizationSwitcher />
              <UserButton />
            </div>
          </SignedIn>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6">
        <SignedOut>
          <Card className="mx-auto mt-16 w-full max-w-xl border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="display-title">Sign In To Continue</CardTitle>
              <CardDescription>
                Login to your account to continue.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <SignInButton mode="modal">
                <Button>Sign in</Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button variant="outline">Create account</Button>
              </SignUpButton>
            </CardContent>
          </Card>
        </SignedOut>
        <SignedIn>
          <Outlet />
        </SignedIn>
      </main>
    </div>
  );
}
