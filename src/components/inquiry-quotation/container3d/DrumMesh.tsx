import React, { useState } from 'react';
import { Html } from '@react-three/drei';
import type { PlacedDrumPosition, StuffingMethod } from '../../../domain/energyaCertifiedContainerStudyEngine';
import { drumWorldPosition, mmToMeters } from './coordinates';

export function DrumMesh({
  drum,
  stuffingMethod,
  active,
  onHover,
}: {
  drum: PlacedDrumPosition;
  stuffingMethod: StuffingMethod;
  active: boolean;
  onHover: (drum: PlacedDrumPosition | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const position = drumWorldPosition(drum);
  const radius = mmToMeters(drum.flangeMm) / 2;
  const halfWidth = mmToMeters(drum.widthMm) / 2;
  const rotation: [number, number, number] = [Math.PI / 2, 0, 0];

  return (
    <group
      position={[position.x, position.y, position.z]}
      onPointerOver={(event) => {
        event.stopPropagation();
        onHover(drum);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(event) => {
        event.stopPropagation();
        setOpen((value) => !value);
        onHover(drum);
      }}
    >
      <group rotation={rotation}>
        <mesh position={[0, halfWidth - 0.02, 0]} castShadow>
          <cylinderGeometry args={[radius, radius, 0.045, 40]} />
          <meshStandardMaterial color={active ? '#fbbf24' : '#b45309'} roughness={0.75} />
        </mesh>
        <mesh position={[0, -(halfWidth - 0.02), 0]} castShadow>
          <cylinderGeometry args={[radius, radius, 0.045, 40]} />
          <meshStandardMaterial color={active ? '#f59e0b' : '#92400e'} roughness={0.75} />
        </mesh>
        <mesh castShadow>
          <cylinderGeometry args={[radius * 0.72, radius * 0.72, Math.max(0.05, halfWidth * 2 - 0.08), 32]} />
          <meshStandardMaterial color="#1c1917" roughness={0.55} metalness={0.15} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[radius * 0.12, radius * 0.12, halfWidth * 2 + 0.03, 16]} />
          <meshStandardMaterial color="#0f172a" metalness={0.4} roughness={0.4} />
        </mesh>
      </group>
      <mesh position={[-radius * 0.72, -radius + 0.04, halfWidth * 0.35]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[radius * 0.28, 0.06, 0.08]} />
        <meshStandardMaterial color="#44403c" />
      </mesh>
      <mesh position={[radius * 0.72, -radius + 0.04, halfWidth * 0.35]} rotation={[0, 0, -0.5]}>
        <boxGeometry args={[radius * 0.28, 0.06, 0.08]} />
        <meshStandardMaterial color="#44403c" />
      </mesh>
      <Html position={[0, radius + 0.15, 0]} center distanceFactor={8} zIndexRange={[20, 0]}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-full border border-slate-200 bg-white/95 px-2 py-0.5 text-[10px] font-bold text-slate-800 shadow-sm"
        >
          Row #{drum.rowIdx} / Ø{drum.flangeMm}
        </button>
        {open && (
          <div className="mt-1 w-44 rounded-xl border border-slate-200 bg-white p-2 text-left text-[10px] text-slate-700 shadow-lg">
            <p className="font-bold text-slate-900">{drum.drumCode}</p>
            <p>Stuffing: {stuffingMethod}</p>
            <p>Cable length: {drum.cuttingLengthM != null ? `${drum.cuttingLengthM} m` : '—'}</p>
            <p>Gross weight: {drum.grossWeightKg.toLocaleString()} kg</p>
            <p>
              Position: {Math.round(drum.xMm)} mm, {Math.round(drum.yMm)} mm
            </p>
          </div>
        )}
      </Html>
    </group>
  );
}
