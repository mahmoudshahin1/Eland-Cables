import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class AdminCustomersRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async writeAudit(params: {
    actor?: any;
    entity: string;
    entityId: string;
    action: string;
    oldValue?: unknown;
    newValue?: unknown;
    message?: string;
  }) {
    return this.prisma.auditEvent.create({
      data: {
        actorId: params.actor?.id,
        actorName: params.actor?.name || params.actor?.fullName || params.actor?.email,
        entity: params.entity,
        entityId: params.entityId,
        action: params.action,
        oldValue: params.oldValue as any,
        newValue: params.newValue as any,
        message: params.message,
      },
    });
  }

  async countCustomers(where: Prisma.CustomerWhereInput) {
    return this.prisma.customer.count({ where });
  }

  async findCustomers(where: Prisma.CustomerWhereInput, skip: number, take: number) {
    return this.prisma.customer.findMany({
      where,
      skip,
      take,
      include: { _count: { select: { users: true, inquiries: true, quotations: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createCustomer(data: Prisma.CustomerCreateInput) {
    return this.prisma.customer.create({ data });
  }

  async findCustomerById(id: string) {
    if (!id) return null;
    return this.prisma.customer.findFirst({
      where: { OR: [{ id }, { code: id }] },
      include: {
        customerGroup: true,
        classification: true,
        segment: true,
        paymentTerm: true,
        paymentMethod: true,
        addresses: { orderBy: [{ isDefault: 'desc' as const }, { code: 'asc' as const }] },
        contacts: { orderBy: [{ isPrimary: 'desc' as const }, { name: 'asc' as const }] },
        externalMappings: { orderBy: { system: 'asc' as const } },
        deliveryCombinations: {
          include: { destinationPort: true, incoterm: true },
          orderBy: [{ countryLabel: 'asc' as const }, { destinationPortCode: 'asc' as const }, { incotermCode: 'asc' as const }],
        },
        users: { include: { userAccount: { include: { roles: { include: { role: true } } } } } },
        _count: { select: { users: true, inquiries: true, quotations: true } }
      }
    });
  }

  async findUserAccountById(id: string) {
    if (!id) return null;
    return this.prisma.userAccount.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
  }

  async updateCustomer(id: string, data: Prisma.CustomerUpdateInput) {
    return this.prisma.customer.update({ where: { id }, data });
  }

  async deleteCustomer(id: string) {
    return this.prisma.customer.delete({ where: { id } });
  }

  async findCustomerAuditLogs(id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { OR: [{ id }, { code: id }] },
    });
    if (!customer) throw new NotFoundException('Customer not found.');
    const links = await this.prisma.customerUser.findMany({ where: { customerId: customer.id }, select: { id: true } });
    return this.prisma.auditEvent.findMany({
      where: {
        OR: [
          { entity: 'Customer', entityId: customer.id },
          { entity: 'CustomerUser', entityId: { in: links.map((l) => l.id) } },
          { entity: 'Export', entityId: customer.id },
        ],
      },
      orderBy: { at: 'desc' },
      take: 100,
    });
  }

  async countCustomerUsers(where: Prisma.CustomerUserWhereInput) {
    return this.prisma.customerUser.count({ where });
  }

  async findCustomerUsers(where: Prisma.CustomerUserWhereInput, skip: number, take: number) {
    return this.prisma.customerUser.findMany({
      where,
      skip,
      take,
      include: {
        customer: true,
        userAccount: { include: { roles: { include: { role: true } } } },
      },
      orderBy: { assignedAt: 'desc' }
    });
  }

  async createCustomerUser(data: Prisma.CustomerUserCreateInput) {
    return this.prisma.customerUser.create({ data });
  }

  async findCustomerUserById(id: string) {
    return this.prisma.customerUser.findUnique({
      where: { id },
      include: { customer: true, userAccount: true },
    });
  }

  async updateCustomerUser(id: string, data: Prisma.CustomerUserUpdateInput) {
    return this.prisma.customerUser.update({ where: { id }, data });
  }

  async deleteCustomerUser(id: string) {
    return this.prisma.customerUser.delete({ where: { id } });
  }

  async deleteCustomer(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.customerDeliveryCombination.deleteMany({ where: { customerId: id } });
      await tx.customerAddress.deleteMany({ where: { customerId: id } });
      await tx.customerContact.deleteMany({ where: { customerId: id } });
      await tx.customerExternalMapping.deleteMany({ where: { customerId: id } });
      await tx.customerUser.deleteMany({ where: { customerId: id } });
      return tx.customer.delete({ where: { id } });
    });
  }

  async findCustomerReferenceMasters() {
    const [currencies, paymentTerms, paymentMethods, classifications, segments, groups, incoterms, destinationPorts] =
      await Promise.all([
        this.prisma.costingCurrency.findMany({ where: { status: 'ACTIVE' }, orderBy: { code: 'asc' } }),
        this.prisma.paymentTerm.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
        this.prisma.paymentMethod.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
        this.prisma.customerClassification.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
        this.prisma.customerSegment.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
        this.prisma.customerGroup.findMany({ orderBy: { name: 'asc' } }),
        this.prisma.incoterm.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
        this.prisma.destinationPort.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
      ]);
    return { currencies, paymentTerms, paymentMethods, classifications, segments, groups, incoterms, destinationPorts };
  }
}
