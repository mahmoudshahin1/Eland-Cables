-- Task 02: Platform NumberSequence, Security Groups, PlatformFieldDefinition metadata extensions

CREATE TABLE "NumberSequence" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT '{PREFIX}{YY}-{#####}',
    "nextSerial" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "scopeType" TEXT NOT NULL DEFAULT 'GLOBAL',
    "scopeValue" TEXT,
    "moduleId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NumberSequence_code_key" ON "NumberSequence"("code");
CREATE INDEX "NumberSequence_prefix_idx" ON "NumberSequence"("prefix");
CREATE INDEX "NumberSequence_moduleId_idx" ON "NumberSequence"("moduleId");
CREATE INDEX "NumberSequence_active_idx" ON "NumberSequence"("active");
CREATE INDEX "NumberSequence_scopeType_scopeValue_idx" ON "NumberSequence"("scopeType", "scopeValue");

CREATE TABLE "SecurityGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "SecurityGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SecurityGroup_code_key" ON "SecurityGroup"("code");
CREATE INDEX "SecurityGroup_isActive_idx" ON "SecurityGroup"("isActive");

CREATE TABLE "SecurityGroupMember" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "SecurityGroupMember_pkey" PRIMARY KEY ("groupId","userId")
);

CREATE INDEX "SecurityGroupMember_userId_idx" ON "SecurityGroupMember"("userId");

CREATE TABLE "SecurityGroupRole" (
    "groupId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "SecurityGroupRole_pkey" PRIMARY KEY ("groupId","roleId")
);

CREATE INDEX "SecurityGroupRole_roleId_idx" ON "SecurityGroupRole"("roleId");

ALTER TABLE "SecurityGroupMember"
  ADD CONSTRAINT "SecurityGroupMember_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "SecurityGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecurityGroupMember"
  ADD CONSTRAINT "SecurityGroupMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecurityGroupRole"
  ADD CONSTRAINT "SecurityGroupRole_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "SecurityGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecurityGroupRole"
  ADD CONSTRAINT "SecurityGroupRole_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformFieldDefinition" ADD COLUMN "tab" TEXT;
ALTER TABLE "PlatformFieldDefinition" ADD COLUMN "fieldSecurity" JSONB;
ALTER TABLE "PlatformFieldDefinition" ADD COLUMN "lookupEntity" TEXT;
ALTER TABLE "PlatformFieldDefinition" ADD COLUMN "lookupDisplayField" TEXT;
