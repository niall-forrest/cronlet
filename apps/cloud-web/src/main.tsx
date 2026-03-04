import React from "react";
import ReactDOM from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkAuthBridge } from "./components/ClerkAuthBridge";
import { Layout } from "./components/Layout";
import { OverviewPage } from "./routes/OverviewPage";
import { TasksPage } from "./routes/TasksPage";
import { CreateTaskPage } from "./routes/CreateTaskPage";
import { RunsPage } from "./routes/RunsPage";
import { ProjectsPage } from "./routes/ProjectsPage";
import { SettingsPage } from "./routes/SettingsPage";
import { AlertsPage } from "./routes/AlertsPage";
import { AuditEventsPage } from "./routes/AuditEventsPage";
import { UsagePage } from "./routes/UsagePage";
import { BillingPage } from "./routes/BillingPage";
import "./index.css";

const rootRoute = createRootRoute({
  component: Layout,
});

// Overview is the landing page
const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: OverviewPage,
});

// Tasks - the primary entity
const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks",
  component: TasksPage,
});

// Create task wizard
const createTaskRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks/create",
  component: CreateTaskPage,
});

// Runs - execution history
const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs",
  component: RunsPage,
});

// Projects - organization container
const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects",
  component: ProjectsPage,
});

// Settings - secrets, API keys
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

// Alerts
const alertsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/alerts",
  component: AlertsPage,
});

// Audit events
const auditEventsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/audit-events",
  component: AuditEventsPage,
});

// Usage
const usageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/usage",
  component: UsagePage,
});

// Billing
const billingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/billing",
  component: BillingPage,
});

const routeTree = rootRoute.addChildren([
  overviewRoute,
  tasksRoute,
  createTaskRoute,
  runsRoute,
  projectsRoute,
  settingsRoute,
  alertsRoute,
  auditEventsRoute,
  usageRoute,
  billingRoute,
]);

const router = createRouter({ routeTree });

const queryClient = new QueryClient();
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Clerk publishable key. Set VITE_CLERK_PUBLISHABLE_KEY in apps/cloud-web/.env.local.");
}

document.documentElement.classList.add("dark");

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      appearance={{
        variables: {
          colorText: "white",
          colorTextOnPrimaryBackground: "white",
          colorTextSecondary: "#a1a1aa",
          colorBackground: "#1c1c24",
          colorInputBackground: "#1c1c24",
          colorInputText: "white",
          colorNeutral: "white",
        },
        elements: {
          // Organization switcher trigger
          organizationSwitcherTrigger: { color: "white" },
          organizationPreviewMainIdentifier: { color: "white" },
          organizationSwitcherTriggerIcon: { color: "white" },
          // Dropdown and popover
          organizationSwitcherPopoverActionButton: { color: "white" },
          organizationSwitcherPopoverActionButtonText: { color: "white" },
          organizationSwitcherPopoverActionButtonIcon: { color: "#a1a1aa" },
          // Modal and profile
          modalContent: { color: "white" },
          navbarButton: { color: "white" },
          navbarButtonIcon: { color: "white" },
          profileSectionTitle: { color: "white" },
          profileSectionTitleText: { color: "white" },
          profileSectionContent: { color: "white" },
          formFieldLabel: { color: "white" },
          formFieldInput: { color: "white" },
          // General text
          text: { color: "white" },
          headerTitle: { color: "white" },
          headerSubtitle: { color: "#a1a1aa" },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkAuthBridge />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ClerkProvider>
  </React.StrictMode>
);
