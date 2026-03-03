import { buildServer } from "./server.js";

const port = Number.parseInt(process.env.PORT ?? "4050", 10);
const host = process.env.HOST ?? "0.0.0.0";

const app = await buildServer();
await app.listen({ port, host });
