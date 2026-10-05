-- Customer Master profile: addresses, contacts, commercial FKs, external mapping.
-- Additive. Does not invent PaymentTerm/PaymentMethod/Classification/Segment rows.
-- Does not rewrite existing Customer commercial strings.

CREATE TABLE "PaymentTerm" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentTerm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentTerm_code_key" ON "PaymentTerm"("code");
CREATE INDEX "PaymentTerm_active_idx" ON "PaymentTerm"("active");

CREATE TABLE "PaymentMethod" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentMethod_code_key" ON "PaymentMethod"("code");
CREATE INDEX "PaymentMethod_active_idx" ON "PaymentMethod"("active");

CREATE TABLE "CustomerClassification" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerClassification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerClassification_code_key" ON "CustomerClassification"("code");
CREATE INDEX "CustomerClassification_active_idx" ON "CustomerClassification"("active");

CREATE TABLE "CustomerSegment" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerSegment_code_key" ON "CustomerSegment"("code");
CREATE INDEX "CustomerSegment_active_idx" ON "CustomerSegment"("active");

ALTER TABLE "Customer" ADD COLUMN "legalName" TEXT;
ALTER TABLE "Customer" ADD COLUMN "countryCode" TEXT;
ALTER TABLE "Customer" ADD COLUMN "taxVatNumber" TEXT;
ALTER TABLE "Customer" ADD COLUMN "remarks" TEXT;
ALTER TABLE "Customer" ADD COLUMN "classificationId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "segmentId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "paymentTermId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "paymentMethodId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "Customer" ADD COLUMN "updatedBy" TEXT;

ALTER TABLE "Customer" ALTER COLUMN "defaultIncoterm" DROP DEFAULT;
ALTER TABLE "Customer" ALTER COLUMN "defaultIncoterm" DROP NOT NULL;

CREATE INDEX "Customer_classificationId_idx" ON "Customer"("classificationId");
CREATE INDEX "Customer_segmentId_idx" ON "Customer"("segmentId");
CREATE INDEX "Customer_paymentTermId_idx" ON "Customer"("paymentTermId");
CREATE INDEX "Customer_paymentMethodId_idx" ON "Customer"("paymentMethodId");
CREATE INDEX "Customer_countryCode_idx" ON "Customer"("countryCode");

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_classificationId_fkey"
  FOREIGN KEY ("classificationId") REFERENCES "CustomerClassification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_segmentId_fkey"
  FOREIGN KEY ("segmentId") REFERENCES "CustomerSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_paymentTermId_fkey"
  FOREIGN KEY ("paymentTermId") REFERENCES "PaymentTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_paymentMethodId_fkey"
  FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CustomerAddress" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT,
  "addressType" TEXT NOT NULL DEFAULT 'OTHER',
  "line1" TEXT NOT NULL,
  "line2" TEXT,
  "city" TEXT,
  "stateRegion" TEXT,
  "countryCode" TEXT,
  "postalCode" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT,
  "updatedBy" TEXT,

  CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerAddress_customerId_code_key" ON "CustomerAddress"("customerId", "code");
CREATE INDEX "CustomerAddress_customerId_active_idx" ON "CustomerAddress"("customerId", "active");

ALTER TABLE "CustomerAddress"
  ADD CONSTRAINT "CustomerAddress_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomerContact" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "jobTitle" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "mobile" TEXT,
  "department" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT,
  "updatedBy" TEXT,

  CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerContact_customerId_active_idx" ON "CustomerContact"("customerId", "active");

ALTER TABLE "CustomerContact"
  ADD CONSTRAINT "CustomerContact_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomerExternalMapping" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "system" TEXT NOT NULL,
  "externalCustomerCode" TEXT NOT NULL,
  "externalName" TEXT,
  "mappingStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT,
  "updatedBy" TEXT,

  CONSTRAINT "CustomerExternalMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerExternalMapping_system_externalCustomerCode_key"
  ON "CustomerExternalMapping"("system", "externalCustomerCode");
CREATE INDEX "CustomerExternalMapping_customerId_active_idx" ON "CustomerExternalMapping"("customerId", "active");
CREATE INDEX "CustomerExternalMapping_system_idx" ON "CustomerExternalMapping"("system");

ALTER TABLE "CustomerExternalMapping"
  ADD CONSTRAINT "CustomerExternalMapping_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerDeliveryCombination" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
