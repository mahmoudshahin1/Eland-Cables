import { Module } from '@nestjs/common';
import { CablesController } from './cables.controller.js';
import { CablesService } from './cables.service.js';
import { CablesRepository } from './cables.repository.js';
import { AttachmentsController } from './attachments.controller.js';
import { AttachmentsService } from './attachments.service.js';
import { AttachmentsRepository } from './attachments.repository.js';
import { CustomerCatalogController } from './customer-catalog.controller.js';
import { AuthModule } from '../../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [CablesController, AttachmentsController, CustomerCatalogController],
  providers: [
    CablesService,
    CablesRepository,
    AttachmentsService,
    AttachmentsRepository,
  ],
  exports: [CablesService, CablesRepository, AttachmentsService, AttachmentsRepository],
})
export class CablesSubModule {}
