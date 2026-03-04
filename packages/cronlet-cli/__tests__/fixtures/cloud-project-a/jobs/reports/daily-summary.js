import { daily, schedule } from "cronlet";

export default schedule(
  daily("09:00").withTimezone("America/New_York"),
  {
    concurrency: "skip",
    catchup: true,
    retry: {
      attempts: 2,
      backoff: "exponential",
      initialDelay: "15s",
    },
    timeout: "2m",
  },
  async () => {}
);
