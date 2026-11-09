import React, { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Maximize2, Minimize2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { CertifiedContainerResult, PlacedDrumPosition, StuffingMethod } from '../../../domain/energyaCertifiedContainerStudyEngine';
import { CONTAINER_VIEW_PRESETS, type ContainerViewPreset } from './CameraPresets';
import { ContainerScene, type ContainerZoomRequest } from './ContainerScene';

const hudButton =
  'inline-flex items-center gap-1 rounded-lg border border-white/15 bg-slate-950/70 px-2.5 py-1.5 text-[11px] font-semibold text-slate-100 backdrop-blur-md hover:bg-slate-800';

export default function ContainerCanvas({
  container,
  heightM,
  stuffingMethod,
  preset,
  activeDrumId,
  onHoverDrum,
  onPresetChange,
}: {
  container: CertifiedContainerResult;
  heightM: number;
  stuffingMethod: StuffingMethod;
  preset: ContainerViewPreset;
  activeDrumId: string | null;
  onHoverDrum: (drum: PlacedDrumPosition | null) => void;
  onPresetChange: (preset: ContainerViewPreset) => void;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState<ContainerZoomRequest>({ id: 0, direction: 0 });
  const [selectedDrum, setSelectedDrum] = useState<PlacedDrumPosition | null>(null);

  useEffect(() => {
    if (!selectedDrum) return;
    const stillPlaced = container.placedDrums.some((drum) => drum.drumId === selectedDrum.drumId);
    if (!stillPlaced) setSelectedDrum(null);
  }, [container.placedDrums, selectedDrum]);

  const toggleFullscreen = () => {
    const node = shell.current;
    if (!node) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      setFullscreen(false);
      return;
    }
    void node.requestFullscreen();
    setFullscreen(true);
  };

  const lengthLabel = selectedDrum?.cuttingLengthM != null ? `${selectedDrum.cuttingLengthM} m` : '—';

  return (
    <div ref={shell} className="flex min-h-[600px] bg-[radial-gradient(circle_at_center,#1e293b_0%,#0f172a_72%)]">
      <div className="relative min-w-0 flex-1">
      <Canvas
        className={fullscreen ? '!h-screen w-full' : '!h-[600px] w-full min-h-[600px]'}
        dpr={[1, 2]}
        frameloop="demand"
        camera={{ position: [6, 4, -4], fov: 42, near: 0.1, far: 200 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <ContainerScene
          container={container}
          heightM={heightM}
          stuffingMethod={stuffingMethod}
          preset={preset}
          activeDrumId={activeDrumId}
          selectedDrumId={selectedDrum?.drumId ?? null}
          onHoverDrum={onHoverDrum}
          onSelectDrum={setSelectedDrum}
          zoom={zoom}
        />
      </Canvas>
      <div className="absolute right-3 top-3 z-10">
        <button type="button" onClick={toggleFullscreen} className={hudButton} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {fullscreen ? 'Exit' : 'Fullscreen'}
        </button>
      </div>
      <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center gap-1.5">
        <button type="button" className={hudButton} onClick={() => setZoom((current) => ({ id: current.id + 1, direction: 1 }))}>
          <ZoomIn className="h-3.5 w-3.5" />
          Zoom In
        </button>
        <button type="button" className={hudButton} onClick={() => setZoom((current) => ({ id: current.id + 1, direction: -1 }))}>
          <ZoomOut className="h-3.5 w-3.5" />
          Zoom Out
        </button>
        <button
          type="button"
          className={hudButton}
          onClick={() => {
            onPresetChange('perspective');
            setZoom((current) => ({ id: current.id + 1, direction: 0 }));
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset View
        </button>
        {CONTAINER_VIEW_PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onPresetChange(item.id)}
            className={`${hudButton} ${preset === item.id ? 'border-sky-400 text-sky-100' : ''}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      </div>
      {selectedDrum && (
        <aside className="flex w-64 shrink-0 flex-col gap-2 border-l border-white/10 bg-slate-950/90 p-4 text-slate-100">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Selected drum</p>
              <p className="text-sm font-black text-white">{selectedDrum.drumCode}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDrum(null)}
              className="rounded-lg border border-white/15 p-1 text-slate-200 hover:bg-slate-800"
              aria-label="Close drum details"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-3"><dt className="text-slate-400">Row</dt><dd className="font-semibold">{selectedDrum.rowIdx}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">Flange</dt><dd className="font-semibold">{selectedDrum.flangeMm} mm</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">Width</dt><dd className="font-semibold">{selectedDrum.widthMm} mm</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">Cutting length</dt><dd className="font-semibold">{lengthLabel}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">Gross weight</dt><dd className="font-semibold">{selectedDrum.grossWeightKg.toLocaleString()} kg</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-400">Net weight</dt><dd className="font-semibold">—</dd></div>
          </dl>
        </aside>
      )}
    </div>
  );
}
