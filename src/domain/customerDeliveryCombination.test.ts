import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ELAND_APPROVED_DELIVERY_COMBINATIONS,
  matchCustomerDeliveryCombination,
  planElandDeliveryMasterLoad,
  uniqueDestinationPortsFromCombinations,
  uniqueIncotermsFromCombinations,
} from './customerDeliveryCombination';
import { matchActiveMasterByCodeOrName } from './inquiryContainerStudyPresentation';

const views = ELAND_APPROVED_DELIVERY_COMBINATIONS.map((row) => ({
  countryCode: row.countryCode,
  countryLabel: row.countryLabel,
  incotermCode: row.incotermCode,
  destinationPortCode: row.destinationPortCode,
  destinationPortName: row.destinationPortName,
}));

describe('Eland approved delivery combinations', () => {
  it('contains exactly the four Energya-supplied combinations', () => {
    assert.equal(ELAND_APPROVED_DELIVERY_COMBINATIONS.length, 4);
    assert.deepEqual(
      ELAND_APPROVED_DELIVERY_COMBINATIONS.map((row) => [
        row.countryLabel,
        row.incotermCode,
        row.destinationPortName,
      ]),
      [
        ['UK', 'DAP', 'DONCASTER'],
        ['NETHERLANDS', 'CIF', 'ROTTERDAM'],
        ['Portugal', 'CIF', 'Sines'],
        ['Portugal', 'CIF', 'Lisbon, Portugal'],
      ]
    );
  });

  it('keeps Sines and Lisbon, Portugal as distinct destinations', () => {
    const portugal = ELAND_APPROVED_DELIVERY_COMBINATIONS.filter((row) => row.countryLabel === 'Portugal');
    assert.equal(portugal.length, 2);
    assert.equal(portugal[0]?.destinationPortName, 'Sines');
    assert.equal(portugal[1]?.destinationPortName, 'Lisbon, Portugal');
    assert.notEqual(portugal[0]?.destinationPortCode, portugal[1]?.destinationPortCode);
  });

  it('does not include Alexandria, FOB, or extra customers/incoterms/ports in preference data', () => {
    const dumped = JSON.stringify(ELAND_APPROVED_DELIVERY_COMBINATIONS);
    assert.equal(/alexandria/i.test(dumped), false);
    assert.equal(
      ELAND_APPROVED_DELIVERY_COMBINATIONS.some((row) => row.incotermCode === 'FOB'),
      false
    );
    assert.deepEqual([...new Set(ELAND_APPROVED_DELIVERY_COMBINATIONS.map((row) => row.customerCode))], ['C-ELAND']);
    assert.deepEqual(uniqueIncotermsFromCombinations(views).map((row) => row.code).sort(), ['CIF', 'DAP']);
    assert.equal(uniqueDestinationPortsFromCombinations(views).length, 4);
  });

  it('matches each supplied combination and blocks arbitrary or mixed pairs', () => {
    assert.equal(matchCustomerDeliveryCombination({ requestedDestination: 'DONCASTER', requestedIncoterm: 'DAP', combinations: views })?.destinationPortCode, 'DONCASTER');
    assert.equal(matchCustomerDeliveryCombination({ requestedDestination: 'ROTTERDAM', requestedIncoterm: 'CIF', combinations: views })?.destinationPortCode, 'ROTTERDAM');
    assert.equal(matchCustomerDeliveryCombination({ requestedDestination: 'Sines', requestedIncoterm: 'CIF', combinations: views })?.destinationPortCode, 'SINES');
    assert.equal(
      matchCustomerDeliveryCombination({
        requestedDestination: 'Lisbon, Portugal',
        requestedIncoterm: 'CIF',
        combinations: views,
      })?.destinationPortCode,
      'LISBON'
    );
    assert.equal(matchCustomerDeliveryCombination({ requestedDestination: 'Alexandria', requestedIncoterm: 'DAP', combinations: views }), null);
    assert.equal(matchCustomerDeliveryCombination({ requestedDestination: 'DONCASTER', requestedIncoterm: 'CIF', combinations: views }), null);
    assert.equal(matchCustomerDeliveryCombination({ requestedDestination: 'DONCASTER', requestedIncoterm: 'FOB', combinations: views }), null);
    assert.equal(matchCustomerDeliveryCombination({ requestedDestination: 'ROTTERDAM', requestedIncoterm: 'DAP', combinations: views }), null);
  });

  it('plans create vs reuse without inventing extra rows', () => {
    const empty = planElandDeliveryMasterLoad({
      customerCode: 'C-ELAND',
      ports: [],
      incoterms: [],
      combinations: [],
    });
    assert.equal(empty.customer, 'reuse');
    assert.deepEqual(empty.incoterms.map((row) => `${row.action}:${row.code}`), ['create:DAP', 'create:CIF']);
    assert.deepEqual(
      empty.ports.map((row) => `${row.action}:${row.code}`),
      ['create:DONCASTER', 'create:ROTTERDAM', 'create:SINES', 'create:LISBON']
    );
    assert.equal(empty.combinations.every((row) => row.action === 'create'), true);
    assert.equal(empty.combinations.length, 4);

    const reused = planElandDeliveryMasterLoad({
      customerCode: 'C-ELAND',
      ports: empty.ports.map((row) => ({ code: row.code, name: row.name })),
      incoterms: empty.incoterms.map((row) => ({ code: row.code })),
      combinations: empty.combinations.map((row) => ({
        customerCode: 'C-ELAND',
        countryCode: row.countryCode,
        incotermCode: row.incotermCode,
        destinationPortCode: row.destinationPortCode,
      })),
    });
    assert.equal(reused.incoterms.every((row) => row.action === 'reuse'), true);
    assert.equal(reused.ports.every((row) => row.action === 'reuse'), true);
    assert.equal(reused.combinations.every((row) => row.action === 'reuse'), true);
  });

  it('does not promote Alexandria into an approved DestinationPort', () => {
    assert.equal(
      matchActiveMasterByCodeOrName('Alexandria', uniqueDestinationPortsFromCombinations(views).map((row) => ({ ...row, active: true }))),
      null
    );
  });
});
