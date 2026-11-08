import React, { useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { mmToMeters } from './coordinates';

export function FreeBufferZone({
  usedLengthMm,
  usableLengthMm,
  widthMm,
  loadPercent,
}: {
  usedLengthMm: number;
  usableLengthMm: number;
  widthMm: number;
  loadPercent?: number;
}) {
  const used = mmToMeters(usedLengthMm);
  const usable = mmToMeters(usableLengthMm);
  const width = mmToMeters(widthMm);
  const remaining = Math.max(0, usable - used);
  const shift = useRef(0);
  const life = useRef(0);
  const arrow = useRef<any>(null);
  const { invalidate } = useThree();

  useFrame((_, delta) => {
    if (remaining < 0.2) return;
    life.current += delta;
    if (life.current > 8) return;
    shift.current = (shift.current + delta * 0.35) % 1;
    if (arrow.current) arrow.current.position.x = used + 0.15 + shift.current * Math.max(0.2, remaining - 0.3);
    invalidate();
  });

  if (remaining < 0.2) return null;
  const center = used + remaining / 2;
  const percent = loadPercent != null && Number.isFinite(loadPercent) ? Math.round(loadPercent) : Math.round((used / Math.max(usable, 0.01)) * 100);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center, 0.03, width / 2]}>
        <planeGeometry args={[remaining, Math.max(0.2, width - 0.2)]} />
        <meshStandardMaterial color="#34d399" emissive="#059669" emissiveIntensity={0.55} transparent opacity={0.34} />
      </mesh>
      <mesh ref={arrow} position={[used + 0.2, 0.12, width * 0.5]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.08, 0.18, 10]} />
        <meshStandardMaterial color="#a7f3d0" emissive="#34d399" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[center, 0.1, width * 0.82]}>
        <boxGeometry args={[Math.max(0.2, remaining - 0.2), 0.015, 0.015]} />
        <meshStandardMaterial color="#ecfdf5" />
      </mesh>
      <Html position={[center, 0.55, width / 2]} center>
        <div className="rounded-xl border border-emerald-300/40 bg-slate-950/75 px-3 py-2 text-center shadow-xl backdrop-blur-md">
          <p className="text-[10px] font-bold tracking-[0.14em] text-emerald-200">FREE BUFFER</p>
          <p className="text-lg font-black text-white">{remaining.toFixed(2)} m</p>
          <p className="text-[11px] font-semibold text-cyan-200">{percent}% loaded</p>
        </div>
      </Html>
    </group>
  );
}
