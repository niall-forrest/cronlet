export default {
  id: "anonymous-job-1",
  name: "anonymous-job-1",
  schedule: {
    type: "daily",
    cron: "0 9 * * *",
    humanReadable: "daily at 9:00 AM",
    originalParams: {},
  },
  config: {
    timeout: "100ms",
    retry: {
      attempts: 2,
      initialDelay: "50ms",
      backoff: "linear",
    },
  },
  handler: async () => {},
};
