import { Inject, Injectable, BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';
import { writeAudit } from '../../shared/infra/legacy-ports.js';
import { asTrimmedString, getExcelVal } from '../../shared/domain/excelFieldUtils.js';

@Injectable()
export class ImportsRepository {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async listImportHistory() {
    return this.prisma.importBatch.findMany({
      orderBy: { importedDate: 'desc' },
      take: 100,
      include: { rows: true },
    });
  }

  async persistImportBatchOnly(batch: any, status: 'PREVIEWED' | 'COMMITTED' | 'REJECTED') {
    return this.prisma.importBatch.create({
      data: {
        batchNumber: batch.batchNumber,
        sourceFile: batch.sourceFile,
        importedBy: batch.importedBy,
        importedDate: new Date(batch.importedDate),
        dataType: batch.dataType,
        rowCount: batch.rowCount,
        successCount: batch.successCount,
        errorCount: batch.errorCount,
        warningCount: batch.warningCount,
        skippedCount: batch.skippedCount || 0,
        status,
        errorsJson: batch.errors || [],
        warningsJson: [...(batch.warnings || []), ...(batch.information || [])],
        rows: {
          create: [
            ...(batch.errors || []).map((e: any) => ({
              rowNumber: e.rowNumber,
              severity: 'ERROR',
              field: e.field,
              code: e.code,
              message: e.message,
            })),
            ...(batch.warnings || []).map((e: any) => ({
              rowNumber: e.rowNumber,
              severity: 'WARNING',
              field: e.field,
              code: e.code,
              message: e.message,
            })),
            ...(batch.information || []).map((e: any) => ({
              rowNumber: e.rowNumber,
              severity: 'INFORMATION',
              field: e.field,
              code: e.code,
              message: e.message,
            })),
          ],
        },
      },
    });
  }

  async persistImportTransaction(args: {
    kind: string;
    batch: any;
    cables?: any[];
    boms?: any[];
    drums?: any[];
    rawMaterials?: any[];
    duplicateObservations?: any[];
    actor: RequestActor;
  }) {
    if (args.batch.errorCount > 0 || args.batch.status === 'REJECTED') {
      await this.persistImportBatchOnly(args.batch, 'REJECTED');
      return;
    }

    const txTimeoutMs = args.kind === 'boms' ? 900_000 : 180_000;
    await this.prisma.$transaction(
      async (tx) => {
        if (args.kind === 'cables' && args.cables) {
          for (const cable of args.cables) {
            const data = {
              materialNumber: cable.cableCode,
              itemCode: cable.itemCode,
              customerCode: cable.customerCode,
              elandItemNumber: cable.elandItemNumber || null,
              description: cable.description,
              family: cable.family ?? null,
              voltage: cable.voltageClass || null,
              conductor: cable.conductor || null,
              cores: cable.cores || null,
              conductorSize: cable.crossSectionMm2 != null ? String(cable.crossSectionMm2) : null,
              insulation: cable.insulation ?? null,
              screen: cable.screen ?? null,
              armour: cable.armour ?? null,
              sheath: cable.sheath ?? null,
              diameter: cable.outerDiameterMm,
              weight: cable.approxWeightKgKm,
              uom: cable.uom || 'CONFIGURATION_REQUIRED',
              status: cable.status === 'INACTIVE' ? ('INACTIVE' as const) : ('ACTIVE' as const),
              sourceBatch: cable.sourceBatch || null,
            };
            const existing = await tx.cableMaster.findUnique({ where: { materialNumber: cable.cableCode } });
            if (!existing) {
              await tx.cableMaster.create({ data });
            } else {
              await tx.cableMaster.update({
                where: { materialNumber: cable.cableCode },
                data: {
                  ...data,
                  family: data.family ?? existing.family,
                  voltage: data.voltage ?? existing.voltage,
                  conductor: data.conductor ?? existing.conductor,
                },
              });
            }
          }
        }

        if (args.kind === 'raw_materials' && args.rawMaterials) {
          for (const rm of args.rawMaterials) {
            await tx.rawMaterial.upsert({
              where: { code: rm.rawMaterialCode },
              create: {
                code: rm.rawMaterialCode,
                description: rm.description,
                uom: rm.uom,
                category: rm.category || rm.materialType || null,
                pricingCategory: rm.pricingCategory || 'STANDARD_RAW_MATERIAL',
                metalType: rm.metalType || 'NONE',
                supplier: rm.supplier || null,
                currency: rm.currency || null,
                status: rm.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
                sourceBatch: rm.sourceBatch || null,
              },
              update: {
                description: rm.description,
                uom: rm.uom,
                category: rm.category || rm.materialType || null,
                pricingCategory: rm.pricingCategory || 'STANDARD_RAW_MATERIAL',
                metalType: rm.metalType || 'NONE',
                supplier: rm.supplier || null,
                currency: rm.currency || null,
                status: rm.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
                sourceBatch: rm.sourceBatch || null,
              },
            });
          }
        }

        if (args.kind === 'boms' && args.boms) {
          for (const line of args.boms) {
            await tx.cableBomLine.upsert({
              where: {
                cableMaterialNumber_rawMaterialCode_bomVersion: {
                  cableMaterialNumber: line.cableMaterialNumber,
                  rawMaterialCode: line.rawMaterial,
                  bomVersion: 1,
                },
              },
              create: {
                cableMaterialNumber: line.cableMaterialNumber,
                rawMaterialCode: line.rawMaterial,
                itemCode: line.itemCode || null,
                customerCode: line.customerCode || null,
                consumption: line.weight,
                uom: line.unitKm,
                bomVersion: 1,
                status: line.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
                sourceBatch: line.sourceBatch || null,
              },
              update: {
                itemCode: line.itemCode || null,
                customerCode: line.customerCode || null,
                consumption: line.weight,
                uom: line.unitKm,
                status: line.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
                sourceBatch: line.sourceBatch || null,
              },
            });
          }
        }

        if (args.kind === 'drums' && args.drums) {
          for (const drum of args.drums) {
            await tx.drumMaster.upsert({
              where: { drumCode: drum.drumCode },
              create: {
                drumCode: drum.drumCode,
                drumType: drum.drumType || null,
                description: drum.description || null,
                flange: drum.flange,
                barrel: drum.barrel,
                barrelWidth: drum.barrelWidth ?? null,
                innerWidth: drum.innerWidth,
                outerWidth: drum.outerWidth,
                usableWidth: drum.usableWidth ?? null,
                capacity: drum.capacity,
                maxWeight: drum.maxWeight ?? null,
                clearanceMm: drum.clearanceMm ?? null,
                emptyDrumNetWeightKg: drum.emptyDrumNetWeightKg ?? null,
                capacityUom: 'CONFIGURATION_REQUIRED',
                dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE',
                status: drum.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
                sourceBatch: drum.sourceBatch || null,
              },
              update: {
                drumType: drum.drumType || null,
                description: drum.description || null,
                flange: drum.flange,
                barrel: drum.barrel,
                innerWidth: drum.innerWidth,
                outerWidth: drum.outerWidth,
                capacity: drum.capacity,
                status: drum.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
                sourceBatch: drum.sourceBatch || null,
              },
            });
          }
        }

        await tx.importBatch.create({
          data: {
            batchNumber: args.batch.batchNumber,
            sourceFile: args.batch.sourceFile,
            importedBy: args.batch.importedBy,
            importedDate: new Date(args.batch.importedDate),
            dataType: args.batch.dataType,
            rowCount: args.batch.rowCount,
            successCount: args.batch.successCount,
            errorCount: args.batch.errorCount,
            warningCount: args.batch.warningCount,
            skippedCount: args.batch.skippedCount || 0,
            status: 'COMMITTED',
            errorsJson: args.batch.errors || [],
            warningsJson: [...(args.batch.warnings || []), ...(args.batch.information || [])],
          },
        });
      },
      { timeout: txTimeoutMs },
    );

    const entity =
      args.kind === 'cables'
        ? 'CableMaster'
        : args.kind === 'boms'
          ? 'CableBom'
          : args.kind === 'drums'
            ? 'DrumMaster'
            : 'RawMaterial';
    const action =
      args.kind === 'boms'
        ? 'BOM_CHANGE'
        : args.kind === 'drums'
          ? 'DRUM_CHANGE'
          : args.kind === 'raw_materials'
            ? 'PRICE_CHANGE'
            : 'IMPORT';

    await writeAudit({
      actor: args.actor,
      entity,
      entityId: args.batch.batchNumber,
      action: args.kind === 'cables' ? 'IMPORT' : action,
      newValue: { kind: args.kind, successCount: args.batch.successCount },
      message: `Import ${args.batch.batchNumber} committed`,
    });
  }

  // Cable Scrap Import
  async previewCableScrapImport(rows: Record<string, unknown>[]) {
    const previewRows: any[] = [];
    let validCount = 0;
    let errorCount = 0;

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const rowNumber = idx + 2;
      const errors: any[] = [];
      const warnings: any[] = [];

      const materialNumber = asTrimmedString(
        getExcelVal(row, ['Cable Material Number', 'Material Number', 'CableMaterialNumber']),
      );
      const metal = asTrimmedString(getExcelVal(row, ['Metal', 'Conductor Metal'])).toUpperCase();
      const family = asTrimmedString(getExcelVal(row, ['Family', 'Cable Family']));
      const scrapRaw = getExcelVal(row, ['Scrap %', 'Scrape %', 'Scrap', 'Scrape', 'Scrap Percent']);

      if (!materialNumber) {
        errors.push({ field: 'Cable Material Number', message: 'Cable Material Number is required.', code: 'REQUIRED' });
      }

      let scrapPercent: number | null = null;
      if (scrapRaw == null || scrapRaw === '') {
        warnings.push({ field: 'Scrap %', message: 'Scrap % is blank — row will be skipped on commit.', code: 'SKIPPED' });
      } else {
        const cleaned = String(scrapRaw).replace(/%/g, '').trim();
        const parsed = Number(cleaned);
        if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
          errors.push({ field: 'Scrap %', message: `Invalid scrap percent "${scrapRaw}". Must be between 0 and 100.`, code: 'INVALID_SCRAP_RATE' });
        } else {
          scrapPercent = parsed;
        }
      }

      let bomLineCount = 0;
      if (materialNumber) {
        const cable = await this.prisma.cableMaster.findUnique({
          where: { materialNumber },
          include: { governedBomLines: true },
        });
        if (!cable) {
          errors.push({
            field: 'Cable Material Number',
            message: `Cable "${materialNumber}" was not found in Cable Master.`,
            code: 'CABLE_NOT_FOUND',
          });
        } else {
          bomLineCount = cable.governedBomLines.length;
          if (bomLineCount === 0) {
            errors.push({
              field: 'Cable Material Number',
              message: `Cable "${materialNumber}" has no BOM lines to apply scrap.`,
              code: 'BOM_NOT_FOUND',
            });
          }
        }
      }

      const status = errors.length > 0 ? 'ERROR' : warnings.length > 0 ? 'WARNING' : 'VALID';
      if (status === 'VALID') validCount += 1;
      if (status === 'ERROR') errorCount += 1;

      previewRows.push({
        rowNumber,
        cableMaterialNumber: materialNumber,
        scrapPercent,
        metal,
        family,
        status,
        bomLineCount,
        errors,
        warnings,
      });
    }

    return { rows: previewRows, validCount, errorCount };
  }

  async commitCableScrapImport(rows: Record<string, unknown>[], actor: RequestActor) {
    const preview = await this.previewCableScrapImport(rows);
    const errors: any[] = [];
    let updatedCables = 0;
    let skippedRows = 0;

    for (const row of preview.rows) {
      if (row.status === 'ERROR') {
        errors.push({
          rowNumber: row.rowNumber,
          message: row.errors.map((e: any) => e.message).join(' '),
          code: row.errors[0]?.code || 'IMPORT_ERROR',
        });
        continue;
      }
      if (row.scrapPercent == null) {
        skippedRows += 1;
        continue;
      }

      await this.prisma.governedBomLine.updateMany({
        where: { cableMaterialNumber: row.cableMaterialNumber },
        data: { scrapPercentage: row.scrapPercent },
      });

      await writeAudit({
        actor,
        entity: 'GovernedBomLine',
        entityId: row.cableMaterialNumber,
        action: 'UPDATE',
        newValue: { scrapPercentage: row.scrapPercent },
        message: `Updated scrap percentage to ${row.scrapPercent}% for cable ${row.cableMaterialNumber}`,
      });

      updatedCables += 1;
    }

    return { updatedCables, skippedRows, errors };
  }

  // Raw Material Prices Import
  async previewRawMaterialPricesImport(rows: Record<string, unknown>[], sourceFile: string) {
    const [rms, approvedPrices] = await Promise.all([
      this.prisma.rawMaterial.findMany({ select: { code: true } }),
      this.prisma.rawMaterialPrice.findMany({ where: { workflowStatus: 'APPROVED' } }),
    ]);

    const existingCodes = new Set<string>(rms.map((r) => r.code.toUpperCase()));
    const previewRows: any[] = [];
    const seenCodesInFile = new Map<string, number>();

    rows.forEach((row, idx) => {
      const rowNumber = idx + 2;
      const rawCode = asTrimmedString(getExcelVal(row, ['Raw Material Code', 'RawMaterialCode', 'Code']));
      const priceRaw = getExcelVal(row, ['Price']);
      const currency = asTrimmedString(getExcelVal(row, ['Currency']));
      const uom = asTrimmedString(getExcelVal(row, ['UOM', 'Unit of Measurement', 'Unit']));
      const effectiveFrom = asTrimmedString(getExcelVal(row, ['Effective From', 'From']));
      const effectiveTo = asTrimmedString(getExcelVal(row, ['Effective To', 'To']));
      const supplier = asTrimmedString(getExcelVal(row, ['Supplier']));
      const source = asTrimmedString(getExcelVal(row, ['Source']));
      const priceBasis = asTrimmedString(getExcelVal(row, ['Price Basis', 'PriceBasis'])) || 'PER_KG';
      const comment = asTrimmedString(getExcelVal(row, ['Comment', 'Notes']));

      const errors: Array<{ field: string; message: string; code: string }> = [];

      if (!rawCode) {
        errors.push({ field: 'rawMaterialCode', message: 'Raw Material Code is required.', code: 'REQUIRED' });
      } else if (!existingCodes.has(rawCode.toUpperCase())) {
        errors.push({ field: 'rawMaterialCode', message: `Raw Material Code "${rawCode}" does not exist in Raw Materials.`, code: 'NOT_FOUND' });
      }

      const parsedPrice = priceRaw === '' || priceRaw === undefined || priceRaw === null ? null : Number(priceRaw);
      if (parsedPrice != null && (Number.isNaN(parsedPrice) || parsedPrice < 0)) {
        errors.push({ field: 'price', message: 'Price must be a non-negative number.', code: 'INVALID_NUMBER' });
      }

      if (rawCode) {
        const key = rawCode.toUpperCase();
        if (seenCodesInFile.has(key)) {
          errors.push({
            field: 'rawMaterialCode',
            message: `Duplicate Raw Material Code "${rawCode}" in row ${seenCodesInFile.get(key)}.`,
            code: 'DUPLICATE',
          });
        } else {
          seenCodesInFile.set(key, rowNumber);
        }

        if (errors.length === 0 && effectiveFrom) {
          const fromDate = new Date(effectiveFrom);
          const toDate = effectiveTo ? new Date(effectiveTo) : null;
          const overlap = approvedPrices.find((p) => {
            if (p.rawMaterialCode.toUpperCase() !== key) return false;
            const pFrom = p.effectiveFrom ? new Date(p.effectiveFrom) : null;
            const pTo = p.effectiveTo ? new Date(p.effectiveTo) : null;
            if (!pFrom) return false;
            if (toDate && toDate < pFrom) return false;
            if (pTo && fromDate > pTo) return false;
            return true;
          });
          if (overlap) {
            errors.push({
              field: 'effectiveFrom',
              message: `Overlapping price period with existing approved price ${overlap.id}.`,
              code: 'PRICE_PERIOD_OVERLAP',
            });
          }
        }
      }

      previewRows.push({
        rowNumber,
        rawMaterialCode: rawCode || `ROW-${rowNumber}`,
        valid: errors.length === 0,
        errors,
        parsedInput: {
          rawMaterialCode: rawCode,
          price: parsedPrice,
          currency,
          uom,
          effectiveFrom,
          effectiveTo,
          supplier,
          source: source || `Excel import: ${sourceFile}`,
          priceBasis,
          comment,
        },
      });
    });

    const totalRows = previewRows.length;
    const invalidCount = previewRows.filter((r) => !r.valid).length;
    const validCount = previewRows.filter((r) => r.valid).length;

    return {
      preview: {
        sourceFile,
        totalRows,
        validCount,
        invalidCount,
        canSubmit: invalidCount === 0 && totalRows > 0,
        rows: previewRows,
      },
    };
  }

  async commitRawMaterialPricesImport(rows: any[], sourceFile: string, actor: RequestActor) {
    const createdDrafts: any[] = [];
    for (const row of rows) {
      const input = row.parsedInput || row;
      const code = input.rawMaterialCode.toUpperCase();
      const latest = await this.prisma.rawMaterialPrice.findFirst({
        where: { rawMaterialCode: code },
        orderBy: { revision: 'desc' },
      });
      const nextRevision = (latest?.revision || 0) + 1;

      const draft = await this.prisma.rawMaterialPrice.create({
        data: {
          rawMaterialCode: code,
          price: input.price != null ? input.price : null,
          currency: input.currency ? input.currency.toUpperCase() : null,
          uom: input.uom || 'KG',
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
          supplier: input.supplier || null,
          source: input.source || `Excel import: ${sourceFile}`,
          priceBasis: input.priceBasis === 'PER_TON' ? 'PER_TON' : 'PER_KG',
          workflowStatus: 'DRAFT',
          status: 'ACTIVE',
          isCurrent: false,
          revision: nextRevision,
          comment: input.comment || null,
        },
      });

      await writeAudit({
        actor,
        entity: 'RawMaterialPrice',
        entityId: draft.id,
        action: 'CREATE',
        newValue: draft,
        message: `Created price draft for ${code} via Excel import: ${sourceFile}`,
      });

      createdDrafts.push(draft);
    }

    return {
      sourceFile,
      importedCount: createdDrafts.length,
      prices: createdDrafts,
      message: `Successfully imported ${createdDrafts.length} price proposals as DRAFT.`,
    };
  }

  // Engineering Mappings Import
  async previewEngineeringMappingsImport(rows: Record<string, unknown>[], sourceFile: string) {
    const [cables, parameters] = await Promise.all([
      this.prisma.cableMaster.findMany({ select: { materialNumber: true, description: true } }),
      this.prisma.cableParameter.findMany({ where: { status: 'ACTIVE' } }),
    ]);

    const existingMap = new Map<string, { materialNumber: string; description: string }>(
      cables.map((c) => [c.materialNumber.toLowerCase(), { materialNumber: c.materialNumber, description: c.description }]),
    );

    const previewRows: any[] = [];
    rows.forEach((row, idx) => {
      const rowNumber = idx + 2;
      const materialNumber = asTrimmedString(getExcelVal(row, ['Material Number', 'Cable Material Number', 'CableMaterialNumber']));
      const errors: any[] = [];

      if (!materialNumber) {
        errors.push({ field: 'materialNumber', message: 'Material Number is required.', code: 'REQUIRED' });
      } else if (!existingMap.has(materialNumber.toLowerCase())) {
        errors.push({ field: 'materialNumber', message: `Material Number "${materialNumber}" not found in Cable Master.`, code: 'CABLE_NOT_FOUND' });
      }

      const parsedInput = {
        materialNumber,
        description: asTrimmedString(getExcelVal(row, ['Cable Description', 'Description'])),
        family: asTrimmedString(getExcelVal(row, ['Cable Family', 'Family'])),
        voltage: asTrimmedString(getExcelVal(row, ['Voltage'])),
        conductor: asTrimmedString(getExcelVal(row, ['Conductor Material', 'Conductor'])),
        conductorSize: asTrimmedString(getExcelVal(row, ['Conductor Size', 'Size'])),
        cores: asTrimmedString(getExcelVal(row, ['Number of Cores', 'Cores'])),
        insulation: asTrimmedString(getExcelVal(row, ['Insulation'])),
        screen: asTrimmedString(getExcelVal(row, ['Screen'])),
        armour: asTrimmedString(getExcelVal(row, ['Armour'])),
        sheath: asTrimmedString(getExcelVal(row, ['Sheath'])),
        sheathColour: asTrimmedString(getExcelVal(row, ['Sheath Colour', 'SheathColour'])),
        coreColour: asTrimmedString(getExcelVal(row, ['Core Colour', 'CoreColour'])),
        standard: asTrimmedString(getExcelVal(row, ['Standard'])),
        specialAdditives: asTrimmedString(getExcelVal(row, ['Special Additives', 'SpecialAdditives'])),
        comment: asTrimmedString(getExcelVal(row, ['Comment'])),
      };

      previewRows.push({
        rowNumber,
        materialNumber: materialNumber || `ROW-${rowNumber}`,
        valid: errors.length === 0,
        errors,
        parsedInput,
      });
    });

    const totalRows = previewRows.length;
    const invalidCount = previewRows.filter((r) => !r.valid).length;
    const validCount = previewRows.filter((r) => r.valid).length;
    const duplicateCount = previewRows.filter((r) => r.errors.some((e: any) => e.code === 'DUPLICATE')).length;
    const unknownCableCount = previewRows.filter((r) =>
      r.errors.some((e: any) => e.code === 'UNKNOWN_MATERIAL_NUMBER')
    ).length;

    return {
      preview: {
        sourceFile,
        totalRows,
        validCount,
        invalidCount,
        duplicateCount,
        unknownCableCount,
        canSubmit: invalidCount === 0 && totalRows > 0,
        rows: previewRows,
      },
    };
  }

  async commitEngineeringMappingsImport(rows: Record<string, unknown>[], sourceFile: string, actor: RequestActor) {
    const preview = await this.previewEngineeringMappingsImport(rows, sourceFile);
    if (!preview.preview.canSubmit) {
      throw new UnprocessableEntityException({
        error: `Import validation failed. ${preview.preview.invalidCount} invalid rows found.`,
        preview: preview.preview,
        code: 'IMPORT_VALIDATION_FAILED',
      });
    }

    const updatedRecords: any[] = [];
    for (const r of preview.preview.rows) {
      const input = r.parsedInput;
      const current = await this.prisma.cableEngineeringMapping.findFirst({
        where: { materialNumber: r.materialNumber, isCurrent: true },
      });

      let record;
      if (!current) {
        record = await this.prisma.cableEngineeringMapping.create({
          data: {
            materialNumber: r.materialNumber,
            revision: 1,
            isCurrent: true,
            status: 'DRAFT',
            mappingStatus: 'INCOMPLETE',
            dataSource: 'EXCEL_IMPORT',
            sourceReference: sourceFile,
            attributes: [],
            family: input.family || null,
            voltage: input.voltage || null,
            conductor: input.conductor || null,
            conductorSize: input.conductorSize || null,
            cores: input.cores || null,
            insulation: input.insulation || null,
            screen: input.screen || null,
            armour: input.armour || null,
            sheath: input.sheath || null,
            sheathColour: input.sheathColour || null,
            coreColour: input.coreColour || null,
            standard: input.standard || null,
            specialAdditives: input.specialAdditives || null,
            comments: input.comment || null,
            createdBy: actor.name || actor.email || 'technical-office',
          },
        });
      } else {
        record = await this.prisma.cableEngineeringMapping.update({
          where: { id: current.id },
          data: {
            family: input.family || current.family,
            voltage: input.voltage || current.voltage,
            conductor: input.conductor || current.conductor,
            conductorSize: input.conductorSize || current.conductorSize,
            cores: input.cores || current.cores,
            insulation: input.insulation || current.insulation,
            screen: input.screen || current.screen,
            armour: input.armour || current.armour,
            sheath: input.sheath || current.sheath,
            sheathColour: input.sheathColour || current.sheathColour,
            coreColour: input.coreColour || current.coreColour,
            standard: input.standard || current.standard,
            specialAdditives: input.specialAdditives || current.specialAdditives,
            comments: input.comment || current.comments,
          },
        });
      }

      await writeAudit({
        actor,
        entity: 'CableEngineeringMapping',
        entityId: r.materialNumber,
        action: current ? 'UPDATE' : 'CREATE',
        newValue: record,
        message: `Imported mapping for ${r.materialNumber} from ${sourceFile}`,
      });

      updatedRecords.push(record);
    }

    return {
      sourceFile,
      importedCount: updatedRecords.length,
      records: updatedRecords,
    };
  }
}
