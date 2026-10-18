import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { AdminCustomersRepository } from './admin-customers.repository.js';
import { RequestActor } from '../common/interfaces/request-actor.interface.js';
import { toSafeUser } from '../shared/domain/safe-user.js';
import { toCustomerDetail, toPublicCustomer } from './admin-customers.presenters.js';

export { toCustomerDetail, toDeliveryPreference, toPublicCustomer, resolveCustomerCommercialProfile } from './admin-customers.presenters.js';

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
    return toCustomerDetail(customer);
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
    const created = await this.repo.createCustomer({
      code,
      name,
      legalName: input.legalName,
      countryCode: input.countryCode,
      type: input.type || 'OTHER',
      status: 'ACTIVE',
      defaultCurrency: input.defaultCurrency || 'USD',
      createdBy: actor.id,
      updatedBy: actor.id,
    });
    const detail = await this.getCustomerById(created.id);
    await this.repo.writeAudit({
      actor,
      entity: 'Customer',
      entityId: created.id,
      action: 'CREATE_CUSTOMER',
      newValue: detail.customer,
      message: `Created customer ${detail.customer.code}`,
    });
    return detail.customer;
  }

  async updateCustomer(actor: RequestActor, id: string, input: any) {
    const previous = await this.repo.findCustomerById(id);
    if (!previous) throw new NotFoundException('Customer not found');
    const updated = await this.repo.updateCustomer(id, {
      name: input.name ?? previous.name,
      legalName: input.legalName !== undefined ? input.legalName : previous.legalName,
      countryCode: input.countryCode !== undefined ? input.countryCode : previous.countryCode,
      type: input.type ?? previous.type,
      defaultCurrency: input.defaultCurrency ?? previous.defaultCurrency,
      updatedBy: actor.id,
    });
    const detail = await this.getCustomerById(id);
    const oldVal = toPublicCustomer(previous);
    delete oldVal.userCount;
    delete oldVal.inquiryCount;
    delete oldVal.quotationCount;
    await this.repo.writeAudit({
      actor,
      entity: 'Customer',
      entityId: updated.id,
      action: 'UPDATE_CUSTOMER',
      oldValue: oldVal,
      newValue: detail.customer,
      message: `Updated customer ${detail.customer.code}`,
    });
    return detail.customer;
  }

  async setCustomerActive(actor: RequestActor, id: string, active: boolean) {
    const customer = await this.repo.findCustomerById(id);
    if (!customer) throw new NotFoundException('Customer not found');
    const updated = await this.repo.updateCustomer(id, { status: active ? 'ACTIVE' : 'INACTIVE', updatedBy: actor.id });
    await this.repo.writeAudit({
      actor,
      entity: 'Customer',
      entityId: updated.id,
      action: active ? 'ACTIVATE_CUSTOMER' : 'DEACTIVATE_CUSTOMER',
      oldValue: { status: customer.status },
      newValue: { status: updated.status },
      message: `${active ? 'Activated' : 'Deactivated'} customer ${updated.code}`,
    });
    return toPublicCustomer(updated);
  }

  async deleteOrDeactivateCustomer(actor: RequestActor, id: string) {
    const customer = await this.repo.findCustomerById(id);
    if (!customer) throw new NotFoundException('Customer not found');
    await this.repo.deleteCustomer(id);
    await this.repo.writeAudit({
      actor,
      entity: 'Customer',
      entityId: id,
      action: 'DELETE_CUSTOMER',
      oldValue: toPublicCustomer(customer),
      message: `Deleted customer ${customer.code}`,
    });
    return { action: 'deleted' as const, reason: null, customer: toPublicCustomer(customer) };
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
    let link;
    if (existing.length > 0) {
      link = await this.repo.updateCustomerUser(existing[0].id, { status: 'ACTIVE', assignedBy: actor.id });
    } else {
      link = await this.repo.createCustomerUser({
        userAccount: { connect: { id: user.id } },
        customer: { connect: { id: customer.id } },
        assignedBy: actor.id,
        status: 'ACTIVE'
      });
    }
    await this.repo.writeAudit({
      actor,
      entity: 'CustomerUser',
      entityId: link.id,
      action: 'ASSIGN_CUSTOMER_USER',
      newValue: { customerId: customer.id, customerCode: customer.code, userAccountId: user.id, email: user.email },
      message: `Assigned user ${user.email} to customer ${customer.code}`,
    });
    const pubCust = toPublicCustomer(customer);
    delete pubCust.userCount;
    delete pubCust.inquiryCount;
    delete pubCust.quotationCount;
    return {
      id: link.id,
      status: link.status,
      customer: pubCust,
      user: toSafeUser({ ...(user as any), roles: (user as any).roles || [], permissionCodes: [] }),
    };
  }

  async updateCustomerUser(actor: RequestActor, id: string, status: string) {
    const previous = await this.repo.findCustomerUserById(id);
    if (!previous) throw new NotFoundException('Customer-user assignment not found.');
    const updated = await this.repo.updateCustomerUser(id, { status: status as any });
    await this.repo.writeAudit({
      actor,
      entity: 'CustomerUser',
      entityId: updated.id,
      action: status === 'ACTIVE' ? 'ASSIGN_CUSTOMER_USER' : 'UNASSIGN_CUSTOMER_USER',
      oldValue: { status: previous.status, customerId: previous.customerId, userAccountId: previous.userAccountId },
      newValue: { status: updated.status },
      message: `Updated assignment ${(previous as any).userAccount?.email || ''} / ${(previous as any).customer?.code || ''} to ${status}`,
    });
    return updated;
  }
}
