import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class AdminCustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countCustomers(where: Prisma.CustomerWhereInput) {
    return this.prisma.customer.count({ where });
  }

  async findCustomers(where: Prisma.CustomerWhereInput, skip: number, take: number) {
    return this.prisma.customer.findMany({
      where,
      skip,
      take,
      include: {
        currency: true,
        metalPricingCondition: true,
        marketType: true,
        customerCategory: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCustomer(data: Prisma.CustomerCreateInput) {
    return this.prisma.customer.create({ data });
  }

  async findCustomerById(id: string) {
    return this.prisma.customer.findUnique({
      where: { id },
      include: {
        currency: true,
        metalPricingCondition: true,
        marketType: true,
        customerCategory: true,
        auditLogs: { orderBy: { timestamp: 'desc' }, take: 10 }
      }
    });
  }

  async updateCustomer(id: string, data: Prisma.CustomerUpdateInput) {
    return this.prisma.customer.update({ where: { id }, data });
  }

  async deleteCustomer(id: string) {
    return this.prisma.customer.delete({ where: { id } });
  }

  async findCustomerAuditLogs(id: string) {
    return this.prisma.auditLog.findMany({
      where: { resourceName: 'Customer', resourceId: id },
      orderBy: { timestamp: 'desc' }
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
      include: { user: true, customer: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createCustomerUser(data: Prisma.CustomerUserCreateInput) {
    return this.prisma.customerUser.create({ data });
  }

  async findCustomerUserById(id: string) {
    return this.prisma.customerUser.findUnique({ where: { id } });
  }

  async updateCustomerUser(id: string, data: Prisma.CustomerUserUpdateInput) {
    return this.prisma.customerUser.update({ where: { id }, data });
  }

  async deleteCustomerUser(id: string) {
    return this.prisma.customerUser.delete({ where: { id } });
  }

  async findCustomerReferenceMasters() {
    const [currencies, pricingConditions, markets, categories] = await this.prisma.$transaction([
      this.prisma.currency.findMany(),
      this.prisma.metalPricingCondition.findMany(),
      this.prisma.marketType.findMany(),
      this.prisma.customerCategory.findMany(),
    ]);
    return { currencies, pricingConditions, markets, categories };
  }
}
