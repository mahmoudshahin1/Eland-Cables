import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service.js';
import { rmFromRow } from '../common/master-data-dto.js';
import {
  validateRawMaterialClassification,
  normalizePricingCategoryInput,
  normalizeMetalType,
} from '../../shared/domain/rawMaterialClassification.js';
import { writeAudit } from '../../shared/infra/legacy-ports.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

@Injectable()
export class RawMaterialsRepository {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async listRawMaterials() {
    const rows = await this.prisma.rawMaterial.findMany({
      include: { prices: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { code: 'asc' },
    });
    return rows.map(rmFromRow);
  }

  async create(
    input: {
      code: string;
      description: string;
      shortDescription?: string;
      uom: string;
      category?: string;
      pricingCategory?: string;
      metalType?: string;
      notes?: string;
      supplier?: string;
      currency?: string;
      status?: 'ACTIVE' | 'INACTIVE';
    },
    actor: RequestActor,
  ) {
    const pricingCategory = normalizePricingCategoryInput(input.pricingCategory);
    const metalType = normalizeMetalType(input.metalType);
    const classification = validateRawMaterialClassification({ pricingCategory, metalType });
    if (classification.ok === false) {
      const err = new Error(classification.message);
      (err as any).code = classification.code;
      throw err;
    }

    const existing = await this.prisma.rawMaterial.findUnique({ where: { code: input.code } });
    if (existing) {
      const err = new Error('Raw Material code already exists.');
      (err as any).code = 'DUPLICATE_RAW_MATERIAL';
      throw err;
    }

    const created = await this.prisma.rawMaterial.create({
      data: {
        code: input.code,
        description: input.description,
        shortDescription: input.shortDescription?.trim() || null,
        uom: input.uom,
        category: input.category || null,
        pricingCategory,
        metalType,
        notes: input.notes?.trim() || null,
        supplier: input.supplier || null,
        currency: input.currency || null,
        priceStatus: 'PRICE_NOT_CONFIGURED',
        status: input.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      },
      include: { prices: true },
    });

    await writeAudit({
      actor,
      entity: 'RawMaterial',
      entityId: created.code,
      action: 'CREATE',
      newValue: created,
    });

    return rmFromRow(created);
  }

  async update(
    code: string,
    input: Partial<{
      description: string;
      shortDescription: string;
      uom: string;
      category: string;
      pricingCategory: string;
      metalType: string;
      notes: string;
      supplier: string;
      currency: string;
      status: 'ACTIVE' | 'INACTIVE';
    }>,
    actor: RequestActor,
  ) {
    const existing = await this.prisma.rawMaterial.findUnique({
      where: { code },
      include: { prices: { take: 1 } },
    });
    if (!existing) return null;

    const pricingCategory = normalizePricingCategoryInput(input.pricingCategory ?? existing.pricingCategory);
    const metalType = normalizeMetalType(input.metalType ?? existing.metalType);
    const classification = validateRawMaterialClassification({ pricingCategory, metalType });
    if (classification.ok === false) {
      const err = new Error(classification.message);
      (err as any).code = classification.code;
      throw err;
    }

    const updated = await this.prisma.rawMaterial.update({
      where: { code },
      data: {
        description: input.description ?? existing.description,
        shortDescription:
          input.shortDescription !== undefined ? input.shortDescription.trim() || null : existing.shortDescription,
        uom: input.uom ?? existing.uom,
        category: input.category !== undefined ? input.category : existing.category,
        pricingCategory,
        metalType,
        notes: input.notes !== undefined ? input.notes.trim() || null : existing.notes,
        supplier: input.supplier !== undefined ? input.supplier : existing.supplier,
        currency: input.currency !== undefined ? input.currency : existing.currency,
        status: input.status === 'INACTIVE' ? 'INACTIVE' : input.status === 'ACTIVE' ? 'ACTIVE' : existing.status,
      },
      include: { prices: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    await writeAudit({
      actor,
      entity: 'RawMaterial',
      entityId: code,
      action: 'UPDATE',
      oldValue: existing,
      newValue: updated,
    });

    return rmFromRow(updated);
  }

  async appendPrice(
    code: string,
    input: { price: number | null; currency?: string; effectiveFrom?: string | null; effectiveTo?: string | null },
    actor: RequestActor,
  ) {
    const rm = await this.prisma.rawMaterial.findUnique({ where: { code } });
    if (!rm) return null;

    if (input.price == null) {
      await this.prisma.rawMaterial.update({ where: { code }, data: { priceStatus: 'PRICE_NOT_CONFIGURED' } });
      return { priceStatus: 'PRICE_NOT_CONFIGURED' as const, created: false };
    }

    const fromSource = input.effectiveFrom ? new Date(input.effectiveFrom) : null;
    const datesValid = Boolean(fromSource && !Number.isNaN(fromSource.getTime()));
    const created = await this.prisma.rawMaterialPrice.create({
      data: {
        rawMaterialCode: code,
        price: input.price,
        currency: input.currency || rm.currency,
        effectiveFrom: datesValid ? fromSource : null,
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        temporalStatus: datesValid ? 'EFFECTIVE' : 'DATA_REQUIRED',
        status: 'ACTIVE',
      },
    });

    await this.prisma.rawMaterial.update({ where: { code }, data: { priceStatus: 'PRICE_NOT_CONFIGURED' } });

    await writeAudit({
      actor,
      entity: 'RawMaterial',
      entityId: code,
      action: 'PRICE_CHANGE',
      newValue: created,
      message: datesValid
        ? 'Price history row with source dates'
        : 'Price history row without invented dates (DATA_REQUIRED)',
    });

    return created;
  }
}
