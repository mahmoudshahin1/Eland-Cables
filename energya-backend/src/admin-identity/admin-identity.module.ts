import { Module } from '@nestjs/common';
import { AdminIdentityController } from './admin-identity.controller.js';
import { AdminIdentityService } from './admin-identity.service.js';

@Module({
  controllers: [AdminIdentityController],
  providers: [AdminIdentityService],
  exports: [AdminIdentityService],
})
export class AdminIdentityModule {}
