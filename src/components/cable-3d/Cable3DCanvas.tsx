import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Cable3DConfig } from './cablePresets';
import { calculateCableSpecs } from './cable3dCalculations';

export interface Cable3DCanvasProps {
  config: Cable3DConfig;
  viewMode: 'cutaway' | 'slice' | 'exploded' | 'full';
  wireframe?: boolean;
  autoRotate?: boolean;
  cameraPreset?: 'iso' | 'front' | 'side' | 'top';
  onHoverLayer?: (layer: { name: string; description: string; thickness: string } | null) => void;
  activeHighlight?: string | null;
  className?: string;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

// IEC 60446 Phase colors
const PHASE_COLORS: { hex: number; name: string; tag: string }[] = [
  { hex: 0x8b4513, name: 'Phase L1 (Brown)', tag: 'Brown' },
  { hex: 0x1e90ff, name: 'Neutral / Phase L2 (Blue)', tag: 'Blue' },
  { hex: 0x708090, name: 'Phase L3 (Grey)', tag: 'Grey' },
  { hex: 0x1a1a1a, name: 'Phase L2 (Black)', tag: 'Black' },
  { hex: 0x2e7d32, name: 'Earth (Green/Yellow)', tag: 'Green/Yellow' },
];

export const Cable3DCanvas: React.FC<Cable3DCanvasProps> = ({
  config,
  viewMode = 'cutaway',
  wireframe = false,
  autoRotate = false,
  cameraPreset = 'iso',
  onHoverLayer,
  activeHighlight,
  className = '',
  onCanvasReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cableGroupRef = useRef<THREE.Group | null>(null);
  const interactiveMeshesRef = useRef<{ mesh: THREE.Mesh; info: { name: string; description: string; thickness: string } }[]>([]);
  const animFrameIdRef = useRef<number | null>(null);
  const [internalHover, setInternalHover] = useState<{ name: string; desc: string } | null>(null);

  // Helper to generate printed sheath texture with brand and specs
  const createSheathTexture = useCallback((cfg: Cable3DConfig) => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background color based on sheathColor
    const colorMap: Record<string, string> = {
      Black: '#151516',
      Red: '#8b1e1e',
      Orange: '#c25e00',
      Blue: '#153d77',
      Grey: '#3a3f45',
    };
    ctx.fillStyle = colorMap[cfg.sheathColor] || '#151516';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle texture noise / sheen
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 200; i++) {
      ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 4, 4);
    }

    // Embossed Cable Printing text (repeating along the length)
    const text = `ENERGYA CABLES  •  ${cfg.voltageRating}  •  ${cfg.description}  •  ${cfg.standard}  •  CE  [2026]  •  METRE `;
    ctx.font = 'bold 32px "Courier New", monospace';
    ctx.fillStyle = cfg.sheathColor === 'Black' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.85)';
    ctx.textBaseline = 'middle';

    for (let x = 40; x < canvas.width; x += 900) {
      ctx.fillText(text, x, 256);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    return texture;
  }, []);

  // Set camera view preset
  const setCameraPreset = useCallback((preset: 'iso' | 'front' | 'side' | 'top') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    ctrl.target.set(0, 0, 0);

    switch (preset) {
      case 'iso':
        cam.position.set(14, 9, 14);
        break;
      case 'front':
        cam.position.set(0, 0, 18);
        break;
      case 'side':
        cam.position.set(18, 0, 0);
        break;
      case 'top':
        cam.position.set(0, 18, 0.1);
        break;
    }
    cam.lookAt(0, 0, 0);
    ctrl.update();
  }, []);

  // Re-build 3D Cable geometry when config or viewMode changes
  const buildCableGeometry = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (cableGroupRef.current) {
      scene.remove(cableGroupRef.current);
    }

    const cableGroup = new THREE.Group();
    cableGroupRef.current = cableGroup;
    interactiveMeshesRef.current = [];

    const specs = calculateCableSpecs(config);
    const { cores, conductorMaterial, voltageClass, insulation, screen, bedding, armour, sheathColor } = config;

    // Unit scaling: 1mm = 0.16 scene units
    const scale = 0.16;
    const totalCableLength = 16.0;

    // Length cutoffs along Z axis (from -8 to +8)
    // In cutaway mode, layers step back progressively:
    const isCutaway = viewMode === 'cutaway';
    const isExploded = viewMode === 'exploded';
    const isSlice = viewMode === 'slice';

    // Offsets for exploded view
    const expZ = isExploded ? 1.4 : 0;

    const zBack = -totalCableLength / 2; // -8.0
    const zOuterEnd = isCutaway ? -1.0 : (isSlice ? 0.2 : totalCableLength / 2);
    const zArmourEnd = isCutaway ? 1.5 : (isSlice ? 0.2 : totalCableLength / 2);
    const zBeddingEnd = isCutaway ? 3.5 : (isSlice ? 0.2 : totalCableLength / 2);
    const zInsulationEnd = isCutaway ? 5.8 : (isSlice ? 0.2 : totalCableLength / 2);
    const zConductorEnd = isSlice ? 0.2 : totalCableLength / 2; // +8.0

    // Radii in scene units
    const rCond = (specs.conductorDiameterMm / 2) * scale;
    const rIns = rCond + specs.insulationThicknessMm * scale;
    const rBedding = (specs.conductorDiameterMm / 2 + specs.insulationThicknessMm + specs.beddingThicknessMm + (cores > 1 ? rIns * 0.4 : 0)) * scale * (cores === 1 ? 1.15 : (cores === 2 ? 1.9 : (cores === 3 ? 2.15 : 2.4)));
    const rArmourWire = (specs.armourWireDiameterMm / 2) * scale;
    const rOuter = (specs.approxOverallDiameterMm / 2) * scale;

    // Shared Materials
    const condColor = conductorMaterial === 'Aluminium' ? 0xdcdde1 : (conductorMaterial === 'Tinned Copper' ? 0xa8a8b0 : 0xc87533);
    const conductorMat = new THREE.MeshStandardMaterial({
      color: condColor,
      metalness: 0.88,
      roughness: 0.22,
      wireframe,
    });

    const semiConMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.85,
      metalness: 0.1,
      wireframe,
    });

    const copperTapeMat = new THREE.MeshStandardMaterial({
      color: 0xd35400,
      metalness: 0.92,
      roughness: 0.25,
      wireframe,
    });

    const beddingMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      roughness: 0.7,
      metalness: 0.05,
      wireframe,
    });

    const armourWireMat = new THREE.MeshStandardMaterial({
      color: armour === 'AWA' ? 0xdcdde1 : 0xbdc3c7,
      metalness: 0.85,
      roughness: 0.35,
      wireframe,
    });

    const sheathTexture = createSheathTexture(config);
    const sheathMat = new THREE.MeshStandardMaterial({
      map: sheathTexture || undefined,
      color: sheathTexture ? 0xffffff : (sheathColor === 'Red' ? 0x962d2d : (sheathColor === 'Orange' ? 0xd35400 : 0x1c1d21)),
      roughness: 0.55,
      metalness: 0.05,
      wireframe,
    });

    // Helper to register interactive mesh
    const registerMesh = (mesh: THREE.Mesh, name: string, description: string, thickness: string) => {
      interactiveMeshesRef.current.push({ mesh, info: { name, description, thickness } });
    };

    // 1. OUTER SHEATH
    const outerLen = Math.max(0.2, (zOuterEnd - zBack));
    const outerGeo = new THREE.CylinderGeometry(rOuter, rOuter, outerLen, 48, 1, false);
    const outerMesh = new THREE.Mesh(outerGeo, sheathMat);
    outerMesh.rotation.x = Math.PI / 2;
    outerMesh.position.z = (zBack + zOuterEnd) / 2 - (isExploded ? expZ * 3 : 0);
    outerMesh.castShadow = true;
    outerMesh.receiveShadow = true;
    cableGroup.add(outerMesh);
    registerMesh(
      outerMesh,
      `Outer Sheath (${config.outerSheath})`,
      `${config.sheathColor} protective jacket providing mechanical, UV, water, and chemical resistance.`,
      `${specs.outerSheathThicknessMm} mm`
    );

    // 2. ARMOUR LAYER
    if (armour !== 'Unarmoured' && specs.armourWireDiameterMm > 0) {
      const armourLen = Math.max(0.2, (zArmourEnd - zBack));
      const armourZCenter = (zBack + zArmourEnd) / 2 - (isExploded ? expZ * 2 : 0);

      if (armour === 'SWA' || armour === 'AWA') {
        const wireCount = Math.floor((2 * Math.PI * rBedding) / (rArmourWire * 2.1));
        const armourGroup = new THREE.Group();

        for (let i = 0; i < wireCount; i++) {
          const angle = (i / wireCount) * Math.PI * 2;
          const x = Math.cos(angle) * (rBedding + rArmourWire);
          const y = Math.sin(angle) * (rBedding + rArmourWire);

          const wireGeo = new THREE.CylinderGeometry(rArmourWire, rArmourWire, armourLen, 12);
          const wireMesh = new THREE.Mesh(wireGeo, armourWireMat);
          wireMesh.rotation.x = Math.PI / 2;
          wireMesh.position.set(x, y, 0);
          wireMesh.castShadow = true;
          armourGroup.add(wireMesh);
        }
        armourGroup.position.z = armourZCenter;
        cableGroup.add(armourGroup);
      } else if (armour === 'STA') {
        const tapeGeo = new THREE.CylinderGeometry(rBedding + rArmourWire, rBedding + rArmourWire, armourLen, 40);
        const tapeMesh = new THREE.Mesh(tapeGeo, armourWireMat);
        tapeMesh.rotation.x = Math.PI / 2;
        tapeMesh.position.z = armourZCenter;
        cableGroup.add(tapeMesh);
        registerMesh(
          tapeMesh,
          'Double Steel Tape Armour (STA)',
          'Overlapping helical galvanized steel tapes offering rodent and radial crush protection.',
          '0.5 mm tape'
        );
      }
    }

    // 3. BEDDING / INNER SHEATH
    if (bedding !== 'None') {
      const beddingLen = Math.max(0.2, (zBeddingEnd - zBack));
      const beddingGeo = new THREE.CylinderGeometry(rBedding, rBedding, beddingLen, 36);
      const beddingMesh = new THREE.Mesh(beddingGeo, beddingMat);
      beddingMesh.rotation.x = Math.PI / 2;
      beddingMesh.position.z = (zBack + zBeddingEnd) / 2 - (isExploded ? expZ : 0);
      beddingMesh.castShadow = true;
      cableGroup.add(beddingMesh);
      registerMesh(
        beddingMesh,
        `Bedding / Inner Sheath (${config.bedding})`,
        'Extruded polymeric bedding compound forming a cylindrical boundary over the laid-up cores.',
        `${specs.beddingThicknessMm} mm`
      );
    }

    // 4. MULTI-CORE ASSEMBLY
    const corePitch = cores === 1 ? 0 : rIns * 1.05;
    const coreOffsets: { x: number; y: number; angle: number }[] = [];

    if (cores === 1) {
      coreOffsets.push({ x: 0, y: 0, angle: 0 });
    } else if (cores === 2) {
      coreOffsets.push({ x: -corePitch, y: 0, angle: 0 });
      coreOffsets.push({ x: corePitch, y: 0, angle: Math.PI });
    } else if (cores === 3) {
      for (let i = 0; i < 3; i++) {
        const a = (i * 2 * Math.PI) / 3 + Math.PI / 6;
        coreOffsets.push({ x: Math.cos(a) * corePitch, y: Math.sin(a) * corePitch, angle: a });
      }
    } else if (cores === 4) {
      for (let i = 0; i < 4; i++) {
        const a = (i * 2 * Math.PI) / 4 + Math.PI / 4;
        coreOffsets.push({ x: Math.cos(a) * corePitch, y: Math.sin(a) * corePitch, angle: a });
      }
    } else {
      for (let i = 0; i < cores; i++) {
        const a = (i * 2 * Math.PI) / cores;
        coreOffsets.push({ x: Math.cos(a) * corePitch * 1.15, y: Math.sin(a) * corePitch * 1.15, angle: a });
      }
    }

    coreOffsets.forEach((pos, idx) => {
      const coreGroup = new THREE.Group();
      const phaseInfo = PHASE_COLORS[idx % PHASE_COLORS.length];

      // A) Core Insulation Cylinder
      const insLen = Math.max(0.2, (zInsulationEnd - zBack));
      const insMat = new THREE.MeshStandardMaterial({
        color: phaseInfo.hex,
        roughness: 0.38,
        metalness: 0.08,
        wireframe,
      });

      const insGeo = new THREE.CylinderGeometry(rIns, rIns, insLen, 28);
      const insMesh = new THREE.Mesh(insGeo, insMat);
      insMesh.rotation.x = Math.PI / 2;
      insMesh.position.z = (zBack + zInsulationEnd) / 2;
      insMesh.castShadow = true;
      coreGroup.add(insMesh);
      registerMesh(
        insMesh,
        `Insulation — Core ${idx + 1}: ${phaseInfo.name}`,
        `${config.insulation} insulation rated for continuous 90°C conductor temperature (250°C short-circuit).`,
        `${specs.insulationThicknessMm} mm`
      );

      // B) Medium Voltage Screens (if MV)
      if (voltageClass === 'MV') {
        const semiConGeo = new THREE.CylinderGeometry(rCond + 0.15 * scale, rCond + 0.15 * scale, insLen + 0.6, 24);
        const semiConMesh = new THREE.Mesh(semiConGeo, semiConMat);
        semiConMesh.rotation.x = Math.PI / 2;
        semiConMesh.position.z = (zBack + zInsulationEnd) / 2 + 0.3;
        coreGroup.add(semiConMesh);

        if (screen.includes('Copper Tape')) {
          const tapeGeo = new THREE.CylinderGeometry(rIns + 0.05 * scale, rIns + 0.05 * scale, insLen - 0.4, 24);
          const tapeMesh = new THREE.Mesh(tapeGeo, copperTapeMat);
          tapeMesh.rotation.x = Math.PI / 2;
          tapeMesh.position.z = (zBack + zInsulationEnd) / 2 - 0.2;
          coreGroup.add(tapeMesh);
          registerMesh(
            tapeMesh,
            'Metallic Copper Tape Screen (CTS)',
            'Helical copper tape screen carrying earth fault currents and maintaining radial electrical stress.',
            '0.1 mm copper tape'
          );
        }
      }

      // C) Conductor (Stranded metallic core)
      const condLen = Math.max(0.2, (zConductorEnd - zBack));
      const isStranded = config.conductorStranding.includes('Stranded');

      if (isStranded && rCond > 0.12) {
        // Multi-strand bundle (7 strands: 1 center + 6 outer)
        const strandRadius = rCond / 3.0;
        const strandGroup = new THREE.Group();

        // Center strand
        const centerGeo = new THREE.CylinderGeometry(strandRadius, strandRadius, condLen, 12);
        const centerMesh = new THREE.Mesh(centerGeo, conductorMat);
        centerMesh.rotation.x = Math.PI / 2;
        strandGroup.add(centerMesh);

        // 6 outer strands
        for (let s = 0; s < 6; s++) {
          const sa = (s * Math.PI) / 3;
          const sx = Math.cos(sa) * strandRadius * 2;
          const sy = Math.sin(sa) * strandRadius * 2;
          const sMesh = new THREE.Mesh(centerGeo, conductorMat);
          sMesh.rotation.x = Math.PI / 2;
          sMesh.position.set(sx, sy, 0);
          strandGroup.add(sMesh);
        }

        strandGroup.position.z = (zBack + zConductorEnd) / 2;
        coreGroup.add(strandGroup);
      } else {
        // Solid or small conductor
        const condGeo = new THREE.CylinderGeometry(rCond, rCond, condLen, 24);
        const condMesh = new THREE.Mesh(condGeo, conductorMat);
        condMesh.rotation.x = Math.PI / 2;
        condMesh.position.z = (zBack + zConductorEnd) / 2;
        coreGroup.add(condMesh);
      }

      // Polished Conductor Cut-Face on the tip
      const faceGeo = new THREE.CircleGeometry(rCond, 24);
      const faceMesh = new THREE.Mesh(faceGeo, conductorMat);
      faceMesh.position.z = zConductorEnd;
      coreGroup.add(faceMesh);
      registerMesh(
        faceMesh,
        `Conductor Core (${config.conductorMaterial})`,
        `${config.crossSectionMm2} mm² high-purity ${config.conductorMaterial} (${config.conductorStranding}).`,
        `Ø ${specs.conductorDiameterMm} mm`
      );

      // Position core
      coreGroup.position.set(pos.x, pos.y, 0);
      cableGroup.add(coreGroup);
    });

    // Add Cable group to scene
    scene.add(cableGroup);
  }, [config, viewMode, wireframe, createSheathTexture]);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x0b0f17); // Sleek modern dark studio background
    scene.fog = new THREE.FogExp2(0x0b0f17, 0.015);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(14, 9, 14);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    if (onCanvasReady) {
      onCanvasReady(renderer.domElement);
    }

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4;
    controls.maxDistance = 50;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.2;
    controlsRef.current = controls;

    // 5. Lighting Setup
    // Key Light
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(15, 20, 15);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    // Fill Light (soft cool blue)
    const fillLight = new THREE.DirectionalLight(0x70a1ff, 1.2);
    fillLight.position.set(-15, 10, -10);
    scene.add(fillLight);

    // Rim Light (sharp highlight on cable edge)
    const rimLight = new THREE.DirectionalLight(0xffa502, 1.0);
    rimLight.position.set(0, -15, -15);
    scene.add(rimLight);

    // Ambient Light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    // Soft Studio Grid Floor
    const grid = new THREE.GridHelper(30, 30, 0x1e293b, 0x0f172a);
    grid.position.y = -4.5;
    scene.add(grid);

    // 6. Raycaster for layer hover tooltip
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const meshesToTest = interactiveMeshesRef.current.map((item) => item.mesh);
      const intersects = raycaster.intersectObjects(meshesToTest, true);

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const entry = interactiveMeshesRef.current.find((item) => item.mesh === hit);
        if (entry) {
          setInternalHover({ name: entry.info.name, desc: `${entry.info.description} (Thickness: ${entry.info.thickness})` });
          if (onHoverLayer) onHoverLayer(entry.info);
          renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }
      setInternalHover(null);
      if (onHoverLayer) onHoverLayer(null);
      renderer.domElement.style.cursor = 'grab';
    };

    renderer.domElement.addEventListener('mousemove', onPointerMove);

    // 7. Render Loop
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 8. Resize Handler
    const onResize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('mousemove', onPointerMove);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      renderer.dispose();
    };
  }, []);

  // Update controls autoRotate
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  // Update camera preset
  useEffect(() => {
    if (cameraPreset) {
      setCameraPreset(cameraPreset);
    }
  }, [cameraPreset, setCameraPreset]);

  // Re-build geometry when config or viewMode changes
  useEffect(() => {
    buildCableGeometry();
  }, [buildCableGeometry]);

  return (
    <div className={`relative w-full h-full min-h-[460px] overflow-hidden select-none ${className}`}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Floating Layer Hover HUD */}
      {internalHover && (
        <div className="absolute bottom-5 left-5 max-w-sm bg-slate-900/90 backdrop-blur-md text-white border border-cyan-500/40 rounded-xl p-3.5 shadow-2xl pointer-events-none transition-all duration-200 animate-in fade-in">
          <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider mb-1">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            {internalHover.name}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{internalHover.desc}</p>
        </div>
      )}

      {/* Viewport Overlay Controls Guide */}
      <div className="absolute top-4 left-4 bg-slate-900/75 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-700/60 text-[11px] text-slate-300 flex items-center gap-3 shadow-md pointer-events-none">
        <span className="flex items-center gap-1 font-mono text-cyan-400">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> 3D PBR Studio
        </span>
        <span className="text-slate-500">|</span>
        <span>Left-click + Drag: Rotate</span>
        <span className="text-slate-500">|</span>
        <span>Scroll: Zoom</span>
        <span className="text-slate-500">|</span>
        <span>Right-click: Pan</span>
      </div>
    </div>
  );
};
