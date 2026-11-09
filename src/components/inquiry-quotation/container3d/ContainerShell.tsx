import React, { useEffect, useMemo } from 'react';
import { Edges, Html } from '@react-three/drei';
import * as THREE from 'three';
import { mmToMeters } from './coordinates';

function usePlankTexture(): THREE.CanvasTexture {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(0, 0, 512, 256);
      for (let plank = 0; plank < 8; plank += 1) {
        ctx.fillStyle = plank % 2 === 0 ? '#8d5a32' : '#5c3a22';
        ctx.fillRect(0, plank * 32, 512, 28);
        ctx.strokeStyle = 'rgba(40, 20, 8, 0.45)';
        ctx.beginPath();
        ctx.moveTo(0, plank * 32 + 28);
        ctx.lineTo(512, plank * 32 + 28);
        ctx.stroke();
      }
    }
    const next = new THREE.CanvasTexture(canvas);
    next.wrapS = THREE.RepeatWrapping;
    next.wrapT = THREE.RepeatWrapping;
    next.colorSpace = THREE.SRGBColorSpace;
    return next;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function Steel({ color = '#334155' }: { color?: string }) {
  return (
    <>
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.38} />
      <Edges color="#38bdf8" threshold={15} />
    </>
  );
}

export function ContainerShell({
  lengthMm,
  widthMm,
  heightM,
  openTop,
}: {
  lengthMm: number;
  widthMm: number;
  heightM: number;
  openTop: boolean;
}) {
  const length = mmToMeters(lengthMm);
  const width = mmToMeters(widthMm);
  const floor = usePlankTexture();
  floor.repeat.set(Math.max(2, Math.round(length)), 3);
  const post = 0.09;
  const rail = 0.07;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[length / 2, 0.02, width / 2]} receiveShadow>
        <planeGeometry args={[length - 0.08, width - 0.08]} />
        <meshStandardMaterial map={floor} roughness={0.92} metalness={0.02} />
      </mesh>

      {[0, length].flatMap((x) =>
        [0, width].map((z) => (
          <mesh key={`post-${x}-${z}`} position={[x, heightM / 2, z]}>
            <boxGeometry args={[post, heightM, post]} />
            <Steel />
          </mesh>
        ))
      )}
      {[0, heightM].flatMap((y) =>
        [0, width].map((z) => (
          <mesh key={`rail-x-${y}-${z}`} position={[length / 2, y, z]}>
            <boxGeometry args={[length, rail, rail]} />
            <Steel color="#1e293b" />
          </mesh>
        ))
      )}
      {[0, heightM].flatMap((y) =>
        [0, length].map((x) => (
          <mesh key={`rail-z-${y}-${x}`} position={[x, y, width / 2]}>
            <boxGeometry args={[rail, rail, width]} />
            <Steel color="#1e293b" />
          </mesh>
        ))
      )}
      {[0, length].flatMap((x) =>
        [0, width].flatMap((z) =>
          [0, heightM].map((y) => (
            <mesh key={`cast-${x}-${z}-${y}`} position={[x, y, z]}>
              <boxGeometry args={[0.16, 0.12, 0.16]} />
              <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.3} />
            </mesh>
          ))
        )
      )}

      <mesh position={[0.05, heightM / 2, width / 2]}>
        <boxGeometry args={[0.06, heightM * 0.92, width * 0.92]} />
        <meshStandardMaterial color="#b45309" roughness={0.62} metalness={0.2} />
        <Edges color="#38bdf8" threshold={15} />
      </mesh>
      <Html position={[0.2, heightM * 0.72, width / 2]} center>
        <span className="rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-950">FRONT BULKHEAD</span>
      </Html>

      {Array.from({ length: 10 }, (_, index) => (
        <mesh key={`corrugation-${index}`} position={[0.35 + index * ((length - 0.8) / 9), heightM / 2, width - 0.03]}>
          <boxGeometry args={[0.08, heightM * 0.88, 0.04]} />
          <meshStandardMaterial color={index % 2 === 0 ? '#475569' : '#334155'} metalness={0.45} roughness={0.45} />
        </mesh>
      ))}

      <mesh position={[length / 2, heightM / 2, 0.02]}>
        <boxGeometry args={[length, heightM, 0.02]} />
        <meshStandardMaterial color="#7dd3fc" transparent opacity={0.12} metalness={0.15} roughness={0.05} side={THREE.DoubleSide} />
      </mesh>
      {!openTop && (
        <mesh position={[length / 2, heightM - 0.01, width / 2]}>
          <boxGeometry args={[length, 0.02, width]} />
          <meshStandardMaterial color="#7dd3fc" transparent opacity={0.12} metalness={0.15} roughness={0.05} side={THREE.DoubleSide} />
        </mesh>
      )}

      {[0.28, 0.72].map((ratio) => (
        <group key={`door-${ratio}`}>
          <mesh position={[length - 0.03, heightM / 2, width * ratio]}>
            <boxGeometry args={[0.05, heightM * 0.9, width * 0.42]} />
            <meshStandardMaterial color="#1d4ed8" metalness={0.4} roughness={0.35} />
            <Edges color="#38bdf8" threshold={15} />
          </mesh>
          <mesh position={[length - 0.06, heightM / 2, width * ratio]}>
            <boxGeometry args={[0.02, heightM * 0.72, 0.03]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.6} roughness={0.25} />
          </mesh>
        </group>
      ))}
      <Html position={[length + 0.15, heightM * 0.2, width / 2]} center>
        <span className="rounded bg-blue-600/90 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">CONTAINER DOORS</span>
      </Html>

      <Html position={[length / 2, -0.35, width + 0.15]} center>
        <span className="rounded bg-slate-950/80 px-2 py-1 text-[11px] font-bold text-sky-100">
          {Math.round(widthMm).toLocaleString()} mm × {Math.round(lengthMm).toLocaleString()} mm
        </span>
      </Html>
      <Html position={[length / 2, 0.15, -0.35]} center>
        <span className="text-[10px] font-semibold text-slate-300">Grid: 1 m sections</span>
      </Html>
    </group>
  );
}
