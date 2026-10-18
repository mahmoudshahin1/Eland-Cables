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

export function toDeliveryPreference(row: any) {
  return {
    id: row.id,
    countryCode: row.countryCode,
    countryLabel: row.countryLabel,
    incotermCode: row.incotermCode,
    destinationPortCode: row.destinationPortCode,
    destinationPortName: row.destinationPort?.name || null,
    isDefault: row.isDefault,
    active: row.active,
  };
}

export function resolveCustomerCommercialProfile(input: any) {
  const currencyCode = input.defaultCurrency ? String(input.defaultCurrency).trim() : null;
  return {
    currencyCode,
    currencyName: currencyCode,
    paymentTermCode: input.paymentTerm?.code ? String(input.paymentTerm.code).trim() : null,
    paymentTermName: (input.paymentTerm?.name ? String(input.paymentTerm.name).trim() : null) || (input.paymentTerms ? String(input.paymentTerms).trim() : null),
    paymentMethodCode: input.paymentMethod?.code ? String(input.paymentMethod.code).trim() : null,
    paymentMethodName: input.paymentMethod?.name ? String(input.paymentMethod.name).trim() : null,
    classificationCode: input.classification?.code ? String(input.classification.code).trim() : null,
    classificationName: input.classification?.name ? String(input.classification.name).trim() : null,
    customerType: input.type ? String(input.type).trim() : null,
    segmentCode: input.segment?.code ? String(input.segment.code).trim() : null,
    segmentName: input.segment?.name ? String(input.segment.name).trim() : null,
  };
}

export function toCustomerDetail(row: any) {
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
    addresses: row.addresses || [],
    contacts: row.contacts || [],
    externalMappings: row.externalMappings || [],
    deliveryPreferences: (row.deliveryCombinations || []).map(toDeliveryPreference),
    users: (row.users || []).map((link: any) => ({
      id: link.id,
      status: link.status,
      assignedAt: link.assignedAt,
      assignedBy: link.assignedBy,
      user: toSafeUser({
        ...link.userAccount,
        roles: link.userAccount?.roles || [],
        permissionCodes: [],
      }),
    })),
  };
}
