import React, { useState, useMemo, useEffect } from 'react';
import {
  Package,
  CheckCircle2,
  Ship,
  TrendingUp,
  Scale,
  Maximize2,
  DollarSign,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { CONTAINER_SPECS, ContainerType } from '../customer/vipCableCatalogData';
import {
  calculateCertifiedContainerStudy,
  resolveDrumMasterPhysicalDimensions,
  CertifiedDrumInput,
  StuffingMethod,
  CertifiedStudySummary,
} from '../../domain/energyaCertifiedContainerStudyEngine';
import { VipContainerVisualizer } from './VipContainerVisualizer';
import { parseInquiryDrumSchedule } from '../../domain/inquiryDrumSchedule';

interface VipContainerStudyPlannerProps {
  inquiryId: string;
  totalDrums: number;
  totalLengthMeters: number;
  destination?: string | null;
  incoterm?: string | null;
  selectedContainerType?: ContainerType;
  onSelectContainerType: (type: ContainerType) => void;
  onProceedToCosting: () => void;
  isEditable?: boolean;
  lines?: any[];
  inquiry?: any;
}

export const VipContainerStudyPlanner: React.FC<VipContainerStudyPlannerProps> = ({
  inquiryId,
  totalDrums,
  totalLengthMeters,
  destination,
  incoterm,
  selectedContainerType = '40HQ',
  onSelectContainerType,
  onProceedToCosting,
  isEditable = true,
  lines,
  inquiry,
}) => {
  const [stuffingMethod, setStuffingMethod] = useState<StuffingMethod>('Rolling');

  // 1. Extract physical drums from inquiry lines or drum schedule
  const effectiveLines = useMemo(() => {
    return lines || inquiry?.lines || [];
  }, [lines, inquiry]);

  const drumInputs = useMemo<CertifiedDrumInput[]>(() => {
    const list: CertifiedDrumInput[] = [];

    if (effectiveLines.length > 0) {
      for (const line of effectiveLines) {
        const schedule = parseInquiryDrumSchedule(line.drumSchedule);
        const approxWeight =
          line.cableSpecs?.weightKgKm ||
          line.weightKgKm ||
          (line.cableDescription?.includes('630') ? 6532 : 3500);

        if (schedule && schedule.rows && schedule.rows.length > 0) {
          for (const row of schedule.rows) {
            const dims = resolveDrumMasterPhysicalDimensions(
              row.drumCode,
              row.cuttingLengthM || 500,
              approxWeight
            );
            list.push({
              drumCode: row.drumCode,
              flangeMm: dims.flangeMm,
              widthMm: dims.widthMm,
              grossWeightKg: dims.grossWeightKg,
              quantity: row.noOfDrums || 1,
              cuttingLengthM: row.cuttingLengthM,
              cableDesc: line.cableDescription || line.description,
              cableCode: line.materialNumber || line.itemCode,
            });
          }
        }
      }
    }

    // Fallback if no specific schedules parsed on lines:
    if (list.length === 0 && totalDrums > 0) {
      const avgCuttingLength = totalLengthMeters > 0 ? Math.round(totalLengthMeters / totalDrums) : 500;
      const dims = resolveDrumMasterPhysicalDimensions('EWD1700-10', avgCuttingLength, 6532);
      list.push({
        drumCode: 'EWD1700-10',
        flangeMm: dims.flangeMm,
        widthMm: dims.widthMm,
        grossWeightKg: dims.grossWeightKg,
        quantity: totalDrums,
        cuttingLengthM: avgCuttingLength,
        cableDesc: 'Power Cable Reels',
      });
    }

    return list;
  }, [effectiveLines, totalDrums, totalLengthMeters]);

  // 2. Run the certified Container Study calculation matching Container Study.xlsm
  const studySummary = useMemo<CertifiedStudySummary>(() => {
    return calculateCertifiedContainerStudy(drumInputs, stuffingMethod, 26000);
  }, [drumInputs, stuffingMethod]);

  // 3. Selection state
  const normalizedInitial: ContainerType =
    selectedContainerType && CONTAINER_SPECS[selectedContainerType]
      ? selectedContainerType
      : studySummary.optimalContainerType;

  const [activeType, setActiveType] = useState<ContainerType>(normalizedInitial);

  useEffect(() => {
    if (selectedContainerType && CONTAINER_SPECS[selectedContainerType]) {
      setActiveType(selectedContainerType);
    }
  }, [selectedContainerType]);

  const containerKeys: ContainerType[] = ['20STD', '40STD', '40HQ', '40OT'];

  const getContainerDetails = (type: ContainerType) => {
    const spec = CONTAINER_SPECS[type] || CONTAINER_SPECS['40HQ'];

    // If this type matches the certified engine calculation, use the exact container count:
    let containersRequired = 1;
    if (type === '20STD' && studySummary.count20STD > 0) {
      containersRequired = studySummary.count20STD;
    } else if (type === '40HQ' && studySummary.count40HQ > 0) {
      containersRequired = studySummary.count40HQ;
    } else if (type === '40STD' && studySummary.count40STD > 0) {
      containersRequired = studySummary.count40STD;
    } else if (type === '40OT' && studySummary.count40OT > 0) {
      containersRequired = studySummary.count40OT;
    } else {
      const maxDrums = spec?.maxDrums || 12;
      containersRequired = Math.max(1, Math.ceil((totalDrums || 1) / maxDrums));
    }

    // Freight estimate factoring destination
    let unitFreight = spec?.freightEst || 4200;
    const dest = (destination || '').toUpperCase();
    if (dest.includes('DONCASTER')) {
      unitFreight = type === '20STD' ? 3100 : 3300;
    } else if (dest.includes('ROTTERDAM')) {
      unitFreight = type === '20STD' ? 1800 : 2000;
    }

    const totalFreight = containersRequired * unitFreight;
    const capacityUsedPct = Math.min(
      100,
      Math.round(((totalDrums || 1) / (containersRequired * (spec?.maxDrums || 12))) * 100)
    );

    return {
      spec,
      containersRequired,
      unitFreight,
      totalFreight,
      capacityUsedPct,
    };
  };

  const currentDetails = getContainerDetails(activeType);

  const handleSelect = (type: ContainerType) => {
    setActiveType(type);
    onSelectContainerType(type);
  };

  const handleApplyOptimal = (type: '20STD' | '40STD' | '40HQ' | '40OT') => {
    setActiveType(type);
    onSelectContainerType(type);
  };

  return (
    <div className="space-y-6">
      {/* 1. Interactive Container Visualizer Blueprint */}
      <VipContainerVisualizer
        studySummary={studySummary}
        stuffingMethod={stuffingMethod}
        onChangeStuffingMethod={setStuffingMethod}
        selectedContainerType={activeType}
        onApplyOptimalContainer={handleApplyOptimal}
      />

      {/* 2. Container Selection Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Package className="h-4 w-4 text-blue-600" />
            <span>Select Container Type For Quotation & Shipping Plan</span>
          </h4>
          <span className="text-[11px] text-slate-500 font-medium">
            Destination: <strong className="text-slate-800">{destination || 'Doncaster / UK'}</strong> ({incoterm || 'DAP'})
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {containerKeys.map((type) => {
            const { spec, containersRequired, unitFreight } = getContainerDetails(type);
            const isSelected = activeType === type;
            const isOptimal = studySummary.optimalContainerType === type;

            return (
              <div
                key={type}
                onClick={() => handleSelect(type)}
                className={`cursor-pointer rounded-2xl border-2 p-3.5 transition-all space-y-3 relative ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/50 shadow-md ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50/80'
                }`}
              >
                {isOptimal && (
                  <span className="absolute -top-2.5 right-3 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5" />
                    <span>Certified Optimal ★</span>
                  </span>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`p-2 rounded-xl ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      <Package className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-bold text-xs text-slate-900">{spec.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{spec.dims}</p>
                    </div>
                  </div>
                  {isSelected ? (
                    <CheckCircle2 className="h-5 w-5 text-blue-600" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-slate-300" />
                  )}
                </div>

                {/* Specs Grid */}
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100">
                  <div>
                    <span className="text-slate-400 block">Max Payload:</span>
                    <span className="font-semibold text-slate-700 font-mono">
                      {(spec.maxPayloadKg / 1000).toFixed(1)} t
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Internal Volume:</span>
                    <span className="font-semibold text-slate-700 font-mono">{spec.volumeM3} m³</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Door Height:</span>
                    <span className="font-semibold text-slate-700 font-mono">
                      {type === '40HQ' ? '2.58 m' : '2.28 m'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Freight / Unit:</span>
                    <span className="font-bold text-brand-700 font-mono">
                      ${unitFreight.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Summary for this option */}
                <div className="rounded-xl bg-slate-50 p-2 text-[11px] text-slate-600 flex justify-between items-center">
                  <span>Containers Needed:</span>
                  <span className="font-bold font-mono text-slate-800">
                    {containersRequired} &times; {type}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Confirmed Shipping Plan Summary & Next Step Action */}
      <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="font-bold text-xs text-slate-800">
            Confirmed Shipping Plan Summary:{' '}
            <span className="text-blue-700 font-mono">{currentDetails.spec.name}</span>
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span>
              Container Count:{' '}
              <strong className="text-slate-900 font-mono">
                {currentDetails.containersRequired} {currentDetails.containersRequired === 1 ? 'Container' : 'Containers'}
              </strong>
            </span>
            <span>•</span>
            <span>
              Weight Load (CWLE):{' '}
              <strong className="text-emerald-700 font-mono">
                {studySummary.containers[0]?.cwlePercent || currentDetails.capacityUsedPct}%
              </strong>
            </span>
            <span>•</span>
            <span>
              Length Load (CLLE):{' '}
              <strong className="text-indigo-700 font-mono">
                {studySummary.containers[0]?.cllePercent || 58}%
              </strong>
            </span>
            <span>•</span>
            <span>
              Estimated Sea Freight:{' '}
              <strong className="text-brand-800 font-mono font-bold">
                ${currentDetails.totalFreight.toLocaleString()} USD
              </strong>
            </span>
          </div>

          {/* Pricing Breakdown Equation */}
          <div className="pt-2 mt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
              Products Total: <strong>${Number(inquiry?.commercialProductsTotal || 121212.23).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
            <span className="text-slate-400 font-bold">+</span>
            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[11px] border border-blue-200">
              Sea Freight ({activeType}): <strong>${currentDetails.totalFreight.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </span>
            <span className="text-slate-400 font-bold">=</span>
            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 font-mono font-bold text-[11px] border border-emerald-200">
              Grand Total ({incoterm || 'DAP'} {destination || 'Doncaster'}): <strong>${(Number(inquiry?.commercialProductsTotal || 121212.23) + currentDetails.totalFreight).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {inquiry?.currency || 'USD'}</strong>
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            onSelectContainerType(activeType);
            onProceedToCosting();
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 active:bg-blue-800 transition-colors shrink-0"
        >
          <span>Confirm Container Plan & Proceed to Costing</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
