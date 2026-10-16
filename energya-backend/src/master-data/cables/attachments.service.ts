import { Injectable, Inject } from '@nestjs/common';
import { AttachmentsRepository } from './attachments.repository.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

@Injectable()
export class AttachmentsService {
  constructor(@Inject(AttachmentsRepository) private readonly attachmentsRepository: AttachmentsRepository) {}

  async listAttachments(materialNumber: string) {
    const attachments = await this.attachmentsRepository.list(materialNumber);
    return { attachments };
  }

  async getAttachmentContent(materialNumber: string, attachmentId: string) {
    return this.attachmentsRepository.getAttachmentContent(materialNumber, attachmentId);
  }

  async upsertAttachment(
    materialNumber: string,
    body: {
      kind?: string;
      fileName?: string;
      mimeType?: string;
      contentBase64?: string;
      source?: string;
    },
    actor: RequestActor,
  ) {
    const attachment = await this.attachmentsRepository.upsert(materialNumber, body, actor);
    return { attachment };
  }

  async deleteAttachment(materialNumber: string, attachmentId: string, actor: RequestActor) {
    return this.attachmentsRepository.delete(materialNumber, attachmentId, actor);
  }
}
