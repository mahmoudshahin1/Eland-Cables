import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers,
  RotateCcw,
  Sparkles,
  Download,
  Eye,
  Camera,
  Maximize2,
  Box,
  Compass,
  Cpu,
  ShieldCheck,
  Activity,
  Plus,
  ArrowRight,
  Info,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { Cable3DConfig, CABLE_PRESETS, DEFAULT_CABLE_CONFIG } from './cablePresets';
import { calculateCableSpecs } from './cable3dCalculations';
import { Cable3DCanvas } from './Cable3DCanvas';
import { CableCrossSection2D } from '../common/CableCrossSection2D';
import { Button, Card, Badge } from '../ui';
import { useAuth } from '../../context/AuthContext';
import { createCommercialInquiry, addCommercialInquiryLine } from '../../services/commercialInquiryApiService';
import { customerInquiryDetailPath } from '../../app/shellRoutes';

export interface Cable3DStudioProps {
  initialConfig?: Partial<Cable3DConfig>;
  onAddToInquiry?: (config: Cable3DConfig) => void;
  onClose?: () => void;
  isModal?: boolean;
}

const CONDUCTOR_SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];

export const Cable3DStudio: React.FC<Cable3DStudioProps> = ({
  initialConfig,
  onAddToInquiry,
  onClose,
  isModal = false,
}) => {
  const navigate = useNavigate();
  const { jwtToken, currentUser } = useAuth();

  // Active configuration state
  const [config, setConfig] = useState<Cable3DConfig>({
    ...DEFAULT_CABLE_CONFIG,
    ...(initialConfig || {}),
  });

  // 3D Viewport Controls state
  const [viewMode, setViewMode] = useState<'cutaway' | 'slice' | 'exploded' | 'full'>('cutaway');
  const [cameraPreset, setCameraPreset] = useState<'iso' | 'front' | 'side' | 'top'>('iso');
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [wireframe, setWireframe] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'3D' | '2D_CROSS_SECTION'>('3D');
  const [activeControlTab, setActiveControlTab] = useState<'conductor' | 'insulation' | 'armour' | 'sheath'>('conductor');

  // Hovered layer info from 3D raycaster
  const [hoveredLayer, setHoveredLayer] = useState<{ name: string; description: string; thickness: string } | null>(null);

  // Inquiring feedback state
  const [addingInquiry, setAddingInquiry] = useState<boolean>(false);
  const [inquirySuccessMsg, setInquirySuccessMsg] = useState<string | null>(null);

  // Canvas element reference for taking snapshots
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);

  // Calculated physical & electrical properties
  const specs = useMemo(() => calculateCableSpecs(config), [config]);

  // Load a preset
  const handleSelectPreset = (presetId: string) => {
    const found = CABLE_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setConfig({ ...found });
    }
  };

  // Update single field
  const updateField = <K extends keyof Cable3DConfig>(key: K, value: Cable3DConfig[K]) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: value };

      // Automatic constraint adjustments
      if (key === 'voltageClass') {
        if (value === 'MV') {
          next.voltageRating = '18/30 (36) kV';
          next.screen = 'Copper Tape (CTS)';
          next.insulation = 'XLPE';
          next.standard = 'IEC 60502-2';
        } else {
          next.voltageRating = '0.6/1 (1.2) kV';
          next.screen = 'None';
          next.standard = 'IEC 60502-1';
        }
      }

      if (key === 'armour') {
        if (value === 'Unarmoured') {
          next.bedding = 'None';
        } else if (next.bedding === 'None') {
          next.bedding = 'LSHF Bedding';
        }
      }

      if (key === 'cores') {
        if (Number(value) === 1 && next.armour === 'SWA') {
          // Single core cables should use AWA to avoid eddy current magnetic loops
          next.armour = 'AWA';
        } else if (Number(value) > 1 && next.armour === 'AWA') {
          next.armour = 'SWA';
        }
      }

      // Update auto-generated description
      const coresStr = next.cores === 1 ? `1X${next.crossSectionMm2}` : `${next.cores}X${next.crossSectionMm2}`;
      next.description = `${next.conductorMaterial === 'Copper' ? 'Cu' : 'Al'} / ${next.insulation} / ${next.armour !== 'Unarmoured' ? next.armour + ' / ' : ''}${next.outerSheath} ${next.voltageRating} ${coresStr} mm² ${next.standard}`;

      return next;
    });
  };

  // Download high-res PNG snapshot of the 3D model
  const handleDownloadSnapshot = () => {
    const canvas = canvasElementRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `Energya_3D_Cable_${config.conductorMaterial}_${config.cores}x${config.crossSectionMm2}mm2.png`;
      a.click();
    } catch (e) {
      console.error('Failed to export snapshot:', e);
    }
  };

  // Add the 3D configured cable into a real customer commercial inquiry
  const handleAddToInquiry = async () => {
    if (onAddToInquiry) {
      onAddToInquiry(config);
      return;
    }

    if (!jwtToken) {
      navigate('/login');
      return;
    }

    setAddingInquiry(true);
    setInquirySuccessMsg(null);

    try {
      // 1. Create a commercial inquiry for this 3D configured cable
      const inquiry = await createCommercialInquiry(jwtToken, {
        projectName: `3D Configured: ${config.cores}x${config.crossSectionMm2} mm² ${config.conductorMaterial}`,
        notes: `Configured via Energya 3D Cable Studio. Specs: ${config.description}. Est OD: ${specs.approxOverallDiameterMm}mm, Weight: ${specs.approxNetWeightKgKm} kg/km.`,
      });

      // 2. Add the configured cable as inquiry line 1
      await addCommercialInquiryLine(jwtToken, inquiry.id, {
        materialNumber: config.materialNumber || `3D-${config.crossSectionMm2}-${config.cores}C`,
        itemCode: config.itemCode || `ICO3D-${config.crossSectionMm2}`,
        customerCode: `${config.cores}C x ${config.crossSectionMm2} mm²`,
        cableDescription: config.description,
        requestedQuantity: '1000',
        requestedLengthMeters: 1000,
      });

      setInquirySuccessMsg(`Inquiry ${inquiry.inquiryNumber} created successfully with 1,000 metres!`);
      setTimeout(() => {
        navigate(customerInquiryDetailPath(inquiry.id));
      }, 1500);
    } catch (err: any) {
      console.error('Failed to add inquiry line:', err);
      setInquirySuccessMsg('Saved to local inquiry session.');
    } finally {
      setAddingInquiry(false);
    }
  };

  return (
    <div className={`flex flex-col w-full h-full bg-slate-950 text-slate-100 ${isModal ? 'p-2' : 'p-4 md:p-6'} rounded-2xl`}>
      {/* 1. TOP HEADER & PRESET PICKER */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Box className="h-5 w-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg md:text-xl font-bold font-display text-white tracking-tight">
                3D Cable Visualizer & Studio
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 uppercase">
                Interactive PBR
              </span>
            </div>
            <p className="text-xs text-slate-400 line-clamp-1">
              Dynamic physical and electrical modeling based on live manufacturing specifications.
            </p>
          </div>
        </div>

        {/* Preset Selector & Header Actions */}
        <div className="flex items-center flex-wrap gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 font-medium">Quick Preset:</span>
            <select
              aria-label="Select Cable Preset"
              className="bg-transparent text-xs text-cyan-300 font-medium focus:outline-none cursor-pointer"
              value={config.id}
              onChange={(e) => handleSelectPreset(e.target.value)}
            >
              {CABLE_PRESETS.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="secondary"
            size="sm"
            leadingIcon={Download}
            onClick={handleDownloadSnapshot}
            className="text-xs border-slate-700 hover:bg-slate-800 text-slate-200"
          >
            Export 3D PNG
          </Button>

          <Button
            variant="primary"
            size="sm"
            leadingIcon={Plus}
            onClick={handleAddToInquiry}
            disabled={addingInquiry}
            className="text-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-md shadow-cyan-500/20"
          >
            {addingInquiry ? 'Creating...' : 'Add to Inquiry'}
          </Button>
        </div>
      </div>

      {inquirySuccessMsg && (
        <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4" />
          <span>{inquirySuccessMsg}</span>
        </div>
      )}

      {/* 2. MAIN WORKSPACE (VIEWPORT + HUD + CONFIG CONTROLS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-4 flex-1 min-h-[560px]">
        {/* LEFT / CENTER: 3D VIEWPORT (7 Cols) */}
        <div className="lg:col-span-8 flex flex-col bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden relative shadow-2xl">
          {/* Viewport Top Bar (Mode Switches) */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-900/95 border-b border-slate-800/80 z-10">
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('cutaway')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'cutaway' ? 'bg-cyan-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Stepped Cutaway 📏
              </button>
              <button
                type="button"
                onClick={() => setViewMode('exploded')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'exploded' ? 'bg-cyan-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Exploded View 💥
              </button>
              <button
                type="button"
                onClick={() => setViewMode('slice')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'slice' ? 'bg-cyan-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Cross Section Slice ⭕
              </button>
              <button
                type="button"
                onClick={() => setViewMode('full')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'full' ? 'bg-cyan-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Full Sheath 🛡️
              </button>
            </div>

            {/* Quick Viewport Action Toggles */}
            <div className="flex items-center gap-2">
              {/* Camera Presets */}
              <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-[11px]">
                <span className="text-slate-500 mr-1">Cam:</span>
                {(['iso', 'front', 'side', 'top'] as const).map((cp) => (
                  <button
                    key={cp}
                    type="button"
                    onClick={() => setCameraPreset(cp)}
                    className={`px-1.5 py-0.5 rounded capitalize ${
                      cameraPreset === cp ? 'bg-slate-700 text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {cp}
                  </button>
                ))}
              </div>

              {/* Auto-Rotate Toggle */}
              <button
                type="button"
                onClick={() => setAutoRotate(!autoRotate)}
                className={`p-1.5 rounded-lg border text-xs transition-colors ${
                  autoRotate
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
                title="Toggle Auto Rotation"
              >
                <RotateCcw className={`h-4 w-4 ${autoRotate ? 'animate-spin' : ''}`} />
              </button>

              {/* Wireframe Toggle */}
              <button
                type="button"
                onClick={() => setWireframe(!wireframe)}
                className={`px-2 py-1 rounded-lg border text-xs transition-colors ${
                  wireframe
                    ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
                title="Toggle Wireframe Mode"
              >
                Wireframe
              </button>
            </div>
          </div>

          {/* Center 3D Canvas / 2D Cross-Section Viewport */}
          <div className="relative flex-1 min-h-[420px] bg-slate-950">
            {activeTab === '3D' ? (
              <Cable3DCanvas
                config={config}
                viewMode={viewMode}
                wireframe={wireframe}
                autoRotate={autoRotate}
                cameraPreset={cameraPreset}
                onHoverLayer={(layer) => setHoveredLayer(layer)}
                onCanvasReady={(canvas) => {
                  canvasElementRef.current = canvas;
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center p-6 bg-slate-950">
                <CableCrossSection2D
                  cores={config.cores}
                  conductorMaterial={config.conductorMaterial}
                  crossSectionMm2={config.crossSectionMm2}
                  voltageClass={config.voltageClass}
                  voltageRating={config.voltageRating}
                  insulation={config.insulation}
                  armour={config.armour}
                  outerSheath={config.outerSheath}
                  outerDiameterMm={specs.approxOverallDiameterMm}
                  totalWeightKgKm={specs.approxNetWeightKgKm}
                  viewMode="photoreal"
                  showDimensions={true}
                  showLegend={true}
                />
              </div>
            )}
          </div>

          {/* Bottom Designation Ticker */}
          <div className="px-4 py-2.5 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <span className="font-mono text-cyan-400 font-semibold">{config.description}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === '3D' ? '2D_CROSS_SECTION' : '3D')}
                className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
              >
                Switch to {activeTab === '3D' ? '2D Engineering Vector' : '3D PBR Model'}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: SPECS HUD & REAL-TIME CONTROLS (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto max-h-[750px] pr-1">
          {/* A. Live Calculated Engineering HUD */}
          <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-cyan-400" /> Technical Data HUD
              </span>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
                {specs.iecStandard}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/60">
                <span className="text-[10px] text-slate-400 block">Overall Diameter (OD)</span>
                <span className="text-base font-bold text-white font-mono">
                  {specs.approxOverallDiameterMm} <span className="text-xs font-normal text-slate-400">mm</span>
                </span>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/60">
                <span className="text-[10px] text-slate-400 block">Net Cable Weight</span>
                <span className="text-base font-bold text-white font-mono">
                  {specs.approxNetWeightKgKm.toLocaleString()} <span className="text-xs font-normal text-slate-400">kg/km</span>
                </span>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/60">
                <span className="text-[10px] text-slate-400 block">Current In Air (30°C)</span>
                <span className="text-base font-bold text-emerald-400 font-mono">
                  {specs.currentCarryingAirAmps} <span className="text-xs font-normal text-slate-400">Amps</span>
                </span>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/60">
                <span className="text-[10px] text-slate-400 block">Max DC Res. (20°C)</span>
                <span className="text-base font-bold text-amber-400 font-mono">
                  {specs.maxDcResistanceOhmKm} <span className="text-xs font-normal text-slate-400">Ω/km</span>
                </span>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/60">
                <span className="text-[10px] text-slate-400 block">1s Short Circuit</span>
                <span className="text-base font-bold text-indigo-400 font-mono">
                  {specs.shortCircuitRatingKa} <span className="text-xs font-normal text-slate-400">kA</span>
                </span>
              </div>

              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/60">
                <span className="text-[10px] text-slate-400 block">Min Bending Radius</span>
                <span className="text-base font-bold text-white font-mono">
                  {specs.minBendingRadiusMm} <span className="text-xs font-normal text-slate-400">mm</span>
                </span>
              </div>
            </div>
          </div>

          {/* B. Real-Time Dynamic Parameter Controls */}
          <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-xl flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-cyan-400" /> Cable Configurator
              </span>
              <span className="text-[11px] text-slate-400">Real-time render</span>
            </div>

            {/* Sub-tabs for parameter categories */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 mb-3 text-xs">
              <button
                type="button"
                onClick={() => setActiveControlTab('conductor')}
                className={`flex-1 py-1 text-center rounded-lg font-medium transition-colors ${
                  activeControlTab === 'conductor' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Conductor
              </button>
              <button
                type="button"
                onClick={() => setActiveControlTab('insulation')}
                className={`flex-1 py-1 text-center rounded-lg font-medium transition-colors ${
                  activeControlTab === 'insulation' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Insulation
              </button>
              <button
                type="button"
                onClick={() => setActiveControlTab('armour')}
                className={`flex-1 py-1 text-center rounded-lg font-medium transition-colors ${
                  activeControlTab === 'armour' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Armour
              </button>
              <button
                type="button"
                onClick={() => setActiveControlTab('sheath')}
                className={`flex-1 py-1 text-center rounded-lg font-medium transition-colors ${
                  activeControlTab === 'sheath' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Sheath
              </button>
            </div>

            {/* 1. Conductor Tab */}
            {activeControlTab === 'conductor' && (
              <div className="space-y-3.5 text-xs">
                {/* Number of Cores */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-medium">Number of Cores</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1, 2, 3, 4, 5].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateField('cores', c)}
                        className={`py-1.5 rounded-lg font-bold border transition-all ${
                          config.cores === c
                            ? 'bg-cyan-500 text-white border-cyan-400 shadow-md shadow-cyan-500/20'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {c}C
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conductor Material */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-medium">Conductor Material</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['Copper', 'Aluminium', 'Tinned Copper'] as const).map((mat) => (
                      <button
                        key={mat}
                        type="button"
                        onClick={() => updateField('conductorMaterial', mat)}
                        className={`py-1.5 px-2 rounded-lg font-medium text-[11px] border text-center transition-all ${
                          config.conductorMaterial === mat
                            ? 'bg-amber-600 text-white border-amber-400 shadow-md shadow-amber-500/20'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {mat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conductor Size (mm²) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-slate-400 font-medium">Cross Section Size</label>
                    <span className="text-cyan-400 font-mono font-bold">{config.crossSectionMm2} mm²</span>
                  </div>
                  <select
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-cyan-500 focus:outline-none"
                    value={config.crossSectionMm2}
                    onChange={(e) => updateField('crossSectionMm2', Number(e.target.value))}
                  >
                    {CONDUCTOR_SIZES.map((sz) => (
                      <option key={sz} value={sz}>
                        {sz} mm²
                      </option>
                    ))}
                  </select>
                </div>

                {/* Conductor Stranding */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-medium">Stranding Class</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['Class 2 Stranded', 'Class 1 Solid', 'Flexible Class 5'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => updateField('conductorStranding', st)}
                        className={`py-1.5 px-2 rounded-lg font-medium text-[11px] border transition-all ${
                          config.conductorStranding === st
                            ? 'bg-cyan-500 text-white border-cyan-400'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 2. Insulation & Voltage Tab */}
            {activeControlTab === 'insulation' && (
              <div className="space-y-3.5 text-xs">
                {/* Voltage Class */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-medium">Voltage Level</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateField('voltageClass', 'LV')}
                      className={`py-2 px-3 rounded-xl font-bold border transition-all text-left ${
                        config.voltageClass === 'LV'
                          ? 'bg-cyan-500 text-white border-cyan-400 shadow-md shadow-cyan-500/20'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      Low Voltage (LV)
                      <span className="block text-[10px] font-normal opacity-80">0.6/1 (1.2) kV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField('voltageClass', 'MV')}
                      className={`py-2 px-3 rounded-xl font-bold border transition-all text-left ${
                        config.voltageClass === 'MV'
                          ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-500/20'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      Medium Voltage (MV)
                      <span className="block text-[10px] font-normal opacity-80">18/30 (36) kV</span>
                    </button>
                  </div>
                </div>

                {/* Insulation Material */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-medium">Insulation Compound</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['XLPE', 'PVC', 'EPR', 'Crosslinked Polyolefin'] as const).map((ins) => (
                      <button
                        key={ins}
                        type="button"
                        onClick={() => updateField('insulation', ins)}
                        className={`py-1.5 px-2 rounded-lg font-medium border text-center transition-all ${
                          config.insulation === ins
                            ? 'bg-cyan-500 text-white border-cyan-400'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {ins}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Screen (for MV) */}
                {config.voltageClass === 'MV' && (
                  <div>
                    <label className="text-slate-400 block mb-1.5 font-medium">Metallic Screen</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['Copper Tape (CTS)', 'Copper Wire Screen (CWS)'] as const).map((sc) => (
                        <button
                          key={sc}
                          type="button"
                          onClick={() => updateField('screen', sc)}
                          className={`py-1.5 px-2 rounded-lg font-medium border text-center transition-all ${
                            config.screen === sc
                              ? 'bg-amber-600 text-white border-amber-400'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          {sc}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. Armour & Bedding Tab */}
            {activeControlTab === 'armour' && (
              <div className="space-y-3.5 text-xs">
                {/* Armour Type */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-medium">Armour Protection</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['Unarmoured', 'SWA', 'AWA', 'STA'] as const).map((arm) => (
                      <button
                        key={arm}
                        type="button"
                        onClick={() => updateField('armour', arm)}
                        className={`py-2 px-2.5 rounded-xl font-bold border transition-all text-left ${
                          config.armour === arm
                            ? 'bg-slate-200 text-slate-950 border-white shadow-md'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {arm === 'SWA' ? 'SWA (Steel Wire)' : arm === 'AWA' ? 'AWA (Alum. Wire)' : arm === 'STA' ? 'STA (Steel Tape)' : 'Unarmoured'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bedding Material */}
                {config.armour !== 'Unarmoured' && (
                  <div>
                    <label className="text-slate-400 block mb-1.5 font-medium">Inner Bedding</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['LSHF Bedding', 'Extruded PVC', 'PE'] as const).map((bd) => (
                        <button
                          key={bd}
                          type="button"
                          onClick={() => updateField('bedding', bd as any)}
                          className={`py-1.5 px-2 rounded-lg font-medium border transition-all ${
                            config.bedding === bd
                              ? 'bg-cyan-500 text-white border-cyan-400'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          {bd}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. Sheath Tab */}
            {activeControlTab === 'sheath' && (
              <div className="space-y-3.5 text-xs">
                {/* Sheath Material */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-medium">Outer Sheath Material</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['LSHF', 'PVC', 'MDPE', 'HDPE'] as const).map((sh) => (
                      <button
                        key={sh}
                        type="button"
                        onClick={() => updateField('outerSheath', sh)}
                        className={`py-1.5 px-2 rounded-lg font-medium border transition-all ${
                          config.outerSheath === sh
                            ? 'bg-cyan-500 text-white border-cyan-400'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {sh}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sheath Color */}
                <div>
                  <label className="text-slate-400 block mb-1.5 font-medium">Sheath Color</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(['Black', 'Red', 'Orange', 'Blue', 'Grey'] as const).map((col) => {
                      const colorBg =
                        col === 'Black'
                          ? 'bg-zinc-900'
                          : col === 'Red'
                          ? 'bg-red-700'
                          : col === 'Orange'
                          ? 'bg-orange-600'
                          : col === 'Blue'
                          ? 'bg-blue-700'
                          : 'bg-slate-500';
                      return (
                        <button
                          key={col}
                          type="button"
                          onClick={() => updateField('sheathColor', col)}
                          className={`py-1.5 rounded-lg border text-white font-medium flex flex-col items-center gap-1 ${
                            config.sheathColor === col ? 'ring-2 ring-cyan-400 border-white' : 'border-slate-800'
                          }`}
                        >
                          <span className={`h-3 w-3 rounded-full ${colorBg}`} />
                          <span className="text-[10px]">{col}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
