import React from 'react';
import { Html } from '@react-three/drei';
import { mmToMeters } from './coordinates';

export function FreeBufferZone({
  usedLengthMm,
  usableLengthMm,
  widthMm,
}: {
  usedLengthMm: number;
  usableLengthMm: number;
  widthMm: number;
}) {
  const used = mmToMeters(usedLengthMm);
  const usable = mmToMeters(usableLengthMm);
  const width = mmToMeters(widthMm);
  const remaining = Math.max(0, usable - used);
  if (remaining < 0.2) return null;
  const center = used + remaining / 2;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center, 0.02, width / 2]}>
        <planeGeometry args={[remaining, Math.max(0.2, width - 0.12)]} />
        <meshStandardMaterial color="#34d399" emissive="#059669" emissiveIntensity={0.45} transparent opacity={0.38} />
      </mesh>
      <mesh position={[center, 0.08, width * 0.82]}>
        <boxGeometry args={[remaining, 0.015, 0.015]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <mesh position={[used + 0.05, 0.08, width * 0.82]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.05, 0.12, 8]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <mesh position={[usable - 0.05, 0.08, width * 0.82]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.05, 0.12, 8]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <Html position={[center, 0.25, width / 2]} center>
        <div className="rounded-md bg-slate-950/80 px-2 py-1 text-[10px] font-bold tracking-wide text-emerald-200">
          FREE BUFFER: {remaining.toFixed(2)} M
        </div>
      </Html>
    </group>
  );
}
