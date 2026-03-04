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
import { ApiKeysPage } from "./routes/ApiKeysPage";
import { AlertsPage } from "./routes/AlertsPage";
import { AuditEventsPage } from "./routes/AuditEventsPage";
import { EndpointsPage } from "./routes/EndpointsPage";
import { ProjectsPage } from "./routes/ProjectsPage";
import { JobsPage } from "./routes/JobsPage";
import { RunsPage } from "./routes/RunsPage";
import { SchedulesPage } from "./routes/SchedulesPage";
import { UsagePage } from "./routes/UsagePage";
import { BillingPage } from "./routes/BillingPage";
import "./index.css";

const rootRoute = createRootRoute({
  component: Layout,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ProjectsPage,
});

const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/jobs",
  component: JobsPage,
});

const endpointsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/endpoints",
  component: EndpointsPage,
});

const schedulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/schedules",
  component: SchedulesPage,
});

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs",
  component: RunsPage,
});

const apiKeysRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/api-keys",
  component: ApiKeysPage,
});

const alertsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/alerts",
  component: AlertsPage,
});

const auditEventsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/audit-events",
  component: AuditEventsPage,
});

const usageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/usage",
  component: UsagePage,
});

const billingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/billing",
  component: BillingPage,
});

const routeTree = rootRoute.addChildren([
  projectsRoute,
  endpointsRoute,
  jobsRoute,
  schedulesRoute,
  runsRoute,
  alertsRoute,
  auditEventsRoute,
  apiKeysRoute,
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
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <QueryClientProvider client={queryClient}>
        <ClerkAuthBridge />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ClerkProvider>
  </React.StrictMode>
);
