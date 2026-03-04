import { schedule, weekly } from "cronlet";

export default schedule(
  weekly("sun", "02:15").withTimezone("Europe/London"),
  {
    name: "cleanup-weekly",
    concurrency: "allow",
    retry: {
      attempts: 4,
      backoff: "linear",
      initialDelay: "30s",
    },
    timeout: "10m",
  },
  async () => {}
);
