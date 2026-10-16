import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service.js';

@Injectable()
export class ReferenceRepository {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async listReference() {
    return this.prisma.cableParameter.findMany({
      orderBy: [{ kind: 'asc' }, { code: 'asc' }],
    });
  }

  async cableUniquenessReport() {
    const cables = await this.prisma.cableMaster.findMany({
      select: { materialNumber: true, itemCode: true, customerCode: true, status: true },
    });
    const countBy = (key: (c: (typeof cables)[number]) => string) => {
      const map = new Map<string, number>();
      cables.forEach((c) => {
        const k = key(c).toLowerCase();
        map.set(k, (map.get(k) || 0) + 1);
      });
      const duplicates = [...map.entries()].filter(([, n]) => n > 1);
      return { distinct: map.size, duplicateKeys: duplicates.length, duplicateExamples: duplicates.slice(0, 20) };
    };
    return {
      total: cables.length,
      active: cables.filter((c) => c.status === 'ACTIVE').length,
      materialNumber: { rule: 'unique (natural key)', ...countBy((c) => c.materialNumber) },
      itemCode: { rule: 'NOT globally unique in ENERGYA source', ...countBy((c) => c.itemCode) },
      customerCode: { rule: 'NOT globally unique in ENERGYA source', ...countBy((c) => c.customerCode) },
    };
  }

  masterDataKeyAnalysis() {
    return [
      {
        candidateKey: 'Material Number',
        businessMeaning: 'ENERGYA cable material / item identity on Cable List (Cable Material Number).',
        currentUniqueness: 'Unique in the official 432-row Cable List and PostgreSQL unique constraint.',
        recommendedConstraint: 'Keep UNIQUE on CableMaster.materialNumber.',
        reason: 'Source data supports it; import rejects file-level duplicates.',
      },
      {
        candidateKey: 'Item Code',
        businessMeaning: 'ERP item code on Cable List. Repeats across materials.',
        currentUniqueness: 'Not unique (264 distinct values in 432 rows).',
        recommendedConstraint: 'Do not add a global unique constraint.',
        reason: 'The source data disproves global uniqueness.',
      },
      {
        candidateKey: 'Customer Code / Specification Code',
        businessMeaning: 'Customer/specification family-style code (e.g. N2XH). Not an approved configurator Family.',
        currentUniqueness: 'Not unique (7 distinct values in 432 rows).',
        recommendedConstraint: 'Do not add a global unique constraint. Do not treat as Cable Family without approval.',
        reason: 'Source data disproves uniqueness; mapping to FAMILY is BUSINESS_DECISION_REQUIRED.',
      },
      {
        candidateKey: 'Customer Code + Item Code',
        businessMeaning: 'Possible commercial identity pair.',
        currentUniqueness: 'Not verified as unique without a business rule. Item codes already repeat.',
        recommendedConstraint: 'Do not enforce until Finance/ERP confirms the pair is a key.',
        reason: 'Must not invent a composite key the extract does not document.',
      },
      {
        candidateKey: 'Customer Code + Specification Code',
        businessMeaning: 'Same column in this extract (Specification Code is stored as customerCode).',
        currentUniqueness: 'Identical to Customer Code — not a second field.',
        recommendedConstraint: 'No additional constraint.',
        reason: 'The Cable List has one specification/customer column, not two.',
      },
      {
        candidateKey: 'Cable + Raw Material + BOM Version',
        businessMeaning: 'Current BOM line grain while 81 weight conflicts are unresolved.',
        currentUniqueness: 'Enforced unique; conflicting weights are skipped, not versioned.',
        recommendedConstraint: 'Keep until business classifies conflicts. Do not switch to Cable+RM alone.',
        reason: 'Cable+RM is disproved as a single-weight key by the 81 groups.',
      },
    ];
  }

  async checkDbHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, postgresql: true, prisma: true };
    } catch (err: any) {
      return { ok: false, postgresql: false, prisma: true, error: err?.message };
    }
  }
}
