-- Optional engineering fields for native drum capacity (STEP 6).
-- Values are not invented; remain NULL until Technical Office / master-data load.

ALTER TABLE "DrumMaster" ADD COLUMN IF NOT EXISTS "clearanceMm" DECIMAL;
ALTER TABLE "DrumMaster" ADD COLUMN IF NOT EXISTS "emptyDrumNetWeightKg" DECIMAL;
