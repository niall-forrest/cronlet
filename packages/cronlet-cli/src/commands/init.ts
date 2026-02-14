import { Command } from "commander";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import pc from "picocolors";

type Framework =
  | "nextjs-app"
  | "nextjs-pages"
  | "express"
  | "hono"
  | "fastify"
  | "astro"
  | "node";

interface DetectedProject {
  framework: Framework;
  label: string;
  typescript: boolean;
  hasSrcDir: boolean;
  jobsDir: string;
}

function detectFramework(cwd: string): DetectedProject {
  const pkgPath = join(cwd, "package.json");
  const hasTsConfig = existsSync(join(cwd, "tsconfig.json"));
  const hasSrcDir = existsSync(join(cwd, "src"));

  let deps: Record<string, string> = {};

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      deps = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch {
      // malformed package.json, continue with empty deps
    }
  }

  // Next.js
  if (deps["next"]) {
    const hasAppDir =
      existsSync(join(cwd, "app")) || existsSync(join(cwd, "src/app"));
    const router = hasAppDir ? "app" : "pages";

    if (router === "app") {
      const jobsDir = hasSrcDir ? "src/jobs" : "jobs";
      return {
        framework: "nextjs-app",
        label: "Next.js (App Router)",
        typescript: hasTsConfig,
        hasSrcDir,
        jobsDir,
      };
    }

    const jobsDir = hasSrcDir ? "src/jobs" : "jobs";
    return {
      framework: "nextjs-pages",
      label: "Next.js (Pages Router)",
      typescript: hasTsConfig,
      hasSrcDir,
      jobsDir,
    };
  }

  // Astro
  if (deps["astro"]) {
    return {
      framework: "astro",
      label: "Astro",
      typescript: hasTsConfig,
      hasSrcDir,
      jobsDir: "src/jobs",
    };
  }

  // Hono
  if (deps["hono"]) {
    return {
      framework: "hono",
      label: "Hono",
      typescript: hasTsConfig,
      hasSrcDir,
      jobsDir: hasSrcDir ? "src/jobs" : "jobs",
    };
  }

  // Fastify
  if (deps["fastify"]) {
    return {
      framework: "fastify",
      label: "Fastify",
      typescript: hasTsConfig,
      hasSrcDir,
      jobsDir: hasSrcDir ? "src/jobs" : "jobs",
    };
  }

  // Express
  if (deps["express"]) {
    return {
      framework: "express",
      label: "Express",
      typescript: hasTsConfig,
      hasSrcDir,
      jobsDir: hasSrcDir ? "src/jobs" : "jobs",
    };
  }

  // Plain Node.js
  return {
    framework: "node",
    label: "Node.js",
    typescript: hasTsConfig,
    hasSrcDir,
    jobsDir: hasSrcDir ? "src/jobs" : "jobs",
  };
}

function generateExampleJob(typescript: boolean): string {
  if (typescript) {
    return `import { schedule, every } from "cronlet"

// Change to your desired schedule
export default schedule(every("30s"), async (ctx) => {
  console.log(\`Running \${ctx.jobName} at \${ctx.startedAt.toISOString()}\`)
})
`;
  }

  return `const { schedule, every } = require("cronlet")

// Change to your desired schedule
module.exports = schedule(every("30s"), async (ctx) => {
  console.log(\`Running \${ctx.jobName} at \${ctx.startedAt.toISOString()}\`)
})
`;
}

function generateConfig(project: DetectedProject): string {
  if (project.typescript) {
    return `import { defineConfig } from "cronlet"

export default defineConfig({
  jobsDir: "./${project.jobsDir}",
  // deploy: {
  //   prefix: "/api/cron",
  // },
})
`;
  }

  return `const { defineConfig } = require("cronlet")

module.exports = defineConfig({
  jobsDir: "./${project.jobsDir}",
  // deploy: {
  //   prefix: "/api/cron",
  // },
})
`;
}

export const initCommand = new Command("init")
  .description("Initialize cronlet in your project")
  .option("--dir <directory>", "Override jobs directory")
  .option("--force", "Overwrite existing files")
  .action(async (options) => {
    const cwd = process.cwd();

    console.log();

    // Detect framework
    const project = detectFramework(cwd);

    if (options.dir) {
      project.jobsDir = options.dir;
    }

    console.log(
      `  ${pc.dim("Detected")} ${pc.cyan(project.label)}${project.typescript ? pc.dim(" + TypeScript") : ""}`
    );
    console.log();

    const ext = project.typescript ? "ts" : "js";
    const jobsFullPath = join(cwd, project.jobsDir);
    const configPath = join(cwd, `cronlet.config.${ext}`);
    const examplePath = join(jobsFullPath, `health-check.${ext}`);

    // Check for existing config
    if (existsSync(configPath) && !options.force) {
      console.log(
        `  ${pc.yellow("!")} ${pc.dim(`cronlet.config.${ext} already exists (use --force to overwrite)`)}`
      );
      console.log();
      return;
    }

    // Create jobs directory
    if (!existsSync(jobsFullPath)) {
      mkdirSync(jobsFullPath, { recursive: true });
      console.log(
        `  ${pc.green("+")} ${pc.dim("Created")} ${relative(cwd, jobsFullPath)}/`
      );
    } else {
      console.log(
        `  ${pc.dim("~")} ${relative(cwd, jobsFullPath)}/ ${pc.dim("already exists")}`
      );
    }

    // Write example job
    if (!existsSync(examplePath) || options.force) {
      writeFileSync(examplePath, generateExampleJob(project.typescript));
      console.log(
        `  ${pc.green("+")} ${pc.dim("Created")} ${relative(cwd, examplePath)}`
      );
    } else {
      console.log(
        `  ${pc.dim("~")} ${relative(cwd, examplePath)} ${pc.dim("already exists")}`
      );
    }

    // Write config
    writeFileSync(configPath, generateConfig(project));
    console.log(
      `  ${pc.green("+")} ${pc.dim("Created")} cronlet.config.${ext}`
    );

    // Next steps
    console.log();
    console.log(pc.dim("  Next steps:"));
    console.log();
    console.log(`    ${pc.cyan("npx cronlet dev")}`);
    console.log();
  });
