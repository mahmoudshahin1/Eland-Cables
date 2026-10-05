-- Cable master default attachments (Technical Offer per cable)
CREATE TABLE "CableMasterAttachment" (
    "id" TEXT NOT NULL,
    "materialNumber" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL_UPLOAD',
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CableMasterAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CableMasterAttachment_materialNumber_kind_key" ON "CableMasterAttachment"("materialNumber", "kind");
CREATE INDEX "CableMasterAttachment_materialNumber_idx" ON "CableMasterAttachment"("materialNumber");

ALTER TABLE "CableMasterAttachment" ADD CONSTRAINT "CableMasterAttachment_materialNumber_fkey" FOREIGN KEY ("materialNumber") REFERENCES "CableMaster"("materialNumber") ON DELETE CASCADE ON UPDATE CASCADE;

-- Inquiry line attachments (copied from cable master or edited by technical team)
CREATE TABLE "CommercialInquiryLineAttachment" (
    "id" TEXT NOT NULL,
    "inquiryLineId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL_UPLOAD',
    "cableMasterAttachmentId" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialInquiryLineAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommercialInquiryLineAttachment_inquiryLineId_idx" ON "CommercialInquiryLineAttachment"("inquiryLineId");
CREATE INDEX "CommercialInquiryLineAttachment_inquiryLineId_kind_idx" ON "CommercialInquiryLineAttachment"("inquiryLineId", "kind");

ALTER TABLE "CommercialInquiryLineAttachment" ADD CONSTRAINT "CommercialInquiryLineAttachment_inquiryLineId_fkey" FOREIGN KEY ("inquiryLineId") REFERENCES "CommercialInquiryLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialInquiryLineAttachment" ADD CONSTRAINT "CommercialInquiryLineAttachment_cableMasterAttachmentId_fkey" FOREIGN KEY ("cableMasterAttachmentId") REFERENCES "CableMasterAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
