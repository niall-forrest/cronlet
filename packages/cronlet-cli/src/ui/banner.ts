import pc from "picocolors";
import type { JobDefinition } from "cronlet";

/**
 * Print the startup banner
 */
export function printBanner(port: number): void {
  console.log();
  console.log(pc.cyan("  ⏱  cronlet dev server running"));
  console.log();
}

/**
 * Print discovered jobs table
 */
export function printJobs(jobs: JobDefinition[]): void {
  if (jobs.length === 0) {
    console.log(pc.yellow("  No jobs discovered"));
    return;
  }

  console.log(pc.dim("  Jobs discovered:"));

  const maxIdLength = Math.max(...jobs.map((j) => j.id.length), 10);

  for (const job of jobs) {
    const id = job.id.padEnd(maxIdLength + 2);
    const schedule = job.schedule.humanReadable;
    console.log(`    ${pc.green("✓")} ${pc.white(id)} ${pc.dim(schedule)}`);
  }

  console.log();
}

/**
 * Print dashboard URL
 */
export function printDashboardUrl(port: number): void {
  console.log(`  ${pc.dim("Dashboard:")} ${pc.cyan(`http://localhost:${port}`)}`);
}

/**
 * Print watching message
 */
export function printWatching(): void {
  console.log(`  ${pc.dim("Watching for changes...")}`);
  console.log();
}

/**
 * Print job execution start
 */
export function printJobStart(jobId: string, runId: string): void {
  const time = new Date().toLocaleTimeString();
  console.log(
    `${pc.dim(time)} ${pc.blue("▶")} ${pc.white(jobId)} ${pc.dim(`(${runId.slice(0, 12)}...)`)}`
  );
}

/**
 * Print job execution success
 */
export function printJobSuccess(jobId: string, duration: number): void {
  const time = new Date().toLocaleTimeString();
  console.log(
    `${pc.dim(time)} ${pc.green("✓")} ${pc.white(jobId)} ${pc.dim(`(${duration}ms)`)}`
  );
}

/**
 * Print job execution failure
 */
export function printJobFailure(jobId: string, error: string): void {
  const time = new Date().toLocaleTimeString();
  console.log(
    `${pc.dim(time)} ${pc.red("✗")} ${pc.white(jobId)} ${pc.red(error)}`
  );
}

/**
 * Print job retry
 */
export function printJobRetry(jobId: string, attempt: number): void {
  const time = new Date().toLocaleTimeString();
  console.log(
    `${pc.dim(time)} ${pc.yellow("↻")} ${pc.white(jobId)} ${pc.dim(`(retry ${attempt})`)}`
  );
}

/**
 * Print file change detected
 */
export function printFileChange(path: string): void {
  console.log(
    `${pc.dim(new Date().toLocaleTimeString())} ${pc.magenta("↻")} ${pc.dim("File changed:")} ${path}`
  );
}

/**
 * Print error message
 */
export function printError(message: string): void {
  console.error(pc.red(`  Error: ${message}`));
}

/**
 * Print success message
 */
export function printSuccess(message: string): void {
  console.log(pc.green(`  ✓ ${message}`));
}

/**
 * Print info message
 */
export function printInfo(message: string): void {
  console.log(pc.dim(`  ${message}`));
}
