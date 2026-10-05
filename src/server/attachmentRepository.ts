import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import { RequestActor } from './auth';
import { assertCanProcessTechnicalOffice } from './rbac';
import {
  ATTACHMENT_SOURCE_CABLE_MASTER,
  ATTACHMENT_SOURCE_MANUAL,
  LINE_ATTACHMENT_KIND_TECHNICAL_OFFER,
} from '../domain/inquiryLineAttachments';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export function attachmentSummary(row: {
  id: string;
  kind: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  source: string;
  uploadedBy: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    kind: row.kind,
    fileName: row.fileName,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    source: row.source,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function decodeAttachmentContent(contentBase64: string): Buffer {
  const raw = (contentBase64 || '').replace(/^data:[^;]+;base64,/, '');
  const content = Buffer.from(raw, 'base64');
  if (!content.length) {
    const err = new Error('Attachment content is empty.');
    (err as Error & { code: string }).code = 'INVALID_REQUEST_INPUTS';
    throw err;
  }
  if (content.length > MAX_ATTACHMENT_BYTES) {
    const err = new Error('Attachment exceeds 8 MB.');
    (err as Error & { code: string }).code = 'INVALID_REQUEST_INPUTS';
    throw err;
  }
  return content;
}

export async function listCableMasterAttachments(materialNumber: string) {
  const prisma = requirePrisma();
  const rows = await prisma.cableMasterAttachment.findMany({
    where: { materialNumber },
    orderBy: { kind: 'asc' },
    select: {
      id: true,
      kind: true,
      fileName: true,
      mimeType: true,
      byteSize: true,
      source: true,
      uploadedBy: true,
      createdAt: true,
    },
  });
  return rows.map(attachmentSummary);
}

export async function upsertCableMasterAttachment(
  materialNumber: string,
  input: { kind: string; fileName: string; mimeType?: string; contentBase64: string; source?: string },
  actor: RequestActor
) {
  assertCanProcessTechnicalOffice(actor);
  const prisma = requirePrisma();
  const cable = await prisma.cableMaster.findUnique({ where: { materialNumber } });
  if (!cable) {
    const err = new Error(`Cable ${materialNumber} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  const kind = (input.kind || LINE_ATTACHMENT_KIND_TECHNICAL_OFFER).trim();
  const fileName = (input.fileName || '').trim();
  if (!fileName) {
    const err = new Error('fileName is required.');
    (err as Error & { code: string }).code = 'INVALID_REQUEST_INPUTS';
    throw err;
  }
  const content = decodeAttachmentContent(input.contentBase64);
  const row = await prisma.cableMasterAttachment.upsert({
    where: { materialNumber_kind: { materialNumber, kind } },
    create: {
      materialNumber,
      kind,
      fileName,
      mimeType: input.mimeType?.trim() || 'application/octet-stream',
      byteSize: content.length,
      content,
      source: input.source?.trim() || ATTACHMENT_SOURCE_MANUAL,
      uploadedBy: actor.name || actor.email || actor.id,
    },
    update: {
      fileName,
      mimeType: input.mimeType?.trim() || 'application/octet-stream',
      byteSize: content.length,
      content,
      source: input.source?.trim() || ATTACHMENT_SOURCE_MANUAL,
      uploadedBy: actor.name || actor.email || actor.id,
    },
  });
  return attachmentSummary(row);
}

export async function getCableMasterAttachmentContent(materialNumber: string, attachmentId: string) {
  const prisma = requirePrisma();
  const row = await prisma.cableMasterAttachment.findFirst({
    where: { id: attachmentId, materialNumber },
  });
  if (!row) {
    const err = new Error('Attachment not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  return row;
}

export async function deleteCableMasterAttachment(
  materialNumber: string,
  attachmentId: string,
  actor: RequestActor
) {
  assertCanProcessTechnicalOffice(actor);
  const prisma = requirePrisma();
  const existing = await prisma.cableMasterAttachment.findFirst({
    where: { id: attachmentId, materialNumber },
  });
  if (!existing) {
    const err = new Error('Attachment not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  await prisma.cableMasterAttachment.delete({ where: { id: attachmentId } });
  return { deleted: true, id: attachmentId };
}

export async function copyCableMasterAttachmentsToLine(
  inquiryLineId: string,
  materialNumber: string,
  actor: { name?: string; email?: string; id?: string }
) {
  const prisma = requirePrisma();
  const defaults = await prisma.cableMasterAttachment.findMany({
    where: { materialNumber },
  });
  if (!defaults.length) return [];

  const created = [];
  for (const master of defaults) {
    const row = await prisma.commercialInquiryLineAttachment.create({
      data: {
        inquiryLineId,
        kind: master.kind,
        fileName: master.fileName,
        mimeType: master.mimeType,
        byteSize: master.byteSize,
        content: master.content,
        source: ATTACHMENT_SOURCE_CABLE_MASTER,
        cableMasterAttachmentId: master.id,
        uploadedBy: actor.name || actor.email || actor.id,
      },
    });
    created.push(attachmentSummary(row));
  }
  return created;
}

export async function copyLineAttachmentsToLine(
  sourceLineId: string,
  targetLineId: string,
  actor: { name?: string; email?: string; id?: string }
) {
  const prisma = requirePrisma();
  const sourceRows = await prisma.commercialInquiryLineAttachment.findMany({
    where: { inquiryLineId: sourceLineId },
  });
  const created = [];
  for (const src of sourceRows) {
    const row = await prisma.commercialInquiryLineAttachment.create({
      data: {
        inquiryLineId: targetLineId,
        kind: src.kind,
        fileName: src.fileName,
        mimeType: src.mimeType,
        byteSize: src.byteSize,
        content: src.content,
        source: src.source,
        cableMasterAttachmentId: src.cableMasterAttachmentId,
        uploadedBy: actor.name || actor.email || actor.id,
      },
    });
    created.push(attachmentSummary(row));
  }
  return created;
}

export async function listInquiryLineAttachments(inquiryLineId: string) {
  const prisma = requirePrisma();
  const rows = await prisma.commercialInquiryLineAttachment.findMany({
    where: { inquiryLineId },
    orderBy: { kind: 'asc' },
    select: {
      id: true,
      kind: true,
      fileName: true,
      mimeType: true,
      byteSize: true,
      source: true,
      uploadedBy: true,
      createdAt: true,
    },
  });
  return rows.map(attachmentSummary);
}

export async function upsertInquiryLineAttachment(
  inquiryLineId: string,
  input: { kind: string; fileName: string; mimeType?: string; contentBase64: string; source?: string },
  actor: RequestActor
) {
  assertCanProcessTechnicalOffice(actor);
  const prisma = requirePrisma();
  const kind = (input.kind || LINE_ATTACHMENT_KIND_TECHNICAL_OFFER).trim();
  const fileName = (input.fileName || '').trim();
  if (!fileName) {
    const err = new Error('fileName is required.');
    (err as Error & { code: string }).code = 'INVALID_REQUEST_INPUTS';
    throw err;
  }
  const content = decodeAttachmentContent(input.contentBase64);
  const existing = await prisma.commercialInquiryLineAttachment.findFirst({
    where: { inquiryLineId, kind },
  });
  const row = existing
    ? await prisma.commercialInquiryLineAttachment.update({
        where: { id: existing.id },
        data: {
          fileName,
          mimeType: input.mimeType?.trim() || 'application/octet-stream',
          byteSize: content.length,
          content,
          source: input.source?.trim() || ATTACHMENT_SOURCE_MANUAL,
          uploadedBy: actor.name || actor.email || actor.id,
        },
      })
    : await prisma.commercialInquiryLineAttachment.create({
        data: {
          inquiryLineId,
          kind,
          fileName,
          mimeType: input.mimeType?.trim() || 'application/octet-stream',
          byteSize: content.length,
          content,
          source: input.source?.trim() || ATTACHMENT_SOURCE_MANUAL,
          uploadedBy: actor.name || actor.email || actor.id,
        },
      });
  return attachmentSummary(row);
}

export async function getInquiryLineAttachmentContent(inquiryLineId: string, attachmentId: string) {
  const prisma = requirePrisma();
  const row = await prisma.commercialInquiryLineAttachment.findFirst({
    where: { id: attachmentId, inquiryLineId },
  });
  if (!row) {
    const err = new Error('Attachment not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  return row;
}

export async function deleteInquiryLineAttachment(
  inquiryLineId: string,
  attachmentId: string,
  actor: RequestActor
) {
  assertCanProcessTechnicalOffice(actor);
  const prisma = requirePrisma();
  const existing = await prisma.commercialInquiryLineAttachment.findFirst({
    where: { id: attachmentId, inquiryLineId },
  });
  if (!existing) {
    const err = new Error('Attachment not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  await prisma.commercialInquiryLineAttachment.delete({ where: { id: attachmentId } });
  return { deleted: true, id: attachmentId };
}

export async function linesMissingTechnicalOffer(inquiryId: string): Promise<number[]> {
  const prisma = requirePrisma();
  const lines = await prisma.commercialInquiryLine.findMany({
    where: { inquiryId },
    include: { attachments: { select: { kind: true } } },
    orderBy: { lineNumber: 'asc' },
  });
  return lines
    .filter(
      (line) =>
        !line.attachments.some((a) => a.kind === LINE_ATTACHMENT_KIND_TECHNICAL_OFFER)
    )
    .map((l) => l.lineNumber);
}
