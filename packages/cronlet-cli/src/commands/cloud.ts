import { Command } from "commander";
import { discoverJobs, type JobDefinition } from "cronlet";
import pc from "picocolors";
import type { ProjectRecord } from "@cronlet/cloud-shared";
import { loadConfig, resolveJobsDirectory } from "../config/index.js";
import {
  loadCloudAuth,
  loadCloudLink,
  saveCloudAuth,
  saveCloudLink,
  type CloudAuthConfig,
  type CloudLinkConfig,
} from "../cloud/config.js";
import {
  createEndpoint,
  createJob,
  createSchedule,
  healthcheck,
  listEndpoints,
  listJobs,
  listProjects,
  listSchedules,
  listUsage,
} from "../cloud/api.js";

interface PushPlan {
  createEndpoint: boolean;
  createJobs: JobDefinition[];
  createSchedules: JobDefinition[];
}

function requireAuthAndLink(): { auth: CloudAuthConfig; link: CloudLinkConfig } {
  const auth = loadCloudAuth();
  if (!auth) {
    throw new Error("Not logged in. Run `cronlet cloud login --api-url ... --api-key ...` first.");
  }

  const link = loadCloudLink();
  if (!link) {
    throw new Error("Project not linked. Run `cronlet cloud link --org ... --project ... --endpoint-url ...` first.");
  }

  return { auth, link };
}

export function toPlan(
  localJobs: JobDefinition[],
  remoteJobs: Set<string>,
  scheduledJobKeys: Set<string>,
  endpointExists: boolean
): PushPlan {
  const sortedJobs = [...localJobs].sort((a, b) => a.id.localeCompare(b.id));
  const createJobs = sortedJobs.filter((job) => !remoteJobs.has(job.id));
  const createSchedules = sortedJobs.filter((job) => !scheduledJobKeys.has(job.id));

  return {
    createEndpoint: !endpointExists,
    createJobs,
    createSchedules,
  };
}

export function createCloudCommand(): Command {
  return new Command("cloud")
    .description("Manage Cronlet Cloud migration and sync")
    .addCommand(
      new Command("login")
      .description("Store cloud API credentials for this workspace")
      .requiredOption("--api-url <url>", "Cloud API base URL")
      .requiredOption("--api-key <key>", "Cloud API key")
      .action(async (options) => {
        const auth: CloudAuthConfig = {
          apiUrl: options.apiUrl,
          apiKey: options.apiKey,
        };

        const path = saveCloudAuth(auth);
        const healthy = await healthcheck(auth.apiUrl);

        console.log();
        console.log(pc.green(`Saved cloud auth at ${path}`));
        console.log(pc.dim(`Health check: ${healthy ? "ok" : "failed"}`));
        console.log();
      })
    )
    .addCommand(
      new Command("link")
      .description("Link current workspace to a cloud org/project/environment")
      .requiredOption("--org <orgId>", "Organization ID")
      .requiredOption("--project <projectId>", "Project ID")
      .requiredOption("--endpoint-url <url>", "Public endpoint URL for BYO execution")
      .option("--environment <environment>", "Environment name", "prod")
      .action((options) => {
        const auth = loadCloudAuth();
        if (!auth) {
          throw new Error("Run `cronlet cloud login` first.");
        }

        const link: CloudLinkConfig = {
          orgId: options.org,
          projectId: options.project,
          environment: options.environment,
          endpointUrl: options.endpointUrl,
          linkedAt: new Date().toISOString(),
        };

        const path = saveCloudLink(link);

        console.log();
        console.log(pc.green(`Linked workspace at ${path}`));
        console.log(pc.dim(`org=${link.orgId} project=${link.projectId} env=${link.environment}`));
        console.log();
      })
    )
    .addCommand(
      new Command("status")
      .description("Show cloud auth, link state, and usage snapshot")
      .action(async () => {
        const auth = loadCloudAuth();
        const link = loadCloudLink();

        console.log();
        console.log(pc.bold("Cronlet Cloud Status"));

        if (!auth) {
          console.log(pc.yellow("  auth: missing"));
          console.log();
          return;
        }

        if (!link) {
          console.log(pc.yellow("  link: missing"));
          console.log(pc.dim(`  api: ${auth.apiUrl}`));
          console.log();
          return;
        }

        const context = { auth, link };
        const healthy = await healthcheck(auth.apiUrl);
        console.log(pc.dim(`  api: ${auth.apiUrl} (${healthy ? "healthy" : "unreachable"})`));
        console.log(pc.dim(`  org: ${link.orgId}`));
        console.log(pc.dim(`  project: ${link.projectId}`));
        console.log(pc.dim(`  environment: ${link.environment}`));

        try {
          const [projects, usage] = await Promise.all([
            listProjects(context),
            listUsage(context),
          ]);
          const linkedProject = projects.find((project: ProjectRecord) => project.id === link.projectId);
          console.log(pc.dim(`  projectName: ${linkedProject?.name ?? "(not found)"}`));
          console.log(pc.dim(`  usage: ${usage.runAttempts}/${usage.runLimit} run attempts this month`));
          console.log(pc.dim(`  tier: ${usage.tier} retention=${usage.retentionDays}d`));
        } catch (error) {
          console.log(pc.yellow(`  cloud query failed: ${error instanceof Error ? error.message : String(error)}`));
        }

        console.log();
      })
    )
    .addCommand(
      new Command("push")
      .description("Push discovered OSS jobs into Cronlet Cloud")
      .option("--dry-run", "Preview without writing remote state")
      .option("-d, --dir <directory>", "Jobs directory")
      .action(async (options) => {
        const { auth, link } = requireAuthAndLink();
        const context = { auth, link };

        const loadedConfig = await loadConfig();
        const jobsDir = resolveJobsDirectory(options.dir, loadedConfig.config);

        for (const warning of loadedConfig.warnings) {
          console.warn(pc.yellow(`Warning: ${warning}`));
        }

        const localJobs = await discoverJobs({ directory: jobsDir });

        const [remoteEndpoints, remoteJobs, remoteSchedules] = await Promise.all([
          listEndpoints(context),
          listJobs(context),
          listSchedules(context),
        ]);

        const endpointName = `default-${link.environment}`;
        const endpoint = remoteEndpoints.find(
          (item) =>
            item.projectId === link.projectId &&
            item.environment === link.environment &&
            item.name === endpointName
        );

        const remoteJobKeys = new Set(remoteJobs.map((job) => job.key));
        const remoteJobKeyById = new Map(remoteJobs.map((job) => [job.id, job.key]));
        const jobIdByKey = new Map(remoteJobs.map((job) => [job.key, job.id]));

        const scheduledJobKeys = new Set(
          remoteSchedules
            .map((schedule) => remoteJobKeyById.get(schedule.jobId))
            .filter((jobKey): jobKey is string => typeof jobKey === "string")
        );
        const plan = toPlan(localJobs, remoteJobKeys, scheduledJobKeys, Boolean(endpoint));

        console.log();
        console.log(pc.bold("Cronlet Cloud Push Plan"));
        console.log(pc.dim(`  local jobs discovered: ${localJobs.length}`));
        console.log(pc.dim(`  create endpoint: ${plan.createEndpoint ? "yes" : "no"}`));
        console.log(pc.dim(`  create jobs: ${plan.createJobs.length}`));
        console.log(pc.dim(`  create schedules: ${plan.createSchedules.length}`));
        console.log();

        if (options.dryRun) {
          for (const job of plan.createJobs) {
            console.log(pc.cyan(`  + job ${job.id} (${job.schedule.cron})`));
          }
          for (const job of plan.createSchedules) {
            console.log(pc.cyan(`  + schedule for ${job.id} (${job.schedule.cron})`));
          }
          console.log();
          console.log(pc.green("Dry run complete."));
          console.log();
          return;
        }

        let endpointId = endpoint?.id;
        if (plan.createEndpoint) {
          const createdEndpoint = await createEndpoint(context, {
            projectId: link.projectId,
            environment: link.environment,
            name: endpointName,
            url: link.endpointUrl,
            authMode: "none",
            timeoutMs: 30000,
          });
          endpointId = createdEndpoint.id;
          console.log(pc.green(`  ✓ endpoint ${createdEndpoint.name}`));
        }

        if (!endpointId) {
          throw new Error("No endpoint available after plan apply.");
        }

        for (const job of plan.createJobs) {
          const createdJob = await createJob(context, {
            projectId: link.projectId,
            environment: link.environment,
            endpointId,
            name: job.name,
            key: job.id,
            concurrency: job.config.concurrency ?? "skip",
            catchup: job.config.catchup ?? false,
            retryAttempts: job.config.retry?.attempts ?? 1,
            retryBackoff: job.config.retry?.backoff ?? "linear",
            retryInitialDelay: job.config.retry?.initialDelay ?? "1s",
            timeout: job.config.timeout ?? "30s",
          });

          jobIdByKey.set(job.id, createdJob.id);
          console.log(pc.green(`  ✓ job ${createdJob.key}`));
        }

        for (const job of plan.createSchedules) {
          const remoteJobId = jobIdByKey.get(job.id);
          if (!remoteJobId) {
            throw new Error(`Missing remote job mapping for ${job.id}`);
          }

          await createSchedule(context, {
            jobId: remoteJobId,
            cron: job.schedule.cron,
            timezone: job.schedule.timezone ?? "UTC",
            active: true,
          });

          console.log(pc.green(`  ✓ schedule ${job.id}`));
        }

        console.log();
        console.log(pc.green("Cloud push completed."));
        console.log();
      })
    );
}

export const cloudCommand = createCloudCommand();
