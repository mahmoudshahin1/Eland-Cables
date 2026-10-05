-- Customer Master company logo URL (path or http(s)), not a binary on the row.
-- One-time persist of the uploaded ELAND lockup onto the existing C-ELAND master.

ALTER TABLE "Customer" ADD COLUMN "companyLogoUrl" TEXT;

UPDATE "Customer"
SET "companyLogoUrl" = '/customer-logos/eland-cables.png'
WHERE "companyLogoUrl" IS NULL
  AND (
    "code" = 'C-ELAND'
    OR LOWER("name") = 'eland cables'
  );
