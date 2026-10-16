import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma.service.js';
import { attachmentSummary } from '../common/master-data-dto.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const ATTACHMENT_SOURCE_MANUAL = 'MANUAL_UPLOAD';

export function decodeAttachmentContent(contentBase64: string): Buffer {
  const raw = (contentBase64 || '').replace(/^data:[^;]+;base64,/, '');
  const content = Buffer.from(raw, 'base64');
  if (!content.length) {
    throw new BadRequestException({ error: 'Attachment content is empty.', code: 'INVALID_REQUEST_INPUTS' });
  }
  if (content.length > MAX_ATTACHMENT_BYTES) {
    throw new BadRequestException({ error: 'Attachment exceeds 8 MB.', code: 'INVALID_REQUEST_INPUTS' });
  }
  return content;
}

@Injectable()
export class AttachmentsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(materialNumber: string) {
    const rows = await this.prisma.cableMasterAttachment.findMany({
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

  async getAttachmentContent(materialNumber: string, attachmentId: string) {
    const row = await this.prisma.cableMasterAttachment.findFirst({
      where: { id: attachmentId, materialNumber },
    });
    if (!row) {
      throw new NotFoundException({ error: 'Attachment not found.', code: 'NOT_FOUND' });
    }
    return row;
  }

  async upsert(
    materialNumber: string,
    input: {
      kind?: string;
      fileName?: string;
      mimeType?: string;
      contentBase64?: string;
      source?: string;
    },
    actor: RequestActor,
  ) {
    const kind = (input.kind || '').trim();
    if (!kind) {
      throw new BadRequestException({ error: 'kind is required.', code: 'INVALID_REQUEST_INPUTS' });
    }
    const fileName = (input.fileName || '').trim();
    if (!fileName) {
      throw new BadRequestException({ error: 'fileName is required.', code: 'INVALID_REQUEST_INPUTS' });
    }
    const content = decodeAttachmentContent(input.contentBase64 || '');
    const row = await this.prisma.cableMasterAttachment.upsert({
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

  async delete(materialNumber: string, attachmentId: string, _actor: RequestActor) {
    const existing = await this.prisma.cableMasterAttachment.findFirst({
      where: { id: attachmentId, materialNumber },
    });
    if (!existing) {
      throw new NotFoundException({ error: 'Attachment not found.', code: 'NOT_FOUND' });
    }
    await this.prisma.cableMasterAttachment.delete({
      where: { id: attachmentId },
    });
    return { deleted: true, id: attachmentId };
  }
}
