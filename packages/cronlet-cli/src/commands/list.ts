import { Command } from "commander";
import { discoverJobs } from "cronlet";
import pc from "picocolors";

export const listCommand = new Command("list")
  .description("List all discovered jobs")
  .option("-d, --dir <directory>", "Jobs directory")
  .action(async (options) => {
    try {
      const jobs = await discoverJobs({
        directory: options.dir,
      });

      if (jobs.length === 0) {
        console.log(pc.yellow("No jobs found"));
        return;
      }

      console.log();
      console.log(pc.bold(`Found ${jobs.length} job${jobs.length === 1 ? "" : "s"}:`));
      console.log();

      // Calculate column widths
      const idWidth = Math.max(...jobs.map((j) => j.id.length), 4);
      const scheduleWidth = Math.max(...jobs.map((j) => j.schedule.humanReadable.length), 8);

      // Print header
      const header = `  ${"ID".padEnd(idWidth)}  ${"Schedule".padEnd(scheduleWidth)}  Cron`;
      console.log(pc.dim(header));
      console.log(pc.dim("  " + "-".repeat(header.length - 2)));

      // Print jobs
      for (const job of jobs) {
        const id = job.id.padEnd(idWidth);
        const schedule = job.schedule.humanReadable.padEnd(scheduleWidth);
        const cron = job.schedule.cron;

        console.log(`  ${pc.white(id)}  ${pc.cyan(schedule)}  ${pc.dim(cron)}`);
      }

      console.log();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(pc.red(`Error: ${message}`));
      process.exit(1);
    }
  });
