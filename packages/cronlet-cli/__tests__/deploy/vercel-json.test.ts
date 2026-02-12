import { describe, it, expect } from "vitest";
import type { JobDefinition } from "cronlet";
import {
  generateCronEntries,
  mergeVercelConfig,
  getRemovedCrons,
  getAddedCrons,
  getUpdatedCrons,
} from "../../src/deploy/generators/vercel-json.js";

function createTestJob(id: string, cron: string): JobDefinition {
  return {
    id,
    name: id,
    schedule: {
      type: "daily",
      cron,
      humanReadable: `job ${id}`,
      originalParams: {},
    },
    config: {},
    handler: async () => {},
  };
}

describe("generateCronEntries", () => {
  it("generates cron entries with default prefix", () => {
    const jobs = [
      createTestJob("job-a", "0 9 * * *"),
      createTestJob("job-b", "0 * * * *"),
    ];

    const entries = generateCronEntries(jobs);

    expect(entries).toEqual([
      { path: "/api/cron/job-a", schedule: "0 9 * * *" },
      { path: "/api/cron/job-b", schedule: "0 * * * *" },
    ]);
  });

  it("uses custom prefix", () => {
    const jobs = [createTestJob("my-job", "0 9 * * *")];

    const entries = generateCronEntries(jobs, "/api/scheduled");

    expect(entries).toEqual([
      { path: "/api/scheduled/my-job", schedule: "0 9 * * *" },
    ]);
  });

  it("flattens nested job IDs", () => {
    const jobs = [createTestJob("billing/sync", "0 9 * * *")];

    const entries = generateCronEntries(jobs);

    expect(entries).toEqual([
      { path: "/api/cron/billing-sync", schedule: "0 9 * * *" },
    ]);
  });
});

describe("mergeVercelConfig", () => {
  it("creates new config when none exists", () => {
    const entries = [{ path: "/api/cron/job-a", schedule: "0 9 * * *" }];

    const config = mergeVercelConfig(null, entries);

    expect(config).toEqual({ crons: entries });
  });

  it("preserves existing non-cron config", () => {
    const existing = {
      regions: ["iad1"],
      functions: { "api/*.ts": { memory: 1024 } },
    };
    const entries = [{ path: "/api/cron/job-a", schedule: "0 9 * * *" }];

    const config = mergeVercelConfig(existing, entries);

    expect(config.regions).toEqual(["iad1"]);
    expect(config.functions).toEqual({ "api/*.ts": { memory: 1024 } });
    expect(config.crons).toEqual(entries);
  });

  it("preserves user crons outside the prefix", () => {
    const existing = {
      crons: [
        { path: "/api/cron/old-job", schedule: "0 0 * * *" },
        { path: "/api/webhooks/stripe", schedule: "0 0 1 * *" },
      ],
    };
    const entries = [{ path: "/api/cron/new-job", schedule: "0 9 * * *" }];

    const config = mergeVercelConfig(existing, entries);

    expect(config.crons).toContainEqual({
      path: "/api/webhooks/stripe",
      schedule: "0 0 1 * *",
    });
    expect(config.crons).toContainEqual({
      path: "/api/cron/new-job",
      schedule: "0 9 * * *",
    });
    expect(config.crons).not.toContainEqual({
      path: "/api/cron/old-job",
      schedule: "0 0 * * *",
    });
  });
});

describe("getRemovedCrons", () => {
  it("returns empty array when no existing config", () => {
    const entries = [{ path: "/api/cron/job-a", schedule: "0 9 * * *" }];

    const removed = getRemovedCrons(null, entries);

    expect(removed).toEqual([]);
  });

  it("identifies removed crons within prefix", () => {
    const existing = {
      crons: [
        { path: "/api/cron/old-job", schedule: "0 0 * * *" },
        { path: "/api/cron/kept-job", schedule: "0 9 * * *" },
      ],
    };
    const entries = [{ path: "/api/cron/kept-job", schedule: "0 9 * * *" }];

    const removed = getRemovedCrons(existing, entries);

    expect(removed).toEqual([{ path: "/api/cron/old-job", schedule: "0 0 * * *" }]);
  });

  it("does not include crons outside prefix", () => {
    const existing = {
      crons: [
        { path: "/api/cron/old-job", schedule: "0 0 * * *" },
        { path: "/api/other/job", schedule: "0 0 * * *" },
      ],
    };
    const entries: Array<{ path: string; schedule: string }> = [];

    const removed = getRemovedCrons(existing, entries);

    expect(removed).toEqual([{ path: "/api/cron/old-job", schedule: "0 0 * * *" }]);
  });
});

describe("getAddedCrons", () => {
  it("returns all entries when no existing config", () => {
    const entries = [
      { path: "/api/cron/job-a", schedule: "0 9 * * *" },
      { path: "/api/cron/job-b", schedule: "0 * * * *" },
    ];

    const added = getAddedCrons(null, entries);

    expect(added).toEqual(entries);
  });

  it("identifies newly added crons", () => {
    const existing = {
      crons: [{ path: "/api/cron/existing", schedule: "0 0 * * *" }],
    };
    const entries = [
      { path: "/api/cron/existing", schedule: "0 0 * * *" },
      { path: "/api/cron/new-job", schedule: "0 9 * * *" },
    ];

    const added = getAddedCrons(existing, entries);

    expect(added).toEqual([{ path: "/api/cron/new-job", schedule: "0 9 * * *" }]);
  });
});

describe("getUpdatedCrons", () => {
  it("returns empty array when no existing config", () => {
    const entries = [{ path: "/api/cron/job-a", schedule: "0 9 * * *" }];

    const updated = getUpdatedCrons(null, entries);

    expect(updated).toEqual([]);
  });

  it("identifies crons with changed schedules", () => {
    const existing = {
      crons: [{ path: "/api/cron/job-a", schedule: "0 0 * * *" }],
    };
    const entries = [{ path: "/api/cron/job-a", schedule: "0 9 * * *" }];

    const updated = getUpdatedCrons(existing, entries);

    expect(updated).toEqual([{ path: "/api/cron/job-a", schedule: "0 9 * * *" }]);
  });

  it("does not include unchanged crons", () => {
    const existing = {
      crons: [{ path: "/api/cron/job-a", schedule: "0 9 * * *" }],
    };
    const entries = [{ path: "/api/cron/job-a", schedule: "0 9 * * *" }];

    const updated = getUpdatedCrons(existing, entries);

    expect(updated).toEqual([]);
  });
});
