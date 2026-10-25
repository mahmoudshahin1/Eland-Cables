import React, { useState } from 'react';
import {
  Ship,
  Package,
  Layers,
  ArrowRight,
  Info,
  Maximize2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Scale,
  Ruler,
} from 'lucide-react';
import type {
  CertifiedContainerResult,
  CertifiedStudySummary,
  PlacedDrumPosition,
  StuffingMethod,
} from '../../domain/energyaCertifiedContainerStudyEngine';

interface VipContainerVisualizerProps {
  studySummary: CertifiedStudySummary;
  stuffingMethod: StuffingMethod;
  onChangeStuffingMethod: (method: StuffingMethod) => void;
  selectedContainerType: string;
  onApplyOptimalContainer: (type: '20STD' | '40STD' | '40HQ' | '40OT') => void;
}

export const VipContainerVisualizer: React.FC<VipContainerVisualizerProps> = ({
  studySummary,
  stuffingMethod,
  onChangeStuffingMethod,
  selectedContainerType,
  onApplyOptimalContainer,
}) => {
  const [activeContainerIdx, setActiveContainerIdx] = useState(0);
  const [hoveredDrum, setHoveredDrum] = useState<PlacedDrumPosition | null>(null);
  const [viewMode, setViewMode] = useState<'top_down' | 'cross_section'>('top_down');

  const containers = studySummary.containers;
  const currentContainer: CertifiedContainerResult | undefined =
    containers[activeContainerIdx] || containers[0];

  if (!currentContainer) {
    return (
      <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl">
        <Package className="h-8 w-8 text-slate-400 mx-auto mb-2" />
        <p className="text-slate-600 font-semibold text-sm">No drums allocated to container study.</p>
        <p className="text-slate-400 text-xs mt-1">Configure cutting lengths and drum schedule to view loading.</p>
      </div>
    );
  }

  const isOptimalSelected = selectedContainerType === studySummary.optimalContainerType;

  // Visual aspect ratio calculations for SVG
  const internalWidthMm = currentContainer.internalWidthMm || 2350;
  const usableLengthMm = currentContainer.usableLengthMm || 5900;

  // ViewBox units: 1 unit = 10 mm
  // Width: 235 viewBox units + 60 padding = 295
  // Length: e.g. 590 units for 20ft, 1200 units for 40ft + padding
  const svgScale = 0.08; // scale factor mm to SVG points
  const svgContainerWidth = internalWidthMm * svgScale; // ~188 px
  const svgContainerLength = usableLengthMm * svgScale; // ~472 px for 5900mm, ~960 px for 12000mm
  const paddingX = 40;
  const paddingY = 40;
  const viewBoxWidth = svgContainerLength + paddingX * 2;
  const viewBoxHeight = svgContainerWidth + paddingY * 2;

  return (
    <div className="space-y-4">
      {/* Top Banner: Certified Container Study Bar & Auto-Select Button */}
      <div className="rounded-2xl border-2 border-blue-500/30 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 p-4 text-white shadow-xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[11px] font-bold text-blue-300 border border-blue-400/30">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                <span>Certified Energya Container Study Engine</span>
              </span>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-400/30">
                Excel Macro Parity
              </span>
            </div>

            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <span>Interactive Container Loading & Stuffing Plan</span>
            </h3>

            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Drums are packed according to certified factory rules (2,350 mm width limits, 26.0t payload,
              multi-line side-by-side nesting, and automatic 20ft/40ft/HQ volume down-sizing).
            </p>
          </div>

          {/* Auto-Select Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onApplyOptimalContainer(studySummary.optimalContainerType)}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition-all shadow-lg active:scale-95 ${
                isOptimalSelected
                  ? 'bg-emerald-600 text-white shadow-emerald-600/30 ring-2 ring-emerald-400/50'
                  : 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 hover:from-amber-400 hover:to-amber-500 shadow-amber-500/20'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              <div className="text-left">
                <span className="block text-[10px] uppercase tracking-wider opacity-90">
                  {isOptimalSelected ? 'Optimal Container Applied' : 'Recommended Optimal Action'}
                </span>
                <span className="text-xs font-extrabold">
                  {isOptimalSelected
                    ? `✓ ${studySummary.optimalContainerLabel}`
                    : `⚡ Auto-Select Optimal Container (${studySummary.optimalContainerLabel})`}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* 4 Excel Summary Counters (Matching J2:J5 in Excel Sheet) */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-800/80 text-[11px]">
          <div className="rounded-xl bg-slate-800/60 p-2.5 border border-slate-700/50">
            <span className="text-slate-400 block text-[10px]">40' High Cube (40 HQ)</span>
            <span className="text-base font-black font-mono text-blue-400">
              {studySummary.count40HQ}{' '}
              <span className="text-xs font-normal text-slate-300">
                {studySummary.count40HQ === 1 ? 'Container' : 'Containers'}
              </span>
            </span>
          </div>

          <div className="rounded-xl bg-slate-800/60 p-2.5 border border-slate-700/50">
            <span className="text-slate-400 block text-[10px]">40' Standard (40 STD)</span>
            <span className="text-base font-black font-mono text-cyan-400">
              {studySummary.count40STD}{' '}
              <span className="text-xs font-normal text-slate-300">
                {studySummary.count40STD === 1 ? 'Container' : 'Containers'}
              </span>
            </span>
          </div>

          <div className="rounded-xl bg-slate-800/60 p-2.5 border border-slate-700/50">
            <span className="text-slate-400 block text-[10px]">20' Standard (20 STD)</span>
            <span className="text-base font-black font-mono text-emerald-400">
              {studySummary.count20STD}{' '}
              <span className="text-xs font-normal text-slate-300">
                {studySummary.count20STD === 1 ? 'Container' : 'Containers'}
              </span>
            </span>
          </div>

          <div className="rounded-xl bg-slate-800/60 p-2.5 border border-slate-700/50">
            <span className="text-slate-400 block text-[10px]">40' Open Top (40 OT)</span>
            <span className="text-base font-black font-mono text-amber-400">
              {studySummary.count40OT}{' '}
              <span className="text-xs font-normal text-slate-300">
                {studySummary.count40OT === 1 ? 'Container' : 'Containers'}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Container Card: Navigation & Visual Blueprint */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        {/* Container Switcher & Mode Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          {/* Container Selector Tabs (if multiple containers) */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-800">Container:</span>
              <span className="rounded-lg bg-blue-50 text-blue-700 px-2.5 py-1 text-xs font-mono font-bold border border-blue-200">
                #{currentContainer.containerIndex} of {studySummary.totalContainers}
              </span>
              <span className="rounded-lg bg-slate-100 text-slate-700 px-2 py-1 text-xs font-bold">
                {currentContainer.containerType}
              </span>
            </div>

            {studySummary.totalContainers > 1 && (
              <div className="flex items-center gap-1 ml-2">
                <button
                  type="button"
                  disabled={activeContainerIdx === 0}
                  onClick={() => setActiveContainerIdx((i) => Math.max(0, i - 1))}
                  className="p-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none"
                  title="Previous Container"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={activeContainerIdx === studySummary.totalContainers - 1}
                  onClick={() => setActiveContainerIdx((i) => Math.min(studySummary.totalContainers - 1, i + 1))}
                  className="p-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none"
                  title="Next Container"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Stuffing Method & View Controls */}
          <div className="flex items-center gap-3">
            {/* Stuffing selector */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-medium">Stuffing Mode:</span>
              <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200">
                <button
                  type="button"
                  onClick={() => onChangeStuffingMethod('Rolling')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    stuffingMethod === 'Rolling'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Rolling (Standard)
                </button>
                <button
                  type="button"
                  onClick={() => onChangeStuffingMethod('Forklifting')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    stuffingMethod === 'Forklifting'
                      ? 'bg-white text-blue-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Forklifting
                </button>
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('top_down')}
                className={`px-2 py-1 rounded-lg font-bold text-xs ${
                  viewMode === 'top_down'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Top-Down Plan
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cross_section')}
                className={`px-2 py-1 rounded-lg font-bold text-xs ${
                  viewMode === 'cross_section'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Door Elevation
              </button>
            </div>
          </div>
        </div>

        {/* Live Gauges Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs">
          <div>
            <div className="flex justify-between text-slate-500 text-[11px] mb-1">
              <span>Weight Load (CWLE):</span>
              <strong className="text-slate-900 font-mono font-bold">{currentContainer.cwlePercent}%</strong>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  currentContainer.cwlePercent > 90
                    ? 'bg-amber-500'
                    : currentContainer.cwlePercent > 50
                      ? 'bg-emerald-500'
                      : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(100, currentContainer.cwlePercent)}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-mono">
              {currentContainer.totalGrossWeightKg.toLocaleString()} / {currentContainer.maxPayloadKg.toLocaleString()} kg
            </p>
          </div>

          <div>
            <div className="flex justify-between text-slate-500 text-[11px] mb-1">
              <span>Length Load (CLLE):</span>
              <strong className="text-slate-900 font-mono font-bold">{currentContainer.cllePercent}%</strong>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, currentContainer.cllePercent)}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-mono">
              {currentContainer.usedLengthMm.toLocaleString()} / {currentContainer.usableLengthMm.toLocaleString()} mm
            </p>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px]">Remaining Payload:</span>
            <span className="font-bold text-slate-800 font-mono text-sm">
              {(currentContainer.remainingWeightKg / 1000).toFixed(2)} t
            </span>
            <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
              Available weight capacity
            </p>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px]">Remaining Length:</span>
            <span className="font-bold text-slate-800 font-mono text-sm">
              {(currentContainer.remainingLengthMm / 1000).toFixed(2)} m
            </span>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Free floor buffer
            </p>
          </div>
        </div>

        {/* 2D Container Loading Blueprint (SVG Interactive Floor Plan) */}
        {viewMode === 'top_down' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>Bulkhead (Front)</span>
                <span className="text-slate-300">───────────►</span>
              </span>
              <span className="font-bold text-slate-700">
                Top-Down Floor View (Width: 2,350 mm × Usable Length: {usableLengthMm.toLocaleString()} mm)
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="text-slate-300">◄───────────</span>
                <span>Container Doors (Loading End)</span>
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-600" />
              </span>
            </div>

            <div className="relative border-2 border-slate-800 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 p-4 shadow-inner overflow-x-auto">
              <svg
                viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
                className="w-full h-auto min-w-[700px] select-none"
                style={{ maxHeight: '380px' }}
              >
                {/* Definitions for patterns and gradients */}
                <defs>
                  {/* Corrugated container side wall pattern */}
                  <pattern id="corrugation" width="12" height="12" patternUnits="userSpaceOnUse">
                    <rect width="6" height="12" fill="#1e293b" />
                    <rect x="6" width="6" height="12" fill="#0f172a" />
                  </pattern>

                  {/* Floor diagonal hatch for remaining free space */}
                  <pattern id="freeSpaceHatch" width="16" height="16" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                    <line x1="0" y1="0" x2="0" y2="16" stroke="#334155" strokeWidth="2" strokeOpacity="0.4" />
                  </pattern>

                  {/* Drum Reel Gradient */}
                  <radialGradient id="drumGradient" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="60%" stopColor="#d97706" />
                    <stop offset="90%" stopColor="#b45309" />
                    <stop offset="100%" stopColor="#78350f" />
                  </radialGradient>

                  {/* Drum Inner Flange Rim Gradient */}
                  <radialGradient id="hubGradient" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#475569" />
                    <stop offset="70%" stopColor="#1e293b" />
                    <stop offset="100%" stopColor="#0f172a" />
                  </radialGradient>
                </defs>

                {/* Container Outer Shell (Steel Frame) */}
                <rect
                  x={paddingX - 10}
                  y={paddingY - 10}
                  width={svgContainerLength + 20}
                  height={svgContainerWidth + 20}
                  rx="6"
                  fill="#1e293b"
                  stroke="#475569"
                  strokeWidth="3"
                />

                {/* Container Interior Floor */}
                <rect
                  x={paddingX}
                  y={paddingY}
                  width={svgContainerLength}
                  height={svgContainerWidth}
                  fill="#0b1329"
                />

                {/* Free space hatched region */}
                {currentContainer.remainingLengthMm > 0 && (
                  <rect
                    x={paddingX + currentContainer.usedLengthMm * svgScale}
                    y={paddingY}
                    width={currentContainer.remainingLengthMm * svgScale}
                    height={svgContainerWidth}
                    fill="url(#freeSpaceHatch)"
                    stroke="#475569"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                )}

                {/* Free Space Label */}
                {currentContainer.remainingLengthMm > 500 && (
                  <text
                    x={paddingX + currentContainer.usedLengthMm * svgScale + (currentContainer.remainingLengthMm * svgScale) / 2}
                    y={paddingY + svgContainerWidth / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#94a3b8"
                    fontSize="11"
                    fontWeight="bold"
                    letterSpacing="1"
                  >
                    FREE BUFFER: {(currentContainer.remainingLengthMm / 1000).toFixed(2)} M
                  </text>
                )}

                {/* Front Bulkhead Wall (Left) */}
                <rect
                  x={paddingX - 8}
                  y={paddingY}
                  width="8"
                  height={svgContainerWidth}
                  fill="#f59e0b"
                />
                <text
                  x={paddingX - 14}
                  y={paddingY + svgContainerWidth / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#f59e0b"
                  fontSize="9"
                  fontWeight="bold"
                  transform={`rotate(-90, ${paddingX - 14}, ${paddingY + svgContainerWidth / 2})`}
                >
                  FRONT BULKHEAD
                </text>

                {/* Rear Container Doors (Right) */}
                <rect
                  x={paddingX + svgContainerLength}
                  y={paddingY}
                  width="10"
                  height={svgContainerWidth / 2 - 4}
                  fill="#3b82f6"
                  stroke="#1d4ed8"
                  strokeWidth="1.5"
                />
                <rect
                  x={paddingX + svgContainerLength}
                  y={paddingY + svgContainerWidth / 2 + 4}
                  width="10"
                  height={svgContainerWidth / 2 - 4}
                  fill="#3b82f6"
                  stroke="#1d4ed8"
                  strokeWidth="1.5"
                />
                <text
                  x={paddingX + svgContainerLength + 18}
                  y={paddingY + svgContainerWidth / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#60a5fa"
                  fontSize="9"
                  fontWeight="bold"
                  transform={`rotate(90, ${paddingX + svgContainerLength + 18}, ${paddingY + svgContainerWidth / 2})`}
                >
                  CONTAINER DOORS
                </text>

                {/* Interior Dimension Lines */}
                {/* Width dimension (2,350 mm) */}
                <line
                  x1={paddingX - 22}
                  y1={paddingY}
                  x2={paddingX - 22}
                  y2={paddingY + svgContainerWidth}
                  stroke="#64748b"
                  strokeWidth="1"
                  markerEnd="url(#arrow)"
                />
                <text
                  x={paddingX - 26}
                  y={paddingY + svgContainerWidth / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#94a3b8"
                  fontSize="9"
                  fontWeight="bold"
                  transform={`rotate(-90, ${paddingX - 26}, ${paddingY + svgContainerWidth / 2})`}
                >
                  2,350 MM WIDTH
                </text>

                {/* Row Dividing Guides & Row Indicators */}
                {currentContainer.rows.map((row, idx) => {
                  let prevRowOffset = 0;
                  for (let i = 0; i < idx; i++) {
                    prevRowOffset += (currentContainer.rows[i].maxFlangeMm + 40) * svgScale;
                  }
                  const rowX = paddingX + 60 * svgScale + prevRowOffset;
                  const rowW = row.maxFlangeMm * svgScale;

                  return (
                    <g key={`row-bound-${row.rowIdx}`}>
                      <rect
                        x={rowX}
                        y={paddingY + 2}
                        width={rowW}
                        height={svgContainerWidth - 4}
                        fill="none"
                        stroke="#334155"
                        strokeWidth="1"
                        strokeDasharray="2 3"
                      />
                      <text
                        x={rowX + rowW / 2}
                        y={paddingY - 6}
                        textAnchor="middle"
                        fill="#cbd5e1"
                        fontSize="9"
                        fontWeight="bold"
                      >
                        Row #{row.rowIdx} ({row.maxFlangeMm} mm)
                      </text>
                    </g>
                  );
                })}

                {/* Render Placed Cable Drums */}
                {currentContainer.placedDrums.map((drum, dIdx) => {
                  const cx = paddingX + drum.xMm * svgScale;
                  const cy = paddingY + drum.yMm * svgScale;
                  const radius = (drum.diameterMm / 2) * svgScale;
                  const isHovered = hoveredDrum?.drumId === drum.drumId;

                  return (
                    <g
                      key={drum.drumId}
                      className="cursor-pointer transition-transform"
                      onMouseEnter={() => setHoveredDrum(drum)}
                      onMouseLeave={() => setHoveredDrum(null)}
                    >
                      {/* Outer Wooden Flange Circle */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={radius}
                        fill="url(#drumGradient)"
                        stroke={isHovered ? '#60a5fa' : '#78350f'}
                        strokeWidth={isHovered ? '3' : '1.5'}
                        filter={isHovered ? 'drop-shadow(0 0 6px rgba(96, 165, 250, 0.8))' : undefined}
                      />

                      {/* Cable Winding Barrel (Inner Circle) */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={radius * 0.65}
                        fill="#b45309"
                        stroke="#92400e"
                        strokeWidth="1.5"
                      />

                      {/* Concentric winding grooves */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={radius * 0.48}
                        fill="none"
                        stroke="#78350f"
                        strokeWidth="1"
                        strokeDasharray="3 2"
                      />

                      {/* Central Spindle Hub */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={radius * 0.28}
                        fill="url(#hubGradient)"
                        stroke="#0f172a"
                        strokeWidth="1.5"
                      />
                      <circle cx={cx} cy={cy} r={radius * 0.1} fill="#e2e8f0" />

                      {/* Drum Labels inside the reel */}
                      <text
                        x={cx}
                        y={cy - 4}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#ffffff"
                        fontSize={radius > 35 ? '10' : '8'}
                        fontWeight="extrabold"
                        pointerEvents="none"
                      >
                        {drum.drumCode}
                      </text>

                      <text
                        x={cx}
                        y={cy + 7}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#fef08a"
                        fontSize={radius > 35 ? '9' : '7'}
                        fontWeight="bold"
                        fontFamily="monospace"
                        pointerEvents="none"
                      >
                        Ø{drum.flangeMm} · {drum.grossWeightKg}kg
                      </text>

                      {/* Line Tag (Port/Line 1 vs Starboard/Line 2) */}
                      <text
                        x={cx}
                        y={cy + 17}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#93c5fd"
                        fontSize="7"
                        fontWeight="bold"
                        pointerEvents="none"
                      >
                        {drum.lineIdx === 1 ? 'Port (L1)' : drum.lineIdx === 2 ? 'Stbd (L2)' : 'Center'}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        ) : (
          /* Cross-Section Elevation (Door Height View) */
          <div className="p-6 bg-slate-900 rounded-2xl border border-slate-800 text-white space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300">Container Rear Door Elevation (Cross-Section)</span>
              <span className="font-mono text-blue-400">
                Door Clearance: {currentContainer.containerType === '40 HQ' ? '2,585 mm (HQ)' : '2,280 mm (STD)'}
              </span>
            </div>

            <div className="relative border-2 border-slate-700 rounded-xl bg-slate-950 h-52 flex items-end justify-center gap-6 p-4">
              {currentContainer.rows[0]?.drums.map((drum, idx) => (
                <div key={idx} className="flex flex-col items-center">
                  <div
                    className="rounded-t-lg bg-gradient-to-t from-amber-700 to-amber-500 border-2 border-amber-400 flex flex-col items-center justify-center p-2 text-center text-white shadow-lg"
                    style={{
                      height: `${Math.min(150, Math.round((drum.flangeMm / 2500) * 140))}px`,
                      width: `${Math.min(120, Math.round((drum.widthMm / 2350) * 200))}px`,
                    }}
                  >
                    <span className="text-[10px] font-black font-mono">{drum.drumCode}</span>
                    <span className="text-[9px] text-amber-100">Flange: {drum.flangeMm}mm</span>
                    <span className="text-[9px] text-amber-200 font-mono">{drum.grossWeightKg} kg</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 font-mono">
                    {idx === 0 ? 'Port (Left)' : 'Starboard (Right)'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hovered Drum Details Tooltip Card */}
        {hoveredDrum && (
          <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl flex flex-wrap items-center justify-between gap-4 text-xs animate-in fade-in duration-200">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-blue-900">{hoveredDrum.drumCode}</span>
                <span className="bg-blue-200/80 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                  Row #{hoveredDrum.rowIdx} · {hoveredDrum.lineIdx === 1 ? 'Line 1 (Port)' : 'Line 2 (Starboard)'}
                </span>
                {hoveredDrum.cuttingLengthM && (
                  <span className="text-slate-600 font-mono text-[11px]">
                    Length: <strong>{hoveredDrum.cuttingLengthM} m</strong>
                  </span>
                )}
              </div>
              <p className="text-slate-600 text-[11px]">
                {hoveredDrum.cableDesc || 'Standard Armored / Power Cable Reel'}
              </p>
            </div>

            <div className="flex items-center gap-4 text-[11px] font-mono">
              <div>
                <span className="text-slate-400 block text-[10px]">Flange × Width:</span>
                <strong className="text-slate-800">
                  Ø{hoveredDrum.flangeMm} × {hoveredDrum.widthMm} mm
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Gross Weight:</span>
                <strong className="text-emerald-700 font-bold">{hoveredDrum.grossWeightKg.toLocaleString()} kg</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Position (X, Y):</span>
                <span className="text-slate-700">
                  {Math.round(hoveredDrum.xMm)}mm, {Math.round(hoveredDrum.yMm)}mm
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
