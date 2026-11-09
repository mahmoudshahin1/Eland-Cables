import React, { useState } from 'react';
import { Edges, Html } from '@react-three/drei';
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
  const [hovered, setHovered] = useState(false);
  const position = drumWorldPosition(drum);
  const radius = mmToMeters(drum.flangeMm) / 2;
  const halfWidth = mmToMeters(drum.widthMm) / 2;
  const highlighted = active || hovered || open;
  const flangeColor = highlighted ? '#fbbf24' : '#b45309';

  return (
    <group
      position={[position.x, position.y, position.z]}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        onHover(drum);
      }}
      onPointerOut={() => {
        setHovered(false);
        onHover(null);
      }}
      onClick={(event) => {
        event.stopPropagation();
        setOpen((value) => !value);
        onHover(drum);
      }}
    >
      <group rotation={[Math.PI / 2, 0, 0]}>
        {[halfWidth - 0.03, -(halfWidth - 0.03)].map((y) => (
          <mesh key={y} position={[0, y, 0]} castShadow>
            <cylinderGeometry args={[radius, radius, 0.07, 40]} />
            <meshStandardMaterial color={flangeColor} roughness={0.62} emissive={highlighted ? '#f59e0b' : '#000000'} emissiveIntensity={highlighted ? 0.35 : 0} />
            <Edges color="#d97706" threshold={15} />
          </mesh>
        ))}
        {Array.from({ length: 8 }, (_, index) => {
          const angle = (index / 8) * Math.PI * 2;
          return [halfWidth - 0.03, -(halfWidth - 0.03)].map((y) => (
            <mesh
              key={`${y}-${index}`}
              position={[Math.cos(angle) * radius * 0.55, y, Math.sin(angle) * radius * 0.55]}
              rotation={[Math.PI / 2, angle, 0]}
            >
              <boxGeometry args={[radius * 0.7, 0.02, 0.045]} />
              <meshStandardMaterial color="#92400e" roughness={0.7} />
            </mesh>
          ));
        })}
        <mesh castShadow>
          <cylinderGeometry args={[radius * 0.7, radius * 0.7, Math.max(0.05, halfWidth * 2 - 0.1), 32]} />
          <meshStandardMaterial color="#1c1917" roughness={0.5} metalness={0.12} />
        </mesh>
        {[0.78, 0.66, 0.54].map((scale) => (
          <mesh key={scale} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[radius * scale, 0.018, 8, 28]} />
            <meshStandardMaterial color="#0c0a09" roughness={0.4} />
          </mesh>
        ))}
        <mesh>
          <cylinderGeometry args={[radius * 0.16, radius * 0.16, halfWidth * 2 + 0.06, 16]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.82} roughness={0.22} />
        </mesh>
      </group>
      <mesh position={[-radius * 0.55, -radius + 0.04, halfWidth * 0.2]} rotation={[0, 0, 0.45]}>
        <boxGeometry args={[radius * 0.34, 0.06, 0.1]} />
        <meshStandardMaterial color="#facc15" />
      </mesh>
      <mesh position={[radius * 0.55, -radius + 0.04, halfWidth * 0.2]} rotation={[0, 0, -0.45]}>
        <boxGeometry args={[radius * 0.34, 0.06, 0.1]} />
        <meshStandardMaterial color="#facc15" />
      </mesh>
      <Html position={[0, radius + 0.18, 0]} center distanceFactor={8} zIndexRange={[20, 0]}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-full border border-amber-200 bg-white/95 px-2 py-0.5 text-[10px] font-bold text-slate-800 shadow-sm"
        >
          Row #{drum.rowIdx} · Ø{drum.flangeMm} mm · {Math.round(drum.grossWeightKg).toLocaleString()} kg
        </button>
        {open && (
          <div className="mt-1 w-52 rounded-xl border border-white/30 bg-slate-950/75 p-2 text-left text-[10px] text-slate-100 shadow-xl backdrop-blur-md">
            <p className="font-bold text-white">Row {drum.rowIdx}</p>
            <p>Drum code: {drum.drumCode}</p>
            <p>
              Flange × barrel × width: {drum.flangeMm} × {Math.round(drum.flangeMm * 0.7)} × {drum.widthMm} mm
            </p>
            <p>Cable length: {drum.cuttingLengthM != null ? `${drum.cuttingLengthM} m` : '—'}</p>
            <p>Net weight: —</p>
            <p>Gross weight: {drum.grossWeightKg.toLocaleString()} kg</p>
            <p>
              X / Z: {Math.round(drum.xMm)} mm / {Math.round(drum.yMm)} mm
            </p>
            <p className="text-slate-300">Stuffing: {stuffingMethod}</p>
          </div>
        )}
      </Html>
    </group>
  );
}
