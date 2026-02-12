import { Command } from "commander";
import { devCommand } from "./commands/dev.js";
import { listCommand } from "./commands/list.js";
import { runCommand } from "./commands/run.js";
import { validateCommand } from "./commands/validate.js";
import { deployCommand } from "./commands/deploy.js";

const program = new Command();

program
  .name("cronlet")
  .description("The simplest way to add scheduled tasks to your Node.js app")
  .version("0.1.1");

program.addCommand(devCommand);
program.addCommand(listCommand);
program.addCommand(runCommand);
program.addCommand(validateCommand);
program.addCommand(deployCommand);

program.parse();
