import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countInquiryWorkspaceDocuments } from './inquiryDocuments';

describe('countInquiryWorkspaceDocuments', () => {
  it('counts uploads plus a generated offer and TDS when a quotation exists', () => {
    const count = countInquiryWorkspaceDocuments({
      attachments: [{ id: 'a' }, { id: 'b' }],
      lines: [{ attachments: [{ kind: 'DRAWING' }] }],
      quotations: [{ id: 'q' }],
      commercialProductsTotal: null,
    });
    assert.equal(count, 5);
  });

  it('does not add a second TDS when a technical offer file is already uploaded', () => {
    const count = countInquiryWorkspaceDocuments({
      attachments: [],
      lines: [{ attachments: [{ kind: 'TECHNICAL_OFFER' }] }],
      quotations: [{ id: 'q' }],
    });
    assert.equal(count, 2);
  });

  it('counts only uploads when nothing has been priced or quoted', () => {
    const count = countInquiryWorkspaceDocuments({
      attachments: [{ id: 'a' }],
      lines: [],
      quotations: [],
      commercialProductsTotal: null,
    });
    assert.equal(count, 1);
  });
});
