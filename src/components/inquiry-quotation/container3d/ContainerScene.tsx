import React, { useEffect, useRef } from 'react';
import { Bounds, ContactShadows, Grid, OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { CertifiedContainerResult, PlacedDrumPosition, StuffingMethod } from '../../../domain/energyaCertifiedContainerStudyEngine';
import { cameraPresetPose, type ContainerViewPreset } from './CameraPresets';
import { ContainerShell } from './ContainerShell';
import { DrumMesh } from './DrumMesh';
import { FreeBufferZone } from './FreeBufferZone';
import { mmToMeters } from './coordinates';

export type ContainerZoomRequest = { id: number; direction: 1 | -1 | 0 };

export function ContainerScene({
  container,
  heightM,
  stuffingMethod,
  preset,
  activeDrumId,
  selectedDrumId,
  onHoverDrum,
  onSelectDrum,
  zoom,
}: {
  container: CertifiedContainerResult;
  heightM: number;
  stuffingMethod: StuffingMethod;
  preset: ContainerViewPreset;
  activeDrumId: string | null;
  selectedDrumId: string | null;
  onHoverDrum: (drum: PlacedDrumPosition | null) => void;
  onSelectDrum: (drum: PlacedDrumPosition) => void;
  zoom: ContainerZoomRequest;
}) {
  const length = mmToMeters(container.usableLengthMm);
  const width = mmToMeters(container.internalWidthMm);
  const controls = useRef<any>(null);
  const goal = useRef(new Vector3());
  const look = useRef(new Vector3());
  const animating = useRef(true);
  const warmFrames = useRef(0);
  const { camera, invalidate } = useThree();

  useEffect(() => {
    const pose = cameraPresetPose(preset, length, width, heightM);
    goal.current.set(...pose.position);
    look.current.set(...pose.target);
    animating.current = true;
    warmFrames.current = 0;
    invalidate();
  }, [preset, length, width, heightM, invalidate, zoom.id && zoom.direction === 0 ? zoom.id : 0]);

  useEffect(() => {
    if (zoom.direction === 0) return;
    const target = controls.current?.target || look.current;
    const offset = camera.position.clone().sub(target);
    const next = Math.min(48, Math.max(2.2, offset.length() * (zoom.direction > 0 ? 0.82 : 1.22)));
    offset.setLength(next);
    camera.position.copy(target).add(offset);
    animating.current = false;
    invalidate();
  }, [zoom, camera, invalidate]);

  useFrame(() => {
    if (warmFrames.current < 12) {
      warmFrames.current += 1;
      invalidate();
    }
    if (!animating.current) return;
    camera.position.lerp(goal.current, 0.12);
    controls.current?.target.lerp(look.current, 0.12);
    controls.current?.update();
    invalidate();
    if (camera.position.distanceTo(goal.current) < 0.05) animating.current = false;
  });

  return (
    <>
      <hemisphereLight args={['#e2e8f0', '#0f172a', 0.55]} />
      <ambientLight intensity={0.28} />
      <directionalLight position={[length, heightM * 3, -width]} intensity={1.15} />
      <directionalLight position={[-3, heightM * 2, width]} intensity={0.45} />
      <directionalLight position={[length / 2, heightM * 0.4, width * 1.6]} intensity={0.35} />
      <Grid
        args={[30, 30]}
        cellSize={0.5}
        sectionSize={1}
        cellColor="#334155"
        sectionColor="#64748b"
        infiniteGrid
        fadeDistance={28}
        position={[length / 2, -0.001, width / 2]}
      />
      <Bounds fit clip observe margin={1.15}>
        <group>
          <ContainerShell
            lengthMm={container.usableLengthMm}
            widthMm={container.internalWidthMm}
            heightM={heightM}
            openTop={container.typeCodeKey === '40OT'}
          />
          {container.placedDrums.map((drum) => (
            <DrumMesh
              key={drum.drumId}
              drum={drum}
              stuffingMethod={stuffingMethod}
              active={activeDrumId === drum.drumId || selectedDrumId === drum.drumId}
              onHover={onHoverDrum}
              onSelect={onSelectDrum}
            />
          ))}
          <FreeBufferZone
            usedLengthMm={container.usedLengthMm}
            usableLengthMm={container.usableLengthMm}
            widthMm={container.internalWidthMm}
            loadPercent={container.cllePercent}
          />
          <ContactShadows
            position={[length / 2, 0.01, width / 2]}
            opacity={0.45}
            scale={Math.max(length, width, 4) * 1.6}
            blur={2.2}
            far={5}
            color="#020617"
          />
        </group>
      </Bounds>
      <OrbitControls
        ref={controls}
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2.05}
        onChange={() => invalidate()}
      />
    </>
  );
}
