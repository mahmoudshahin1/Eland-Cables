-- Phase 1 follow-up: AgreementReleaseLine for release snapshot qty tracking

CREATE TABLE "public"."AgreementReleaseLine" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "agreementLineId" TEXT,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "quotationLineId" TEXT,
    "materialNumber" TEXT,
    "itemDescription" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "quantityUom" TEXT NOT NULL DEFAULT 'KM',
    "unitPrice" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgreementReleaseLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgreementReleaseLine_releaseId_idx" ON "public"."AgreementReleaseLine"("releaseId");
CREATE INDEX "AgreementReleaseLine_agreementLineId_idx" ON "public"."AgreementReleaseLine"("agreementLineId");

ALTER TABLE "public"."AgreementReleaseLine" ADD CONSTRAINT "AgreementReleaseLine_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "public"."AgreementRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
