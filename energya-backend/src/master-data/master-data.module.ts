import { Module } from '@nestjs/common';
import { CablesSubModule } from './cables/cables.module.js';
import { RawMaterialsSubModule } from './raw-materials/raw-materials.module.js';
import { BomsSubModule } from './boms/boms.module.js';
import { DrumsSubModule } from './drums/drums.module.js';
import { ReferenceSubModule } from './reference/reference.module.js';

@Module({
  imports: [
    CablesSubModule,
    RawMaterialsSubModule,
    BomsSubModule,
    DrumsSubModule,
    ReferenceSubModule,
  ],
  exports: [
    CablesSubModule,
    RawMaterialsSubModule,
    BomsSubModule,
    DrumsSubModule,
    ReferenceSubModule,
  ],
})
export class MasterDataModule {}
