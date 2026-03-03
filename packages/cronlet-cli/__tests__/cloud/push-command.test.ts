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
});
