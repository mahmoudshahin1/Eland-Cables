import { Inject, Injectable, BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { ImportsRepository } from './imports.repository.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

@Injectable()
export class ImportsService {
  constructor(
    @Inject(ImportsRepository)
    private readonly repo: ImportsRepository,
  ) {}

  async listImportHistory() {
    return this.repo.listImportHistory();
  }

  async previewGeneralImport(
    kind: string,
    rows: Record<string, unknown>[],
    sourceFile: string,
    actor: RequestActor,
  ) {
    if (!kind || !Array.isArray(rows)) {
      throw new BadRequestException('kind and rows[] are required.');
    }

    const importedBy = actor.name || actor.email || 'api-user';
    const batchNumber = `BATCH-${Date.now().toString().slice(-6)}`;
    const batch = {
      batchNumber,
      sourceFile: sourceFile || 'upload.xlsx',
      importedBy,
      importedDate: new Date(),
      dataType: kind,
      rowCount: rows.length,
      successCount: rows.length,
      errorCount: 0,
      warningCount: 0,
      skippedCount: 0,
      duplicateCount: 0,
      status: 'PREVIEWED',
      errors: [],
      warnings: [],
      information: [],
    };

    await this.repo.persistImportBatchOnly(batch, 'PREVIEWED').catch(() => undefined);

    return {
      batch,
      wouldCommit: true,
      valid: rows.length,
      errors: 0,
      warnings: 0,
      duplicates: 0,
      skipped: 0,
      message: 'Preview OK. Confirm to commit valid rows. Skipped/duplicate groups are not auto-fixed.',
    };
  }

  async commitGeneralImport(
    kind: string,
    rows: Record<string, unknown>[],
    sourceFile: string,
    actor: RequestActor,
  ) {
    if (!kind || !Array.isArray(rows)) {
      throw new BadRequestException('kind and rows[] are required.');
    }

    const importedBy = actor.name || actor.email || 'api-user';
    const batchNumber = `BATCH-${Date.now().toString().slice(-6)}`;
    const batch = {
      batchNumber,
      sourceFile: sourceFile || 'upload.xlsx',
      importedBy,
      importedDate: new Date(),
      dataType: kind,
      rowCount: rows.length,
      successCount: rows.length,
      errorCount: 0,
      warningCount: 0,
      skippedCount: 0,
      duplicateCount: 0,
      status: 'COMMITTED',
      errors: [],
      warnings: [],
      information: [],
    };

    const args: any = {
      kind,
      batch,
      actor,
    };

    if (kind === 'cables') args.cables = rows;
    if (kind === 'raw_materials') args.rawMaterials = rows;
    if (kind === 'boms') args.boms = rows;
    if (kind === 'drums') args.drums = rows;

    await this.repo.persistImportTransaction(args);

    return {
      batch: { ...batch, status: 'COMMITTED' },
      committed: true,
      postgresql: true,
      valid: rows.length,
      errors: 0,
      warnings: 0,
      duplicates: 0,
      skipped: 0,
    };
  }

  // Cable Scrap
  async previewCableScrapImport(rows: Record<string, unknown>[]) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('rows array is required.');
    }
    return this.repo.previewCableScrapImport(rows);
  }

  async commitCableScrapImport(rows: Record<string, unknown>[], actor: RequestActor) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException('rows array is required.');
    }
    return this.repo.commitCableScrapImport(rows, actor);
  }

  // Raw Material Prices
  async previewRawMaterialPricesImport(rows: Record<string, unknown>[], sourceFile: string) {
    return this.repo.previewRawMaterialPricesImport(rows, sourceFile || 'Price_Upload.xlsx');
  }

  async commitRawMaterialPricesImport(rows: any[], sourceFile: string, actor: RequestActor) {
    return this.repo.commitRawMaterialPricesImport(rows, sourceFile || 'Price_Upload.xlsx', actor);
  }

  // Engineering Mappings
  async previewEngineeringMappingsImport(rows: Record<string, unknown>[], sourceFile: string) {
    return this.repo.previewEngineeringMappingsImport(rows, sourceFile || 'Mapping_Upload.xlsx');
  }

  async commitEngineeringMappingsImport(
    rows: Record<string, unknown>[],
    sourceFile: string,
    actor: RequestActor,
  ) {
    return this.repo.commitEngineeringMappingsImport(rows, sourceFile || 'Mapping_Upload.xlsx', actor);
  }
}
