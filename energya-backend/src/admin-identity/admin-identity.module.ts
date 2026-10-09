import { Module } from '@nestjs/common';
import { AdminIdentityRepository } from './admin-identity.repository.js';
import { AdminIdentityController } from './admin-identity.controller.js';
import { AdminIdentityService } from './admin-identity.service.js';

@Module({
  controllers: [AdminIdentityController],
  providers: [AdminIdentityService, AdminIdentityRepository],
  exports: [AdminIdentityService],
})
export class AdminIdentityModule {}
