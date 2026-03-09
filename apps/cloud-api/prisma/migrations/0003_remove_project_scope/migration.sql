-- DropForeignKey
ALTER TABLE "Alert" DROP CONSTRAINT "Alert_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Run" DROP CONSTRAINT "Run_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_projectId_fkey";

-- AlterTable
ALTER TABLE "Alert" DROP COLUMN "projectId";

-- AlterTable
ALTER TABLE "Run" DROP COLUMN "projectId";

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "projectId";

-- DropTable
DROP TABLE "Project";
