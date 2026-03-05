import { useState } from "react";
import {
  OrganizationSwitcher,
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/clerk-react";
import { MagnifyingGlass, Command } from "@phosphor-icons/react";
import { Link, Outlet } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sidebar, MobileMenuButton } from "@/components/Sidebar";
import { CommandPalette } from "@/components/CommandPalette";

const features = [
  {
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    title: "Natural scheduling",
    desc: '"Every weekday at 9am" - no cron syntax needed',
  },
  {
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z"
        />
      </svg>
    ),
    title: "Chain tools together",
    desc: "HTTP, Slack, email - build workflows in minutes",
  },
  {
    icon: (
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
        />
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
        <div className="absolute left-1/4 top-1/4 h-96 w-96 animate-pulse rounded-full bg-primary/10 blur-[128px]" />
        <div
          className="absolute bottom-1/4 right-1/4 h-64 w-64 animate-pulse rounded-full bg-primary/8 blur-[96px]"
          style={{ animationDelay: "1s" }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium tracking-wide text-primary">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
          </span>
          Now in public beta
        </div>

        {/* Main headline */}
        <h1 className="mb-6 font-display text-5xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-6xl md:text-7xl">
          Scheduled tasks,{" "}
          <span className="bg-gradient-to-r from-primary via-emerald-400 to-teal-400 bg-clip-text text-transparent">
            hosted
          </span>
        </h1>

        {/* Subheadline */}
        <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Create a task, we run it on schedule. Natural language scheduling,
          built-in tools, and an MCP server for AI agents.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <SignUpButton mode="modal">
            <button className="group relative inline-flex items-center justify-center overflow-hidden rounded-xl bg-primary px-8 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_0_32px_-8px_hsl(var(--primary)/0.5)] transition-all duration-300 hover:shadow-[0_0_48px_-8px_hsl(var(--primary)/0.7)]">
              <span className="relative z-10">Get started free</span>
            </button>
          </SignUpButton>
          <SignInButton mode="modal">
            <button className="inline-flex items-center justify-center rounded-xl border border-border bg-secondary/50 px-8 py-3.5 text-sm font-semibold text-foreground backdrop-blur transition-all duration-200 hover:border-border/80 hover:bg-secondary">
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
            className="group rounded-2xl border border-border/50 bg-card/50 p-5 backdrop-blur transition-all duration-300 hover:border-primary/30 hover:bg-card"
          >
            <div className="mb-3 inline-flex rounded-xl bg-primary/10 p-2.5 text-primary transition-colors group-hover:bg-primary/15">
              {f.icon}
            </div>
            <h3 className="mb-1.5 text-sm font-semibold text-foreground">
              {f.title}
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {f.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Bottom fade */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <SignedOut>
        {/* Signed out: Simple header + Hero */}
        <header className="sticky top-0 z-20 border-b border-border/50 bg-background/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3">
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
            <div className="ml-auto flex items-center gap-2">
              <SignInButton mode="modal">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                >
                  Sign in
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button size="sm">Get started</Button>
              </SignUpButton>
            </div>
          </div>
        </header>
        <HeroSection />
      </SignedOut>

      <SignedIn>
        {/* Signed in: Sidebar layout */}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <CommandPalette />

        {/* Main content area */}
        <div className="lg:pl-64">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/50 bg-background/95 px-4 backdrop-blur lg:px-6">
            <MobileMenuButton onClick={() => setSidebarOpen(true)} />

            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => document.dispatchEvent(new CustomEvent("openCommandPalette"))}
                className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <MagnifyingGlass size={16} />
                <span>Search...</span>
                <kbd className="ml-1 inline-flex items-center gap-0.5 rounded border border-border/50 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium">
                  <Command size={10} />K
                </kbd>
              </button>
              <OrganizationSwitcher
                appearance={{
                  elements: {
                    rootBox: "flex items-center",
                    organizationSwitcherTrigger:
                      "rounded-lg border border-border/50 bg-secondary/50 px-3 py-1.5 text-sm hover:bg-secondary outline-none focus:outline-none focus:ring-0",
                    organizationSwitcherTriggerIcon: "text-muted-foreground",
                  },
                }}
              />
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8",
                  },
                }}
              />
            </div>
          </header>

          {/* Page content */}
          <main className="p-4 lg:p-6">
            <div className="mx-auto max-w-6xl">
              <Outlet />
            </div>
          </main>
        </div>
      </SignedIn>
    </div>
  );
}
