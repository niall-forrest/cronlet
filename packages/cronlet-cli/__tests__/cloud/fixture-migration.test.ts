import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EndpointRecord, JobRecord, ScheduleRecord } from "@cronlet/cloud-shared";
import { discoverJobs } from "cronlet";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudLinkConfig } from "../../src/cloud/config.js";

interface ApiStateMachine {
  endpoints: EndpointRecord[];
  jobs: JobRecord[];
  schedules: ScheduleRecord[];
  operations: string[];
  endpointCounter: number;
  jobCounter: number;
  scheduleCounter: number;
}

const apiState = vi.hoisted<ApiStateMachine>(() => ({
  endpoints: [],
  jobs: [],
  schedules: [],
  operations: [],
  endpointCounter: 1,
  jobCounter: 1,
  scheduleCounter: 1,
}));

const mocks = vi.hoisted(() => ({
  mockLoadCloudAuth: vi.fn(),
  mockLoadCloudLink: vi.fn(),
  mockLoadConfig: vi.fn(),
  mockResolveJobsDirectory: vi.fn(),
  mockListEndpoints: vi.fn(),
  mockListJobs: vi.fn(),
  mockListSchedules: vi.fn(),
  mockCreateEndpoint: vi.fn(),
  mockCreateJob: vi.fn(),
  mockCreateSchedule: vi.fn(),
  mockPatchEndpoint: vi.fn(),
  mockPatchJob: vi.fn(),
  mockPatchSchedule: vi.fn(),
}));

vi.mock("../../src/cloud/config.js", () => ({
  loadCloudAuth: mocks.mockLoadCloudAuth,
  loadCloudLink: mocks.mockLoadCloudLink,
  saveCloudAuth: vi.fn(),
  saveCloudLink: vi.fn(),
}));

vi.mock("../../src/config/index.js", () => ({
  loadConfig: mocks.mockLoadConfig,
  resolveJobsDirectory: mocks.mockResolveJobsDirectory,
}));

vi.mock("../../src/cloud/api.js", () => ({
  healthcheck: vi.fn(async () => true),
  listProjects: vi.fn(),
  listUsage: vi.fn(),
  listEndpoints: mocks.mockListEndpoints,
  listJobs: mocks.mockListJobs,
  listSchedules: mocks.mockListSchedules,
  createEndpoint: mocks.mockCreateEndpoint,
  createJob: mocks.mockCreateJob,
  createSchedule: mocks.mockCreateSchedule,
  patchEndpoint: mocks.mockPatchEndpoint,
  patchJob: mocks.mockPatchJob,
  patchSchedule: mocks.mockPatchSchedule,
}));

import { createCloudCommand, toPlan } from "../../src/commands/cloud.js";

const testFile = fileURLToPath(import.meta.url);
const testDir = path.dirname(testFile);
const packageRoot = path.resolve(testDir, "..", "..");

function resetApiState(): void {
  apiState.endpoints = [];
  apiState.jobs = [];
  apiState.schedules = [];
  apiState.operations = [];
  apiState.endpointCounter = 1;
  apiState.jobCounter = 1;
  apiState.scheduleCounter = 1;
}

async function runPushCommand(args: string[] = []): Promise<void> {
  const cloudCommand = createCloudCommand();
  await cloudCommand.parseAsync(["node", "cloud", "push", ...args], { from: "node" });
}

function setFixtureJobsDir(relativeToPackageRoot: string): void {
  const absolute = path.join(packageRoot, relativeToPackageRoot);
  const forCurrentCwd = path.relative(process.cwd(), absolute);
  mocks.mockResolveJobsDirectory.mockReturnValue(forCurrentCwd);
}

function configureApiStateMachine(): void {
  mocks.mockListEndpoints.mockImplementation(async () => [...apiState.endpoints]);
  mocks.mockListJobs.mockImplementation(async () => [...apiState.jobs]);
  mocks.mockListSchedules.mockImplementation(async () => [...apiState.schedules]);

  mocks.mockCreateEndpoint.mockImplementation(async (_context, payload) => {
    const created: EndpointRecord = {
      id: `endpoint_${apiState.endpointCounter++}`,
      orgId: "org_test",
      projectId: payload.projectId,
      environment: payload.environment,
      name: payload.name,
      url: payload.url,
      authMode: payload.authMode,
      authSecretRef: null,
      timeoutMs: payload.timeoutMs,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    apiState.endpoints.push(created);
    apiState.operations.push(`create:endpoint:${created.name}`);
    return created;
  });

  mocks.mockPatchEndpoint.mockImplementation(async (_context, endpointId, patch) => {
    const existing = apiState.endpoints.find((endpoint) => endpoint.id === endpointId);
    if (!existing) {
      throw new Error(`Endpoint not found: ${endpointId}`);
    }
    const updated: EndpointRecord = {
      ...existing,
      ...patch,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    apiState.endpoints = apiState.endpoints.map((endpoint) => (endpoint.id === endpointId ? updated : endpoint));
    apiState.operations.push(`patch:endpoint:${endpointId}`);
    return updated;
  });

  mocks.mockCreateJob.mockImplementation(async (_context, payload) => {
    const created: JobRecord = {
      id: `job_${apiState.jobCounter++}`,
      orgId: "org_test",
      projectId: payload.projectId,
      environment: payload.environment,
      endpointId: payload.endpointId,
      name: payload.name,
      key: payload.key,
      concurrency: payload.concurrency,
      catchup: payload.catchup,
      retryAttempts: payload.retryAttempts,
      retryBackoff: payload.retryBackoff,
      retryInitialDelay: payload.retryInitialDelay,
      timeout: payload.timeout,
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    apiState.jobs.push(created);
    apiState.operations.push(`create:job:${created.key}`);
    return created;
  });

  mocks.mockPatchJob.mockImplementation(async (_context, jobId, patch) => {
    const existing = apiState.jobs.find((job) => job.id === jobId);
    if (!existing) {
      throw new Error(`Job not found: ${jobId}`);
    }
    const updated: JobRecord = {
      ...existing,
      ...patch,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    apiState.jobs = apiState.jobs.map((job) => (job.id === jobId ? updated : job));
    apiState.operations.push(`patch:job:${existing.key}`);
    return updated;
  });

  mocks.mockCreateSchedule.mockImplementation(async (_context, payload) => {
    const created: ScheduleRecord = {
      id: `schedule_${apiState.scheduleCounter++}`,
      orgId: "org_test",
      projectId: "proj_test",
      jobId: payload.jobId,
      cron: payload.cron,
      timezone: payload.timezone,
      active: payload.active,
      nextRunAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    apiState.schedules.push(created);
    apiState.operations.push(`create:schedule:${payload.jobId}`);
    return created;
  });

  mocks.mockPatchSchedule.mockImplementation(async (_context, scheduleId, patch) => {
    const existing = apiState.schedules.find((schedule) => schedule.id === scheduleId);
    if (!existing) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }
    const updated: ScheduleRecord = {
      ...existing,
      ...patch,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    apiState.schedules = apiState.schedules.map((schedule) => (schedule.id === scheduleId ? updated : schedule));
    apiState.operations.push(`patch:schedule:${scheduleId}`);
    return updated;
  });
}

function createLink(endpointUrl: string): CloudLinkConfig {
  return {
    orgId: "org_test",
    projectId: "proj_test",
    environment: "prod",
    endpointUrl,
    linkedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("cloud push fixture migrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetApiState();
    configureApiStateMachine();

    mocks.mockLoadCloudAuth.mockReturnValue({
      apiUrl: "http://127.0.0.1:4050",
      apiKey: "test-key",
    });
    mocks.mockLoadConfig.mockResolvedValue({
      config: { jobsDir: "jobs" },
      warnings: [],
    });
  });

  it("migrates fixture project A and re-run is zero drift", async () => {
    const link = createLink("https://fixtures.example.com/a");
    mocks.mockLoadCloudLink.mockReturnValue(link);
    setFixtureJobsDir("__tests__/fixtures/cloud-project-a/jobs");

    await runPushCommand();

    expect(apiState.endpoints).toHaveLength(1);
    expect(apiState.jobs.map((job) => job.key).sort()).toEqual([
      "billing/sync-stripe",
      "digest-job",
      "reports/daily-summary",
    ]);

    const byKey = new Map(apiState.jobs.map((job) => [job.key, job]));
    expect(byKey.get("reports/daily-summary")).toMatchObject({
      concurrency: "skip",
      catchup: true,
      retryAttempts: 2,
      retryBackoff: "exponential",
      retryInitialDelay: "15s",
      timeout: "2m",
    });
    expect(byKey.get("billing/sync-stripe")).toMatchObject({
      concurrency: "queue",
      catchup: false,
      retryAttempts: 1,
      retryBackoff: "linear",
      retryInitialDelay: "1s",
      timeout: "5m",
    });
    expect(byKey.get("digest-job")).toMatchObject({
      concurrency: "skip",
      catchup: false,
      retryAttempts: 3,
      retryBackoff: "linear",
      retryInitialDelay: "20s",
      timeout: "45s",
    });

    const scheduleByJobKey = new Map(
      apiState.schedules.map((schedule) => {
        const job = apiState.jobs.find((value) => value.id === schedule.jobId);
        return [job?.key ?? "unknown", schedule];
      })
    );
    expect(scheduleByJobKey.get("reports/daily-summary")).toMatchObject({
      cron: "0 9 * * *",
      timezone: "America/New_York",
      active: true,
    });
    expect(scheduleByJobKey.get("billing/sync-stripe")).toMatchObject({
      cron: "0 18 * * 5L",
      timezone: "UTC",
      active: true,
    });
    expect(scheduleByJobKey.get("digest-job")).toMatchObject({
      cron: "30 17 * * 1,5",
      timezone: "UTC",
      active: true,
    });

    const opsAfterFirstRun = apiState.operations.length;
    await runPushCommand();
    expect(apiState.operations).toHaveLength(opsAfterFirstRun);

    const fixtureJobs = await discoverJobs({
      directory: path.relative(process.cwd(), path.join(packageRoot, "__tests__/fixtures/cloud-project-a/jobs")),
    });
    const endpoint = apiState.endpoints.find((value) => value.name === "default-prod");
    const plan = toPlan(fixtureJobs, apiState.jobs, apiState.schedules, endpoint, link);
    expect(plan.endpoint.mode).toBe("none");
    expect(plan.createJobs).toHaveLength(0);
    expect(plan.updateJobs).toHaveLength(0);
    expect(plan.pauseJobs).toHaveLength(0);
    expect(plan.createSchedules).toHaveLength(0);
    expect(plan.updateSchedules).toHaveLength(0);
    expect(plan.pauseSchedules).toHaveLength(0);
  });

  it("migrates fixture project B and re-run is zero drift", async () => {
    const link = createLink("https://fixtures.example.com/b");
    mocks.mockLoadCloudLink.mockReturnValue(link);
    setFixtureJobsDir("__tests__/fixtures/cloud-project-b/src/jobs");

    await runPushCommand();

    expect(apiState.jobs.map((job) => job.key).sort()).toEqual([
      "cleanup-weekly",
      "ops/heartbeat",
    ]);

    const byKey = new Map(apiState.jobs.map((job) => [job.key, job]));
    expect(byKey.get("cleanup-weekly")).toMatchObject({
      concurrency: "allow",
      catchup: false,
      retryAttempts: 4,
      retryBackoff: "linear",
      retryInitialDelay: "30s",
      timeout: "10m",
    });
    expect(byKey.get("ops/heartbeat")).toMatchObject({
      concurrency: "skip",
      catchup: false,
      retryAttempts: 1,
      retryBackoff: "linear",
      retryInitialDelay: "1s",
      timeout: "30s",
    });

    const scheduleByJobKey = new Map(
      apiState.schedules.map((schedule) => {
        const job = apiState.jobs.find((value) => value.id === schedule.jobId);
        return [job?.key ?? "unknown", schedule];
      })
    );
    expect(scheduleByJobKey.get("cleanup-weekly")).toMatchObject({
      cron: "15 2 * * 0",
      timezone: "Europe/London",
      active: true,
    });
    expect(scheduleByJobKey.get("ops/heartbeat")).toMatchObject({
      cron: "0 0 * * *",
      timezone: "UTC",
      active: true,
    });

    const opsAfterFirstRun = apiState.operations.length;
    await runPushCommand();
    expect(apiState.operations).toHaveLength(opsAfterFirstRun);

    const fixtureJobs = await discoverJobs({
      directory: path.relative(process.cwd(), path.join(packageRoot, "__tests__/fixtures/cloud-project-b/src/jobs")),
    });
    const endpoint = apiState.endpoints.find((value) => value.name === "default-prod");
    const plan = toPlan(fixtureJobs, apiState.jobs, apiState.schedules, endpoint, link);
    expect(plan.endpoint.mode).toBe("none");
    expect(plan.createJobs).toHaveLength(0);
    expect(plan.updateJobs).toHaveLength(0);
    expect(plan.pauseJobs).toHaveLength(0);
    expect(plan.createSchedules).toHaveLength(0);
    expect(plan.updateSchedules).toHaveLength(0);
    expect(plan.pauseSchedules).toHaveLength(0);
  });
});
