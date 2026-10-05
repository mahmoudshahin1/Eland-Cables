import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { InquiriesService } from './inquiries.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { RequestUser } from '../auth/current-user.decorator.js';

@Controller('api/inquiries')
@UseGuards(JwtAuthGuard)
export class InquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  @Get()
  async listInquiries(
    @CurrentUser() actor: RequestUser,
    @Query() query: any,
  ) {
    return this.inquiriesService.listInquiries(actor, query);
  }

  @Get(':id')
  async getInquiryById(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
  ) {
    return this.inquiriesService.getInquiryById(id, actor);
  }

  @Post()
  async createInquiry(
    @CurrentUser() actor: RequestUser,
    @Body() data: any,
  ) {
    return this.inquiriesService.createInquiry(actor, data);
  }

  @Patch(':id')
  async updateInquiry(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.inquiriesService.updateInquiry(id, actor, data);
  }

  @Post(':id/submit')
  async submitInquiry(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
  ) {
    return this.inquiriesService.submitInquiry(id, actor);
  }

  @Post(':id/cancel')
  async cancelInquiry(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.inquiriesService.cancelInquiry(id, actor, reason);
  }

  @Post(':id/status')
  async updateStatus(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body('status') status: any,
  ) {
    return this.inquiriesService.updateStatus(id, actor, status);
  }

  @Post(':id/lines')
  async addLine(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() lineData: any,
  ) {
    return this.inquiriesService.addLine(id, actor, lineData);
  }

  @Patch(':id/lines/:lineId')
  async updateLine(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() lineData: any,
  ) {
    return this.inquiriesService.updateLine(id, lineId, actor, lineData);
  }

  @Delete(':id/lines/:lineId')
  async deleteLine(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ) {
    return this.inquiriesService.deleteLine(id, lineId, actor);
  }
}
