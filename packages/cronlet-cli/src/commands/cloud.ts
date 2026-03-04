import { createHash } from "node:crypto";
import { Command } from "commander";
import { discoverJobs, type JobDefinition } from "cronlet";
import pc from "picocolors";
import type {
  EndpointRecord,
  JobRecord,
  ProjectRecord,
  ScheduleRecord,
} from "@cronlet/cloud-shared";
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
  patchEndpoint,
  patchJob,
  patchSchedule,
} from "../cloud/api.js";

interface DesiredEndpoint {
  projectId: string;
  environment: string;
  name: string;
  url: string;
  authMode: "none";
  timeoutMs: number;
}

interface DesiredJob {
  key: string;
  name: string;
  cron: string;
  timezone: string;
  concurrency: "allow" | "skip" | "queue";
  catchup: boolean;
  retryAttempts: number;
  retryBackoff: "linear" | "exponential";
  retryInitialDelay: string;
  timeout: string;
}

interface EndpointPlan {
  mode: "none" | "create" | "update";
  create?: DesiredEndpoint;
  patch?: {
    endpointId: string;
    payload: {
      url?: string;
      authMode?: "none" | "bearer" | "basic" | "header";
      timeoutMs?: number;
    };
    changes: string[];
  };
}

interface JobCreateOp {
  key: string;
  payload: {
    projectId: string;
    environment: string;
    endpointId: string;
    name: string;
    key: string;
    concurrency: "allow" | "skip" | "queue";
    catchup: boolean;
    retryAttempts: number;
    retryBackoff: "linear" | "exponential";
    retryInitialDelay: string;
    timeout: string;
  };
}

interface JobUpdateOp {
  jobId: string;
  key: string;
  payload: {
    name?: string;
    concurrency?: "allow" | "skip" | "queue";
    catchup?: boolean;
    retryAttempts?: number;
    retryBackoff?: "linear" | "exponential";
    retryInitialDelay?: string;
    timeout?: string;
    active?: boolean;
  };
  changes: string[];
}

interface JobPauseOp {
  jobId: string;
  key: string;
}

interface ScheduleCreateOp {
  jobKey: string;
  payload: {
    cron: string;
    timezone: string;
    active: boolean;
  };
}

interface ScheduleUpdateOp {
  scheduleId: string;
  jobKey: string;
  payload: {
    cron?: string;
    timezone?: string;
    active?: boolean;
  };
  changes: string[];
}

interface SchedulePauseOp {
  scheduleId: string;
  jobKey: string;
}

interface PushPlan {
  endpoint: EndpointPlan;
  createJobs: JobCreateOp[];
  updateJobs: JobUpdateOp[];
  pauseJobs: JobPauseOp[];
  createSchedules: ScheduleCreateOp[];
  updateSchedules: ScheduleUpdateOp[];
  pauseSchedules: SchedulePauseOp[];
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

function toDesiredEndpoint(link: CloudLinkConfig): DesiredEndpoint {
  return {
    projectId: link.projectId,
    environment: link.environment,
    name: `default-${link.environment}`,
    url: link.endpointUrl,
    authMode: "none",
    timeoutMs: 30000,
  };
}

function toDesiredJob(job: JobDefinition): DesiredJob {
  return {
    key: job.id,
    name: job.name,
    cron: job.schedule.cron,
    timezone: job.schedule.timezone ?? "UTC",
    concurrency: job.config.concurrency ?? "skip",
    catchup: job.config.catchup ?? false,
    retryAttempts: job.config.retry?.attempts ?? 1,
    retryBackoff: job.config.retry?.backoff ?? "linear",
    retryInitialDelay: job.config.retry?.initialDelay ?? "1s",
    timeout: job.config.timeout ?? "30s",
  };
}

function diffEndpoint(remote: EndpointRecord, desired: DesiredEndpoint): EndpointPlan {
  const payload: {
    url?: string;
    authMode?: "none" | "bearer" | "basic" | "header";
    timeoutMs?: number;
  } = {};
  const changes: string[] = [];

  if (remote.url !== desired.url) {
    payload.url = desired.url;
    changes.push("url");
  }

  if (remote.authMode !== desired.authMode) {
    payload.authMode = desired.authMode;
    changes.push("authMode");
  }

  if (remote.timeoutMs !== desired.timeoutMs) {
    payload.timeoutMs = desired.timeoutMs;
    changes.push("timeoutMs");
  }

  if (changes.length === 0) {
    return { mode: "none" };
  }

  return {
    mode: "update",
    patch: {
      endpointId: remote.id,
      payload,
      changes,
    },
  };
}

function diffJob(remote: JobRecord, desired: DesiredJob): JobUpdateOp | null {
  const payload: JobUpdateOp["payload"] = {};
  const changes: string[] = [];

  if (remote.name !== desired.name) {
    payload.name = desired.name;
    changes.push("name");
  }
  if (remote.concurrency !== desired.concurrency) {
    payload.concurrency = desired.concurrency;
    changes.push("concurrency");
  }
  if (remote.catchup !== desired.catchup) {
    payload.catchup = desired.catchup;
    changes.push("catchup");
  }
  if (remote.retryAttempts !== desired.retryAttempts) {
    payload.retryAttempts = desired.retryAttempts;
    changes.push("retryAttempts");
  }
  if (remote.retryBackoff !== desired.retryBackoff) {
    payload.retryBackoff = desired.retryBackoff;
    changes.push("retryBackoff");
  }
  if (remote.retryInitialDelay !== desired.retryInitialDelay) {
    payload.retryInitialDelay = desired.retryInitialDelay;
    changes.push("retryInitialDelay");
  }
  if (remote.timeout !== desired.timeout) {
    payload.timeout = desired.timeout;
    changes.push("timeout");
  }
  if (!remote.active) {
    payload.active = true;
    changes.push("active");
  }

  if (changes.length === 0) {
    return null;
  }

  return {
    jobId: remote.id,
    key: remote.key,
    payload,
    changes,
  };
}

function selectPrimarySchedule(schedules: ScheduleRecord[]): ScheduleRecord {
  const sorted = [...schedules].sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });

  const primary = sorted[0];
  if (!primary) {
    throw new Error("Expected at least one schedule");
  }

  return primary;
}

function diffSchedule(schedule: ScheduleRecord, desired: DesiredJob): ScheduleUpdateOp | null {
  const payload: ScheduleUpdateOp["payload"] = {};
  const changes: string[] = [];

  if (schedule.cron !== desired.cron) {
    payload.cron = desired.cron;
    changes.push("cron");
  }

  if (schedule.timezone !== desired.timezone) {
    payload.timezone = desired.timezone;
    changes.push("timezone");
  }

  if (!schedule.active) {
    payload.active = true;
    changes.push("active");
  }

  if (changes.length === 0) {
    return null;
  }

  return {
    scheduleId: schedule.id,
    jobKey: desired.key,
    payload,
    changes,
  };
}

function dedupeSchedulePauses(operations: SchedulePauseOp[]): SchedulePauseOp[] {
  const seen = new Set<string>();
  return operations.filter((operation) => {
    if (seen.has(operation.scheduleId)) {
      return false;
    }
    seen.add(operation.scheduleId);
    return true;
  });
}

export function toPlan(
  localJobs: JobDefinition[],
  remoteJobs: JobRecord[],
  remoteSchedules: ScheduleRecord[],
  endpoint: EndpointRecord | undefined,
  link: CloudLinkConfig
): PushPlan {
  const desiredEndpoint = toDesiredEndpoint(link);
  const desiredJobs = localJobs.map(toDesiredJob).sort((a, b) => a.key.localeCompare(b.key));
  const desiredByKey = new Map(desiredJobs.map((job) => [job.key, job]));

  const scopedRemoteJobs = remoteJobs
    .filter((job) => job.projectId === link.projectId && job.environment === link.environment)
    .sort((a, b) => a.key.localeCompare(b.key));
  const remoteJobByKey = new Map(scopedRemoteJobs.map((job) => [job.key, job]));
  const remoteJobKeyById = new Map(scopedRemoteJobs.map((job) => [job.id, job.key]));

  const scopedSchedules = remoteSchedules
    .filter((schedule) => remoteJobKeyById.has(schedule.jobId))
    .sort((a, b) => a.id.localeCompare(b.id));

  const schedulesByJobKey = new Map<string, ScheduleRecord[]>();
  for (const schedule of scopedSchedules) {
    const jobKey = remoteJobKeyById.get(schedule.jobId);
    if (!jobKey) {
      continue;
    }
    const existing = schedulesByJobKey.get(jobKey) ?? [];
    existing.push(schedule);
    schedulesByJobKey.set(jobKey, existing);
  }

  const createJobs: JobCreateOp[] = [];
  const updateJobs: JobUpdateOp[] = [];
  const pauseJobs: JobPauseOp[] = [];
  const createSchedules: ScheduleCreateOp[] = [];
  const updateSchedules: ScheduleUpdateOp[] = [];
  const pauseSchedules: SchedulePauseOp[] = [];

  for (const desired of desiredJobs) {
    const remoteJob = remoteJobByKey.get(desired.key);

    if (!remoteJob) {
      createJobs.push({
        key: desired.key,
        payload: {
          projectId: link.projectId,
          environment: link.environment,
          endpointId: endpoint?.id ?? "",
          name: desired.name,
          key: desired.key,
          concurrency: desired.concurrency,
          catchup: desired.catchup,
          retryAttempts: desired.retryAttempts,
          retryBackoff: desired.retryBackoff,
          retryInitialDelay: desired.retryInitialDelay,
          timeout: desired.timeout,
        },
      });
      createSchedules.push({
        jobKey: desired.key,
        payload: {
          cron: desired.cron,
          timezone: desired.timezone,
          active: true,
        },
      });
      continue;
    }

    const jobUpdate = diffJob(remoteJob, desired);
    if (jobUpdate) {
      updateJobs.push(jobUpdate);
    }

    const schedules = schedulesByJobKey.get(desired.key) ?? [];
    if (schedules.length === 0) {
      createSchedules.push({
        jobKey: desired.key,
        payload: {
          cron: desired.cron,
          timezone: desired.timezone,
          active: true,
        },
      });
      continue;
    }

    const primary = selectPrimarySchedule(schedules);
    const scheduleUpdate = diffSchedule(primary, desired);
    if (scheduleUpdate) {
      updateSchedules.push(scheduleUpdate);
    }

    for (const schedule of schedules) {
      if (schedule.id === primary.id) {
        continue;
      }
      if (!schedule.active) {
        continue;
      }
      pauseSchedules.push({
        scheduleId: schedule.id,
        jobKey: desired.key,
      });
    }
  }

  for (const remoteJob of scopedRemoteJobs) {
    if (desiredByKey.has(remoteJob.key)) {
      continue;
    }

    if (remoteJob.active) {
      pauseJobs.push({
        jobId: remoteJob.id,
        key: remoteJob.key,
      });
    }

    const schedules = schedulesByJobKey.get(remoteJob.key) ?? [];
    for (const schedule of schedules) {
      if (!schedule.active) {
        continue;
      }
      pauseSchedules.push({
        scheduleId: schedule.id,
        jobKey: remoteJob.key,
      });
    }
  }

  const endpointPlan: EndpointPlan = !endpoint
    ? {
      mode: "create",
      create: desiredEndpoint,
    }
    : diffEndpoint(endpoint, desiredEndpoint);

  const sortedPlan: PushPlan = {
    endpoint: endpointPlan,
    createJobs: createJobs.sort((a, b) => a.key.localeCompare(b.key)),
    updateJobs: updateJobs.sort((a, b) => a.key.localeCompare(b.key)),
    pauseJobs: pauseJobs.sort((a, b) => a.key.localeCompare(b.key)),
    createSchedules: createSchedules.sort((a, b) => a.jobKey.localeCompare(b.jobKey)),
    updateSchedules: updateSchedules.sort((a, b) => {
      const byKey = a.jobKey.localeCompare(b.jobKey);
      return byKey !== 0 ? byKey : a.scheduleId.localeCompare(b.scheduleId);
    }),
    pauseSchedules: dedupeSchedulePauses(pauseSchedules).sort((a, b) => {
      const byKey = a.jobKey.localeCompare(b.jobKey);
      return byKey !== 0 ? byKey : a.scheduleId.localeCompare(b.scheduleId);
    }),
  };

  return sortedPlan;
}

function makeIdempotencyKey(link: CloudLinkConfig, operation: string, payload: unknown): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 24);
  return `cronlet:${link.projectId}:${operation}:${digest}`;
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

        const scopedRemoteJobs = remoteJobs.filter(
          (job) => job.projectId === link.projectId && job.environment === link.environment
        );

        const plan = toPlan(localJobs, remoteJobs, remoteSchedules, endpoint, link);

        console.log();
        console.log(pc.bold("Cronlet Cloud Push Plan"));
        console.log(pc.dim(`  local jobs discovered: ${localJobs.length}`));
        console.log(pc.dim(`  remote jobs scoped: ${scopedRemoteJobs.length}`));
        console.log(pc.dim(`  endpoint create: ${plan.endpoint.mode === "create" ? "yes" : "no"}`));
        console.log(pc.dim(`  endpoint update: ${plan.endpoint.mode === "update" ? "yes" : "no"}`));
        console.log(pc.dim(`  create jobs: ${plan.createJobs.length}`));
        console.log(pc.dim(`  update jobs: ${plan.updateJobs.length}`));
        console.log(pc.dim(`  pause jobs: ${plan.pauseJobs.length}`));
        console.log(pc.dim(`  create schedules: ${plan.createSchedules.length}`));
        console.log(pc.dim(`  update schedules: ${plan.updateSchedules.length}`));
        console.log(pc.dim(`  pause schedules: ${plan.pauseSchedules.length}`));
        console.log();

        if (options.dryRun) {
          if (plan.endpoint.mode === "create") {
            console.log(pc.cyan("  + endpoint default"));
          }
          if (plan.endpoint.mode === "update" && plan.endpoint.patch) {
            console.log(pc.cyan(`  ~ endpoint ${plan.endpoint.patch.endpointId} [${plan.endpoint.patch.changes.join(", ")}]`));
          }
          for (const operation of plan.createJobs) {
            console.log(pc.cyan(`  + job ${operation.key}`));
          }
          for (const operation of plan.updateJobs) {
            console.log(pc.cyan(`  ~ job ${operation.key} [${operation.changes.join(", ")}]`));
          }
          for (const operation of plan.pauseJobs) {
            console.log(pc.cyan(`  - job ${operation.key}`));
          }
          for (const operation of plan.createSchedules) {
            console.log(pc.cyan(`  + schedule ${operation.jobKey} (${operation.payload.cron})`));
          }
          for (const operation of plan.updateSchedules) {
            console.log(pc.cyan(`  ~ schedule ${operation.jobKey} [${operation.changes.join(", ")}]`));
          }
          for (const operation of plan.pauseSchedules) {
            console.log(pc.cyan(`  - schedule ${operation.jobKey}`));
          }
          console.log();
          console.log(pc.green("Dry run complete."));
          console.log();
          return;
        }

        let endpointId = endpoint?.id;
        let phase = "prepare";

        try {
          phase = "endpoint";
          if (plan.endpoint.mode === "create" && plan.endpoint.create) {
            const createdEndpoint = await createEndpoint(
              context,
              plan.endpoint.create,
              { idempotencyKey: makeIdempotencyKey(link, "endpoint:create", plan.endpoint.create) }
            );
            endpointId = createdEndpoint.id;
            console.log(pc.green(`  ✓ endpoint ${createdEndpoint.name}`));
          } else if (plan.endpoint.mode === "update" && plan.endpoint.patch) {
            await patchEndpoint(
              context,
              plan.endpoint.patch.endpointId,
              plan.endpoint.patch.payload,
              {
                idempotencyKey: makeIdempotencyKey(
                  link,
                  `endpoint:update:${plan.endpoint.patch.endpointId}`,
                  plan.endpoint.patch.payload
                ),
              }
            );
            endpointId = plan.endpoint.patch.endpointId;
            console.log(pc.green(`  ✓ endpoint ${plan.endpoint.patch.endpointId}`));
          }

          if (!endpointId) {
            throw new Error("No endpoint available after plan apply.");
          }

          const jobIdByKey = new Map(scopedRemoteJobs.map((job) => [job.key, job.id]));

          phase = "jobs-upsert";
          for (const operation of plan.createJobs) {
            const createdJob = await createJob(
              context,
              {
                ...operation.payload,
                endpointId,
              },
              {
                idempotencyKey: makeIdempotencyKey(link, `job:create:${operation.key}`, operation.payload),
              }
            );

            jobIdByKey.set(operation.key, createdJob.id);
            console.log(pc.green(`  ✓ job ${createdJob.key}`));
          }

          for (const operation of plan.updateJobs) {
            await patchJob(
              context,
              operation.jobId,
              operation.payload,
              {
                idempotencyKey: makeIdempotencyKey(link, `job:update:${operation.jobId}`, operation.payload),
              }
            );
            console.log(pc.green(`  ✓ job ${operation.key}`));
          }

          phase = "schedules-upsert";
          for (const operation of plan.createSchedules) {
            const remoteJobId = jobIdByKey.get(operation.jobKey);
            if (!remoteJobId) {
              throw new Error(`Missing remote job mapping for ${operation.jobKey}`);
            }

            await createSchedule(
              context,
              {
                jobId: remoteJobId,
                cron: operation.payload.cron,
                timezone: operation.payload.timezone,
                active: operation.payload.active,
              },
              {
                idempotencyKey: makeIdempotencyKey(link, `schedule:create:${operation.jobKey}`, operation.payload),
              }
            );

            console.log(pc.green(`  ✓ schedule ${operation.jobKey}`));
          }

          for (const operation of plan.updateSchedules) {
            await patchSchedule(
              context,
              operation.scheduleId,
              operation.payload,
              {
                idempotencyKey: makeIdempotencyKey(link, `schedule:update:${operation.scheduleId}`, operation.payload),
              }
            );
            console.log(pc.green(`  ✓ schedule ${operation.jobKey}`));
          }

          phase = "schedules-pause";
          for (const operation of plan.pauseSchedules) {
            await patchSchedule(
              context,
              operation.scheduleId,
              { active: false },
              {
                idempotencyKey: makeIdempotencyKey(link, `schedule:pause:${operation.scheduleId}`, { active: false }),
              }
            );
            console.log(pc.green(`  ✓ paused schedule ${operation.jobKey}`));
          }

          phase = "jobs-pause";
          for (const operation of plan.pauseJobs) {
            await patchJob(
              context,
              operation.jobId,
              { active: false },
              {
                idempotencyKey: makeIdempotencyKey(link, `job:pause:${operation.jobId}`, { active: false }),
              }
            );
            console.log(pc.green(`  ✓ paused job ${operation.key}`));
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(`Cloud push failed during ${phase}. Safe to re-run: ${reason}`);
        }

        console.log();
        console.log(pc.green("Cloud push completed."));
        console.log();
      })
    );
}

export const cloudCommand = createCloudCommand();
