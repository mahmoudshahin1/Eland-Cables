import { get } from '../api/httpClient';
import type {
  CustomerContainerStudyVisibility,
  CustomerFinancialOfferProjection,
} from '../domain/financialOfferCustomerProjection';

export async function fetchCustomerFinancialOffer(
  token: string,
  inquiryId: string
): Promise<CustomerFinancialOfferProjection> {
  return get<CustomerFinancialOfferProjection>(
    `/api/v2/inquiries/${encodeURIComponent(inquiryId)}/customer-financial-offer`,
    { token }
  );
}

export async function fetchCustomerFinancialOfferById(
  token: string,
  offerId: string
): Promise<CustomerFinancialOfferProjection> {
  return get<CustomerFinancialOfferProjection>(
    `/api/v2/customer-financial-offers/${encodeURIComponent(offerId)}`,
    { token }
  );
}

export async function fetchCustomerContainerStudyVisibility(
  token: string,
  inquiryId: string
): Promise<CustomerContainerStudyVisibility> {
  return get<CustomerContainerStudyVisibility>(
    `/api/v2/inquiries/${encodeURIComponent(inquiryId)}/customer-container-study`,
    { token }
  );
}
