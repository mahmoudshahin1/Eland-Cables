import React, { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
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
        ctx.fillStyle = plank % 2 === 0 ? '#8d5a32' : '#704422';
        ctx.fillRect(0, plank * 32, 512, 30);
        ctx.strokeStyle = 'rgba(40, 20, 8, 0.35)';
        ctx.beginPath();
        ctx.moveTo(0, plank * 32);
        ctx.lineTo(512, plank * 32);
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
  floor.repeat.set(Math.max(2, length / 1.2), 2);
  const near = React.useRef<THREE.MeshStandardMaterial>(null);
  const far = React.useRef<THREE.MeshStandardMaterial>(null);
  const { camera } = useThree();

  useFrame(() => {
    const facingNear = camera.position.z < width / 2;
    if (near.current) near.current.opacity = facingNear ? 0.08 : 0.4;
    if (far.current) far.current.opacity = facingNear ? 0.4 : 0.08;
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[length / 2, 0, width / 2]} receiveShadow>
        <planeGeometry args={[length, width]} />
        <meshStandardMaterial map={floor} roughness={0.9} metalness={0.02} />
      </mesh>
      <gridHelper
        args={[Math.max(length, width), Math.max(4, Math.round(length)), '#64748b', '#1e293b']}
        position={[length / 2, 0.012, width / 2]}
      />
      <mesh position={[0.04, heightM / 2, width / 2]}>
        <boxGeometry args={[0.08, heightM, width]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.6} />
      </mesh>
      <mesh position={[length - 0.03, heightM / 2, width * 0.26]}>
        <boxGeometry args={[0.05, heightM * 0.92, width * 0.46]} />
        <meshStandardMaterial color="#3b82f6" metalness={0.35} roughness={0.4} />
      </mesh>
      <mesh position={[length - 0.03, heightM / 2, width * 0.74]}>
        <boxGeometry args={[0.05, heightM * 0.92, width * 0.46]} />
        <meshStandardMaterial color="#2563eb" metalness={0.35} roughness={0.4} />
      </mesh>
      <mesh position={[length / 2, heightM / 2, 0.02]}>
        <boxGeometry args={[length, heightM, 0.03]} />
        <meshStandardMaterial ref={near} color="#94a3b8" transparent opacity={0.12} metalness={0.6} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[length / 2, heightM / 2, width - 0.02]}>
        <boxGeometry args={[length, heightM, 0.03]} />
        <meshStandardMaterial ref={far} color="#94a3b8" transparent opacity={0.4} metalness={0.6} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      {!openTop && (
        <mesh position={[length / 2, heightM, width / 2]}>
          <boxGeometry args={[length, 0.04, width]} />
          <meshStandardMaterial color="#0f172a" transparent opacity={0.16} metalness={0.5} roughness={0.4} />
        </mesh>
      )}
    </group>
  );
}
