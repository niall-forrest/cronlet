CREATE TYPE "TaskKind" AS ENUM ('scheduled', 'dispatch');

ALTER TABLE "Organization"
ADD COLUMN "callbackSigningSecret" TEXT;

ALTER TABLE "Task"
ADD COLUMN "kind" "TaskKind" NOT NULL DEFAULT 'scheduled';

CREATE INDEX "Task_organizationId_kind_active_idx" ON "Task"("organizationId", "kind", "active");
