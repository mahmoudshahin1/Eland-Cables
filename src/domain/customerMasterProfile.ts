/**
 * Customer commercial profile resolution from Customer Master FKs + legacy columns.
 * Does not invent Payment Term / Method / Classification / Segment values.
 */

export type NamedMasterRef = {
  code: string;
  name: string;
  active?: boolean;
} | null | undefined;

export type CustomerCommercialProfileView = {
  currencyCode: string | null;
  currencyName: string | null;
  paymentTermCode: string | null;
  paymentTermName: string | null;
  paymentMethodCode: string | null;
  paymentMethodName: string | null;
  classificationCode: string | null;
  classificationName: string | null;
  customerType: string | null;
  segmentCode: string | null;
  segmentName: string | null;
};

function text(value: unknown): string | null {
  const t = String(value || '').trim();
  return t ? t : null;
}

export function resolveCustomerCommercialProfile(input: {
  defaultCurrency?: string | null;
  type?: string | null;
  paymentTerms?: string | null;
  paymentTerm?: NamedMasterRef;
  paymentMethod?: NamedMasterRef;
  classification?: NamedMasterRef;
  segment?: NamedMasterRef;
  currencyMaster?: NamedMasterRef;
}): CustomerCommercialProfileView {
  const currencyCode = text(input.defaultCurrency);
  return {
    currencyCode,
    currencyName: text(input.currencyMaster?.name) || currencyCode,
    paymentTermCode: text(input.paymentTerm?.code),
    paymentTermName: text(input.paymentTerm?.name) || text(input.paymentTerms),
    paymentMethodCode: text(input.paymentMethod?.code),
    paymentMethodName: text(input.paymentMethod?.name),
    classificationCode: text(input.classification?.code),
    classificationName: text(input.classification?.name),
    customerType: text(input.type),
    segmentCode: text(input.segment?.code),
    segmentName: text(input.segment?.name),
  };
}
