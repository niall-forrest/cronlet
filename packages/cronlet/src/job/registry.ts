import type { JobDefinition } from "./types.js";

/**
 * Global job registry for storing job definitions
 */
class JobRegistry {
  private jobs: Map<string, JobDefinition> = new Map();

  /**
   * Register a job definition
   * @throws Error if a job with the same ID is already registered
   */
  register(job: JobDefinition): void {
    if (this.jobs.has(job.id)) {
      throw new Error(
        `Job with ID "${job.id}" is already registered. Use unique job names or file names.`
      );
    }
    this.jobs.set(job.id, job);
  }

  /**
   * Get all registered jobs
   */
  getAll(): JobDefinition[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get a job by ID
   */
  getById(id: string): JobDefinition | undefined {
    return this.jobs.get(id);
  }

  /**
   * Check if a job with the given ID exists
   */
  has(id: string): boolean {
    return this.jobs.has(id);
  }

  /**
   * Remove a job by ID
   */
  remove(id: string): boolean {
    return this.jobs.delete(id);
  }

  /**
   * Clear all registered jobs
   */
  clear(): void {
    this.jobs.clear();
  }

  /**
   * Get the number of registered jobs
   */
  get size(): number {
    return this.jobs.size;
  }
}

/**
 * Global singleton registry instance
 */
export const registry = new JobRegistry();

// Export the class for testing purposes
export { JobRegistry };
