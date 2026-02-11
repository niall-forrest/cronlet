import { Command } from "commander";
import { devCommand } from "./commands/dev.js";
import { listCommand } from "./commands/list.js";
import { runCommand } from "./commands/run.js";
import { validateCommand } from "./commands/validate.js";

const program = new Command();

program
  .name("cronlet")
  .description("The simplest way to add scheduled tasks to your Next.js app")
  .version("0.1.0");

program.addCommand(devCommand);
program.addCommand(listCommand);
program.addCommand(runCommand);
program.addCommand(validateCommand);

program.parse();
