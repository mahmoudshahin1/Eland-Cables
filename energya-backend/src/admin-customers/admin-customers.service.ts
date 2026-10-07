import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { RequestActor } from '../common/interfaces/request-actor.interface.js';

@Injectable()
export class AdminCustomersService {
  constructor(private readonly prisma: PrismaService) {}

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
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: { code: 'asc' },
        skip,
        take,
      }),
    ]);
    return { customers: rows, total, skip, take };
  }

  async exportMasterDataExcel(actor: RequestActor, filter: any) {
    return { buffer: Buffer.from([]), filename: 'customers.xlsx' }; // Stubbed for Phase 1 Parity
  }

  async listCustomerReferenceMasters() {
    return { groups: [], classifications: [], segments: [], paymentTerms: [], paymentMethods: [] }; // Stubbed
  }

  async getCustomerById(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async createCustomer(actor: RequestActor, input: any) {
    return this.prisma.customer.create({
      data: {
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        legalName: input.legalName,
        countryCode: input.countryCode,
        type: input.type || 'STANDARD',
        status: 'ACTIVE',
        defaultCurrency: input.defaultCurrency || 'USD',
        createdBy: actor.id,
      }
    });
  }

  async updateCustomer(actor: RequestActor, id: string, input: any) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.prisma.customer.update({
      where: { id },
      data: {
        name: input.name ?? customer.name,
        legalName: input.legalName !== undefined ? input.legalName : customer.legalName,
        countryCode: input.countryCode !== undefined ? input.countryCode : customer.countryCode,
        type: input.type ?? customer.type,
        defaultCurrency: input.defaultCurrency ?? customer.defaultCurrency,
        updatedBy: actor.id,
      }
    });
  }

  async setCustomerActive(actor: RequestActor, id: string, active: boolean) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.prisma.customer.update({
      where: { id },
      data: { status: active ? 'ACTIVE' : 'INACTIVE', updatedBy: actor.id }
    });
  }

  async deleteOrDeactivateCustomer(actor: RequestActor, id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.prisma.customer.update({
      where: { id },
      data: { status: 'INACTIVE', updatedBy: actor.id }
    });
  }

  async listCustomerAudit(id: string) {
    return [];
  }

  async listCustomerUsers(filter: any) {
    const where: any = {};
    if (filter.customerId) where.customerId = filter.customerId;
    if (filter.status) where.status = filter.status;
    const take = Math.min(filter.take ? Number(filter.take) : 50, 100);
    const skip = filter.skip ? Number(filter.skip) : 0;
    const [total, rows] = await Promise.all([
      this.prisma.customerUser.count({ where }),
      this.prisma.customerUser.findMany({ where, include: { userAccount: { select: { id: true, username: true, email: true, fullName: true, isActive: true } }, customer: { select: { code: true, name: true } } }, skip, take })
    ]);
    return { assignments: rows, total, skip, take };
  }

  async assignUserToCustomer(actor: RequestActor, input: any) {
    const userId = input.userAccountId || input.userId;
    if (!userId || !input.customerId) throw new BadRequestException('userId and customerId required');
    return this.prisma.customerUser.upsert({
      where: { customerId_userAccountId: { userAccountId: userId, customerId: input.customerId } },
      create: { userAccountId: userId, customerId: input.customerId, assignedBy: actor.id, status: 'ACTIVE' },
      update: { status: 'ACTIVE', assignedBy: actor.id }
    });
  }

  async updateCustomerUser(actor: RequestActor, id: string, status: string) {
    return this.prisma.customerUser.update({
      where: { id },
      data: { status: status as any }
    });
  }
}
