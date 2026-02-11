import { describe, it, expect, beforeEach } from "vitest";
import { JobRegistry } from "../../src/job/registry.js";
import type { JobDefinition } from "../../src/job/types.js";

describe("JobRegistry", () => {
  let registry: JobRegistry;

  const createMockJob = (id: string): JobDefinition => ({
    id,
    name: id,
    schedule: {
      type: "interval",
      cron: "*/15 * * * *",
      humanReadable: "every 15 minutes",
      originalParams: {},
    },
    config: {},
    handler: async () => {},
  });

  beforeEach(() => {
    registry = new JobRegistry();
  });

  describe("register()", () => {
    it("registers a job", () => {
      const job = createMockJob("test-job");
      registry.register(job);
      expect(registry.size).toBe(1);
    });

    it("throws on duplicate ID", () => {
      const job1 = createMockJob("test-job");
      const job2 = createMockJob("test-job");

      registry.register(job1);
      expect(() => registry.register(job2)).toThrow("already registered");
    });
  });

  describe("getAll()", () => {
    it("returns empty array when no jobs", () => {
      expect(registry.getAll()).toEqual([]);
    });

    it("returns all registered jobs", () => {
      const job1 = createMockJob("job-1");
      const job2 = createMockJob("job-2");

      registry.register(job1);
      registry.register(job2);

      const jobs = registry.getAll();
      expect(jobs).toHaveLength(2);
      expect(jobs.map((j) => j.id)).toContain("job-1");
      expect(jobs.map((j) => j.id)).toContain("job-2");
    });
  });

  describe("getById()", () => {
    it("returns undefined for non-existent job", () => {
      expect(registry.getById("non-existent")).toBeUndefined();
    });

    it("returns job by ID", () => {
      const job = createMockJob("test-job");
      registry.register(job);

      const retrieved = registry.getById("test-job");
      expect(retrieved).toBe(job);
    });
  });

  describe("has()", () => {
    it("returns false for non-existent job", () => {
      expect(registry.has("non-existent")).toBe(false);
    });

    it("returns true for existing job", () => {
      const job = createMockJob("test-job");
      registry.register(job);
      expect(registry.has("test-job")).toBe(true);
    });
  });

  describe("remove()", () => {
    it("returns false for non-existent job", () => {
      expect(registry.remove("non-existent")).toBe(false);
    });

    it("removes and returns true for existing job", () => {
      const job = createMockJob("test-job");
      registry.register(job);

      expect(registry.remove("test-job")).toBe(true);
      expect(registry.has("test-job")).toBe(false);
      expect(registry.size).toBe(0);
    });
  });

  describe("clear()", () => {
    it("removes all jobs", () => {
      registry.register(createMockJob("job-1"));
      registry.register(createMockJob("job-2"));
      registry.register(createMockJob("job-3"));

      expect(registry.size).toBe(3);

      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.getAll()).toEqual([]);
    });
  });

  describe("size", () => {
    it("returns 0 for empty registry", () => {
      expect(registry.size).toBe(0);
    });

    it("returns correct count", () => {
      registry.register(createMockJob("job-1"));
      expect(registry.size).toBe(1);

      registry.register(createMockJob("job-2"));
      expect(registry.size).toBe(2);

      registry.remove("job-1");
      expect(registry.size).toBe(1);
    });
  });
});
