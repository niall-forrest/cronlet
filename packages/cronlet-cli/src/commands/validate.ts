import { Command } from "commander";
import { discoverJobs, parseDuration } from "cronlet";
import pc from "picocolors";
import { loadConfig, resolveJobsDirectory } from "../config/index.js";

export const validateCommand = new Command("validate")
  .description("Validate all job configurations")
  .option("-d, --dir <directory>", "Jobs directory")
  .action(async (options) => {
    let hasErrors = false;

    console.log();
    console.log(pc.cyan("Validating jobs..."));
    console.log();

    try {
      const loadedConfig = await loadConfig();
      const jobsDir = resolveJobsDirectory(options.dir, loadedConfig.config);
      for (const warning of loadedConfig.warnings) {
        console.warn(pc.yellow(`Warning: ${warning}`));
      }

      const jobs = await discoverJobs({
        directory: jobsDir,
      });

      if (jobs.length === 0) {
        console.log(pc.yellow("No jobs found to validate"));
        return;
      }

      for (const job of jobs) {
        const issues: string[] = [];

        // Validate schedule
        if (!job.schedule.cron) {
          issues.push("Missing cron expression");
        }

        // Validate handler
        if (typeof job.handler !== "function") {
          issues.push("Handler is not a function");
        }

        // Validate retry config
        if (job.config.retry) {
          if (typeof job.config.retry.attempts !== "number" || job.config.retry.attempts < 1) {
            issues.push("Retry attempts must be a positive number");
          }

          if (job.config.retry.backoff && !["linear", "exponential"].includes(job.config.retry.backoff)) {
            issues.push("Retry backoff must be 'linear' or 'exponential'");
          }
        }

        // Validate timeout format
        if (job.config.timeout) {
          try {
            parseDuration(job.config.timeout);
          } catch {
            issues.push(
              `Invalid timeout format: ${job.config.timeout} (use ms|s|m|h|d, e.g. 100ms, 30s, 5m)`
            );
          }
        }

        // Validate retry initial delay format
        if (job.config.retry?.initialDelay) {
          try {
            parseDuration(job.config.retry.initialDelay);
          } catch {
            issues.push(
              `Invalid retry initialDelay format: ${job.config.retry.initialDelay} (use ms|s|m|h|d)`
            );
          }
        }

        // Print result
        if (issues.length === 0) {
          console.log(`  ${pc.green("✓")} ${pc.white(job.id)}`);
        } else {
          hasErrors = true;
          console.log(`  ${pc.red("✗")} ${pc.white(job.id)}`);
          for (const issue of issues) {
            console.log(`    ${pc.red("→")} ${pc.dim(issue)}`);
          }
        }
      }

      console.log();

      if (hasErrors) {
        console.log(pc.red("Validation failed"));
        process.exit(1);
      } else {
        console.log(pc.green(`✓ All ${jobs.length} job${jobs.length === 1 ? "" : "s"} valid`));
      }

      console.log();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(pc.red(`Error: ${message}`));
      process.exit(1);
    }
  });
