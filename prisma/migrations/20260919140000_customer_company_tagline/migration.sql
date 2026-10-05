-- Customer Master marketing/membership tagline for authenticated customer chrome.
-- ELAND approved home design reads this from C-ELAND, not from React copy.

ALTER TABLE "Customer" ADD COLUMN "companyTagline" TEXT;

UPDATE "Customer"
SET "companyTagline" = 'A Member of ELSEWEDY HELAL Group'
WHERE "companyTagline" IS NULL
  AND (
    "code" = 'C-ELAND'
    OR LOWER("name") = 'eland cables'
  );
