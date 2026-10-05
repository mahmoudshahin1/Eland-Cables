import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INQUIRY_HEADER_FIELDS,
  INQUIRY_LINE_COLUMNS,
  INQUIRY_LIST_COLUMNS,
  applyPlatformFieldOverrides,
  resolveGridPreference,
} from './inquiryFieldManifest';

describe('resolveGridPreference', () => {
  it('keeps hidden columns hidden instead of merging defaults back in', () => {
    const saved = {
      visibleFieldIds: INQUIRY_LIST_COLUMNS.filter((c) => c.id !== 'salesAgent').map((c) => c.id),
    };
    const resolved = resolveGridPreference(saved, INQUIRY_LIST_COLUMNS);
    assert.equal(resolved.visibleFieldIds.includes('salesAgent'), false);
    assert.equal(resolved.visibleFieldIds.includes('inquiryNumber'), true);
  });

  it('keeps hidden inquiry line columns hidden across reloads', () => {
    const saved = {
      visibleFieldIds: INQUIRY_LINE_COLUMNS.filter((c) => c.id !== 'drumType' && c.id !== 'voltage').map(
        (c) => c.id
      ),
    };
    const resolved = resolveGridPreference(saved, INQUIRY_LINE_COLUMNS);
    assert.equal(resolved.visibleFieldIds.includes('drumType'), false);
    assert.equal(resolved.visibleFieldIds.includes('voltage'), false);
    assert.equal(resolved.visibleFieldIds.includes('value'), true);
  });

  it('adds newly introduced default-visible columns that were not in the saved schema', () => {
    const knownWithoutNew = INQUIRY_HEADER_FIELDS.filter((f) => f.id !== 'quotationOwner').map((f) => f.id);
    const saved = {
      visibleFieldIds: knownWithoutNew.filter((id) => id !== 'salesComments'),
      knownFieldIds: knownWithoutNew,
    };
    const resolved = resolveGridPreference(saved, INQUIRY_HEADER_FIELDS);
    assert.equal(resolved.visibleFieldIds.includes('quotationOwner'), true);
    assert.equal(resolved.visibleFieldIds.includes('salesComments'), false);
  });

  it('returns defaults when nothing is saved', () => {
    const resolved = resolveGridPreference(null, INQUIRY_LIST_COLUMNS);
    const defaultIds = INQUIRY_LIST_COLUMNS.filter((f) => f.defaultVisible).map((f) => f.id);
    assert.deepEqual(resolved.visibleFieldIds, defaultIds);
  });
});

describe('applyPlatformFieldOverrides', () => {
  it('hides a field when PlatformFieldDefinition sets visible false', () => {
    const fields = applyPlatformFieldOverrides(INQUIRY_HEADER_FIELDS, [
      { fieldCode: 'salesAgent', visible: false },
    ]);
    const sales = fields.find((f) => f.id === 'salesAgent');
    assert.equal(sales?.defaultVisible, false);
  });

  it('does not expose protected cost columns to customers via overlay', () => {
    const fields = applyPlatformFieldOverrides(INQUIRY_LIST_COLUMNS, [
      { fieldCode: 'estimatedValue', customerVisible: true, visible: true },
    ]);
    const value = fields.find((f) => f.id === 'estimatedValue');
    assert.equal(value?.customerVisible, false);
    assert.equal(value?.systemProtected, true);
  });
});
