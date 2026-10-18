import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service.js';
import { bomFromRow } from '../common/master-data-dto.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

@Injectable()
export class BomsRepository {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async listBoms() {
    const [rows, governed] = await Promise.all([
      this.prisma.cableBomLine.findMany({
        orderBy: [{ cableMaterialNumber: 'asc' }, { rawMaterialCode: 'asc' }],
      }),
      this.prisma.governedBomLine.findMany({
        where: { status: 'APPROVED' },
        select: { cableMaterialNumber: true, rawMaterialCode: true, bomVersion: true, scrapPercentage: true },
      }),
    ]);

    const scrapByLine = new Map<string, number | null>();
    for (const g of governed) {
      if (g.scrapPercentage == null) continue;
      const key = `${g.cableMaterialNumber}|${g.rawMaterialCode}|${g.bomVersion}`;
      scrapByLine.set(key, Math.round(Number(g.scrapPercentage) * 10000) / 100);
    }

    return rows.map((row) => {
      const key = `${row.cableMaterialNumber}|${row.rawMaterialCode}|${row.bomVersion}`;
      return bomFromRow({
        ...row,
        scrapPercent: scrapByLine.get(key) ?? null,
      });
    });
  }

  async persistExcelCommit(args: {
    lines: Array<{
      cableMaterialNumber: string;
      rawMaterial: string;
      itemCode?: string;
      customerCode?: string;
      weight: number;
      unitKm?: string;
      status?: 'ACTIVE' | 'INACTIVE';
      sourceBatch?: string;
    }>;
    replaceCableMaterialNumbers?: string[];
    duplicateObservations?: Array<{
      cableMaterialNumber: string;
      rawMaterialCode: string;
      weightA: number;
      weightB: number;
      occurrenceCount: number;
      sourceWorksheet?: string;
      sourceFile?: string;
      sourceRowNumbers: number[];
      classification: string;
    }>;
    sourceFile?: string;
    actor: RequestActor;
  }): Promise<{ upserted: number; skippedDuplicates: number; batchRef: string }> {
    if (!args.lines?.length) {
      const err = new Error('At least one BOM line is required.');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    const cableNumbers = [...new Set(args.lines.map((l) => l.cableMaterialNumber.trim()))];
    const rmCodes = [...new Set(args.lines.map((l) => l.rawMaterial.trim().toUpperCase()))];

    const [cables, rms] = await Promise.all([
      this.prisma.cableMaster.findMany({
        where: { materialNumber: { in: cableNumbers } },
        select: { materialNumber: true },
      }),
      this.prisma.rawMaterial.findMany({
        where: { code: { in: rmCodes } },
        select: { code: true },
      }),
    ]);
    const cableSet = new Set(cables.map((c) => c.materialNumber.toLowerCase()));
    const rmSet = new Set(rms.map((r) => r.code.toUpperCase()));

    const invalid: string[] = [];
    for (const line of args.lines) {
      if (!cableSet.has(line.cableMaterialNumber.trim().toLowerCase())) {
        invalid.push(`Cable ${line.cableMaterialNumber} not in Cable Master`);
      }
      if (!rmSet.has(line.rawMaterial.trim().toUpperCase())) {
        invalid.push(`Raw Material ${line.rawMaterial} not in Raw Material Master`);
      }
      if (line.weight <= 0) {
        invalid.push(`Invalid weight for ${line.cableMaterialNumber}/${line.rawMaterial}`);
      }
    }
    if (invalid.length) {
      const err = new Error(invalid.slice(0, 5).join('; '));
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    const batchRef = `EXCEL-BOM-${Date.now()}`;
    const replaceSet = [
      ...new Set((args.replaceCableMaterialNumbers || []).map((c) => c.trim()).filter(Boolean)),
    ];

    await this.prisma.$transaction(
      async (tx) => {
        if (replaceSet.length) {
          await tx.cableBomLine.deleteMany({
            where: {
              bomVersion: 1,
              cableMaterialNumber: { in: replaceSet },
            },
          });
        }

        for (const line of args.lines) {
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
              uom: line.unitKm || 'kg',
              bomVersion: 1,
              status: line.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
              sourceBatch: line.sourceBatch || batchRef,
            },
            update: {
              itemCode: line.itemCode || null,
              customerCode: line.customerCode || null,
              consumption: line.weight,
              uom: line.unitKm || 'kg',
              status: line.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
              sourceBatch: line.sourceBatch || batchRef,
            },
          });
        }

        if (args.duplicateObservations?.length) {
          for (const obs of args.duplicateObservations) {
            const existing = await tx.bomDuplicateObservation.findMany({
              where: {
                cableMaterialNumber: obs.cableMaterialNumber,
                rawMaterialCode: obs.rawMaterialCode,
              },
              orderBy: { createdAt: 'asc' },
            });
            const payload = {
              weightA: obs.weightA,
              weightB: obs.weightB,
              occurrenceCount: obs.occurrenceCount,
              sourceWorksheet: obs.sourceWorksheet || null,
              sourceFile: obs.sourceFile || args.sourceFile || null,
              sourceRows: obs.sourceRowNumbers as any,
              classification: obs.classification,
              sourceBatch: batchRef,
            };
            if (existing.length === 0) {
              await tx.bomDuplicateObservation.create({
                data: {
                  cableMaterialNumber: obs.cableMaterialNumber,
                  rawMaterialCode: obs.rawMaterialCode,
                  ...payload,
                },
              });
              continue;
            }
            const keep = existing.find((row) => row.conflictId) || existing[0];
            await tx.bomDuplicateObservation.update({
              where: { id: keep.id },
              data: payload,
            });
            const extraIds = existing.filter((row) => row.id !== keep.id).map((row) => row.id);
            if (extraIds.length) {
              await tx.bomDuplicateObservation.deleteMany({ where: { id: { in: extraIds } } });
            }
          }
        }
      },
      { timeout: 900_000 },
    );

    await this.prisma.auditEvent.create({
      data: {
        actorId: args.actor.id,
        actorName: args.actor.name,
        entity: 'CableBom',
        entityId: batchRef,
        action: 'BOM_CHANGE',
        newValue: {
          source: 'excel-method-b',
          upserted: args.lines.length,
          replaceCableCount: replaceSet.length,
          duplicateObservations: args.duplicateObservations?.length ?? 0,
          sourceFile: args.sourceFile,
        } as any,
        message: `Excel Method-B BOM commit ${batchRef} (${args.lines.length} line(s))`,
      },
    });

    return { upserted: args.lines.length, skippedDuplicates: 0, batchRef };
  }
}
