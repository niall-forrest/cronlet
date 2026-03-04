import { monthly, schedule } from "cronlet";

export default schedule(
  monthly("last-fri", "18:00"),
  {
    concurrency: "queue",
    timeout: "5m",
  },
  async () => {}
);
