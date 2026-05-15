CREATE TABLE "CircuitBreaker" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "destinationKey" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'closed',
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "openedAt" TIMESTAMP(3),
  "cooldownUntil" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "lastFailureReason" TEXT,
  "probeInFlight" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CircuitBreaker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CircuitBreaker_organizationId_destinationKey_key" ON "CircuitBreaker"("organizationId", "destinationKey");
CREATE INDEX "CircuitBreaker_organizationId_state_updatedAt_idx" ON "CircuitBreaker"("organizationId", "state", "updatedAt");

ALTER TABLE "CircuitBreaker"
ADD CONSTRAINT "CircuitBreaker_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
