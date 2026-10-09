import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AdminCustomersRepository } from './admin-customers.repository.js';
import { RequestActor } from '../common/interfaces/request-actor.interface.js';

@Injectable()
export class AdminCustomersService {
  constructor(private readonly repo: AdminCustomersRepository) {}

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
    return { customers: rows, total, skip, take };
  }

  async exportMasterDataExcel(actor: RequestActor, filter: any) {
    return { buffer: Buffer.from([]), filename: 'customers.xlsx' }; // Stubbed for Phase 1 Parity
  }

  async listCustomerReferenceMasters() {
    // We stub this for Phase 1 Parity as before
    return { groups: [], classifications: [], segments: [], paymentTerms: [], paymentMethods: [] }; 
  }

  async getCustomerById(id: string) {
    const customer = await this.repo.findCustomerById(id);
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async createCustomer(actor: RequestActor, input: any) {
    return this.repo.createCustomer({
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
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
    return this.repo.findCustomerAuditLogs(id);
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
    return { assignments: rows, total, skip, take };
  }

  async assignUserToCustomer(actor: RequestActor, input: any) {
    const userId = input.userAccountId || input.userId;
    if (!userId || !input.customerId) throw new BadRequestException('userId and customerId required');
    // Using simple creation or update instead of upsert for simplicity since we don't have upsert explicitly in repo
    const existing = await this.repo.findCustomerUsers({ userAccountId: userId, customerId: input.customerId }, 0, 1);
    if (existing.length > 0) {
      return this.repo.updateCustomerUser(existing[0].id, { status: 'ACTIVE', assignedBy: actor.id });
    }
    return this.repo.createCustomerUser({
      user: { connect: { id: userId } },
      customer: { connect: { id: input.customerId } },
      assignedBy: actor.id,
      status: 'ACTIVE'
    });
  }

  async updateCustomerUser(actor: RequestActor, id: string, status: string) {
    return this.repo.updateCustomerUser(id, { status: status as any });
  }
}
