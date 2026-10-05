import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyHomeFilters,
  computeCommercialTotal,
  isElandCustomer,
  mapTransactionKind,
  normalizeInquiryStatus,
  sortHomeRows,
  toHomeRow,
} from './inquiryQuotationHomeService';
import { ErpRequestHeader, UserAccount } from '../types';

function sample(over: Partial<ErpRequestHeader> = {}): ErpRequestHeader {
  return {
    id: 'req-1',
    transactionType: 'Customer Request',
    trxDate: '22/06/2026',
    refNo: '26/002594',
    organization: 'Energya',
    customerName: 'Madkour',
    contactPerson: 'Ahmed',
    salesAgent: 'Osama Hassanien',
    projectName: 'ABO QIR',
    currency: 'USD',
    exchangeRate: 1,
    rawMaterialCurrency: 'USD',
    rawMaterialExchangeRate: 1,
    copperPriceRate: 1,
    aluminiumPriceRate: 1,
    aluminiumAlloyPriceRate: 1,
    deliveryDate: '30/08/2026',
    versionNo: 1,
    status: 'Opened',
    quotationOwner: 'Salah Mohamed',
    quotationStatus: 'Draft',
    remarks: '',
    technicalComments: '',
    salesComments: '',
    hasAttachments: false,
    attachments: [],
    items: [
      {
        serial: 1,
        itemCode: 'ICO117X101C0002',
        cableCode: '10009487',
        customerCode: 'N2XH',
        itemDescription: 'Cu 1X16',
        uom: 'KM',
        qty: 2,
        unitPriceUsd: 2450,
      },
    ],
    statusLogs: [],
    comments: [],
    ...over,
  };
}

describe('inquiry quotation home mapper', () => {
  it('maps Customer Request to Inquiry', () => {
    assert.equal(mapTransactionKind(sample()), 'Inquiry');
  });

  it('maps Sales Quotation to Quotation', () => {
    assert.equal(mapTransactionKind(sample({ transactionType: 'Sales Quotation' })), 'Quotation');
  });

  it('computes commercial total from qty * unit price', () => {
    assert.equal(computeCommercialTotal(sample()), 4900);
  });

  it('filters by customer and status', () => {
    const rows = [toHomeRow(sample(), 1), toHomeRow(sample({ id: '2', customerName: 'DEWA', quotationStatus: 'Approved' }), 2)];
    const filtered = applyHomeFilters(rows, {
      search: '',
      status: 'Draft',
      customer: 'Mad',
      currency: 'ALL',
      createdBy: '',
      version: '',
      dateFrom: '',
      dateTo: '',
      transactionType: 'ALL',
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].customerName, 'Madkour');
  });

  it('sorts by total descending', () => {
    const a = toHomeRow(sample({ id: 'a', items: [{ serial: 1, itemCode: 'x', itemDescription: '', uom: 'KM', qty: 1, unitPriceUsd: 10 }] }), 1);
    const b = toHomeRow(sample({ id: 'b', items: [{ serial: 1, itemCode: 'y', itemDescription: '', uom: 'KM', qty: 1, unitPriceUsd: 99 }] }), 2);
    const sorted = sortHomeRows([a, b], 'totalValue', 'desc');
    assert.equal(sorted[0].id, 'b');
  });

  it('maps ELAND statuses to Open, Submitted, and Canceled only', () => {
    const elandUser: UserAccount = {
      id: 'c-eland',
      userType: 'customer',
      userName: 'eland.cables',
      fullName: 'Eng. David Smith',
      email: 'david.smith@elandcables.com',
      department: 'Commercial Procurement',
      role: 'Procurement Director',
      companyName: 'ELAND Cables',
      status: 'Active',
      lastLogin: 'Today',
      permissions: { customerPortalAccess: true } as UserAccount['permissions'],
    };

    assert.equal(normalizeInquiryStatus('Opened', undefined, true), 'Open');
    assert.equal(normalizeInquiryStatus('Opened', 'Sent To Technical', true), 'Submitted');
    assert.equal(normalizeInquiryStatus('Canceled', undefined, true), 'Canceled');
    assert.equal(toHomeRow(sample({ quotationStatus: 'Sent To Technical' }), 1, elandUser).status, 'Submitted');
    assert.equal(isElandCustomer(elandUser), true);
  });

  it('keeps Sent To Technical for non-ELAND customers', () => {
    assert.equal(normalizeInquiryStatus('Opened', 'Sent To Technical', false), 'Sent To Technical');
  });
});
