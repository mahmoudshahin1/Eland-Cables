import React from 'react';
import { Canvas } from '@react-three/fiber';
import type { CertifiedContainerResult, PlacedDrumPosition, StuffingMethod } from '../../../domain/energyaCertifiedContainerStudyEngine';
import { ContainerScene } from './ContainerScene';
import type { ContainerViewPreset } from './CameraPresets';

export default function ContainerCanvas({
  container,
  heightM,
  stuffingMethod,
  preset,
  activeDrumId,
  onHoverDrum,
}: {
  container: CertifiedContainerResult;
  heightM: number;
  stuffingMethod: StuffingMethod;
  preset: ContainerViewPreset;
  activeDrumId: string | null;
  onHoverDrum: (drum: PlacedDrumPosition | null) => void;
}) {
  return (
    <Canvas
      className="h-[420px] w-full"
      dpr={[1, 2]}
      frameloop="demand"
      camera={{ position: [6, 4, -4], fov: 42, near: 0.1, far: 200 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <ContainerScene
        container={container}
        heightM={heightM}
        stuffingMethod={stuffingMethod}
        preset={preset}
        activeDrumId={activeDrumId}
        onHoverDrum={onHoverDrum}
      />
    </Canvas>
  );
}
