-- Task 05I-DF-B3 — defense-in-depth uniqueness for physical drum identity.
-- Inspected existing rows before apply: no duplicate (snapshotId, sourceLineId)
-- or (resultId, physicalDrumKey) pairs. Does not rewrite historical data.
-- Does not add a CALCULATED lifecycle status.

CREATE UNIQUE INDEX "ContainerStudyInputDrum_snapshotId_sourceLineId_key"
  ON "ContainerStudyInputDrum"("snapshotId", "sourceLineId");

CREATE UNIQUE INDEX "ContainerStudyResultAllocation_resultId_physicalDrumKey_key"
  ON "ContainerStudyResultAllocation"("resultId", "physicalDrumKey");

CREATE UNIQUE INDEX "ContainerStudyResultUnallocated_resultId_physicalDrumKey_key"
  ON "ContainerStudyResultUnallocated"("resultId", "physicalDrumKey");
