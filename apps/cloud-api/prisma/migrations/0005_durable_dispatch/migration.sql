ALTER TYPE "RunStatus" ADD VALUE IF NOT EXISTS 'leased';
ALTER TYPE "RunStatus" ADD VALUE IF NOT EXISTS 'retry_wait';
ALTER TYPE "RunStatus" ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE "RunStatus" ADD VALUE IF NOT EXISTS 'dead_lettered';
ALTER TYPE "RunStatus" ADD VALUE IF NOT EXISTS 'terminal_client_error';
ALTER TYPE "RunStatus" ADD VALUE IF NOT EXISTS 'retry_window_expired';

CREATE TYPE "DispatchJobStatus" AS ENUM (
  'pending',
  'leased',
  'running',
  'retry_wait',
  'succeeded',
  'failed',
  'cancelled',
  'dead_lettered'
);

CREATE TYPE "RunAttemptStatus" AS ENUM (
  'pending',
  'running',
  'success',
  'failure',
  'timeout',
  'cancelled',
  'terminal_client_error'
);

ALTER TABLE "Task"
ADD COLUMN "externalId" TEXT,
ADD COLUMN "retryMaxAttempts" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN "retryInitialDelay" TEXT NOT NULL DEFAULT '10s',
ADD COLUMN "retryMaxDelay" TEXT NOT NULL DEFAULT '15m',
ADD COLUMN "retryJitter" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "retryWindow" TEXT NOT NULL DEFAULT '24h',
ADD COLUMN "retryOnStatusCodes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "terminalStatusCodes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

CREATE UNIQUE INDEX "Task_organizationId_externalId_key" ON "Task"("organizationId", "externalId");

CREATE TABLE "DispatchJob" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "status" "DispatchJobStatus" NOT NULL DEFAULT 'pending',
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" TEXT,
  "leasedUntil" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 10,
  "retryWindowEndsAt" TIMESTAMP(3),
  "lastError" TEXT,
  "destinationKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DispatchJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RunAttempt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "dispatchJobId" TEXT,
  "attemptNumber" INTEGER NOT NULL,
  "status" "RunAttemptStatus" NOT NULL DEFAULT 'pending',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "httpStatus" INTEGER,
  "errorClass" TEXT,
  "errorMessage" TEXT,
  "responseBodyPreview" TEXT,
  "responseBodyHash" TEXT,
  "output" JSONB,
  "logs" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RunAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previousState" TEXT,
  "nextState" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RunEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previousState" TEXT,
  "nextState" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RunEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DispatchEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "dispatchJobId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previousState" TEXT,
  "nextState" TEXT,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DispatchEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdempotencyKey" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "responsePayload" JSONB,
  "statusCode" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Run_organizationId_status_scheduledAt_idx" ON "Run"("organizationId", "status", "scheduledAt");
CREATE UNIQUE INDEX "RunAttempt_runId_attemptNumber_key" ON "RunAttempt"("runId", "attemptNumber");
CREATE INDEX "RunAttempt_organizationId_status_createdAt_idx" ON "RunAttempt"("organizationId", "status", "createdAt");
CREATE INDEX "RunAttempt_dispatchJobId_idx" ON "RunAttempt"("dispatchJobId");
CREATE INDEX "DispatchJob_status_availableAt_idx" ON "DispatchJob"("status", "availableAt");
CREATE INDEX "DispatchJob_organizationId_status_availableAt_idx" ON "DispatchJob"("organizationId", "status", "availableAt");
CREATE INDEX "DispatchJob_destinationKey_status_availableAt_idx" ON "DispatchJob"("destinationKey", "status", "availableAt");
CREATE INDEX "DispatchJob_leasedUntil_idx" ON "DispatchJob"("leasedUntil");
CREATE INDEX "TaskEvent_organizationId_createdAt_idx" ON "TaskEvent"("organizationId", "createdAt");
CREATE INDEX "TaskEvent_taskId_createdAt_idx" ON "TaskEvent"("taskId", "createdAt");
CREATE INDEX "RunEvent_organizationId_createdAt_idx" ON "RunEvent"("organizationId", "createdAt");
CREATE INDEX "RunEvent_runId_createdAt_idx" ON "RunEvent"("runId", "createdAt");
CREATE INDEX "DispatchEvent_organizationId_createdAt_idx" ON "DispatchEvent"("organizationId", "createdAt");
CREATE INDEX "DispatchEvent_dispatchJobId_createdAt_idx" ON "DispatchEvent"("dispatchJobId", "createdAt");
CREATE UNIQUE INDEX "IdempotencyKey_organizationId_method_path_key_key" ON "IdempotencyKey"("organizationId", "method", "path", "key");
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

ALTER TABLE "DispatchJob" ADD CONSTRAINT "DispatchJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DispatchJob" ADD CONSTRAINT "DispatchJob_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DispatchJob" ADD CONSTRAINT "DispatchJob_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunAttempt" ADD CONSTRAINT "RunAttempt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunAttempt" ADD CONSTRAINT "RunAttempt_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunAttempt" ADD CONSTRAINT "RunAttempt_dispatchJobId_fkey" FOREIGN KEY ("dispatchJobId") REFERENCES "DispatchJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunEvent" ADD CONSTRAINT "RunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DispatchEvent" ADD CONSTRAINT "DispatchEvent_dispatchJobId_fkey" FOREIGN KEY ("dispatchJobId") REFERENCES "DispatchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
