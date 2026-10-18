import { Module } from '@nestjs/common';
import { CablesSubModule } from './cables/cables.module.js';
import { RawMaterialsSubModule } from './raw-materials/raw-materials.module.js';
import { BomsSubModule } from './boms/boms.module.js';
import { DrumsSubModule } from './drums/drums.module.js';
import { ReferenceSubModule } from './reference/reference.module.js';
import { MarketMetalsSubModule } from './market-metals/market-metals.module.js';
import { ExportsSubModule } from './exports/exports.module.js';
import { ImportsSubModule } from './imports/imports.module.js';

@Module({
  imports: [
    CablesSubModule,
    RawMaterialsSubModule,
    BomsSubModule,
    DrumsSubModule,
    ReferenceSubModule,
    MarketMetalsSubModule,
    ExportsSubModule,
    ImportsSubModule,
  ],
  exports: [
    CablesSubModule,
    RawMaterialsSubModule,
    BomsSubModule,
    DrumsSubModule,
    ReferenceSubModule,
    MarketMetalsSubModule,
    ExportsSubModule,
    ImportsSubModule,
  ],
})
export class MasterDataModule {}
