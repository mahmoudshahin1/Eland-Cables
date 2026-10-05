-- Persist inquiry documents in PostgreSQL. Binary content is not invented metadata.
CREATE TABLE "CommercialInquiryAttachment" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialInquiryAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommercialInquiryAttachment_inquiryId_idx" ON "CommercialInquiryAttachment"("inquiryId");

ALTER TABLE "CommercialInquiryAttachment" ADD CONSTRAINT "CommercialInquiryAttachment_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "CommercialInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
