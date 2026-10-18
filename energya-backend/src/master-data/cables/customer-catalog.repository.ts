import { Injectable, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service.js';
import {
  catalogCategoryFamilyKeys,
  catalogFilterAliases,
  catalogPrismaSort,
  catalogProductHasCostingLeak,
  parseCableDescriptionConstruction,
  parseCatalogPage,
  parseCatalogPageSize,
  parseCatalogSortDir,
  parseCatalogSortField,
  parseCustomerCatalogCategory,
  toCustomerCatalogProduct,
} from '../../shared/domain/customerCableCatalog.js';
import { cableFamilyFilterWhere } from './cables.repository.js';
import { listCustomerProductFacets } from './customer-catalog.facets.js';

@Injectable()
export class CustomerCatalogRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listCustomerProducts(query: any) {
    const page = parseCatalogPage(query.page);
    const pageSize = parseCatalogPageSize(query.pageSize);
    const sortBy = parseCatalogSortField(query.sortBy || query.sort);
    const sortDir = parseCatalogSortDir(query.sortDir, sortBy);
    const prismaSort = catalogPrismaSort(sortBy);
    const where = this.buildCustomerCatalogWhere(query);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.cableMaster.count({ where }),
      this.prisma.cableMaster.findMany({
        where,
        orderBy: { [prismaSort.field]: query.sortDir ? sortDir : prismaSort.dir },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          materialNumber: true,
          itemCode: true,
          customerCode: true,
          description: true,
          family: true,
          voltage: true,
          conductor: true,
          conductorSize: true,
          cores: true,
          insulation: true,
          screen: true,
          armour: true,
          sheath: true,
          standard: true,
          diameter: true,
          weight: true,
        },
      }),
    ]);

    const cables = rows.map(toCustomerCatalogProduct);
    if (cables.some((c) => catalogProductHasCostingLeak(c))) {
      throw new Error('Catalog result contained forbidden costing fields.');
    }

    return {
      total,
      page,
      pageSize,
      sortBy,
      sortDir: query.sortDir ? sortDir : prismaSort.dir,
      category: parseCustomerCatalogCategory(query.category),
      cables,
      searchKind: 'CABLE_MASTER_CATALOG' as const,
    };
  }

  async listCustomerProductFacets() {
    return listCustomerProductFacets(this.prisma, (category) => this.customerCatalogCategoryWhere(category));
  }

  private customerCatalogCategoryWhere(category: string | undefined): Prisma.CableMasterWhereInput | undefined {
    const parsed = parseCustomerCatalogCategory(category);
    if (!parsed) return undefined;
    const keys = catalogCategoryFamilyKeys(parsed);
    const or: Prisma.CableMasterWhereInput[] = [];
    for (const key of keys) {
      const clause = cableFamilyFilterWhere(key);
      if (clause.OR) or.push(...clause.OR);
      else or.push(clause);
    }
    return or.length ? { OR: or } : undefined;
  }

  private buildCustomerCatalogWhere(query: any): Prisma.CableMasterWhereInput {
    const and: Prisma.CableMasterWhereInput[] = [{ status: 'ACTIVE' }];
    const categoryWhere = this.customerCatalogCategoryWhere(query.category);
    if (categoryWhere) and.push(categoryWhere);
    if (query.voltageClass) and.push(cableFamilyFilterWhere(query.voltageClass));

    const pushFilter = (field: string, value?: string) => {
      const aliases = catalogFilterAliases(field as any, value || '');
      if (!aliases.length) return;
      const or: Prisma.CableMasterWhereInput[] = [];
      for (const alias of aliases) {
        or.push({ [field]: { contains: alias, mode: 'insensitive' } } as Prisma.CableMasterWhereInput);
        or.push({ description: { contains: alias, mode: 'insensitive' } });
      }
      and.push({ OR: or });
    };

    pushFilter('voltage', query.voltage);
    pushFilter('conductor', query.conductor);
    pushFilter('conductorSize', query.conductorSize || query.size);
    pushFilter('cores', query.cores);
    pushFilter('insulation', query.insulation);
    pushFilter('screen', query.screen);
    pushFilter('armour', query.armour);
    pushFilter('sheath', query.sheath);
    pushFilter('standard', query.standard);
    pushFilter('sheathColour', query.sheathColour);
    pushFilter('coreColour', query.coreColour);
    pushFilter('specialAdditives', query.specialAdditives);

    if (query.diameter && Number.isFinite(Number(query.diameter))) {
      and.push({ diameter: Number(query.diameter) });
    }
    if (query.weight && Number.isFinite(Number(query.weight))) {
      and.push({ weight: Number(query.weight) });
    }

    const q = query.q?.trim() || query.search?.trim();
    if (q) {
      and.push({
        OR: [
          { materialNumber: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { itemCode: { contains: q, mode: 'insensitive' } },
          { customerCode: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    return { AND: and };
  }
}
