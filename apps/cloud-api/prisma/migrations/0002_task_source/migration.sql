CREATE TYPE "TaskSource" AS ENUM ('dashboard', 'mcp', 'sdk');

ALTER TABLE "Task"
ADD COLUMN "source" "TaskSource" NOT NULL DEFAULT 'dashboard';
