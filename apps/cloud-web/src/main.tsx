import React from "react";
import ReactDOM from "react-dom/client";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { ApiKeysPage } from "./routes/ApiKeysPage";
import { EndpointsPage } from "./routes/EndpointsPage";
import { ProjectsPage } from "./routes/ProjectsPage";
import { JobsPage } from "./routes/JobsPage";
import { RunsPage } from "./routes/RunsPage";
import { SchedulesPage } from "./routes/SchedulesPage";
import { UsagePage } from "./routes/UsagePage";
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

const usageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/usage",
  component: UsagePage,
});

const routeTree = rootRoute.addChildren([
  projectsRoute,
  endpointsRoute,
  jobsRoute,
  schedulesRoute,
  runsRoute,
  apiKeysRoute,
  usageRoute,
]);

const router = createRouter({ routeTree });

const queryClient = new QueryClient();
document.documentElement.classList.add("dark");

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
