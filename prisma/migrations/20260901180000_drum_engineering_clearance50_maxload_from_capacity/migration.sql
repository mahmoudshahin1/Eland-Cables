-- TO-approved Drum Master engineering normalization (2026-09-01).
-- Clearance = 50 mm for ALL ACTIVE drums.
-- MaxLoad (maxWeight) = Capacity when Capacity is valid (> 0).
-- Capacity column is preserved unchanged (source/reference).
-- emptyDrumNetWeightKg is NOT touched (logistics WARNING only).
-- Does not insert/duplicate drums.

-- Report MaxLoad≠Capacity conflicts before overwrite (query for ops logs):
-- SELECT "drumCode", "capacity", "maxWeight"
-- FROM "DrumMaster"
-- WHERE status = 'ACTIVE'
--   AND "maxWeight" IS NOT NULL
--   AND "capacity" IS NOT NULL
--   AND "capacity" > 0
--   AND "maxWeight" <> "capacity";

UPDATE "DrumMaster"
SET
  "clearanceMm" = 50,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE status = 'ACTIVE';

UPDATE "DrumMaster"
SET
  "maxWeight" = "capacity",
  "updatedAt" = CURRENT_TIMESTAMP
WHERE status = 'ACTIVE'
  AND "capacity" IS NOT NULL
  AND "capacity" > 0;
