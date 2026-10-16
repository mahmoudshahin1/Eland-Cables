import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Inject,
} from '@nestjs/common';
import { Response } from 'express';
import { AttachmentsService } from './attachments.service.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { MasterWriteAuthGuard } from '../../common/guards/master-data-auth.guard.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

@Controller('api/master')
@UsePipes(new ValidationPipe({ whitelist: false, forbidNonWhitelisted: false }))
export class AttachmentsController {
  constructor(@Inject(AttachmentsService) private readonly attachmentsService: AttachmentsService) {}

  // Public: No auth guard (SEC-MD-02 parity)
  @Get('cables/:materialNumber/attachments')
  async listAttachments(@Param('materialNumber') materialNumber: string) {
    return this.attachmentsService.listAttachments(materialNumber);
  }

  // Public: No auth guard (SEC-MD-02 parity)
  @Get('cables/:materialNumber/attachments/:attachmentId')
  async getAttachmentFile(
    @Param('materialNumber') materialNumber: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const row = await this.attachmentsService.getAttachmentContent(materialNumber, attachmentId);
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${row.fileName.replace(/"/g, '')}"`);
    res.send(Buffer.from(row.content));
  }

  @UseGuards(JwtAuthGuard, MasterWriteAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @Post('cables/:materialNumber/attachments')
  async uploadAttachment(
    @Param('materialNumber') materialNumber: string,
    @Body() body: any,
    @Req() req: { user: RequestActor },
  ) {
    return this.attachmentsService.upsertAttachment(materialNumber, body, req.user);
  }

  @UseGuards(JwtAuthGuard, MasterWriteAuthGuard)
  @Delete('cables/:materialNumber/attachments/:attachmentId')
  async deleteAttachment(
    @Param('materialNumber') materialNumber: string,
    @Param('attachmentId') attachmentId: string,
    @Req() req: { user: RequestActor },
  ) {
    return this.attachmentsService.deleteAttachment(materialNumber, attachmentId, req.user);
  }
}
