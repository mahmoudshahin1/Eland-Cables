import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  APPROVED_CHAT_REPLIES,
  ENGINEER_FALLBACK,
  actorFirstName,
  caseTypeLabel,
  engineerStatusLabel,
  isCustomerServiceCaseType,
  replySupportChat,
  supportChatGreeting,
} from './supportChat';

describe('Support chat scripted replies', () => {
  it('greets the signed-in first name without inventing a product spec', () => {
    const greeting = supportChatGreeting('David');
    assert.match(greeting, /Hello David!/);
    assert.match(supportChatGreeting(actorFirstName('Eng. David Smith')), /Hello David!/);
    assert.match(greeting, /Energya Assistant/);
    assert.equal(greeting.includes('mm²'), false);
    assert.equal(greeting.includes('0.6/1'), false);
  });

  it('answers approved chips and never invents a cable construction', () => {
    assert.equal(replySupportChat('', 'cable_selection').reply, APPROVED_CHAT_REPLIES.cable_selection);
    assert.equal(replySupportChat('', 'technical_standards').action, 'open_engineer');
    assert.equal(replySupportChat('track my inquiry please').action, 'open_inquiries');
    const fallback = replySupportChat('What is the exact ampacity of a 4x240 cable?');
    assert.equal(fallback.reply, ENGINEER_FALLBACK);
    assert.equal(fallback.action, 'open_engineer');
    assert.equal(fallback.reply.includes('240'), false);
  });

  it('labels case types and engineer status for the customer UI', () => {
    assert.equal(isCustomerServiceCaseType('COMPLAINT'), true);
    assert.equal(caseTypeLabel('INFORMATION_REQUEST'), 'Information Request');
    assert.equal(engineerStatusLabel('WAITING'), 'Waiting');
    assert.equal(engineerStatusLabel('AVAILABLE'), 'Available');
  });
});
