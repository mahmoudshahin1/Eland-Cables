import { Module } from '@nestjs/common';
import { InquiriesService } from './inquiries.service.js';
import { InquiriesController } from './inquiries.controller.js';

@Module({
  controllers: [InquiriesController],
  providers: [InquiriesService],
  exports: [InquiriesService],
})
export class InquiriesModule {}
