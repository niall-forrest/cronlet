export default {
  id: "anonymous-job-1",
  name: "anonymous-job-1",
  schedule: {
    type: "interval",
    cron: "*/5 * * * *",
    humanReadable: "every 5 minutes",
    originalParams: { interval: "5m" },
  },
  config: {},
  handler: async () => {},
};
