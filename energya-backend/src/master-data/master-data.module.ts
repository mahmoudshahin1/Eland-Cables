import { Module } from '@nestjs/common';
import { MasterDataService } from './master-data.service.js';
import { MasterDataController } from './master-data.controller.js';

@Module({
  controllers: [MasterDataController],
  providers: [MasterDataService],
  exports: [MasterDataService],
})
export class MasterDataModule {}
