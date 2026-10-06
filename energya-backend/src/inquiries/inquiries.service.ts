import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import type { RequestUser } from '../auth/current-user.decorator.js';

export interface InquiryListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  customerId?: string;
}

@Injectable()
export class InquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve customer ID for an actor if they are a customer user
   */
  private async resolveActorCustomer(actor: RequestUser): Promise<{ customerId?: string; customerName?: string }> {
    if (actor.role !== 'customer') {
      return {};
    }

    // Try finding via UserAccount.customerId first
    const user = await this.prisma.userAccount.findUnique({
      where: { id: actor.sub },
      include: {
        customerUsers: {
          include: { customer: true },
        },
      },
    });

    if (user?.customerUsers?.[0]?.customer) {
      return {
        customerId: user.customerUsers[0].customer.id,
        customerName: user.customerUsers[0].customer.name,
      };
    }

    if (user?.customerId) {
      return {
        customerId: user.customerId,
        customerName: user.fullName || 'Customer',
      };
    }

    return { customerId: 'CUSTOMER-' + actor.sub, customerName: actor.username };
  }

  /**
   * List inquiries with customer isolation and filters
   */
  async listInquiries(actor: RequestUser, query: InquiryListQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const actorCustomer = await this.resolveActorCustomer(actor);
    const where: any = {};

    // Customer isolation: Customer users can ONLY see their own inquiries
    if (actor.role === 'customer') {
      where.OR = [
        { customerId: actorCustomer.customerId || 'NONE' },
        { createdBy: actor.username },
      ];
    } else if (query.customerId) {
      where.customerId = query.customerId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      const searchConditions = [
        { inquiryNumber: { contains: term, mode: 'insensitive' } },
        { customerName: { contains: term, mode: 'insensitive' } },
        { projectName: { contains: term, mode: 'insensitive' } },
        { customerReference: { contains: term, mode: 'insensitive' } },
      ];

      if (where.OR) {
        where.AND = [{ OR: searchConditions }];
      } else {
        where.OR = searchConditions;
      }
    }

    try {
      const [items, total] = await Promise.all([
        this.prisma.commercialInquiry.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: {
              select: { lines: true, attachments: true, quotations: true },
            },
          },
        }),
        this.prisma.commercialInquiry.count({ where }),
      ]);

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Failed to list inquiries.');
    }
  }

  /**
   * Get single inquiry detail with lines
   */
  async getInquiryById(id: string, actor: RequestUser) {
    const inquiry = await this.prisma.commercialInquiry.findUnique({
      where: { id },
      include: {
        lines: {
          orderBy: { lineNumber: 'asc' },
        },
        attachments: true,
        quotations: {
          take: 5,
          orderBy: { versionNo: 'desc' },
        },
      },
    });

    if (!inquiry) {
      throw new NotFoundException(`Inquiry with ID '${id}' not found.`);
    }

    // Customer isolation check
    if (actor.role === 'customer') {
      const actorCustomer = await this.resolveActorCustomer(actor);
      if (
        inquiry.customerId !== actorCustomer.customerId &&
        inquiry.createdBy !== actor.username
      ) {
        throw new ForbiddenException('You do not have access to view this inquiry.');
      }
    }

    return inquiry;
  }

  /**
   * Generate an inquiry number: INQ-YYYYMMDD-XXXX
   */
  private generateInquiryNumber(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `INQ-${dateStr}-${rand}`;
  }

  /**
   * Create a new Inquiry
   */
  async createInquiry(actor: RequestUser, data: any) {
    const actorCustomer = await this.resolveActorCustomer(actor);
    const inquiryNumber = data.inquiryNumber || this.generateInquiryNumber();

    const customerId =
      actor.role === 'customer'
        ? actorCustomer.customerId || 'CUST-SELF'
        : data.customerId || 'CUST-GENERAL';

    const customerName =
      actor.role === 'customer'
        ? actorCustomer.customerName || actor.username
        : data.customerName || 'General Customer';

    const linesData = Array.isArray(data.lines)
      ? data.lines.map((line: any, idx: number) => ({
          lineNumber: idx + 1,
          materialNumber: line.materialNumber,
          cableDescription: line.cableDescription || 'Custom Cable Requirement',
          requestedQuantity: line.requestedQuantity ?? 1,
          quantityUom: line.quantityUom || 'KM',
          requestedLengthMeters: line.requestedLengthMeters ?? 1000,
          drumType: line.drumType || 'Standard Drum',
          notes: line.notes,
        }))
      : [];

    return this.prisma.commercialInquiry.create({
      data: {
        inquiryNumber,
        customerId,
        customerName,
        contactPerson: data.contactPerson || actor.username,
        customerReference: data.customerReference,
        projectName: data.projectName,
        requestedDeliveryDate: data.requestedDeliveryDate
          ? new Date(data.requestedDeliveryDate)
          : undefined,
        currency: data.currency || 'USD',
        incoterms: data.incoterms || 'FOB',
        paymentTerms: data.paymentTerms || 'LC at sight',
        deliveryTerms: data.deliveryTerms || 'Standard CIF',
        notes: data.notes,
        createdBy: actor.username,
        status: (data.status as any) || 'DRAFT',
        lines: {
          create: linesData,
        },
      },
      include: {
        lines: true,
      },
    });
  }

  /**
   * Update Inquiry Header
   */
  async updateInquiry(id: string, actor: RequestUser, data: any) {
    const inquiry = await this.getInquiryById(id, actor);

    if (inquiry.status !== 'DRAFT' && actor.role === 'customer') {
      throw new BadRequestException('Cannot edit an inquiry once submitted.');
    }

    return this.prisma.commercialInquiry.update({
      where: { id },
      data: {
        projectName: data.projectName ?? inquiry.projectName,
        customerReference: data.customerReference ?? inquiry.customerReference,
        contactPerson: data.contactPerson ?? inquiry.contactPerson,
        requestedDeliveryDate: data.requestedDeliveryDate
          ? new Date(data.requestedDeliveryDate)
          : inquiry.requestedDeliveryDate,
        currency: data.currency ?? inquiry.currency,
        incoterms: data.incoterms ?? inquiry.incoterms,
        paymentTerms: data.paymentTerms ?? inquiry.paymentTerms,
        deliveryTerms: data.deliveryTerms ?? inquiry.deliveryTerms,
        notes: data.notes ?? inquiry.notes,
        modifiedBy: actor.username,
      },
      include: {
        lines: true,
      },
    });
  }

  /**
   * Submit Inquiry (transitions status DRAFT -> SUBMITTED)
   */
  async submitInquiry(id: string, actor: RequestUser) {
    const inquiry = await this.getInquiryById(id, actor);

    if (inquiry.status !== 'DRAFT') {
      throw new BadRequestException(`Inquiry is already in '${inquiry.status}' status.`);
    }

    return this.prisma.commercialInquiry.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        modifiedBy: actor.username,
      },
      include: {
        lines: true,
      },
    });
  }

  /**
   * Cancel Inquiry
   */
  async cancelInquiry(id: string, actor: RequestUser, reason?: string) {
    await this.getInquiryById(id, actor);

    return this.prisma.commercialInquiry.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        notes: reason ? `Cancelled: ${reason}` : undefined,
        modifiedBy: actor.username,
      },
    });
  }

  /**
   * Update Inquiry Status (Staff action)
   */
  async updateStatus(id: string, actor: RequestUser, status: any) {
    if (actor.role === 'customer') {
      throw new ForbiddenException('Customer users cannot manually change workflow status.');
    }

    return this.prisma.commercialInquiry.update({
      where: { id },
      data: {
        status,
        modifiedBy: actor.username,
      },
      include: {
        lines: true,
      },
    });
  }

  /**
   * Add a line item to an Inquiry
   */
  async addLine(inquiryId: string, actor: RequestUser, lineData: any) {
    const inquiry = await this.getInquiryById(inquiryId, actor);

    const highestLine = await this.prisma.commercialInquiryLine.findFirst({
      where: { inquiryId },
      orderBy: { lineNumber: 'desc' },
      select: { lineNumber: true },
    });

    const nextLineNumber = (highestLine?.lineNumber || 0) + 1;

    return this.prisma.commercialInquiryLine.create({
      data: {
        inquiryId,
        lineNumber: nextLineNumber,
        materialNumber: lineData.materialNumber,
        customerCode: lineData.customerCode || inquiry.customerId,
        itemCode: lineData.itemCode,
        cableDescription: lineData.cableDescription || 'Cable Specification',
        requestedQuantity: lineData.requestedQuantity ?? 1,
        quantityUom: lineData.quantityUom || 'KM',
        requestedLengthMeters: lineData.requestedLengthMeters ?? 1000,
        cuttingLengthMeters: lineData.cuttingLengthMeters,
        drumType: lineData.drumType || 'Wood Reel 220',
        cableTolerancePercent: lineData.cableTolerancePercent,
        notes: lineData.notes,
        status: 'DRAFT',
      },
    });
  }

  /**
   * Update a line item
   */
  async updateLine(inquiryId: string, lineId: string, actor: RequestUser, lineData: any) {
    await this.getInquiryById(inquiryId, actor);

    const line = await this.prisma.commercialInquiryLine.findFirst({
      where: { id: lineId, inquiryId },
    });

    if (!line) {
      throw new NotFoundException(`Line '${lineId}' not found on inquiry.`);
    }

    return this.prisma.commercialInquiryLine.update({
      where: { id: lineId },
      data: {
        cableDescription: lineData.cableDescription ?? line.cableDescription,
        materialNumber: lineData.materialNumber ?? line.materialNumber,
        requestedQuantity: lineData.requestedQuantity ?? line.requestedQuantity,
        quantityUom: lineData.quantityUom ?? line.quantityUom,
        requestedLengthMeters: lineData.requestedLengthMeters ?? line.requestedLengthMeters,
        cuttingLengthMeters: lineData.cuttingLengthMeters ?? line.cuttingLengthMeters,
        drumType: lineData.drumType ?? line.drumType,
        cableTolerancePercent: lineData.cableTolerancePercent ?? line.cableTolerancePercent,
        notes: lineData.notes ?? line.notes,
      },
    });
  }

  /**
   * Delete a line item
   */
  async deleteLine(inquiryId: string, lineId: string, actor: RequestUser) {
    await this.getInquiryById(inquiryId, actor);

    return this.prisma.commercialInquiryLine.delete({
      where: { id: lineId },
    });
  }
}
