ALTER TABLE "Organization"
ADD COLUMN "callbackSigningSecretRotatedAt" TIMESTAMP(3);

UPDATE "Organization"
SET "callbackSigningSecretRotatedAt" = COALESCE("updatedAt", NOW())
WHERE "callbackSigningSecret" IS NOT NULL
  AND "callbackSigningSecretRotatedAt" IS NULL;
