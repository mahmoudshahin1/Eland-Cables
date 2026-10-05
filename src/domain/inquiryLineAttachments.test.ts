import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LINE_ATTACHMENT_KIND_TECHNICAL_OFFER,
  canEditLineTechnicalAttachments,
  lineHasRequiredTechnicalOffer,
} from './inquiryLineAttachments';

describe('inquiryLineAttachments', () => {
  it('detects technical offer on line attachments', () => {
    assert.equal(lineHasRequiredTechnicalOffer([]), false);
    assert.equal(
      lineHasRequiredTechnicalOffer([
        {
          id: '1',
          kind: 'OTHER',
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
          byteSize: 10,
          source: 'MANUAL_UPLOAD',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
      false
    );
    assert.equal(
      lineHasRequiredTechnicalOffer([
        {
          id: '1',
          kind: LINE_ATTACHMENT_KIND_TECHNICAL_OFFER,
          fileName: 'offer.pdf',
          mimeType: 'application/pdf',
          byteSize: 10,
          source: 'CABLE_MASTER_DEFAULT',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
      true
    );
  });

  it('allows internal technical office users to edit line attachments', () => {
    assert.equal(canEditLineTechnicalAttachments({ userType: 'customer' }), false);
    assert.equal(canEditLineTechnicalAttachments({ userType: 'internal' }), true);
    assert.equal(
      canEditLineTechnicalAttachments({
        userType: 'internal',
        permissions: { technicalOffice: false },
      }),
      false
    );
  });
});
