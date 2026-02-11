import { Command } from "commander";
import { discoverJobs } from "cronlet";
import pc from "picocolors";

export const validateCommand = new Command("validate")
  .description("Validate all job configurations")
  .option("-d, --dir <directory>", "Jobs directory")
  .action(async (options) => {
    let hasErrors = false;

    console.log();
    console.log(pc.cyan("Validating jobs..."));
    console.log();

    try {
      const jobs = await discoverJobs({
        directory: options.dir,
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
          const timeoutMatch = job.config.timeout.match(/^(\d+)(s|m|h|d)$/);
          if (!timeoutMatch) {
            issues.push(`Invalid timeout format: ${job.config.timeout}`);
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
