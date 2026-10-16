import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { CablesRepository } from './cables.repository.js';
import { CustomerCatalogRepository } from './customer-catalog.repository.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

@Injectable()
export class CablesService {
  constructor(
    @Inject(CablesRepository) private readonly cablesRepository: CablesRepository,
    @Inject(CustomerCatalogRepository) private readonly customerCatalogRepository: CustomerCatalogRepository,
  ) {}

  async listOrSearchCables(
    query: {
      q?: string;
      customerCode?: string;
      itemCode?: string;
      materialNumber?: string;
      family?: string;
      voltage?: string;
      conductor?: string;
      cores?: string;
      diameter?: string;
      page?: string | number;
      pageSize?: string | number;
    },
    actor: RequestActor,
  ) {
    const hasFilter = Boolean(
      query.q ||
        query.customerCode ||
        query.itemCode ||
        query.materialNumber ||
        query.family ||
        query.voltage ||
        query.conductor ||
        query.cores ||
        query.diameter ||
        query.page ||
        query.pageSize,
    );

    if (hasFilter) {
      return this.cablesRepository.search({
        q: query.q,
        customerCode: query.customerCode,
        itemCode: query.itemCode,
        materialNumber: query.materialNumber,
        family: query.family,
        voltage: query.voltage,
        conductor: query.conductor,
        cores: query.cores,
        diameter: query.diameter ? String(query.diameter) : undefined,
        page: query.page ? Number(query.page) : 1,
        pageSize: query.pageSize ? Number(query.pageSize) : 25,
      });
    }

    if (actor.userType === 'customer') {
      return this.cablesRepository.search({ page: 1, pageSize: 50 });
    }

    const cables = await this.cablesRepository.listAll();
    return { cables };
  }

  async getCableByMaterialNumber(materialNumber: string) {
    const cable = await this.cablesRepository.getByMaterialNumber(materialNumber);
    if (!cable) {
      throw new NotFoundException({ error: 'Cable not found.' });
    }
    return { cable };
  }

  async listCustomerProducts(query: any, user: RequestActor) {
    const result = await this.customerCatalogRepository.listCustomerProducts(query);
    return {
      ...result,
      actorKind: user.userType === 'customer' ? 'customer' : 'internal',
      customerScopeApplied: user.userType === 'customer',
    };
  }

  async listCustomerProductFacets() {
    return this.customerCatalogRepository.listCustomerProductFacets();
  }
}

