import { Command } from "commander";
import { discoverJobs, registry, engine } from "cronlet";
import pc from "picocolors";

export const runCommand = new Command("run")
  .description("Manually trigger a specific job")
  .argument("<job-id>", "The job ID to run")
  .option("-d, --dir <directory>", "Jobs directory")
  .action(async (jobId, options) => {
    try {
      // Discover jobs
      await discoverJobs({
        directory: options.dir,
      });

      // Find the job
      const job = registry.getById(jobId);

      if (!job) {
        console.error(pc.red(`Error: Job "${jobId}" not found`));
        console.log();
        console.log(pc.dim("Available jobs:"));

        const jobs = registry.getAll();
        for (const j of jobs) {
          console.log(`  ${pc.white(j.id)}`);
        }

        process.exit(1);
      }

      console.log();
      console.log(pc.cyan(`Running job: ${job.name}`));
      console.log(pc.dim(`Schedule: ${job.schedule.humanReadable}`));
      console.log();

      // Setup event listeners
      engine.on("job:start", (event) => {
        if (event.jobId !== jobId) return;
        console.log(pc.blue(`▶ Started (attempt ${event.attempt})`));
      });

      engine.on("job:retry", (event) => {
        if (event.jobId !== jobId) return;
        console.log(pc.yellow(`↻ Retrying (attempt ${event.attempt + 1})`));
      });

      // Run the job
      const result = await engine.run(job);

      console.log();

      if (result.status === "success") {
        console.log(pc.green(`✓ Completed successfully`));
        console.log(pc.dim(`  Duration: ${result.duration}ms`));
      } else if (result.status === "timeout") {
        console.log(pc.red(`✗ Timed out`));
        console.log(pc.dim(`  Duration: ${result.duration}ms`));
        process.exit(1);
      } else {
        console.log(pc.red(`✗ Failed`));
        console.log(pc.dim(`  Duration: ${result.duration}ms`));
        if (result.error) {
          console.log(pc.red(`  Error: ${result.error.message}`));
        }
        process.exit(1);
      }

      console.log();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(pc.red(`Error: ${message}`));
      process.exit(1);
    }
  });
