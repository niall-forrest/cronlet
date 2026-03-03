export default {
  id: "anonymous-job-3",
  name: "anonymous-job-3",
  schedule: {
    type: "monthly",
    cron: "0 17 * * 5L",
    humanReadable: "last Friday of every month at 5:00 PM",
    originalParams: { day: "last-fri", time: "17:00" },
  },
  config: {},
  handler: async () => {},
};
