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

const features = [
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: "Natural scheduling",
    desc: "\"Every weekday at 9am\" — no cron syntax needed",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
    title: "Chain tools together",
    desc: "HTTP, Slack, email — build workflows in minutes",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    ),
    title: "Agent-native",
    desc: "MCP tools let AI agents schedule their own tasks",
  },
];

function HeroSection() {
  return (
    <div className="relative flex min-h-[calc(100vh-64px)] flex-col items-center justify-center overflow-hidden px-4">
      {/* Animated background grid */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
        {/* Glowing orbs */}
        <div className="absolute left-1/4 top-1/4 h-96 w-96 animate-pulse rounded-full bg-cyan-500/10 blur-[128px]" />
        <div className="absolute right-1/4 bottom-1/4 h-64 w-64 animate-pulse rounded-full bg-cyan-400/8 blur-[96px]" style={{ animationDelay: "1s" }} />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-4 py-1.5 text-xs font-medium tracking-wide text-cyan-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500"></span>
          </span>
          Now in public beta
        </div>

        {/* Main headline */}
        <h1 className="mb-6 font-display text-5xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-6xl md:text-7xl">
          Scheduled tasks,{" "}
          <span className="bg-gradient-to-r from-cyan-300 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
            hosted
          </span>
        </h1>

        {/* Subheadline */}
        <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-zinc-400">
          Create a task, we run it on schedule. Natural language scheduling,
          built-in tools, and an MCP server for AI agents.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <SignUpButton mode="modal">
            <button className="group relative inline-flex items-center justify-center overflow-hidden rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 px-8 py-3.5 text-sm font-semibold text-white shadow-[0_0_32px_-8px_rgba(34,211,238,0.5)] transition-all duration-300 hover:shadow-[0_0_48px_-8px_rgba(34,211,238,0.7)]">
              <span className="relative z-10">Get started free</span>
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-teal-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </button>
          </SignUpButton>
          <SignInButton mode="modal">
            <button className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/50 px-8 py-3.5 text-sm font-semibold text-zinc-300 backdrop-blur transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-800 hover:text-white">
              Sign in
            </button>
          </SignInButton>
        </div>
      </div>

      {/* Features row */}
      <div className="relative z-10 mt-24 grid w-full max-w-4xl grid-cols-1 gap-6 px-4 sm:grid-cols-3">
        {features.map((f, i) => (
          <div
            key={i}
            className="group rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-5 backdrop-blur transition-all duration-300 hover:border-cyan-500/30 hover:bg-zinc-900/80"
          >
            <div className="mb-3 inline-flex rounded-lg bg-cyan-500/10 p-2.5 text-cyan-400 transition-colors group-hover:bg-cyan-500/15 group-hover:text-cyan-300">
              {f.icon}
            </div>
            <h3 className="mb-1.5 text-sm font-semibold text-white">{f.title}</h3>
            <p className="text-xs leading-relaxed text-zinc-500">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Bottom fade */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}

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
            <strong className="font-display text-lg font-bold tracking-tight text-primary">Cronlet</strong>
          </Link>
          <SignedOut>
            <div className="ml-auto flex items-center gap-2">
              <SignInButton mode="modal">
                <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-white">
                  Sign in
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button size="sm" className="bg-cyan-500 text-white hover:bg-cyan-400">
                  Get started
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
      <SignedOut>
        <HeroSection />
      </SignedOut>
      <SignedIn>
        <main className="mx-auto w-full max-w-7xl px-4 py-6">
          <Outlet />
        </main>
      </SignedIn>
    </div>
  );
}
