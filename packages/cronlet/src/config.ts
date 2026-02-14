export interface CronletConfig {
  jobsDir?: string;
  deploy?: {
    prefix?: string;
    vercel?: {
      maxDuration?: number;
    };
  };
}

export function defineConfig(config: CronletConfig): CronletConfig {
  return config;
}
