import React, { useState, useMemo } from 'react';
import { Layers, ZoomIn, ZoomOut, RotateCcw, Eye, Shield, Cpu, Tag, Sparkles, Info } from 'lucide-react';

export interface CableCrossSectionProps {
  // Input parameters can come from various sources
  cores?: number | string; // 1, 2, 3, 4, 5, 24 or "1C", "3 Core", "4X16"
  conductorMaterial?: 'Copper' | 'Aluminum' | string;
  crossSectionMm2?: number; // e.g. 16, 25, 35, 50, 70, 95, 120, 185, 240, etc.
  voltageClass?: 'LV' | 'MV' | 'HV' | 'EHV' | 'Control' | 'Special' | string; // e.g. "0.6/1 kV", "33 KV"
  voltageRating?: string; // e.g. "0.6/1 kV", "33 KV"
  insulation?: 'XLPE' | 'PVC' | 'EPR' | 'LSHF' | string;
  innerSheath?: 'PVC' | 'LSHF' | 'PE' | 'None' | string;
  armour?: 'SWA' | 'STA' | 'AWA' | 'SWB' | 'Unarmoured' | 'None' | string;
  outerSheath?: 'LSHF' | 'PVC' | 'MDPE' | 'HDPE' | 'Lead' | string;
  outerDiameterMm?: number;
  totalWeightKgKm?: number;
  cableCode?: string;
  itemDescription?: string;
  colorScheme?: 'modern-iec' | 'traditional-rgb' | 'black-numbered';
  viewMode?: 'photoreal' | 'schematic';
  showDimensions?: boolean;
  showLegend?: boolean;
  interactive?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'responsive';
  className?: string;
}

export const CableCrossSection2D: React.FC<CableCrossSectionProps> = ({
  cores = 1,
  conductorMaterial = 'Copper',
  crossSectionMm2,
  voltageClass = 'LV',
  voltageRating,
  insulation = 'XLPE',
  innerSheath = 'None',
  armour = 'Unarmoured',
  outerSheath = 'LSHF',
  outerDiameterMm,
  totalWeightKgKm,
  cableCode,
  itemDescription,
  colorScheme = 'modern-iec',
  viewMode = 'photoreal',
  showDimensions = true,
  showLegend = true,
  interactive = true,
  size = 'responsive',
  className = '',
}) => {
  const [hoveredLayer, setHoveredLayer] = useState<string | null>(null);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [activeColorScheme, setActiveColorScheme] = useState<'modern-iec' | 'traditional-rgb'>(colorScheme === 'traditional-rgb' ? 'traditional-rgb' : 'modern-iec');
  const [displayMode, setDisplayMode] = useState<'photoreal' | 'schematic'>(viewMode);
  const [showRuler, setShowRuler] = useState<boolean>(showDimensions);

  // Parse core count
  const parsedCores = useMemo(() => {
    if (typeof cores === 'number') return cores;
    const str = String(cores).toUpperCase();
    if (str.includes('4X') || str.includes('4C') || str.includes('4 CORE') || str.includes('4-CORE')) return 4;
    if (str.includes('3.5C') || str.includes('3.5 CORE')) return 4;
    if (str.includes('3X') || str.includes('3C') || str.includes('3 CORE') || str.includes('3-CORE')) return 3;
    if (str.includes('2X') || str.includes('2C') || str.includes('2 CORE') || str.includes('2-CORE')) return 2;
    if (str.includes('5X') || str.includes('5C') || str.includes('5 CORE') || str.includes('5-CORE')) return 5;
    if (str.includes('24C') || str.includes('24 CORE')) return 24;
    if (str.includes('1X') || str.includes('1C') || str.includes('1 CORE') || str.includes('1-CORE') || str.includes('SINGLE')) return 1;
    
    // Check description or code if provided
    if (itemDescription) {
      const desc = itemDescription.toUpperCase();
      if (desc.includes('4X') || desc.includes('4 CORE') || desc.includes('4C')) return 4;
      if (desc.includes('3X') || desc.includes('3 CORE') || desc.includes('3C')) return 3;
      if (desc.includes('2X') || desc.includes('2 CORE') || desc.includes('2C')) return 2;
      if (desc.includes('5X') || desc.includes('5 CORE') || desc.includes('5C')) return 5;
      if (desc.includes('1X') || desc.includes('1 CORE') || desc.includes('1C')) return 1;
    }
    return 1;
  }, [cores, itemDescription]);

  // Parse cross section size
  const parsedCrossSection = useMemo(() => {
    if (crossSectionMm2 && crossSectionMm2 > 0) return crossSectionMm2;
    if (itemDescription) {
      const match = itemDescription.match(/(\d+(?:\.\d+)?)\s*(?:MM2|MM²|SQMM)/i);
      if (match && match[1]) return parseFloat(match[1]);
      const matchX = itemDescription.match(/(?:1|2|3|4|5)X(\d+)/i);
      if (matchX && matchX[1]) return parseFloat(matchX[1]);
    }
    if (cableCode) {
      const match = cableCode.match(/(\d+)(?:MM|SQ|C\d+)/i);
      if (match && match[1]) return parseFloat(match[1]);
    }
    return 16;
  }, [crossSectionMm2, itemDescription, cableCode]);

  // Determine if cable is Medium/High Voltage
  const isMvOrHv = useMemo(() => {
    const vClass = String(voltageClass).toUpperCase();
    const vRating = String(voltageRating || '').toUpperCase();
    const desc = String(itemDescription || '').toUpperCase();
    return (
      vClass.includes('MV') ||
      vClass.includes('HV') ||
      vClass.includes('EHV') ||
      vRating.includes('11') ||
      vRating.includes('22') ||
      vRating.includes('33') ||
      vRating.includes('66') ||
      vRating.includes('132') ||
      desc.includes('33KV') ||
      desc.includes('11KV') ||
      desc.includes('66KV') ||
      desc.includes('132KV')
    );
  }, [voltageClass, voltageRating, itemDescription]);

  // Conductor is Copper or Aluminum
  const isCopper = useMemo(() => {
    const mat = String(conductorMaterial).toLowerCase();
    const desc = String(itemDescription || '').toLowerCase();
    if (mat.includes('al') && !mat.includes('copper')) return false;
    if (desc.includes('al /') || desc.includes('aluminum') || desc.includes('aluminium')) return false;
    return true;
  }, [conductorMaterial, itemDescription]);

  // Armour detection
  const hasArmour = useMemo(() => {
    const arm = String(armour).toUpperCase();
    const desc = String(itemDescription || '').toUpperCase();
    if (arm === 'SWA' || arm === 'STA' || arm === 'AWA' || arm === 'SWB') return arm;
    if (desc.includes('SWA')) return 'SWA';
    if (desc.includes('STA')) return 'STA';
    if (desc.includes('AWA')) return 'AWA';
    return null;
  }, [armour, itemDescription]);

  // Outer Diameter (approximate if not provided)
  const calculatedOdMm = useMemo(() => {
    if (outerDiameterMm && outerDiameterMm > 0) return outerDiameterMm;
    if (parsedCores === 1) {
      if (parsedCrossSection <= 16) return 10.9;
      if (parsedCrossSection <= 25) return 12.4;
      if (parsedCrossSection <= 35) return 13.5;
      if (parsedCrossSection <= 50) return 15.0;
      if (parsedCrossSection <= 70) return 16.8;
      if (parsedCrossSection <= 95) return 18.6;
      if (parsedCrossSection <= 120) return 20.4;
      if (parsedCrossSection <= 185) return 23.5;
      if (parsedCrossSection <= 240) return 26.8;
      return 32.0;
    } else if (parsedCores === 4) {
      if (parsedCrossSection <= 16) return 20.2;
      if (parsedCrossSection <= 25) return 23.8;
      if (parsedCrossSection <= 35) return 27.2;
      if (parsedCrossSection <= 50) return 31.0;
      return 42.0;
    } else if (parsedCores === 3) {
      return isMvOrHv ? 88.0 : 38.0;
    }
    return 18.0;
  }, [outerDiameterMm, parsedCores, parsedCrossSection, isMvOrHv]);

  // Determine Layer Colors & Radii geometry in a 200x200 SVG canvas (center at 100, 100)
  const geometry = useMemo(() => {
    const cx = 100;
    const cy = 100;
    const outerRadius = 88;

    // Conductor strand sizing
    // Scale conductor radius proportionally
    let conductorRadius = 24;
    let coreOuterRadius = 38;
    let corePositions: { cx: number; cy: number; label: string; color: string; stroke: string; neutral?: boolean }[] = [];

    if (parsedCores === 1) {
      conductorRadius = Math.min(46, Math.max(22, 18 + Math.sqrt(parsedCrossSection) * 2.6));
      coreOuterRadius = isMvOrHv ? 68 : 64;
      corePositions = [
        {
          cx: 100,
          cy: 100,
          label: 'Phase Conductor',
          color: activeColorScheme === 'modern-iec' ? '#9333ea' : '#2563eb',
          stroke: activeColorScheme === 'modern-iec' ? '#7e22ce' : '#1d4ed8',
        },
      ];
    } else if (parsedCores === 2) {
      conductorRadius = Math.min(22, Math.max(12, 10 + Math.sqrt(parsedCrossSection) * 1.8));
      coreOuterRadius = conductorRadius + (isMvOrHv ? 14 : 9);
      const offset = 34;
      corePositions = [
        {
          cx: 100 - offset,
          cy: 100,
          label: 'Phase (Brown/Red)',
          color: activeColorScheme === 'modern-iec' ? '#92400e' : '#dc2626',
          stroke: activeColorScheme === 'modern-iec' ? '#78350f' : '#b91c1c',
        },
        {
          cx: 100 + offset,
          cy: 100,
          label: 'Neutral (Blue/Black)',
          color: activeColorScheme === 'modern-iec' ? '#2563eb' : '#1e293b',
          stroke: activeColorScheme === 'modern-iec' ? '#1d4ed8' : '#0f172a',
          neutral: true,
        },
      ];
    } else if (parsedCores === 3) {
      conductorRadius = Math.min(20, Math.max(11, 8 + Math.sqrt(parsedCrossSection) * 1.5));
      coreOuterRadius = conductorRadius + (isMvOrHv ? 16 : 8);
      const distance = 36;
      corePositions = [
        {
          cx: 100,
          cy: 100 - distance,
          label: activeColorScheme === 'modern-iec' ? 'L1 (Brown)' : 'L1 (Red)',
          color: activeColorScheme === 'modern-iec' ? '#92400e' : '#dc2626',
          stroke: activeColorScheme === 'modern-iec' ? '#78350f' : '#b91c1c',
        },
        {
          cx: 100 - distance * 0.866,
          cy: 100 + distance * 0.5,
          label: activeColorScheme === 'modern-iec' ? 'L2 (Black)' : 'L2 (Yellow)',
          color: activeColorScheme === 'modern-iec' ? '#1e293b' : '#ca8a04',
          stroke: activeColorScheme === 'modern-iec' ? '#0f172a' : '#a16207',
        },
        {
          cx: 100 + distance * 0.866,
          cy: 100 + distance * 0.5,
          label: activeColorScheme === 'modern-iec' ? 'L3 (Grey)' : 'L3 (Blue)',
          color: activeColorScheme === 'modern-iec' ? '#64748b' : '#2563eb',
          stroke: activeColorScheme === 'modern-iec' ? '#475569' : '#1d4ed8',
        },
      ];
    } else if (parsedCores === 4) {
      conductorRadius = Math.min(18, Math.max(10, 7 + Math.sqrt(parsedCrossSection) * 1.4));
      coreOuterRadius = conductorRadius + 7;
      const offset = 32;
      corePositions = [
        {
          cx: 100 - offset,
          cy: 100 - offset,
          label: activeColorScheme === 'modern-iec' ? 'L1 (Brown)' : 'L1 (Red)',
          color: activeColorScheme === 'modern-iec' ? '#92400e' : '#dc2626',
          stroke: activeColorScheme === 'modern-iec' ? '#78350f' : '#b91c1c',
        },
        {
          cx: 100 + offset,
          cy: 100 - offset,
          label: activeColorScheme === 'modern-iec' ? 'L2 (Black)' : 'L2 (Yellow)',
          color: activeColorScheme === 'modern-iec' ? '#18181b' : '#ca8a04',
          stroke: activeColorScheme === 'modern-iec' ? '#27272a' : '#a16207',
        },
        {
          cx: 100 + offset,
          cy: 100 + offset,
          label: activeColorScheme === 'modern-iec' ? 'L3 (Grey)' : 'L3 (Blue)',
          color: activeColorScheme === 'modern-iec' ? '#64748b' : '#2563eb',
          stroke: activeColorScheme === 'modern-iec' ? '#475569' : '#1d4ed8',
        },
        {
          cx: 100 - offset,
          cy: 100 + offset,
          label: 'Neutral (Blue / Black)',
          color: activeColorScheme === 'modern-iec' ? '#2563eb' : '#09090b',
          stroke: activeColorScheme === 'modern-iec' ? '#1d4ed8' : '#27272a',
          neutral: true,
        },
      ];
    } else if (parsedCores === 5) {
      conductorRadius = 13;
      coreOuterRadius = 20;
      const r = 36;
      corePositions = Array.from({ length: 5 }).map((_, idx) => {
        const angle = ((idx * 72 - 90) * Math.PI) / 180;
        const colors = ['#92400e', '#18181b', '#64748b', '#2563eb', '#16a34a'];
        const strokes = ['#78350f', '#27272a', '#475569', '#1d4ed8', '#15803d'];
        const labels = ['L1 Brown', 'L2 Black', 'L3 Grey', 'Neutral Blue', 'Earth Green/Yellow'];
        return {
          cx: 100 + r * Math.cos(angle),
          cy: 100 + r * Math.sin(angle),
          label: labels[idx],
          color: colors[idx],
          stroke: strokes[idx],
        };
      });
    }

    // Number of individual wire strands for stranded Class 2 conductor visual
    const strandsCount = parsedCrossSection <= 16 ? 7 : parsedCrossSection <= 50 ? 19 : 37;

    return {
      cx,
      cy,
      outerRadius,
      sheathThickness: 7,
      armourRadius: hasArmour ? outerRadius - 9 : null,
      armourWireRadius: 3.5,
      armourWiresCount: hasArmour === 'SWA' || hasArmour === 'AWA' ? 24 : 0,
      innerBeddingRadius: hasArmour ? outerRadius - 18 : outerRadius - 9,
      coreOuterRadius,
      conductorRadius,
      corePositions,
      strandsCount,
    };
  }, [parsedCores, parsedCrossSection, isMvOrHv, hasArmour, activeColorScheme]);

  // Generate wire strand coordinates for each core center
  const getStrandsForCenter = (coreCx: number, coreCy: number, condRadius: number, count: number) => {
    const strands: { x: number; y: number; r: number }[] = [];
    if (count === 7) {
      // 1 center + 6 outer
      const strandR = condRadius / 3.1;
      strands.push({ x: coreCx, y: coreCy, r: strandR });
      const ringR = strandR * 2;
      for (let i = 0; i < 6; i++) {
        const angle = (i * 60 * Math.PI) / 180;
        strands.push({
          x: coreCx + ringR * Math.cos(angle),
          y: coreCy + ringR * Math.sin(angle),
          r: strandR,
        });
      }
    } else if (count === 19) {
      // 1 center + 6 mid + 12 outer
      const strandR = condRadius / 5.1;
      strands.push({ x: coreCx, y: coreCy, r: strandR });
      // Ring 1 (6)
      const ring1 = strandR * 2;
      for (let i = 0; i < 6; i++) {
        const angle = (i * 60 * Math.PI) / 180;
        strands.push({
          x: coreCx + ring1 * Math.cos(angle),
          y: coreCy + ring1 * Math.sin(angle),
          r: strandR,
        });
      }
      // Ring 2 (12)
      const ring2 = strandR * 4;
      for (let i = 0; i < 12; i++) {
        const angle = ((i * 30 + 15) * Math.PI) / 180;
        strands.push({
          x: coreCx + ring2 * Math.cos(angle),
          y: coreCy + ring2 * Math.sin(angle),
          r: strandR,
        });
      }
    } else {
      // Solid or fine mesh representation
      const strandR = condRadius / 7.2;
      strands.push({ x: coreCx, y: coreCy, r: strandR });
      for (let ring = 1; ring <= 3; ring++) {
        const n = ring * 6;
        const ringR = ring * strandR * 2;
        for (let i = 0; i < n; i++) {
          const angle = ((i * (360 / n)) * Math.PI) / 180;
          strands.push({
            x: coreCx + ringR * Math.cos(angle),
            y: coreCy + ringR * Math.sin(angle),
            r: strandR,
          });
        }
      }
    }
    return strands;
  };

  // Outer sheath color styling
  const sheathColor = useMemo(() => {
    const s = String(outerSheath).toUpperCase();
    if (s.includes('LSHF') || s.includes('LSOH')) return { base: '#1e293b', stroke: '#334155', accent: '#3b82f6' };
    if (s.includes('PVC')) return { base: '#0f172a', stroke: '#1e293b', accent: '#ef4444' };
    if (s.includes('MDPE') || s.includes('HDPE')) return { base: '#18181b', stroke: '#27272a', accent: '#10b981' };
    return { base: '#1e293b', stroke: '#334155', accent: '#6366f1' };
  }, [outerSheath]);

  // Conductor color gradient definition
  const condColor = isCopper
    ? {
        fill: '#ea580c',
        stroke: '#c2410c',
        gradStart: '#fdba74',
        gradMid: '#ea580c',
        gradEnd: '#9a3412',
        name: 'Plain Annealed Copper (CR01)',
        purity: '99.99% ETP Cu',
      }
    : {
        fill: '#94a3b8',
        stroke: '#64748b',
        gradStart: '#f1f5f9',
        gradMid: '#cbd5e1',
        gradEnd: '#64748b',
        name: 'Electrical Grade Aluminum (AL01)',
        purity: '1350 / EC Grade',
      };

  return (
    <div
      className={`bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 shadow-2xl p-4 flex flex-col items-center select-none overflow-hidden relative ${className}`}
    >
      {/* Top Controls Toolbar */}
      <div className="w-full flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3 text-xs">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h4 className="font-extrabold text-white text-xs tracking-tight flex items-center space-x-1.5">
              <span>2D Engineering Cross-Section</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                {parsedCores}C × {parsedCrossSection} mm²
              </span>
            </h4>
            <p className="text-[10px] text-slate-400 font-mono">
              OD: Ø {calculatedOdMm.toFixed(2)} mm • {voltageRating || (isMvOrHv ? 'MV 33kV' : '0.6/1 kV LV')}
            </p>
          </div>
        </div>

        {/* View & Color Scheme Toggles */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setActiveColorScheme((prev) => (prev === 'modern-iec' ? 'traditional-rgb' : 'modern-iec'))}
            className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-[10px] font-bold text-slate-300 border border-slate-800 transition-colors"
            title="Toggle Core Phase Identification Standard (IEC 60502 vs Traditional)"
          >
            {activeColorScheme === 'modern-iec' ? 'IEC Standard' : 'RGB Classic'}
          </button>
          <button
            onClick={() => setShowRuler((prev) => !prev)}
            className={`p-1.5 rounded-lg border text-[10px] transition-colors ${
              showRuler
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
            title="Toggle Dimensional Callout Lines"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel((prev) => (prev === 1 ? 1.25 : prev === 1.25 ? 1.5 : 1))}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
            title="Zoom Cross-Section"
          >
            {zoomLevel > 1 ? <ZoomOut className="h-3.5 w-3.5" /> : <ZoomIn className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Main SVG Cross-Section Stage */}
      <div className="relative w-full max-w-[280px] aspect-square flex items-center justify-center my-1">
        <svg
          viewBox="0 0 200 200"
          className="w-full h-full drop-shadow-2xl transition-transform duration-300 origin-center"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          <defs>
            {/* Conductor metallic gradient */}
            <radialGradient id="condGrad" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor={condColor.gradStart} />
              <stop offset="60%" stopColor={condColor.gradMid} />
              <stop offset="100%" stopColor={condColor.gradEnd} />
            </radialGradient>

            {/* XLPE Semi-Translucent Polymer gradient */}
            <radialGradient id="xlpeGrad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="70%" stopColor="#e2e8f0" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </radialGradient>

            {/* Galvanized Steel Armour gradient */}
            <radialGradient id="steelGrad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#f1f5f9" />
              <stop offset="50%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#475569" />
            </radialGradient>

            {/* Outer Sheath Texture */}
            <radialGradient id="sheathGrad" cx="30%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="70%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </radialGradient>

            {/* Pattern for tape / cross-hatch */}
            <pattern id="tapePattern" width="6" height="6" patternUnits="userSpaceOnUse">
              <path d="M0 6 L6 0 M0 0 L6 6" stroke="#475569" strokeWidth="0.5" />
            </pattern>
          </defs>

          {/* LAYER 1: OUTER SHEATH JACKET */}
          <g
            className="cursor-pointer transition-opacity"
            onMouseEnter={() => setHoveredLayer('Outer Sheath (LH02 / LSHF Jacket)')}
            onMouseLeave={() => setHoveredLayer(null)}
            onClick={() => setSelectedLayer('Outer Sheath: Low Smoke Zero Halogen UV-resistant outer jacket.')}
          >
            <circle
              cx={geometry.cx}
              cy={geometry.cy}
              r={geometry.outerRadius}
              fill="url(#sheathGrad)"
              stroke={hoveredLayer?.includes('Outer Sheath') ? '#60a5fa' : sheathColor.stroke}
              strokeWidth={hoveredLayer?.includes('Outer Sheath') ? '3.5' : '2'}
            />
            {/* Outer Sheath Thickness Ring */}
            <circle
              cx={geometry.cx}
              cy={geometry.cy}
              r={geometry.outerRadius - geometry.sheathThickness}
              fill="#0f172a"
              stroke="#334155"
              strokeWidth="1"
            />
          </g>

          {/* LAYER 2: METALLIC ARMOUR (SWA / AWA / STA) if specified */}
          {hasArmour && geometry.armourRadius && (
            <g
              className="cursor-pointer"
              onMouseEnter={() => setHoveredLayer(`Armour Layer (${hasArmour}: Galvanized Steel Wire Armour)`)}
              onMouseLeave={() => setHoveredLayer(null)}
            >
              {/* Armour Bedding Ring */}
              <circle
                cx={geometry.cx}
                cy={geometry.cy}
                r={geometry.armourRadius + 4}
                fill="none"
                stroke="#475569"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              {/* Individual Armour Wires Circle Array */}
              {Array.from({ length: geometry.armourWiresCount }).map((_, i) => {
                const angle = (i * 360) / geometry.armourWiresCount;
                const rad = (angle * Math.PI) / 180;
                const wx = geometry.cx + geometry.armourRadius! * Math.cos(rad);
                const wy = geometry.cy + geometry.armourRadius! * Math.sin(rad);
                return (
                  <circle
                    key={i}
                    cx={wx}
                    cy={wy}
                    r={geometry.armourWireRadius}
                    fill="url(#steelGrad)"
                    stroke="#334155"
                    strokeWidth="0.75"
                  />
                );
              })}
            </g>
          )}

          {/* LAYER 3: INNER BEDDING / BINDING TAPE (TP01) */}
          <g
            className="cursor-pointer"
            onMouseEnter={() => setHoveredLayer('Inner Bedding & Binding Tape (TP01)')}
            onMouseLeave={() => setHoveredLayer(null)}
          >
            <circle
              cx={geometry.cx}
              cy={geometry.cy}
              r={geometry.innerBeddingRadius}
              fill="#1e293b"
              stroke="#475569"
              strokeWidth="1"
            />
            {/* Non-hygroscopic Tape Layer Ring */}
            <circle
              cx={geometry.cx}
              cy={geometry.cy}
              r={geometry.innerBeddingRadius - 2}
              fill="none"
              stroke="#64748b"
              strokeWidth="1"
              strokeDasharray="3 1.5"
            />
          </g>

          {/* LAYER 4: CENTRAL / INTERSTITIAL FILLERS for Multi-Core */}
          {parsedCores > 1 && (
            <g>
              {/* Center dummy filler */}
              <circle
                cx={geometry.cx}
                cy={geometry.cy}
                r={parsedCores === 4 ? 14 : parsedCores === 3 ? 12 : 8}
                fill="#334155"
                stroke="#1e293b"
                strokeWidth="1"
              />
              {/* Interstitial filler text mark */}
              <circle
                cx={geometry.cx}
                cy={geometry.cy}
                r={4}
                fill="#475569"
              />
            </g>
          )}

          {/* LAYER 5: CORES (Conductor + Insulation + Screens) */}
          {geometry.corePositions.map((core, coreIdx) => {
            const strands = getStrandsForCenter(core.cx, core.cy, geometry.conductorRadius, geometry.strandsCount);

            return (
              <g
                key={coreIdx}
                className="cursor-pointer"
                onMouseEnter={() =>
                  setHoveredLayer(
                    `${core.label} - ${parsedCrossSection} mm² ${conductorMaterial} / ${insulation} 90°C`
                  )
                }
                onMouseLeave={() => setHoveredLayer(null)}
              >
                {/* MV Semi-Conductive Insulation Screen (Outer Black Ring) if MV/HV */}
                {isMvOrHv && (
                  <circle
                    cx={core.cx}
                    cy={core.cy}
                    r={geometry.coreOuterRadius + 3}
                    fill="#0f172a"
                    stroke="#1e293b"
                    strokeWidth="1.5"
                  />
                )}

                {/* Core Insulation Jacket (Color coded according to IEC/RGB standard) */}
                <circle
                  cx={core.cx}
                  cy={core.cy}
                  r={geometry.coreOuterRadius}
                  fill={core.color}
                  stroke={core.stroke}
                  strokeWidth="2"
                />

                {/* XLPE High-Dielectric Insulation Ring */}
                <circle
                  cx={core.cx}
                  cy={core.cy}
                  r={geometry.conductorRadius + (isMvOrHv ? 12 : 5)}
                  fill="url(#xlpeGrad)"
                  stroke="#cbd5e1"
                  strokeWidth="1"
                  opacity={isMvOrHv ? 0.95 : 0.4}
                />

                {/* MV Conductor Screen (Inner Semi-con layer) if MV/HV */}
                {isMvOrHv && (
                  <circle
                    cx={core.cx}
                    cy={core.cy}
                    r={geometry.conductorRadius + 2.5}
                    fill="#1e293b"
                    stroke="#0f172a"
                    strokeWidth="1"
                  />
                )}

                {/* Conductor Background Base */}
                <circle
                  cx={core.cx}
                  cy={core.cy}
                  r={geometry.conductorRadius}
                  fill="url(#condGrad)"
                  stroke={condColor.stroke}
                  strokeWidth="1"
                />

                {/* Class 2 Stranded Multi-Wire Geometry */}
                {strands.map((s, sIdx) => (
                  <circle
                    key={sIdx}
                    cx={s.x}
                    cy={s.y}
                    r={s.r}
                    fill="url(#condGrad)"
                    stroke={condColor.stroke}
                    strokeWidth="0.5"
                  />
                ))}

                {/* Core Center Dot / Core identification pin */}
                {parsedCores > 1 && (
                  <text
                    x={core.cx}
                    y={core.cy + 3}
                    textAnchor="middle"
                    fontSize="7"
                    fontWeight="bold"
                    fill={isCopper ? '#78350f' : '#334155'}
                    opacity={0.7}
                  >
                    {coreIdx + 1}
                  </text>
                )}
              </g>
            );
          })}

          {/* LAYER 6: DIMENSION RULERS & ANNOTATIONS */}
          {showRuler && (
            <g className="pointer-events-none text-[8px] font-mono">
              {/* Outer Diameter Line Indicator (Top) */}
              <line
                x1={geometry.cx - geometry.outerRadius}
                y1="12"
                x2={geometry.cx + geometry.outerRadius}
                y2="12"
                stroke="#60a5fa"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <line x1={geometry.cx - geometry.outerRadius} y1="8" x2={geometry.cx - geometry.outerRadius} y2="16" stroke="#60a5fa" strokeWidth="1" />
              <line x1={geometry.cx + geometry.outerRadius} y1="8" x2={geometry.cx + geometry.outerRadius} y2="16" stroke="#60a5fa" strokeWidth="1" />
              <text x="100" y="9" textAnchor="middle" fill="#93c5fd" fontSize="7.5" fontWeight="bold">
                Ø {calculatedOdMm.toFixed(1)} mm
              </text>

              {/* Conductor Cross-Section Callout (Bottom) */}
              <text x="100" y="194" textAnchor="middle" fill="#fbbf24" fontSize="7.5" fontWeight="bold">
                {parsedCores} × {parsedCrossSection} mm² {conductorMaterial}
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Layer Hover Inspector Banner */}
      <div className="w-full bg-slate-900/90 rounded-xl p-2 mt-2 border border-slate-800 flex items-center justify-between text-[11px] min-h-[36px]">
        {hoveredLayer ? (
          <span className="font-bold text-amber-300 flex items-center space-x-1.5 animate-fade-in truncate">
            <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="truncate">{hoveredLayer}</span>
          </span>
        ) : (
          <span className="text-slate-400 text-[10px] flex items-center space-x-1">
            <Info className="h-3.5 w-3.5 text-blue-400 mr-1 inline shrink-0" />
            <span>Hover over any core or sheath layer to inspect material composition.</span>
          </span>
        )}
      </div>

      {/* Color Code & Material Breakdown Legend */}
      {showLegend && (
        <div className="w-full mt-3 pt-2.5 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[10px]">
          {/* Conductor Spec */}
          <div className="flex items-center space-x-2 bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
            <span
              className="w-3 h-3 rounded-full shrink-0 shadow-sm"
              style={{ backgroundColor: condColor.fill, border: `1px solid ${condColor.stroke}` }}
            />
            <div className="truncate">
              <span className="font-bold text-slate-200 block truncate">
                {conductorMaterial} Conductor
              </span>
              <span className="text-slate-400 text-[9px]">Class 2 Stranded RMC</span>
            </div>
          </div>

          {/* Insulation Spec */}
          <div className="flex items-center space-x-2 bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
            <span className="w-3 h-3 rounded-full bg-slate-200 border border-slate-400 shrink-0" />
            <div className="truncate">
              <span className="font-bold text-slate-200 block truncate">
                {insulation} Insulation (XL08)
              </span>
              <span className="text-slate-400 text-[9px]">90°C Crosslinked</span>
            </div>
          </div>

          {/* Sheath Spec */}
          <div className="flex items-center space-x-2 bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
            <span className="w-3 h-3 rounded-full bg-slate-700 border border-slate-500 shrink-0" />
            <div className="truncate">
              <span className="font-bold text-slate-200 block truncate">
                Outer Sheath ({outerSheath})
              </span>
              <span className="text-slate-400 text-[9px]">Flame Retardant LH02</span>
            </div>
          </div>

          {/* Armour or Tape */}
          <div className="flex items-center space-x-2 bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
            <span
              className={`w-3 h-3 rounded-full shrink-0 ${
                hasArmour ? 'bg-slate-400 border border-slate-300' : 'bg-emerald-500/20 border border-emerald-500/40'
              }`}
            />
            <div className="truncate">
              <span className="font-bold text-slate-200 block truncate">
                {hasArmour ? `${hasArmour} Armour` : 'Binder Tape (TP01)'}
              </span>
              <span className="text-slate-400 text-[9px]">
                {hasArmour ? 'Galvanized Wires' : 'Mica / Polyester'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
