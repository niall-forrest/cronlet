import { Command } from "commander";
import { discoverJobs } from "cronlet";
import pc from "picocolors";
import { detectProject } from "../deploy/detection.js";
import { deployToVercel } from "../deploy/platforms/vercel.js";
import {
  loadConfig,
  resolveJobsDirectory,
  DEFAULT_JOB_DIRECTORIES,
} from "../config/index.js";

export const deployCommand = new Command("deploy")
  .description("Generate deployment files for a target platform")
  .requiredOption("--platform <platform>", "Target platform (vercel)")
  .option("-d, --dir <directory>", "Jobs directory")
  .option("--prefix <prefix>", "Route prefix")
  .option("--dry-run", "Preview changes without writing files")
  .option("--force", "Overwrite manually edited files")
  .option("--no-clean", "Keep orphaned routes from deleted jobs")
  .action(async (options) => {
    const platform = options.platform.toLowerCase();

    // Validate platform
    if (platform !== "vercel") {
      console.error(pc.red(`  Error: Unknown platform '${platform}'. Supported: vercel`));
      process.exit(1);
    }

    console.log();
    if (options.dryRun) {
      console.log(pc.yellow("  Dry run — no files will be written"));
      console.log();
    }
    console.log(pc.cyan("  Generating Vercel deployment..."));
    console.log();

    // Detect project structure
    const project = detectProject();
    if (!project) {
      console.error(pc.red("  Error: Could not detect Next.js project."));
      console.error(pc.dim("  Ensure app/ or pages/ directory exists."));
      process.exit(1);
    }

    console.log(pc.dim(`  Project: ${project.router === "app" ? "App Router" : "Pages Router"} (${project.typescript ? "TypeScript" : "JavaScript"})`));

    // Load config
    const loadedConfig = await loadConfig();
    const config = loadedConfig.config;
    for (const warning of loadedConfig.warnings) {
      console.log(pc.yellow(`  Warning: ${warning}`));
    }

    const prefix = options.prefix ?? config?.deploy?.prefix ?? "/api/cron";

    // Find jobs directory
    const jobsDir = resolveJobsDirectory(options.dir, config);
    if (!jobsDir) {
      console.error(pc.red("  Error: Could not find jobs directory."));
      console.error(
        pc.dim(
          `  Create one of ${DEFAULT_JOB_DIRECTORIES.join(", ")}, set jobsDir in config, or use --dir.`
        )
      );
      process.exit(1);
    }

    console.log(pc.dim(`  Jobs: ${jobsDir}`));
    console.log();

    // Discover jobs
    let jobs;
    try {
      jobs = await discoverJobs({ directory: jobsDir });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(pc.red(`  Error: Failed to discover jobs: ${message}`));
      process.exit(1);
    }

    if (jobs.length === 0) {
      console.log(pc.yellow("  No jobs discovered."));
      console.log(pc.dim(`  Create job files in ${jobsDir}`));
      process.exit(0);
    }

    // Print discovered jobs
    console.log(pc.dim("  Jobs discovered:"));
    for (const job of jobs) {
      console.log(`    ${pc.green("✓")} ${pc.white(job.id.padEnd(24))} ${pc.dim(job.schedule.humanReadable)}`);
    }
    console.log();

    // Deploy
    const result = await deployToVercel(
      jobs,
      project,
      jobsDir,
      {
        prefix,
        force: options.force ?? false,
        clean: options.clean ?? true,
        dryRun: options.dryRun ?? false,
        maxDuration: config?.deploy?.vercel?.maxDuration,
      },
      config
    );

    // Print errors
    if (result.errors.length > 0) {
      console.log(pc.red("  Errors:"));
      for (const error of result.errors) {
        console.log(`    ${pc.red("✗")} ${error}`);
      }
      console.log();
    }

    // Print warnings
    if (result.warnings.length > 0) {
      console.log(pc.yellow("  Warnings:"));
      for (const warning of result.warnings) {
        console.log(`    ${pc.yellow("⚠")} ${warning}`);
      }
      console.log();
    }

    // Print routes
    if (result.generatedRoutes.length > 0 || result.removedRoutes.length > 0) {
      console.log(pc.dim("  Routes:"));

      for (const route of result.generatedRoutes) {
        const status = route.status === "new"
          ? pc.green("+")
          : route.status === "updated"
            ? pc.yellow("~")
            : pc.dim("○");
        const statusText = route.status === "skipped" ? pc.dim(" (skipped)") : "";
        console.log(`    ${status} ${route.path}${statusText}`);
      }

      for (const route of result.removedRoutes) {
        console.log(`    ${pc.red("-")} ${route}`);
      }
      console.log();
    }

    // Print vercel.json changes
    const hasVercelChanges =
      result.addedCrons.length > 0 ||
      result.removedCrons.length > 0 ||
      result.updatedCrons.length > 0;

    if (hasVercelChanges) {
      console.log(pc.dim("  vercel.json:"));

      for (const cron of result.addedCrons) {
        console.log(`    ${pc.green("+")} ${cron.path} → ${pc.dim(cron.schedule)}`);
      }

      for (const cron of result.updatedCrons) {
        console.log(`    ${pc.yellow("~")} ${cron.path} → ${pc.dim(cron.schedule)}`);
      }

      for (const cron of result.removedCrons) {
        console.log(`    ${pc.red("-")} ${cron.path}`);
      }
      console.log();
    }

    // Print next steps
    if (!options.dryRun) {
      console.log(pc.dim("  Next steps:"));
      console.log(pc.dim("    1. Commit the generated files"));
      console.log(pc.dim("    2. Push to deploy on Vercel"));
      console.log(pc.dim("    3. Vercel will automatically call your routes on schedule"));
      console.log();
    } else {
      console.log(pc.dim("  Run without --dry-run to apply changes."));
      console.log();
    }

    // Exit with error if there were validation errors
    if (result.errors.length > 0) {
      process.exit(1);
    }
  });
