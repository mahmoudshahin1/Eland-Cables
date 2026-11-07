import React, { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { CertifiedContainerResult, PlacedDrumPosition, StuffingMethod } from '../../../domain/energyaCertifiedContainerStudyEngine';
import { cameraPresetPose, type ContainerViewPreset } from './CameraPresets';
import { ContainerShell } from './ContainerShell';
import { DrumMesh } from './DrumMesh';
import { FreeBufferZone } from './FreeBufferZone';
import { mmToMeters } from './coordinates';

export function ContainerScene({
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
  const length = mmToMeters(container.usableLengthMm);
  const width = mmToMeters(container.internalWidthMm);
  const controls = useRef<any>(null);
  const goal = useRef(new Vector3());
  const look = useRef(new Vector3());
  const animating = useRef(true);
  const { camera, invalidate } = useThree();

  useEffect(() => {
    const pose = cameraPresetPose(preset, length, width, heightM);
    goal.current.set(...pose.position);
    look.current.set(...pose.target);
    animating.current = true;
    invalidate();
  }, [preset, length, width, heightM, invalidate]);

  useFrame(() => {
    if (!animating.current) return;
    camera.position.lerp(goal.current, 0.12);
    controls.current?.target.lerp(look.current, 0.12);
    controls.current?.update();
    invalidate();
    if (camera.position.distanceTo(goal.current) < 0.05) animating.current = false;
  });

  return (
    <>
      <color attach="background" args={['#020617']} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[length, heightM * 2, -width]} intensity={1.15} />
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
          active={activeDrumId === drum.drumId}
          onHover={onHoverDrum}
        />
      ))}
      <FreeBufferZone
        usedLengthMm={container.usedLengthMm}
        usableLengthMm={container.usableLengthMm}
        widthMm={container.internalWidthMm}
      />
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
