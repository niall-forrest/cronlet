import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobDefinition } from "cronlet";

const mocks = vi.hoisted(() => ({
  mockLoadCloudAuth: vi.fn(),
  mockLoadCloudLink: vi.fn(),
  mockLoadConfig: vi.fn(),
  mockResolveJobsDirectory: vi.fn(),
  mockDiscoverJobs: vi.fn(),
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

vi.mock("cronlet", () => ({
  discoverJobs: mocks.mockDiscoverJobs,
}));

vi.mock("../../src/cloud/api.js", () => ({
  healthcheck: vi.fn(),
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

import { createCloudCommand } from "../../src/commands/cloud.js";

function createJob(id: string): JobDefinition {
  return {
    id,
    name: id,
    schedule: {
      type: "interval",
      cron: "*/5 * * * *",
      humanReadable: "every 5 minutes",
      originalParams: {},
    },
    config: {},
    handler: async () => {},
  };
}

async function runPushCommand(args: string[]): Promise<void> {
  const cloudCommand = createCloudCommand();
  await cloudCommand.parseAsync(["node", "cloud", "push", ...args], { from: "node" });
}

describe("cronlet cloud push command", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.mockLoadCloudAuth.mockReturnValue({
      apiUrl: "http://127.0.0.1:4050",
      apiKey: "test-key",
    });
    mocks.mockLoadCloudLink.mockReturnValue({
      orgId: "org_test",
      projectId: "proj_test",
      environment: "prod",
      endpointUrl: "https://example.com/cron",
      linkedAt: new Date().toISOString(),
    });
    mocks.mockLoadConfig.mockResolvedValue({
      config: { jobsDir: "src/jobs" },
      warnings: [],
    });
    mocks.mockResolveJobsDirectory.mockReturnValue("/tmp/jobs");
    mocks.mockListEndpoints.mockResolvedValue([
      {
        id: "endpoint_1",
        orgId: "org_test",
        projectId: "proj_test",
        environment: "prod",
        name: "default-prod",
        url: "https://example.com/cron",
        authMode: "none",
        authSecretRef: null,
        timeoutMs: 30000,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("does not create jobs/schedules again when remote is already in sync", async () => {
    mocks.mockDiscoverJobs.mockResolvedValue([createJob("a-job"), createJob("b-job")]);
    mocks.mockListJobs.mockResolvedValue([
      {
        id: "remote_job_a",
        orgId: "org_test",
        projectId: "proj_test",
        environment: "prod",
        endpointId: "endpoint_1",
        name: "a-job",
        key: "a-job",
        concurrency: "skip",
        catchup: false,
        retryAttempts: 1,
        retryBackoff: "linear",
        retryInitialDelay: "1s",
        timeout: "30s",
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "remote_job_b",
        orgId: "org_test",
        projectId: "proj_test",
        environment: "prod",
        endpointId: "endpoint_1",
        name: "b-job",
        key: "b-job",
        concurrency: "skip",
        catchup: false,
        retryAttempts: 1,
        retryBackoff: "linear",
        retryInitialDelay: "1s",
        timeout: "30s",
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    mocks.mockListSchedules.mockResolvedValue([
      {
        id: "sched_a",
        orgId: "org_test",
        projectId: "proj_test",
        jobId: "remote_job_a",
        cron: "*/5 * * * *",
        timezone: "UTC",
        active: true,
        nextRunAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "sched_b",
        orgId: "org_test",
        projectId: "proj_test",
        jobId: "remote_job_b",
        cron: "*/5 * * * *",
        timezone: "UTC",
        active: true,
        nextRunAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    await runPushCommand([]);

    expect(mocks.mockCreateEndpoint).not.toHaveBeenCalled();
    expect(mocks.mockCreateJob).not.toHaveBeenCalled();
    expect(mocks.mockCreateSchedule).not.toHaveBeenCalled();
    expect(mocks.mockPatchEndpoint).not.toHaveBeenCalled();
    expect(mocks.mockPatchJob).not.toHaveBeenCalled();
    expect(mocks.mockPatchSchedule).not.toHaveBeenCalled();
  });

  it("prints dry-run jobs in deterministic ID order", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    mocks.mockDiscoverJobs.mockResolvedValue([createJob("z-job"), createJob("a-job")]);
    mocks.mockListJobs.mockResolvedValue([]);
    mocks.mockListSchedules.mockResolvedValue([]);

    await runPushCommand(["--dry-run"]);

    const lines = logSpy.mock.calls.map((call) => String(call[0] ?? ""));
    const jobLines = lines.filter((line) => line.includes("+ job "));
    expect(jobLines).toEqual([
      expect.stringContaining("+ job a-job"),
      expect.stringContaining("+ job z-job"),
    ]);

    logSpy.mockRestore();
  });

  it("applies update and pause operations when remote drift is detected", async () => {
    mocks.mockDiscoverJobs.mockResolvedValue([createJob("a-job")]);
    mocks.mockListEndpoints.mockResolvedValue([
      {
        id: "endpoint_1",
        orgId: "org_test",
        projectId: "proj_test",
        environment: "prod",
        name: "default-prod",
        url: "https://old.example.com/cron",
        authMode: "none",
        authSecretRef: null,
        timeoutMs: 30000,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    mocks.mockListJobs.mockResolvedValue([
      {
        id: "remote_job_a",
        orgId: "org_test",
        projectId: "proj_test",
        environment: "prod",
        endpointId: "endpoint_1",
        name: "legacy-a",
        key: "a-job",
        concurrency: "allow",
        catchup: false,
        retryAttempts: 1,
        retryBackoff: "linear",
        retryInitialDelay: "1s",
        timeout: "30s",
        active: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "remote_job_b",
        orgId: "org_test",
        projectId: "proj_test",
        environment: "prod",
        endpointId: "endpoint_1",
        name: "legacy-b",
        key: "b-job",
        concurrency: "skip",
        catchup: false,
        retryAttempts: 1,
        retryBackoff: "linear",
        retryInitialDelay: "1s",
        timeout: "30s",
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    mocks.mockListSchedules.mockResolvedValue([
      {
        id: "sched_a",
        orgId: "org_test",
        projectId: "proj_test",
        jobId: "remote_job_a",
        cron: "0 * * * *",
        timezone: "UTC",
        active: true,
        nextRunAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "sched_b",
        orgId: "org_test",
        projectId: "proj_test",
        jobId: "remote_job_b",
        cron: "*/5 * * * *",
        timezone: "UTC",
        active: true,
        nextRunAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    await runPushCommand([]);

    expect(mocks.mockPatchEndpoint).toHaveBeenCalledTimes(1);
    expect(mocks.mockPatchJob).toHaveBeenCalled();
    expect(mocks.mockPatchSchedule).toHaveBeenCalled();
    expect(mocks.mockCreateJob).not.toHaveBeenCalled();
    expect(mocks.mockCreateSchedule).not.toHaveBeenCalled();
  });

  it("sends idempotency keys for create mutations", async () => {
    mocks.mockDiscoverJobs.mockResolvedValue([createJob("a-job")]);
    mocks.mockListEndpoints.mockResolvedValue([]);
    mocks.mockListJobs.mockResolvedValue([]);
    mocks.mockListSchedules.mockResolvedValue([]);

    mocks.mockCreateEndpoint.mockResolvedValue({
      id: "endpoint_1",
      orgId: "org_test",
      projectId: "proj_test",
      environment: "prod",
      name: "default-prod",
      url: "https://example.com/cron",
      authMode: "none",
      authSecretRef: null,
      timeoutMs: 30000,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    mocks.mockCreateJob.mockResolvedValue({
      id: "remote_job_a",
      orgId: "org_test",
      projectId: "proj_test",
      environment: "prod",
      endpointId: "endpoint_1",
      name: "a-job",
      key: "a-job",
      concurrency: "skip",
      catchup: false,
      retryAttempts: 1,
      retryBackoff: "linear",
      retryInitialDelay: "1s",
      timeout: "30s",
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    mocks.mockCreateSchedule.mockResolvedValue({
      id: "sched_a",
      orgId: "org_test",
      projectId: "proj_test",
      jobId: "remote_job_a",
      cron: "*/5 * * * *",
      timezone: "UTC",
      active: true,
      nextRunAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await runPushCommand([]);

    expect(mocks.mockCreateEndpoint).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^cronlet:proj_test:/) })
    );
    expect(mocks.mockCreateJob).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^cronlet:proj_test:/) })
    );
    expect(mocks.mockCreateSchedule).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^cronlet:proj_test:/) })
    );
  });

  it("is safe to re-run after partial apply failures", async () => {
    const endpoints: Array<Record<string, unknown>> = [];
    const jobs: Array<Record<string, unknown>> = [];
    const schedules: Array<Record<string, unknown>> = [];
    let shouldFailScheduleCreate = true;

    mocks.mockDiscoverJobs.mockResolvedValue([createJob("a-job")]);
    mocks.mockListEndpoints.mockImplementation(async () => endpoints);
    mocks.mockListJobs.mockImplementation(async () => jobs);
    mocks.mockListSchedules.mockImplementation(async () => schedules);

    mocks.mockCreateEndpoint.mockImplementation(async (_context, payload) => {
      const endpoint = {
        id: "endpoint_1",
        orgId: "org_test",
        authSecretRef: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...payload,
      };
      endpoints.push(endpoint);
      return endpoint;
    });

    mocks.mockCreateJob.mockImplementation(async (_context, payload) => {
      const job = {
        id: `remote_${payload.key}`,
        orgId: "org_test",
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...payload,
      };
      jobs.push(job);
      return job;
    });

    mocks.mockCreateSchedule.mockImplementation(async (_context, payload) => {
      if (shouldFailScheduleCreate) {
        shouldFailScheduleCreate = false;
        throw new Error("simulated schedule write failure");
      }

      const schedule = {
        id: `sched_${String(payload.jobId)}`,
        orgId: "org_test",
        projectId: "proj_test",
        nextRunAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...payload,
      };
      schedules.push(schedule);
      return schedule;
    });

    await expect(runPushCommand([])).rejects.toThrow("Cloud push failed during schedules-upsert");
    await runPushCommand([]);

    expect(mocks.mockCreateEndpoint).toHaveBeenCalledTimes(1);
    expect(mocks.mockCreateJob).toHaveBeenCalledTimes(1);
    expect(mocks.mockCreateSchedule).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(1);
    expect(schedules).toHaveLength(1);
  });
});
