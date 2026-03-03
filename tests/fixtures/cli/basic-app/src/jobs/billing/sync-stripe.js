export default {
  id: "anonymous-job-2",
  name: "anonymous-job-2",
  schedule: {
    type: "interval",
    cron: "0 * * * *",
    humanReadable: "every hour",
    originalParams: { interval: "1h" },
  },
  config: {},
  handler: async () => {},
};
