import React, { useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
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

  return (
    <div ref={shell} className="relative min-h-[600px] bg-[radial-gradient(circle_at_center,#1e293b_0%,#0f172a_72%)]">
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
          onHoverDrum={onHoverDrum}
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
  );
}
