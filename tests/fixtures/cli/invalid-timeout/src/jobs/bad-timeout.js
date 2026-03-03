export default {
  id: "anonymous-job-1",
  name: "anonymous-job-1",
  schedule: {
    type: "daily",
    cron: "0 8 * * *",
    humanReadable: "daily at 8:00 AM",
    originalParams: {},
  },
  config: {
    timeout: "10x",
  },
  handler: async () => {},
};
