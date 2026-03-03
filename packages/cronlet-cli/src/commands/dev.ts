import { Command } from "commander";
import { discoverJobs, registry, engine } from "cronlet";
import { createServer } from "../server/index.js";
import { CronScheduler } from "../scheduler/index.js";
import { createWatcher } from "../watcher/index.js";
import {
  loadConfig,
  resolveJobsDirectory,
  resolveWatchDirectories,
  DEFAULT_JOB_DIRECTORIES,
} from "../config/index.js";
import {
  printBanner,
  printJobs,
  printDashboardUrl,
  printWatching,
  printWatchDirectories,
  printJobStart,
  printJobSuccess,
  printJobFailure,
  printJobRetry,
  printFileChange,
  printError,
  printInfo,
} from "../ui/banner.js";
import pc from "picocolors";

export const devCommand = new Command("dev")
  .description("Start the development server with hot reloading")
  .option("-p, --port <port>", "Port for the dashboard", "3141")
  .option("-d, --dir <directory>", "Jobs directory")
  .option("--no-watch", "Disable file watching")
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    if (Number.isNaN(port) || port <= 0) {
      printError(`Invalid port: ${options.port}`);
      process.exit(1);
    }

    const loadedConfig = await loadConfig();
    const jobsDir = resolveJobsDirectory(options.dir, loadedConfig.config);
    const watchDirs = resolveWatchDirectories(options.dir, loadedConfig.config);

    for (const warning of loadedConfig.warnings) {
      console.warn(pc.yellow(`  Warning: ${warning}`));
    }

    const engineUnsubscribers = [
      engine.on("job:start", (event) => {
        printJobStart(event.jobId, event.runId);
      }),
      engine.on("job:success", (event) => {
        printJobSuccess(event.jobId, event.duration ?? 0);
      }),
      engine.on("job:failure", (event) => {
        printJobFailure(event.jobId, event.error?.message ?? "Unknown error");
      }),
      engine.on("job:timeout", (event) => {
        printJobFailure(event.jobId, "Timeout");
      }),
      engine.on("job:retry", (event) => {
        printJobRetry(event.jobId, event.attempt);
      }),
    ];

    // Create scheduler
    const scheduler = new CronScheduler();

    // Load and schedule jobs
    const loadJobs = async () => {
      registry.clear();
      scheduler.clear();

      try {
        const jobs = await discoverJobs({
          directory: jobsDir,
          clearRegistry: false,
        });

        for (const job of jobs) {
          scheduler.add(job);
        }

        return jobs;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        printError(`Failed to load jobs: ${message}`);
        return [];
      }
    };

    // Initial load
    const jobs = await loadJobs();

    // Print banner
    printBanner(port);
    printInfo(`Config: ${loadedConfig.path ?? "none"}`);
    printInfo(
      `Jobs source: ${
        options.dir
          ? "--dir flag"
          : loadedConfig.config?.jobsDir
            ? `${loadedConfig.path ?? "config"} jobsDir`
            : "auto-detect"
      }`
    );
    if (jobsDir) {
      printInfo(`Jobs directory: ${jobsDir}`);
    } else {
      printInfo(`Jobs directory: auto-detect (${DEFAULT_JOB_DIRECTORIES.join(", ")})`);
    }
    if (options.watch !== false) {
      printWatchDirectories(watchDirs);
    }
    printJobs(jobs);
    if (jobs.length === 0) {
      printInfo(`Tip: add a job file in ${jobsDir ?? DEFAULT_JOB_DIRECTORIES.join(", ")}`);
      console.log();
    }

    let server: Awaited<ReturnType<typeof createServer>> | null = null;
    // Start server
    try {
      server = await createServer(scheduler, port);
      printDashboardUrl(port);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      printError(`Failed to start server: ${message}`);
      for (const unsubscribe of engineUnsubscribers) {
        unsubscribe();
      }
      process.exit(1);
    }

    // Start scheduler
    scheduler.start();

    let watcher: ReturnType<typeof createWatcher> | null = null;

    // Setup file watcher
    if (options.watch !== false) {
      watcher = createWatcher({
        directory: watchDirs,
        onChange: async (path) => {
          printFileChange(path);

          // Reload all jobs
          const reloadedJobs = await loadJobs();
          printJobs(reloadedJobs);
        },
      });

      printWatching();
    }

    let shuttingDown = false;
    const handleShutdown = async (signal: string) => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;

      console.log(`\n  Received ${signal}, shutting down gracefully...`);

      watcher?.close();
      if (server) {
        await server.close().catch(() => {});
      }

      for (const unsubscribe of engineUnsubscribers) {
        unsubscribe();
      }

      const inFlight = scheduler.getInFlightCount();
      if (inFlight > 0) {
        console.log(`  Waiting for ${inFlight} in-flight job(s) to complete...`);
      }

      const { completed, interrupted } = await scheduler.shutdown(30000);

      if (completed.length > 0) {
        console.log(`  ✓ ${completed.length} job(s) completed`);
      }
      if (interrupted.length > 0) {
        console.log(`  ⚠ ${interrupted.length} job(s) interrupted: ${interrupted.join(", ")}`);
      }

      console.log("  Goodbye!");
      process.exit(0);
    };

    process.once("SIGINT", () => {
      void handleShutdown("SIGINT");
    });
    process.once("SIGTERM", () => {
      void handleShutdown("SIGTERM");
    });
  });
