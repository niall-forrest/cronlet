ALTER TABLE "Organization"
ADD COLUMN "outboundAllowedHosts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
