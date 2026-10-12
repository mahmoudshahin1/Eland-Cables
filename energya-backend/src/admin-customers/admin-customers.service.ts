import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject } from '@nestjs/common';
import { AdminCustomersRepository } from './admin-customers.repository.js';
import { RequestActor } from '../common/interfaces/request-actor.interface.js';
import { toSafeUser } from '../shared/domain/safe-user.js';

export function toPublicCustomer(row: any) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    legalName: row.legalName ?? null,
    countryCode: row.countryCode ?? null,
    type: row.type,
    status: row.status,
    defaultCurrency: row.defaultCurrency,
    defaultIncoterm: row.defaultIncoterm ?? null,
    paymentTerms: row.paymentTerms ?? null,
    deliveryTerms: row.deliveryTerms ?? null,
    taxVatNumber: row.taxVatNumber ?? null,
    remarks: row.remarks ?? null,
    companyLogoUrl: row.companyLogoUrl ?? null,
    companyTagline: row.companyTagline ?? null,
    allowedQuotationCurrencies: row.allowedQuotationCurrencies,
    customerGroupId: row.customerGroupId ?? null,
    classificationId: row.classificationId ?? null,
    segmentId: row.segmentId ?? null,
    paymentTermId: row.paymentTermId ?? null,
    paymentMethodId: row.paymentMethodId ?? null,
    createdBy: row.createdBy ?? null,
    updatedBy: row.updatedBy ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    userCount: row._count?.users ?? undefined,
    inquiryCount: row._count?.inquiries ?? undefined,
    quotationCount: row._count?.quotations ?? undefined,
  };
}

@Injectable()
export class AdminCustomersService {
  constructor(@Inject(AdminCustomersRepository) private readonly repo: AdminCustomersRepository) {}

  async listCustomers(filter: any) {
    const where: any = {};
    if (filter.q) {
      where.OR = [
        { name: { contains: filter.q, mode: 'insensitive' } },
        { code: { contains: filter.q, mode: 'insensitive' } },
      ];
    }
    if (filter.status) where.status = filter.status;
    if (filter.type) where.type = filter.type;
    
    const take = Math.min(filter.take ? Number(filter.take) : 50, 100);
    const skip = filter.skip ? Number(filter.skip) : 0;
    
    const [total, rows] = await Promise.all([
      this.repo.countCustomers(where),
      this.repo.findCustomers(where, skip, take),
    ]);
    return { customers: rows.map(toPublicCustomer), total };
  }

  async exportMasterDataExcel(actor: RequestActor, filter: any) {
    return { buffer: Buffer.from([]), filename: 'customers.xlsx' }; // Stubbed for Phase 1 Parity
  }

  async listCustomerReferenceMasters() {
    return this.repo.findCustomerReferenceMasters();
  }

  async getCustomerById(id: string) {
    const customer = await this.repo.findCustomerById(id);
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async createCustomer(actor: RequestActor, input: any) {
    const code = String(input.code || '').trim().toUpperCase();
    const name = String(input.name || '').trim();
    if (!code || !name) {
      throw new BadRequestException({
        error: 'Customer code and name are required.',
        code: 'VALIDATION_FAILED',
      });
    }
    return this.repo.createCustomer({
      code,
      name,
      legalName: input.legalName,
      countryCode: input.countryCode,
      type: input.type || 'STANDARD',
      status: 'ACTIVE',
      defaultCurrency: input.defaultCurrency || 'USD',
      createdBy: actor.id,
    });
  }

  async updateCustomer(actor: RequestActor, id: string, input: any) {
    const customer = await this.repo.findCustomerById(id);
    if (!customer) throw new NotFoundException('Customer not found');
    return this.repo.updateCustomer(id, {
      name: input.name ?? customer.name,
      legalName: input.legalName !== undefined ? input.legalName : customer.legalName,
      countryCode: input.countryCode !== undefined ? input.countryCode : customer.countryCode,
      type: input.type ?? customer.type,
      defaultCurrency: input.defaultCurrency ?? customer.defaultCurrency,
      updatedBy: actor.id,
    });
  }

  async setCustomerActive(actor: RequestActor, id: string, active: boolean) {
    const customer = await this.repo.findCustomerById(id);
    if (!customer) throw new NotFoundException('Customer not found');
    return this.repo.updateCustomer(id, { status: active ? 'ACTIVE' : 'INACTIVE', updatedBy: actor.id });
  }

  async deleteOrDeactivateCustomer(actor: RequestActor, id: string) {
    const customer = await this.repo.findCustomerById(id);
    if (!customer) throw new NotFoundException('Customer not found');
    return this.repo.updateCustomer(id, { status: 'INACTIVE', updatedBy: actor.id });
  }

  async listCustomerAudit(id: string) {
    return { events: await this.repo.findCustomerAuditLogs(id) };
  }

  async listCustomerUsers(filter: any) {
    const where: any = {};
    if (filter.customerId) where.customerId = filter.customerId;
    if (filter.status) where.status = filter.status;
    const take = Math.min(filter.take ? Number(filter.take) : 50, 100);
    const skip = filter.skip ? Number(filter.skip) : 0;
    const [total, rows] = await Promise.all([
      this.repo.countCustomerUsers(where),
      this.repo.findCustomerUsers(where, skip, take)
    ]);
    return {
      total,
      assignments: rows.map((link) => ({
        id: link.id,
        status: link.status,
        assignedAt: link.assignedAt,
        assignedBy: link.assignedBy,
        customer: toPublicCustomer(link.customer),
        user: toSafeUser({ ...link.userAccount, roles: link.userAccount?.roles || [], permissionCodes: [] }),
      })),
    };
  }

  async assignUserToCustomer(actor: RequestActor, input: any) {
    const customerId = input?.customerId;
    const userId = input?.userAccountId || input?.userId;
    const customer = await this.repo.findCustomerById(customerId);
    if (!customer) throw new NotFoundException({ error: 'Customer not found.', code: 'NOT_FOUND' });
    const user = await this.repo.findUserAccountById(userId);
    if (!user) throw new NotFoundException({ error: 'User not found.', code: 'NOT_FOUND' });
    const existing = await this.repo.findCustomerUsers({ userAccountId: user.id, customerId: customer.id }, 0, 1);
    if (existing.length > 0) {
      return this.repo.updateCustomerUser(existing[0].id, { status: 'ACTIVE', assignedBy: actor.id });
    }
    return this.repo.createCustomerUser({
      user: { connect: { id: user.id } },
      customer: { connect: { id: customer.id } },
      assignedBy: actor.id,
      status: 'ACTIVE'
    });
  }

  async updateCustomerUser(actor: RequestActor, id: string, status: string) {
    const previous = await this.repo.findCustomerUserById(id);
    if (!previous) throw new NotFoundException('Customer-user assignment not found.');
    return this.repo.updateCustomerUser(id, { status: status as any });
  }
}
