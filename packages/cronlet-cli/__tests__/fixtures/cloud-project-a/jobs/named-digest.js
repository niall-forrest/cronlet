import { schedule, weekly } from "cronlet";

export default schedule(
  weekly(["mon", "fri"], "17:30"),
  {
    name: "digest-job",
    retry: {
      attempts: 3,
      initialDelay: "20s",
    },
    timeout: "45s",
  },
  async () => {}
);
