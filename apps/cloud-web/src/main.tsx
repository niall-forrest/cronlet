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
import { TaskDetailPage } from "./routes/TaskDetailPage";
import { TaskEditPage } from "./routes/TaskEditPage";
import { CreateTaskPage } from "./routes/CreateTaskPage";
import { RunsPage } from "./routes/RunsPage";
import { RunDetailPage } from "./routes/RunDetailPage";
import { AgentConnectPage } from "./routes/AgentConnectPage";
import { SettingsPage } from "./routes/SettingsPage";
import { AlertsPage } from "./routes/AlertsPage";
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
  component: function CreateTaskWrapper() {
    return <CreateTaskPage />;
  },
});

const createTaskTemplatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks/create/templates",
  component: function CreateTaskTemplatesWrapper() {
    return <CreateTaskPage showTemplatesInitially />;
  },
});

// Task detail page
const taskDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks/$taskId",
  component: function TaskDetailWrapper() {
    const { taskId } = taskDetailRoute.useParams();
    return <TaskDetailPage taskId={taskId} />;
  },
});

const taskEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks/$taskId/edit",
  component: function TaskEditWrapper() {
    const { taskId } = taskEditRoute.useParams();
    return <TaskEditPage taskId={taskId} />;
  },
});

// Runs - execution history
const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs",
  component: RunsPage,
});

const runDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs/$runId",
  component: function RunDetailWrapper() {
    const { runId } = runDetailRoute.useParams();
    return <RunDetailPage runId={runId} />;
  },
});

// Agent Connect - MCP, SDK, API integration
const agentConnectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agent-connect",
  component: AgentConnectPage,
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
  createTaskTemplatesRoute,
  taskEditRoute,
  taskDetailRoute,
  runsRoute,
  runDetailRoute,
  agentConnectRoute,
  settingsRoute,
  alertsRoute,
  usageRoute,
  billingRoute,
]);

const router = createRouter({ routeTree });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute - data is fresh for this long
      gcTime: 1000 * 60 * 5, // 5 minutes - keep in cache
      refetchOnWindowFocus: false, // Don't refetch on tab focus
      retry: 1,
    },
  },
});
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
          organizationSwitcherTrigger: {
            color: "white",
            outline: "none",
            boxShadow: "none",
          },
          organizationPreviewMainIdentifier: { color: "white" },
          organizationSwitcherTriggerIcon: { color: "#a1a1aa" },
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
