import { useState } from "react";
import {
  OrganizationSwitcher,
  SignedIn,
  SignedOut,
  SignIn,
  UserButton,
} from "@clerk/clerk-react";
import { MagnifyingGlass, Command } from "@phosphor-icons/react";
import { Outlet } from "@tanstack/react-router";
import { Sidebar, MobileMenuButton } from "@/components/Sidebar";
import { CommandPalette } from "@/components/CommandPalette";

function AuthScreen() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      {/* Animated background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
        <div className="absolute left-1/4 top-1/4 h-96 w-96 animate-pulse rounded-full bg-primary/10 blur-[128px]" />
        <div
          className="absolute bottom-1/4 right-1/4 h-64 w-64 animate-pulse rounded-full bg-primary/8 blur-[96px]"
          style={{ animationDelay: "1s" }}
        />
      </div>

      {/* Logo */}
      <div className="relative z-10 mb-8 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <div className="h-3 w-3 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.5)]" />
        </div>
        <span className="font-display text-2xl font-bold tracking-tight text-foreground">
          cronlet
        </span>
      </div>

      {/* Sign In Component */}
      <div className="relative z-10">
        <SignIn
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "bg-card border border-border/50 shadow-2xl rounded-2xl",
              headerTitle: "text-foreground",
              headerSubtitle: "text-muted-foreground",
              socialButtonsBlockButton: "border-border/50 hover:bg-secondary",
              formFieldLabel: "text-foreground",
              formFieldInput: "bg-secondary/50 border-border/50",
              footerActionLink: "text-primary hover:text-primary/80",
              dividerLine: "bg-border/50",
              dividerText: "text-muted-foreground",
            },
          }}
          routing="hash"
        />
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
        <AuthScreen />
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
