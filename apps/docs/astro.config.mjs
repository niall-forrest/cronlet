import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://docs.cronlet.dev",
  integrations: [
    starlight({
      title: "Cronlet Docs",
      description: "Developer documentation for Cronlet Cloud, the SDK, agent tooling, callbacks, and the local runtime",
      customCss: ["/src/styles/custom.css"],
      social: {
        github: "https://github.com/niall-forrest/cronlet",
      },
      editLink: {
        baseUrl:
          "https://github.com/niall-forrest/cronlet/edit/main/apps/docs/",
      },
      sidebar: [
        {
          label: "Cloud + SDK",
          items: [
            { label: "Overview", link: "/" },
            { label: "Cloud Quickstart", link: "/cloud-quickstart/" },
            { label: "SDK Overview", link: "/sdk-overview/" },
            { label: "Tasks, Handlers, and Schedules", link: "/tasks-handlers-and-schedules/" },
            { label: "Callbacks and Agent Loops", link: "/callbacks-and-agent-loops/" },
            { label: "Agent Tooling", link: "/agent-tooling/" },
            { label: "SDK API Reference", link: "/sdk-api-reference/" },
          ],
        },
        {
          label: "Local Runtime",
          items: [
            { label: "Local Runtime Quickstart", link: "/local-runtime-quickstart/" },
            { label: "Local Runtime Reference", link: "/local-runtime-reference/" },
          ],
        },
      ],
    }),
  ],
});
