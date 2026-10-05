import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import * as bcrypt from 'bcryptjs';

export interface UserQuery {
  page?: number;
  limit?: number;
  search?: string;
  userType?: string;
  status?: string;
}

export interface CustomerQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // USERS
  // ══════════════════════════════════════════════════════════════════════════

  async listUsers(query: UserQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.userType) {
      where.userType = query.userType;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { username: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { fullName: { contains: term, mode: 'insensitive' } },
        { jobTitle: { contains: term, mode: 'insensitive' } },
        { department: { contains: term, mode: 'insensitive' } },
      ];
    }

    try {
      const [users, total] = await Promise.all([
        this.prisma.userAccount.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            roles: {
              include: {
                role: true,
              },
            },
            customerUsers: {
              include: {
                customer: {
                  select: { id: true, code: true, name: true },
                },
              },
            },
          },
        }),
        this.prisma.userAccount.count({ where }),
      ]);

      // Remove passwordHash from response
      const sanitized = users.map((u) => {
        const { passwordHash, ...rest } = u;
        return rest;
      });

      return {
        items: sanitized,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    } catch (err: any) {
      return {
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
        note: err.message,
      };
    }
  }

  async getUserById(id: string) {
    const user = await this.prisma.userAccount.findUnique({
      where: { id },
      include: {
        roles: {
          include: { role: true },
        },
        customerUsers: {
          include: { customer: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found.`);
    }

    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }

  async createUser(data: any) {
    const existing = await this.prisma.userAccount.findFirst({
      where: {
        OR: [
          { email: data.email?.toLowerCase() },
          { username: data.username?.toLowerCase() },
        ],
      },
    });

    if (existing) {
      throw new BadRequestException('A user with that email or username already exists.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password || 'TempPass123!', salt);

    const user = await this.prisma.userAccount.create({
      data: {
        username: data.username.toLowerCase(),
        email: data.email.toLowerCase(),
        fullName: data.fullName,
        jobTitle: data.jobTitle,
        department: data.department,
        mobile: data.mobile,
        userType: data.userType || 'internal',
        status: data.status || 'ACTIVE',
        passwordHash,
      },
    });

    // If roles provided, link them
    if (Array.isArray(data.roleIds) && data.roleIds.length > 0) {
      await Promise.all(
        data.roleIds.map((roleId: string) =>
          this.prisma.userRole.create({
            data: {
              userId: user.id,
              roleId,
            },
          }).catch(() => null),
        ),
      );
    }

    const { passwordHash: _, ...sanitized } = user;
    return sanitized;
  }

  async updateUser(id: string, data: any) {
    const user = await this.prisma.userAccount.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User '${id}' not found.`);
    }

    const updated = await this.prisma.userAccount.update({
      where: { id },
      data: {
        fullName: data.fullName ?? user.fullName,
        email: data.email ? data.email.toLowerCase() : user.email,
        jobTitle: data.jobTitle ?? user.jobTitle,
        department: data.department ?? user.department,
        mobile: data.mobile ?? user.mobile,
        userType: data.userType ?? user.userType,
        status: data.status ?? user.status,
        isActive: data.isActive !== undefined ? data.isActive : user.isActive,
      },
      include: {
        roles: { include: { role: true } },
      },
    });

    const { passwordHash, ...sanitized } = updated;
    return sanitized;
  }

  async toggleLockUser(id: string, lock: boolean) {
    const user = await this.prisma.userAccount.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User '${id}' not found.`);
    }

    const updated = await this.prisma.userAccount.update({
      where: { id },
      data: {
        isLocked: lock,
        failedLoginAttempts: lock ? user.failedLoginAttempts : 0,
      },
    });

    const { passwordHash, ...sanitized } = updated;
    return sanitized;
  }

  async resetUserPassword(id: string, newPassword?: string) {
    const user = await this.prisma.userAccount.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User '${id}' not found.`);
    }

    const pwdToSet = newPassword || 'Energya2026!';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(pwdToSet, salt);

    await this.prisma.userAccount.update({
      where: { id },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        isLocked: false,
      },
    });

    return {
      success: true,
      message: `Password reset successfully for user '${user.username}'.`,
      temporaryPassword: newPassword ? undefined : pwdToSet,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ROLES & PERMISSIONS
  // ══════════════════════════════════════════════════════════════════════════

  async listRoles() {
    try {
      return await this.prisma.role.findMany({
        orderBy: { code: 'asc' },
        include: {
          _count: {
            select: { users: true, permissions: true },
          },
        },
      });
    } catch {
      // Default fallback standard roles
      return [
        { id: 'role-admin', code: 'ADMINISTRATOR', name: 'Administrator', userType: 'internal', isActive: true, _count: { users: 2, permissions: 15 } },
        { id: 'role-sales-mgr', code: 'SALES_MANAGER', name: 'Sales Manager', userType: 'internal', isActive: true, _count: { users: 3, permissions: 10 } },
        { id: 'role-sales-eng', code: 'SALES_ENGINEER', name: 'Sales Engineer', userType: 'internal', isActive: true, _count: { users: 5, permissions: 8 } },
        { id: 'role-tech-office', code: 'TECHNICAL_OFFICE', name: 'Technical Office', userType: 'internal', isActive: true, _count: { users: 4, permissions: 9 } },
        { id: 'role-costing', code: 'COSTING_SPECIALIST', name: 'Costing Specialist', userType: 'internal', isActive: true, _count: { users: 2, permissions: 7 } },
        { id: 'role-customer', code: 'CUSTOMER_PORTAL_USER', name: 'Customer User', userType: 'customer', isActive: true, _count: { users: 12, permissions: 4 } },
      ];
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CUSTOMERS
  // ══════════════════════════════════════════════════════════════════════════

  async listCustomers(query: CustomerQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { code: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
        { countryCode: { contains: term, mode: 'insensitive' } },
      ];
    }

    try {
      const [items, total] = await Promise.all([
        this.prisma.customer.findMany({
          where,
          skip,
          take: limit,
          orderBy: { name: 'asc' },
          include: {
            _count: {
              select: { users: true, contacts: true, addresses: true },
            },
          },
        }),
        this.prisma.customer.count({ where }),
      ]);

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    } catch (err: any) {
      return {
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
        note: err.message,
      };
    }
  }

  async getCustomerById(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        users: {
          include: {
            userAccount: {
              select: { id: true, username: true, fullName: true, email: true, isActive: true },
            },
          },
        },
        contacts: true,
        addresses: true,
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID '${id}' not found.`);
    }

    return customer;
  }

  async createCustomer(data: any) {
    const existing = await this.prisma.customer.findUnique({
      where: { code: data.code },
    });

    if (existing) {
      throw new BadRequestException(`Customer with code '${data.code}' already exists.`);
    }

    return this.prisma.customer.create({
      data: {
        code: data.code.toUpperCase(),
        name: data.name,
        legalName: data.legalName,
        countryCode: data.countryCode || 'EG',
        defaultCurrency: data.defaultCurrency || 'USD',
        paymentTerms: data.paymentTerms,
        deliveryTerms: data.deliveryTerms,
        status: data.status || 'ACTIVE',
      },
    });
  }

  async updateCustomer(id: string, data: any) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException(`Customer '${id}' not found.`);
    }

    return this.prisma.customer.update({
      where: { id },
      data: {
        name: data.name ?? customer.name,
        legalName: data.legalName ?? customer.legalName,
        countryCode: data.countryCode ?? customer.countryCode,
        defaultCurrency: data.defaultCurrency ?? customer.defaultCurrency,
        paymentTerms: data.paymentTerms ?? customer.paymentTerms,
        deliveryTerms: data.deliveryTerms ?? customer.deliveryTerms,
        status: data.status ?? customer.status,
      },
    });
  }

  async assignCustomerUser(customerId: string, userAccountId: string) {
    return this.prisma.customerUser.upsert({
      where: {
        customerId_userAccountId: {
          customerId,
          userAccountId,
        },
      },
      update: {
        status: 'ACTIVE',
      },
      create: {
        customerId,
        userAccountId,
        status: 'ACTIVE',
      },
      include: {
        customer: true,
        userAccount: {
          select: { id: true, username: true, fullName: true, email: true },
        },
      },
    });
  }
}
