import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CommercialInquiryDto, CommercialInquiryLineDto } from '../../services/commercialInquiryApiService';
import {
  CLEAR_SELECTED_CABLE_LABEL,
  InquiryLineEditorModal,
  OPEN_CABLE_SEARCH_LABEL,
  OPEN_CUTTING_DRUM_SELECTION_LABEL,
  REPLACE_CABLE_LABEL,
} from './InquiryLineEditorModal';

const line: CommercialInquiryLineDto = {
  id: 'line-1',
  lineNumber: 1,
  materialNumber: '10009487',
  cableDescription: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 RMC IEC 60502-1',
  requestedQuantity: 1,
  requestedLengthMeters: 1000,
};

const inquiry = {
  id: 'inq-1',
  inquiryNumber: 'INQ26-00001',
  currency: 'USD',
  status: 'DRAFT',
  lines: [line],
} as CommercialInquiryDto;

describe('InquiryLineEditorModal cable controls', () => {
  it('exposes clear, replace, and reopen cable search for a selected cable', () => {
    const html = renderToStaticMarkup(
      React.createElement(InquiryLineEditorModal, {
        line,
        inquiry,
        form: {
          requestedQuantity: '1',
          requestedLengthMeters: '1000',
          cuttingLengthMeters: '1000',
          drumType: '',
          cableDescription: line.cableDescription,
        },
        isEditable: true,
        isV2Inquiry: true,
        cuttingError: null,
        onChange: () => undefined,
        onClose: () => undefined,
        onSave: () => undefined,
        onOpenSchedule: () => undefined,
        onOpenCableSearch: () => undefined,
        onClearCable: () => undefined,
      })
    );
    assert.match(html, new RegExp(CLEAR_SELECTED_CABLE_LABEL));
    assert.match(html, new RegExp(REPLACE_CABLE_LABEL));
    assert.match(html, new RegExp(OPEN_CABLE_SEARCH_LABEL));
    assert.match(html, /Cable Master is not deleted/);
    assert.match(html, /10009487/);
  });

  it('does not offer clear when no cable is selected', () => {
    const html = renderToStaticMarkup(
      React.createElement(InquiryLineEditorModal, {
        line: { ...line, materialNumber: null, cableDescription: 'Cable line' },
        inquiry,
        form: {
          requestedQuantity: '1',
          requestedLengthMeters: '1000',
          cuttingLengthMeters: '',
          drumType: '',
          cableDescription: 'Cable line',
        },
        isEditable: true,
        isV2Inquiry: true,
        cuttingError: null,
        onChange: () => undefined,
        onClose: () => undefined,
        onSave: () => undefined,
        onOpenSchedule: () => undefined,
        onOpenCableSearch: () => undefined,
        onClearCable: () => undefined,
      })
    );
    assert.doesNotMatch(html, new RegExp(CLEAR_SELECTED_CABLE_LABEL));
    assert.match(html, new RegExp(OPEN_CABLE_SEARCH_LABEL));
  });

  it('Cutting step opens the shared Cutting Length and Drum Selection editor', () => {
    const html = renderToStaticMarkup(
      React.createElement(InquiryLineEditorModal, {
        line,
        inquiry,
        form: {
          requestedQuantity: '1',
          requestedLengthMeters: '1000',
          cuttingLengthMeters: '1000',
          drumType: 'EWD630-0',
          cableDescription: line.cableDescription,
        },
        isEditable: true,
        isV2Inquiry: true,
        cuttingError: null,
        onChange: () => undefined,
        onClose: () => undefined,
        onSave: () => undefined,
        onOpenSchedule: () => undefined,
        onOpenCableSearch: () => undefined,
        initialStep: 'cutting',
      })
    );
    assert.match(html, new RegExp(OPEN_CUTTING_DRUM_SELECTION_LABEL));
    assert.doesNotMatch(html, /Configure Multi-Drum Schedule/);
    assert.doesNotMatch(html, /Cutting Schedule & Multi-Drum Configuration/);
  });
});
