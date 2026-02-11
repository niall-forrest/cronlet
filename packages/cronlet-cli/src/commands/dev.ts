import { Command } from "commander";
import { discoverJobs, registry, engine } from "cronlet";
import { createServer } from "../server/index.js";
import { CronScheduler } from "../scheduler/index.js";
import { createWatcher } from "../watcher/index.js";
import {
  printBanner,
  printJobs,
  printDashboardUrl,
  printWatching,
  printJobStart,
  printJobSuccess,
  printJobFailure,
  printJobRetry,
  printFileChange,
  printError,
} from "../ui/banner.js";

export const devCommand = new Command("dev")
  .description("Start the development server with hot reloading")
  .option("-p, --port <port>", "Port for the dashboard", "3141")
  .option("-d, --dir <directory>", "Jobs directory")
  .option("--no-watch", "Disable file watching")
  .action(async (options) => {
    const port = parseInt(options.port, 10);

    // Setup execution event listeners for console output
    engine.on("job:start", (event) => {
      printJobStart(event.jobId, event.runId);
    });

    engine.on("job:success", (event) => {
      printJobSuccess(event.jobId, event.duration ?? 0);
    });

    engine.on("job:failure", (event) => {
      printJobFailure(event.jobId, event.error?.message ?? "Unknown error");
    });

    engine.on("job:timeout", (event) => {
      printJobFailure(event.jobId, "Timeout");
    });

    engine.on("job:retry", (event) => {
      printJobRetry(event.jobId, event.attempt);
    });

    // Create scheduler
    const scheduler = new CronScheduler();

    // Load and schedule jobs
    const loadJobs = async () => {
      registry.clear();
      scheduler.clear();

      try {
        const jobs = await discoverJobs({
          directory: options.dir,
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
    printJobs(jobs);

    // Start server
    try {
      await createServer(scheduler, port);
      printDashboardUrl(port);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      printError(`Failed to start server: ${message}`);
      process.exit(1);
    }

    // Start scheduler
    scheduler.start();

    // Setup file watcher
    if (options.watch !== false) {
      const jobsDir = options.dir ?? "./jobs";

      const watcher = createWatcher({
        directory: jobsDir,
        onChange: async (path) => {
          printFileChange(path);

          // Reload all jobs
          const reloadedJobs = await loadJobs();
          printJobs(reloadedJobs);
        },
      });

      printWatching();

      // Cleanup on exit
      process.on("SIGINT", () => {
        watcher.close();
        scheduler.stop();
        process.exit(0);
      });

      process.on("SIGTERM", () => {
        watcher.close();
        scheduler.stop();
        process.exit(0);
      });
    }
  });
