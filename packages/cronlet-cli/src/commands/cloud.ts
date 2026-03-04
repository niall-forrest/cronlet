import { Command } from "commander";
import pc from "picocolors";
import {
  loadCloudAuth,
  saveCloudAuth,
  type CloudAuthConfig,
} from "../cloud/config.js";

async function healthcheck(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export function createCloudCommand(): Command {
  return new Command("cloud")
    .description("Connect to Cronlet Cloud")
    .addCommand(
      new Command("login")
        .description("Store cloud API credentials for this workspace")
        .requiredOption("--api-url <url>", "Cloud API base URL")
        .requiredOption("--api-key <key>", "Cloud API key")
        .action(async (options) => {
          const auth: CloudAuthConfig = {
            apiUrl: options.apiUrl,
            apiKey: options.apiKey,
          };

          const path = saveCloudAuth(auth);
          const healthy = await healthcheck(auth.apiUrl);

          console.log();
          console.log(pc.green(`Saved cloud auth at ${path}`));
          console.log(pc.dim(`Health check: ${healthy ? "ok" : "failed"}`));
          console.log();
        })
    )
    .addCommand(
      new Command("status")
        .description("Show cloud connection status")
        .action(async () => {
          const auth = loadCloudAuth();

          console.log();
          console.log(pc.bold("Cronlet Cloud Status"));

          if (!auth) {
            console.log(pc.yellow("  Not logged in"));
            console.log(pc.dim("  Run: cronlet cloud login --api-url <url> --api-key <key>"));
            console.log();
            return;
          }

          const healthy = await healthcheck(auth.apiUrl);
          console.log(pc.dim(`  API: ${auth.apiUrl}`));
          console.log(pc.dim(`  Status: ${healthy ? pc.green("connected") : pc.red("unreachable")}`));
          console.log();
        })
    )
    .addCommand(
      new Command("logout")
        .description("Remove stored cloud credentials")
        .action(async () => {
          const auth = loadCloudAuth();

          if (!auth) {
            console.log();
            console.log(pc.yellow("Not logged in"));
            console.log();
            return;
          }

          // Remove auth by saving empty values - or we could delete the file
          const { unlinkSync, existsSync } = await import("node:fs");
          const { join } = await import("node:path");
          const authPath = join(process.cwd(), ".cronlet", "cloud-auth.json");

          if (existsSync(authPath)) {
            unlinkSync(authPath);
          }

          console.log();
          console.log(pc.green("Logged out from Cronlet Cloud"));
          console.log();
        })
    );
}

export const cloudCommand = createCloudCommand();
