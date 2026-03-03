import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://docs.cronlet.dev",
  integrations: [
    starlight({
      title: "Cronlet Docs",
      description: "Human-first guides for scheduling jobs in Node.js apps with cronlet",
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
          label: "Documentation",
          items: [
            { label: "Overview", link: "/" },
            { label: "Quickstart", link: "/getting-started/" },
            {
              label: "Jobs and Scheduling Model",
              link: "/jobs-and-scheduling-model/",
            },
            { label: "Config Reference", link: "/config-reference/" },
            { label: "CLI Commands", link: "/cli-commands/" },
            {
              label: "Local Dev and Hot Reload",
              link: "/local-dev-and-hot-reload/",
            },
            {
              label: "Deploy Targets and Caveats",
              link: "/deploy-targets-and-caveats/",
            },
            {
              label: "Troubleshooting and FAQ",
              link: "/troubleshooting-and-faq/",
            },
          ],
        },
      ],
    }),
  ],
});
