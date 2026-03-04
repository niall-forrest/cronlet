import { daily, schedule } from "cronlet";

export default schedule(daily("00:00"), async () => {});
