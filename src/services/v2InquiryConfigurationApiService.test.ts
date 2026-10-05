import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { persistV2CuttingLengthPlan, previewV2CuttingLengthPlan } from './v2CuttingLengthApiService';
import { createV2Inquiry } from './v2InquiryConfigurationApiService';
import { httpClient } from '../api/httpClient';

describe('V2 inquiry and cutting clients use httpClient', () => {
  const originalPost = httpClient.post;

  afterEach(() => {
    httpClient.post = originalPost;
  });

  it('createV2Inquiry posts projectName through httpClient', async () => {
    httpClient.post = (async (url, body) => {
      assert.equal(url, '/api/v2/inquiries');
      assert.equal((body as { projectName: string }).projectName, 'CEO-DEMO-X');
      return { inquiry: { id: '1', projectName: 'CEO-DEMO-X' } };
    }) as typeof httpClient.post;
    const inquiry = await createV2Inquiry('tok', { projectName: 'CEO-DEMO-X' });
    assert.equal(inquiry.projectName, 'CEO-DEMO-X');
  });

  it('preview and persist cutting plans use cutting-plans API paths', async () => {
    const urls: string[] = [];
    httpClient.post = (async (url) => {
      urls.push(String(url));
      if (String(url).endsWith('/preview')) {
        return { preview: true, persisted: false, validation: { validationStatus: 'VALID', validationMessages: [] } };
      }
      return { inquiry: {}, line: {}, plan: { planId: 'p1' }, handoff: {} };
    }) as typeof httpClient.post;
    await previewV2CuttingLengthPlan('tok', 'inq', 'line', { nominalLengthM: 500 });
    await persistV2CuttingLengthPlan('tok', 'inq', 'line', { nominalLengthM: 500 });
    assert.equal(urls[0], '/api/v2/inquiries/inq/lines/line/cutting-plans/preview');
    assert.equal(urls[1], '/api/v2/inquiries/inq/lines/line/cutting-plans');
  });
});
