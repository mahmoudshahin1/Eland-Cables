import React, { useEffect, useMemo, useState } from 'react';
import { CommercialInquiryLineDto } from '../../services/commercialInquiryApiService';
import { parseInquiryDrumSchedule } from '../../domain/inquiryDrumSchedule';
import { DrumSelectionWorkflowPanel } from '../common/DrumSelectionWorkflowPanel';
import type { DrumScheduleRow } from '../common/DrumCuttingScheduleTable';
import type { DrumMasterRecord } from '../../types';

export function resolveLineCableEngineering(line: CommercialInquiryLineDto): {
  cableDiameterMm: number;
  approxWeightKgKm: number;
} {
  const payload = line.configurationPayload || {};
  const diameter = Number(
    payload.outerDiameterMm ?? payload.cableDiameterMm ?? payload.diameter ?? payload.estimatedDiameterMm
  );
  const weight = Number(payload.approxWeightKgKm ?? payload.weightKgKm ?? payload.weight);
  return {
    cableDiameterMm: Number.isFinite(diameter) && diameter > 0 ? diameter : 0,
    approxWeightKgKm: Number.isFinite(weight) && weight > 0 ? weight : 0,
  };
}

export function resolveLineCableTolerancePercent(line: CommercialInquiryLineDto): string {
  const fromSchedule = parseInquiryDrumSchedule(line.drumSchedule)?.cableTolerancePercent;
  if (fromSchedule != null && Number.isFinite(fromSchedule) && fromSchedule >= 0) {
    return String(fromSchedule);
  }
  const fromLine = Number(line.cableTolerancePercent);
  if (Number.isFinite(fromLine) && fromLine >= 0) return String(fromLine);
  return '';
}

export function scheduleToRows(line: CommercialInquiryLineDto, vipToleranceControls = false): DrumScheduleRow[] {
  const schedule = parseInquiryDrumSchedule(line.drumSchedule);
  if (schedule?.rows.length) {
    return schedule.rows.map((row, index) => ({
      id: `pkg-${line.id}-${index + 1}`,
      drumCode: row.drumCode,
      noOfDrums: row.noOfDrums,
      cuttingLengthM: row.cuttingLengthM,
      drumTolerancePercent: row.drumTolerancePercent,
      ...(vipToleranceControls ? {
        drumTolerancePositivePercent: row.drumTolerancePositivePercent ?? row.drumTolerancePercent,
        drumToleranceNegativePercent: row.drumToleranceNegativePercent ?? row.drumTolerancePercent,
      } : {}),
    }));
  }
  const qty = Number(line.requestedQuantity);
  const cut = Number(line.cuttingLengthMeters);
  const hasCut = Number.isFinite(cut) && cut > 0;
  const hasDrum = Boolean(line.drumType?.trim());
  return [
    {
      id: `pkg-${line.id}-1`,
      drumCode: line.drumType || '',
      noOfDrums: Number.isFinite(qty) && qty > 0 ? qty : 1,
      cuttingLengthM: hasCut ? cut : '',
      drumTolerancePercent: vipToleranceControls ? '5' : hasCut || hasDrum ? '0' : '',
      ...(vipToleranceControls ? { drumTolerancePositivePercent: '5', drumToleranceNegativePercent: '5' } : {}),
    },
  ];
}

interface InquiryDrumPlanWorkflowProps {
  inquiryId: string;
  line: CommercialInquiryLineDto;
  drums: DrumMasterRecord[];
  jwtToken?: string | null;
  cableDiameterMm?: number;
  approxWeightKgKm?: number;
  onConfirmed?: () => void;
  vipToleranceControls?: boolean;
}

export const InquiryDrumPlanWorkflow: React.FC<InquiryDrumPlanWorkflowProps> = ({
  inquiryId,
  line,
  drums,
  jwtToken,
  cableDiameterMm = 0,
  approxWeightKgKm = 0,
  onConfirmed,
  vipToleranceControls = false,
}) => {
  const [rows, setRows] = useState<DrumScheduleRow[]>(() => scheduleToRows(line, vipToleranceControls));
  const [cableTolerancePercent, setCableTolerancePercent] = useState(() =>
    vipToleranceControls ? '0' : resolveLineCableTolerancePercent(line)
  );

  const scheduleKey = useMemo(
    () => `${line.id}:${JSON.stringify(line.drumSchedule || null)}:${line.drumType || ''}`,
    [line.id, line.drumSchedule, line.drumType]
  );

  useEffect(() => {
    setRows(scheduleToRows(line, vipToleranceControls));
    setCableTolerancePercent(vipToleranceControls ? '0' : resolveLineCableTolerancePercent(line));
  }, [scheduleKey, line, vipToleranceControls]);

  const storedSchedule = parseInquiryDrumSchedule(line.drumSchedule);

  return (
    <DrumSelectionWorkflowPanel
      cableCode={line.materialNumber || ''}
      cableDescription={line.cableDescription || ''}
      cableDiameterMm={cableDiameterMm}
      approxWeightKgKm={approxWeightKgKm}
      drums={drums}
      jwtToken={jwtToken}
      inquiryId={inquiryId}
      lineId={line.id}
      vipToleranceControls={vipToleranceControls}
      initialLifecycleStatus={storedSchedule?.lifecycleStatus || null}
      rows={rows}
      cableTolerancePercent={cableTolerancePercent}
      onCableToleranceChange={setCableTolerancePercent}
      onRowsChange={setRows}
      onPlanValidityChange={() => undefined}
      onDrumPlanConfirmed={onConfirmed}
      error={null}
    />
  );
};
