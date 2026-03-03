import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "Cronlet Docs",
      description: "Typed scheduling for Node.js apps",
      social: {
        github: "https://github.com/niallforrest/cronlet",
      },
      sidebar: [
        {
          label: "Documentation",
          autogenerate: { directory: "." },
        },
      ],
    }),
  ],
});
