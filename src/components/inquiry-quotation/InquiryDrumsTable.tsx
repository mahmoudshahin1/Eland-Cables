import React from 'react';
import { Ruler } from 'lucide-react';
import { DrumMasterRecord } from '../../types';
import { CommercialInquiryLineDto } from '../../services/commercialInquiryApiService';
import {
  buildInquiryDrumLineSummary,
  formatInquiryDrumLineSummaryDrums,
} from '../../domain/inquiryDrumLineSummary';
import { parseInquiryDrumSchedule } from '../../domain/inquiryDrumSchedule';

interface InquiryDrumsTableProps {
  lines: CommercialInquiryLineDto[];
  drumMaster: DrumMasterRecord[];
  isEditable?: boolean;
  onConfigureDrums?: (line: CommercialInquiryLineDto) => void;
}

export function InquiryDrumsTable({
  lines,
  drumMaster,
  isEditable = false,
  onConfigureDrums,
}: InquiryDrumsTableProps) {
  if (lines.length === 0) {
    return (
      <p className="text-slate-400 py-6 text-center text-xs">Add cable lines to configure drum planning.</p>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[760px]">
          <thead className="bg-brand-800 text-white font-bold border-b border-brand-900 uppercase text-[11px] tracking-wider">
            <tr>
              <th className="p-3">Cable</th>
              <th className="p-3 text-center w-36 whitespace-nowrap">Number of Drums</th>
              <th className="p-3">Drum Code & Description</th>
              <th className="p-3 text-right w-36 whitespace-nowrap">Total Length (m)</th>
              {isEditable && <th className="p-3 text-right w-32">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {lines.map((line) => {
              const summary = buildInquiryDrumLineSummary(line, drumMaster);
              const hasConfig =
                Boolean(line.drumType?.trim()) ||
                Boolean(parseInquiryDrumSchedule(line.drumSchedule)?.rows?.length);
              const drumsText = formatInquiryDrumLineSummaryDrums(summary.drumEntries);

              return (
                <tr key={line.id} className="transition-colors hover:bg-blue-50/40">
                  <td className="p-3">
                    <p className="font-medium text-slate-900 leading-snug">{summary.cableDescription}</p>
                    {!hasConfig && (
                      <p className="text-amber-700 font-semibold text-[10px] mt-0.5">
                        DRUM_CONFIGURATION_REQUIRED — not selected
                      </p>
                    )}
                  </td>
                  <td className="p-3 text-center font-mono font-bold text-slate-800">
                    {summary.drumCount > 0 ? summary.drumCount : '—'}
                  </td>
                  <td className="p-3 text-slate-700 leading-snug">
                    {drumsText === 'Not selected' ? (
                      <span className="text-slate-400 italic">{drumsText}</span>
                    ) : (
                      drumsText
                    )}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    {summary.totalLengthM.toLocaleString()}
                  </td>
                  {isEditable && (
                    <td className="p-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onConfigureDrums?.(line)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold border border-blue-200 transition-colors text-[11px]"
                      >
                        <Ruler className="h-3.5 w-3.5" />
                        Configure Drums
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
