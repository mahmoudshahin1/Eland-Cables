import { CustomerAssignmentStatus, CustomerStatus, CustomerType, Prisma } from '@prisma/client';
import { issue } from '../platform/errors/domainError';
import { hasPermission } from '../domain/rbacEngine';
import { RequestActor } from './auth';
import { requirePrisma, writeAudit, toSafeUser } from './identityService';
import { resolveCustomerCommercialProfile } from '../domain/customerMasterProfile';

function denyCustomerActors(actor: RequestActor) {
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot modify customer master data or assignments.');
  }
}

function parseCurrencies(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((c) => String(c).toUpperCase()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
  }
  return ['USD'];
}

function text(value: unknown): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t ? t : null;
}

function bool(value: unknown, fallback = false): boolean {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

const CUSTOMER_DETAIL_INCLUDE = {
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
  _count: { select: { users: true, inquiries: true, quotations: true } },
} satisfies Prisma.CustomerInclude;

type CustomerDetailRow = Prisma.CustomerGetPayload<{ include: typeof CUSTOMER_DETAIL_INCLUDE }>;

export function toPublicCustomer(row: {
  id: string;
  code: string;
  name: string;
  legalName?: string | null;
  countryCode?: string | null;
  type: CustomerType;
  status: CustomerStatus;
  defaultCurrency: string;
  defaultIncoterm?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  taxVatNumber?: string | null;
  remarks?: string | null;
  companyLogoUrl?: string | null;
  companyTagline?: string | null;
  allowedQuotationCurrencies: unknown;
  customerGroupId?: string | null;
  classificationId?: string | null;
  segmentId?: string | null;
  paymentTermId?: string | null;
  paymentMethodId?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { users?: number; inquiries?: number; quotations?: number };
}) {
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

function toDeliveryPreference(row: CustomerDetailRow['deliveryCombinations'][number]) {
  return {
    id: row.id,
    countryCode: row.countryCode,
    countryLabel: row.countryLabel,
    incotermCode: row.incotermCode,
    destinationPortCode: row.destinationPortCode,
    destinationPortName: row.destinationPort.name,
    isDefault: row.isDefault,
    active: row.active,
  };
}

export function toCustomerDetail(row: CustomerDetailRow) {
  return {
    customer: {
      ...toPublicCustomer(row),
      customerGroup: row.customerGroup,
      commercialProfile: resolveCustomerCommercialProfile({
        defaultCurrency: row.defaultCurrency,
        type: row.type,
        paymentTerms: row.paymentTerms,
        paymentTerm: row.paymentTerm,
        paymentMethod: row.paymentMethod,
        classification: row.classification,
        segment: row.segment,
      }),
    },
    addresses: row.addresses,
    contacts: row.contacts,
    externalMappings: row.externalMappings,
    deliveryPreferences: row.deliveryCombinations.map(toDeliveryPreference),
    users: row.users.map((link) => ({
      id: link.id,
      status: link.status,
      assignedAt: link.assignedAt,
      assignedBy: link.assignedBy,
      user: toSafeUser({
        ...link.userAccount,
        roles: link.userAccount.roles,
        permissionCodes: [],
      }),
    })),
  };
}

function customerWhere(filter: { q?: string; status?: string; type?: string }) {
  const where: Prisma.CustomerWhereInput = {};
  if (filter.q) {
    where.OR = [
      { code: { contains: filter.q, mode: 'insensitive' } },
      { name: { contains: filter.q, mode: 'insensitive' } },
      { legalName: { contains: filter.q, mode: 'insensitive' } },
    ];
  }
  if (filter.status && filter.status !== 'all') where.status = filter.status as CustomerStatus;
  if (filter.type && filter.type !== 'all') where.type = filter.type as CustomerType;
  return where;
}

export async function listCustomers(filter: {
  q?: string;
  status?: string;
  type?: string;
  skip?: number;
  take?: number;
}) {
  const prisma = requirePrisma();
  const where = customerWhere(filter);
  const skip = filter.skip || 0;
  const take = Math.min(filter.take || 50, 200);
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true, inquiries: true, quotations: true } } },
    }),
    prisma.customer.count({ where }),
  ]);
  return { customers: customers.map(toPublicCustomer), total };
}

export async function listCustomersMatching(filter: { q?: string; status?: string; type?: string }) {
  const prisma = requirePrisma();
  const where = customerWhere(filter);
  return prisma.customer.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      addresses: true,
      contacts: true,
      externalMappings: true,
      deliveryCombinations: { include: { destinationPort: true, incoterm: true } },
      classification: true,
      segment: true,
      paymentTerm: true,
      paymentMethod: true,
      customerGroup: true,
    },
  });
}

async function findCustomerOrThrow(id: string) {
  const prisma = requirePrisma();
  const row = await prisma.customer.findFirst({
    where: { OR: [{ id }, { code: id }] },
    include: CUSTOMER_DETAIL_INCLUDE,
  });
  if (!row) throw issue('NOT_FOUND', 'Customer not found.');
  return row;
}

export async function getCustomerById(id: string) {
  return toCustomerDetail(await findCustomerOrThrow(id));
}

type CustomerWriteInput = {
  code?: string;
  name?: string;
  legalName?: string | null;
  countryCode?: string | null;
  type?: CustomerType;
  defaultCurrency?: string;
  defaultIncoterm?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  taxVatNumber?: string | null;
  remarks?: string | null;
  companyLogoUrl?: string | null;
  companyTagline?: string | null;
  allowedQuotationCurrencies?: unknown;
  customerGroupId?: string | null;
  classificationId?: string | null;
  segmentId?: string | null;
  paymentTermId?: string | null;
  paymentMethodId?: string | null;
  addresses?: unknown;
  contacts?: unknown;
  deliveryPreferences?: unknown;
  externalMappings?: unknown;
};

function coreCustomerData(input: CustomerWriteInput, previous?: { defaultCurrency: string; type: CustomerType }) {
  return {
    name: input.name !== undefined ? String(input.name).trim() : undefined,
    legalName: input.legalName !== undefined ? text(input.legalName) : undefined,
    countryCode: input.countryCode !== undefined ? text(input.countryCode)?.toUpperCase() || null : undefined,
    type: input.type !== undefined ? input.type : previous?.type,
    defaultCurrency:
      input.defaultCurrency !== undefined
        ? String(input.defaultCurrency || previous?.defaultCurrency || 'USD').trim().toUpperCase()
        : undefined,
    defaultIncoterm: input.defaultIncoterm !== undefined ? text(input.defaultIncoterm)?.toUpperCase() || null : undefined,
    paymentTerms: input.paymentTerms !== undefined ? text(input.paymentTerms) : undefined,
    deliveryTerms: input.deliveryTerms !== undefined ? text(input.deliveryTerms) : undefined,
    taxVatNumber: input.taxVatNumber !== undefined ? text(input.taxVatNumber) : undefined,
    remarks: input.remarks !== undefined ? text(input.remarks) : undefined,
    companyLogoUrl: input.companyLogoUrl !== undefined ? text(input.companyLogoUrl) : undefined,
    companyTagline: input.companyTagline !== undefined ? text(input.companyTagline) : undefined,
    allowedQuotationCurrencies:
      input.allowedQuotationCurrencies !== undefined ? parseCurrencies(input.allowedQuotationCurrencies) : undefined,
    customerGroupId: input.customerGroupId !== undefined ? text(input.customerGroupId) : undefined,
    classificationId: input.classificationId !== undefined ? text(input.classificationId) : undefined,
    segmentId: input.segmentId !== undefined ? text(input.segmentId) : undefined,
    paymentTermId: input.paymentTermId !== undefined ? text(input.paymentTermId) : undefined,
    paymentMethodId: input.paymentMethodId !== undefined ? text(input.paymentMethodId) : undefined,
  };
}

async function syncAddresses(
  tx: Prisma.TransactionClient,
  customerId: string,
  items: unknown,
  actor: RequestActor
) {
  if (!Array.isArray(items)) return;
  const existing = await tx.customerAddress.findMany({ where: { customerId } });
  const keep = new Set(items.map((item) => (item as { id?: string }).id).filter(Boolean) as string[]);
  for (const row of existing) {
    if (!keep.has(row.id)) {
      await tx.customerAddress.update({ where: { id: row.id }, data: { active: false, isDefault: false } });
    }
  }
  let defaultAssigned = false;
  for (const raw of items) {
    const item = (raw || {}) as Record<string, unknown>;
    const code = text(item.code);
    const line1 = text(item.line1);
    if (!code || !line1) throw issue('VALIDATION_FAILED', 'Address code and line 1 are required.');
    const isDefault = !defaultAssigned && bool(item.isDefault);
    if (isDefault) defaultAssigned = true;
    const data = {
      code,
      name: text(item.name),
      addressType: text(item.addressType) || 'OTHER',
      line1,
      line2: text(item.line2),
      city: text(item.city),
      stateRegion: text(item.stateRegion),
      countryCode: text(item.countryCode)?.toUpperCase() || null,
      postalCode: text(item.postalCode),
      isDefault,
      active: item.active === undefined ? true : bool(item.active, true),
      updatedBy: actor.id || actor.email,
    };
    const id = text(item.id);
    if (id && existing.some((row) => row.id === id)) {
      await tx.customerAddress.update({ where: { id }, data });
    } else {
      await tx.customerAddress.create({
        data: { ...data, customerId, createdBy: actor.id || actor.email },
      });
    }
  }
}

async function syncContacts(
  tx: Prisma.TransactionClient,
  customerId: string,
  items: unknown,
  actor: RequestActor
) {
  if (!Array.isArray(items)) return;
  const existing = await tx.customerContact.findMany({ where: { customerId } });
  const keep = new Set(items.map((item) => (item as { id?: string }).id).filter(Boolean) as string[]);
  for (const row of existing) {
    if (!keep.has(row.id)) {
      await tx.customerContact.update({ where: { id: row.id }, data: { active: false, isPrimary: false } });
    }
  }
  let primaryAssigned = false;
  for (const raw of items) {
    const item = (raw || {}) as Record<string, unknown>;
    const name = text(item.name);
    if (!name) throw issue('VALIDATION_FAILED', 'Contact name is required.');
    const isPrimary = !primaryAssigned && bool(item.isPrimary);
    if (isPrimary) primaryAssigned = true;
    const data = {
      name,
      jobTitle: text(item.jobTitle),
      email: text(item.email),
      phone: text(item.phone),
      mobile: text(item.mobile),
      department: text(item.department),
      isPrimary,
      active: item.active === undefined ? true : bool(item.active, true),
      updatedBy: actor.id || actor.email,
    };
    const id = text(item.id);
    if (id && existing.some((row) => row.id === id)) {
      await tx.customerContact.update({ where: { id }, data });
    } else {
      await tx.customerContact.create({
        data: { ...data, customerId, createdBy: actor.id || actor.email },
      });
    }
  }
}

async function syncExternalMappings(
  tx: Prisma.TransactionClient,
  customerId: string,
  items: unknown,
  actor: RequestActor
) {
  if (!Array.isArray(items)) return;
  const existing = await tx.customerExternalMapping.findMany({ where: { customerId } });
  const keep = new Set(items.map((item) => (item as { id?: string }).id).filter(Boolean) as string[]);
  for (const row of existing) {
    if (!keep.has(row.id)) {
      await tx.customerExternalMapping.update({ where: { id: row.id }, data: { active: false } });
    }
  }
  for (const raw of items) {
    const item = (raw || {}) as Record<string, unknown>;
    const system = text(item.system);
    const externalCustomerCode = text(item.externalCustomerCode);
    if (!system || !externalCustomerCode) {
      throw issue('VALIDATION_FAILED', 'External mapping system and external customer code are required.');
    }
    const data = {
      system,
      externalCustomerCode,
      externalName: text(item.externalName),
      mappingStatus: text(item.mappingStatus) || 'PENDING',
      active: item.active === undefined ? true : bool(item.active, true),
      updatedBy: actor.id || actor.email,
    };
    const id = text(item.id);
    if (id && existing.some((row) => row.id === id)) {
      await tx.customerExternalMapping.update({ where: { id }, data });
    } else {
      await tx.customerExternalMapping.create({
        data: { ...data, customerId, createdBy: actor.id || actor.email },
      });
    }
  }
}

async function syncDeliveryPreferences(
  tx: Prisma.TransactionClient,
  customerId: string,
  items: unknown,
  actor: RequestActor
) {
  if (!Array.isArray(items)) return;
  const existing = await tx.customerDeliveryCombination.findMany({ where: { customerId } });
  const keep = new Set(items.map((item) => (item as { id?: string }).id).filter(Boolean) as string[]);
  for (const row of existing) {
    if (!keep.has(row.id)) {
      await tx.customerDeliveryCombination.update({
        where: { id: row.id },
        data: { active: false, isDefault: false },
      });
    }
  }
  let defaultAssigned = false;
  for (const raw of items) {
    const item = (raw || {}) as Record<string, unknown>;
    const countryCode = text(item.countryCode)?.toUpperCase();
    const countryLabel = text(item.countryLabel) || countryCode;
    const incotermCode = text(item.incotermCode)?.toUpperCase();
    const destinationPortCode = text(item.destinationPortCode)?.toUpperCase();
    if (!countryCode || !incotermCode || !destinationPortCode || !countryLabel) {
      throw issue('VALIDATION_FAILED', 'Delivery preference requires country, incoterm, and destination port.');
    }
    const incoterm = await tx.incoterm.findUnique({ where: { code: incotermCode } });
    if (!incoterm) throw issue('VALIDATION_FAILED', `Incoterm ${incotermCode} was not found in the global master.`);
    const port = await tx.destinationPort.findUnique({ where: { code: destinationPortCode } });
    if (!port) throw issue('VALIDATION_FAILED', `Destination port ${destinationPortCode} was not found.`);
    const isDefault = !defaultAssigned && bool(item.isDefault);
    if (isDefault) defaultAssigned = true;
    const data = {
      countryCode,
      countryLabel,
      incotermCode,
      destinationPortCode,
      isDefault,
      active: item.active === undefined ? true : bool(item.active, true),
      updatedBy: actor.id || actor.email,
    };
    const id = text(item.id);
    if (id && existing.some((row) => row.id === id)) {
      await tx.customerDeliveryCombination.update({ where: { id }, data });
    } else {
      await tx.customerDeliveryCombination.create({
        data: { ...data, customerId, createdBy: actor.id || actor.email },
      });
    }
  }
}

async function persistChildren(
  tx: Prisma.TransactionClient,
  customerId: string,
  input: CustomerWriteInput,
  actor: RequestActor
) {
  await syncAddresses(tx, customerId, input.addresses, actor);
  await syncContacts(tx, customerId, input.contacts, actor);
  await syncExternalMappings(tx, customerId, input.externalMappings, actor);
  await syncDeliveryPreferences(tx, customerId, input.deliveryPreferences, actor);
}

export async function createCustomer(actor: RequestActor, input: CustomerWriteInput) {
  denyCustomerActors(actor);
  const prisma = requirePrisma();
  const code = String(input.code || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  if (!code || !name) throw issue('VALIDATION_FAILED', 'Customer code and name are required.');
  const existing = await prisma.customer.findUnique({ where: { code } });
  if (existing) throw issue('CONFLICT', 'Customer code already exists.');
  const customerId = await prisma.$transaction(async (tx) => {
    const created = await tx.customer.create({
      data: {
        code,
        name,
        legalName: text(input.legalName),
        countryCode: text(input.countryCode)?.toUpperCase() || null,
        type: input.type || 'OTHER',
        defaultCurrency: String(input.defaultCurrency || 'USD').trim().toUpperCase(),
        defaultIncoterm: text(input.defaultIncoterm)?.toUpperCase() || null,
        paymentTerms: text(input.paymentTerms),
        deliveryTerms: text(input.deliveryTerms),
        taxVatNumber: text(input.taxVatNumber),
        remarks: text(input.remarks),
        companyLogoUrl: text(input.companyLogoUrl),
        companyTagline: text(input.companyTagline),
        allowedQuotationCurrencies: parseCurrencies(input.allowedQuotationCurrencies),
        customerGroupId: text(input.customerGroupId),
        classificationId: text(input.classificationId),
        segmentId: text(input.segmentId),
        paymentTermId: text(input.paymentTermId),
        paymentMethodId: text(input.paymentMethodId),
        createdBy: actor.id || actor.email,
        updatedBy: actor.id || actor.email,
      },
    });
    await persistChildren(tx, created.id, input, actor);
    return created.id;
  });
  const detail = await getCustomerById(customerId);
  await writeAudit({
    actor,
    entity: 'Customer',
    entityId: customerId,
    action: 'CREATE_CUSTOMER',
    newValue: detail.customer,
    message: `Created customer ${detail.customer.code}`,
  });
  return detail.customer;
}

export async function updateCustomer(actor: RequestActor, id: string, input: CustomerWriteInput) {
  denyCustomerActors(actor);
  const prisma = requirePrisma();
  const previous = await prisma.customer.findFirst({ where: { OR: [{ id }, { code: id }] } });
  if (!previous) throw issue('NOT_FOUND', 'Customer not found.');
  const data = coreCustomerData(input, previous);
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: previous.id },
      data: {
        ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
        updatedBy: actor.id || actor.email,
      },
    });
    await persistChildren(tx, previous.id, input, actor);
  });
  const detail = await getCustomerById(previous.id);
  await writeAudit({
    actor,
    entity: 'Customer',
    entityId: previous.id,
    action: 'UPDATE_CUSTOMER',
    oldValue: toPublicCustomer(previous),
    newValue: detail.customer,
    message: `Updated customer ${detail.customer.code}`,
  });
  return detail.customer;
}

export async function setCustomerActive(actor: RequestActor, id: string, active: boolean) {
  denyCustomerActors(actor);
  const prisma = requirePrisma();
  const previous = await prisma.customer.findFirst({ where: { OR: [{ id }, { code: id }] } });
  if (!previous) throw issue('NOT_FOUND', 'Customer not found.');
  const customer = await prisma.customer.update({
    where: { id: previous.id },
    data: { status: active ? 'ACTIVE' : 'INACTIVE', updatedBy: actor.id || actor.email },
  });
  await writeAudit({
    actor,
    entity: 'Customer',
    entityId: customer.id,
    action: active ? 'ACTIVATE_CUSTOMER' : 'DEACTIVATE_CUSTOMER',
    oldValue: { status: previous.status },
    newValue: { status: customer.status },
    message: `${active ? 'Activated' : 'Deactivated'} customer ${customer.code}`,
  });
  return toPublicCustomer(customer);
}

export async function deleteOrDeactivateCustomer(actor: RequestActor, id: string) {
  denyCustomerActors(actor);
  const prisma = requirePrisma();
  const previous = await prisma.customer.findFirst({
    where: { OR: [{ id }, { code: id }] },
    include: {
      _count: {
        select: {
          inquiries: true,
          quotations: true,
          containerStudies: true,
          users: true,
          deliveryCombinations: true,
        },
      },
    },
  });
  if (!previous) throw issue('NOT_FOUND', 'Customer not found.');
  const historicalKeys = [previous.id, previous.code];
  const [commitmentCount, salesOrderCount] = await Promise.all([
    prisma.commercialCommitment.count({
      where: { OR: [{ customerMasterId: previous.id }, { customerId: { in: historicalKeys } }] },
    }),
    prisma.epcSalesOrder.count({
      where: { OR: [{ customerMasterId: previous.id }, { customerId: { in: historicalKeys } }] },
    }),
  ]);
  const referenced =
    previous._count.inquiries +
      previous._count.quotations +
      previous._count.containerStudies +
      commitmentCount +
      salesOrderCount >
    0;
  if (referenced) {
    const customer = await setCustomerActive(actor, previous.id, false);
    return {
      action: 'deactivated' as const,
      reason: 'Customer is referenced by historical commercial transactions and cannot be hard-deleted.',
      customer,
    };
  }
  await prisma.$transaction(async (tx) => {
    await tx.customerDeliveryCombination.deleteMany({ where: { customerId: previous.id } });
    await tx.customerAddress.deleteMany({ where: { customerId: previous.id } });
    await tx.customerContact.deleteMany({ where: { customerId: previous.id } });
    await tx.customerExternalMapping.deleteMany({ where: { customerId: previous.id } });
    await tx.customerUser.deleteMany({ where: { customerId: previous.id } });
    await tx.customer.delete({ where: { id: previous.id } });
  });
  await writeAudit({
    actor,
    entity: 'Customer',
    entityId: previous.id,
    action: 'DELETE_CUSTOMER',
    oldValue: toPublicCustomer(previous),
    message: `Deleted unreferenced customer ${previous.code}`,
  });
  return { action: 'deleted' as const, reason: null, customer: toPublicCustomer(previous) };
}

export async function listCustomerReferenceMasters() {
  const prisma = requirePrisma();
  const [currencies, paymentTerms, paymentMethods, classifications, segments, groups, incoterms, destinationPorts] =
    await Promise.all([
      prisma.costingCurrency.findMany({ where: { status: 'ACTIVE' }, orderBy: { code: 'asc' } }),
      prisma.paymentTerm.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
      prisma.paymentMethod.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
      prisma.customerClassification.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
      prisma.customerSegment.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
      prisma.customerGroup.findMany({ orderBy: { name: 'asc' } }),
      prisma.incoterm.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
      prisma.destinationPort.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
    ]);
  return { currencies, paymentTerms, paymentMethods, classifications, segments, groups, incoterms, destinationPorts };
}

export async function listCustomerUsers(filter: {
  q?: string;
  customerId?: string;
  status?: string;
  skip?: number;
  take?: number;
}) {
  const prisma = requirePrisma();
  const where: Prisma.CustomerUserWhereInput = {};
  if (filter.customerId) where.customerId = filter.customerId;
  if (filter.status && filter.status !== 'all') where.status = filter.status as CustomerAssignmentStatus;
  if (filter.q) {
    where.userAccount = {
      OR: [
        { email: { contains: filter.q, mode: 'insensitive' } },
        { fullName: { contains: filter.q, mode: 'insensitive' } },
        { username: { contains: filter.q, mode: 'insensitive' } },
      ],
    };
  }
  const skip = filter.skip || 0;
  const take = Math.min(filter.take || 50, 200);
  const [rows, total] = await Promise.all([
    prisma.customerUser.findMany({
      where,
      skip,
      take,
      orderBy: { assignedAt: 'desc' },
      include: {
        customer: true,
        userAccount: { include: { roles: { include: { role: true } } } },
      },
    }),
    prisma.customerUser.count({ where }),
  ]);
  return {
    total,
    assignments: rows.map((link) => ({
      id: link.id,
      status: link.status,
      assignedAt: link.assignedAt,
      assignedBy: link.assignedBy,
      customer: toPublicCustomer(link.customer),
      user: toSafeUser({ ...link.userAccount, roles: link.userAccount.roles, permissionCodes: [] }),
    })),
  };
}

export async function assignUserToCustomer(actor: RequestActor, input: { customerId: string; userAccountId: string }) {
  denyCustomerActors(actor);
  if (actor.id && actor.id === input.userAccountId && actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot assign themselves to a customer.');
  }
  const prisma = requirePrisma();
  const customer = await prisma.customer.findFirst({
    where: { OR: [{ id: input.customerId }, { code: input.customerId }] },
  });
  if (!customer) throw issue('NOT_FOUND', 'Customer not found.');
  const user = await prisma.userAccount.findUnique({
    where: { id: input.userAccountId },
    include: { roles: { include: { role: true } } },
  });
  if (!user) throw issue('NOT_FOUND', 'User not found.');
  if (user.userType === 'customer') {
    const otherActive = await prisma.customerUser.count({
      where: { userAccountId: user.id, status: 'ACTIVE', NOT: { customerId: customer.id } },
    });
    if (otherActive > 0) {
      throw issue(
        'CONFIGURATION_REQUIRED',
        'Customer users may have only one active customer assignment. Deactivate the existing assignment before assigning another customer.'
      );
    }
  }
  const link = await prisma.customerUser.upsert({
    where: { customerId_userAccountId: { customerId: customer.id, userAccountId: user.id } },
    create: {
      customerId: customer.id,
      userAccountId: user.id,
      status: 'ACTIVE',
      assignedBy: actor.id || actor.email,
    },
    update: { status: 'ACTIVE', assignedBy: actor.id || actor.email, assignedAt: new Date() },
  });
  await writeAudit({
    actor,
    entity: 'CustomerUser',
    entityId: link.id,
    action: 'ASSIGN_CUSTOMER_USER',
    newValue: { customerId: customer.id, customerCode: customer.code, userAccountId: user.id, email: user.email },
    message: `Assigned ${user.email} to customer ${customer.code}`,
  });
  return { id: link.id, status: link.status, customer: toPublicCustomer(customer), user: toSafeUser({ ...user, permissionCodes: [] }) };
}

export async function updateCustomerUser(actor: RequestActor, id: string, status: CustomerAssignmentStatus) {
  denyCustomerActors(actor);
  const prisma = requirePrisma();
  const previous = await prisma.customerUser.findUnique({
    where: { id },
    include: { customer: true, userAccount: true },
  });
  if (!previous) throw issue('NOT_FOUND', 'Customer-user assignment not found.');
  const link = await prisma.customerUser.update({ where: { id }, data: { status } });
  await writeAudit({
    actor,
    entity: 'CustomerUser',
    entityId: link.id,
    action: status === 'ACTIVE' ? 'ASSIGN_CUSTOMER_USER' : 'UNASSIGN_CUSTOMER_USER',
    oldValue: { status: previous.status, customerId: previous.customerId, userAccountId: previous.userAccountId },
    newValue: { status: link.status },
    message: `Updated assignment ${previous.userAccount.email} / ${previous.customer.code} to ${status}`,
  });
  return link;
}

export async function listCustomerAudit(customerId: string) {
  const prisma = requirePrisma();
  const customer = await prisma.customer.findFirst({
    where: { OR: [{ id: customerId }, { code: customerId }] },
  });
  if (!customer) throw issue('NOT_FOUND', 'Customer not found.');
  const links = await prisma.customerUser.findMany({ where: { customerId: customer.id }, select: { id: true } });
  const events = await prisma.auditEvent.findMany({
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
  return { events };
}

export function canMutateCustomers(actor: RequestActor, action: 'VIEW' | 'CREATE' | 'UPDATE' | 'ACTIVATE') {
  return hasPermission(actor, 'ADMIN', 'CUSTOMER', action);
}
