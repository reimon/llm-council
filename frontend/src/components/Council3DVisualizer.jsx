import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

// Color themes per stage
const STAGE_COLORS = {
  1: { core: 0x00e5ff, ring: 0x00b4d8, particle: 0x90e0ef }, // Stage 1: Cyan / Electric Blue
  2: { core: 0xa855f7, ring: 0x9333ea, particle: 0xe879f9 }, // Stage 2: Deliberation Violet
  3: { core: 0xf59e0b, ring: 0xd97706, particle: 0xfde047 }, // Stage 3: Sovereign Gold / Amber
  done: { core: 0x10b981, ring: 0x059669, particle: 0x6ee7b7 }, // Completed: Emerald
};

// Branded member colors
const MEMBER_PALETTE = [
  0x00e5ff, // Electric Cyan
  0xa855f7, // Royal Purple
  0x10b981, // Emerald Green
  0xf59e0b, // Amber Gold
  0xec4899, // Pink / Rose
  0x3b82f6, // Blue
  0x14b8a6, // Teal
];

export default function Council3DVisualizer({
  members = [],
  chairman = null,
  activeStage = 1,
  isComplete = false,
  selectedModel = null,
  onSelectModel = null,
  autoRotateDefault = true,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [autoRotate, setAutoRotate] = useState(autoRotateDefault);
  const [hoveredModel, setHoveredModel] = useState(null);
  const [nodePositions, setNodePositions] = useState([]);

  // Mutable refs for Three.js state
  const stateRef = useRef({
    scene: null,
    camera: null,
    renderer: null,
    animId: null,
    coreMesh: null,
    coreWireframe: null,
    coreRings: [],
    memberMeshes: [],
    beamLines: [],
    dataPackets: [],
    starField: null,
    floorGrid: null,
    isDragging: false,
    prevPointer: { x: 0, y: 0 },
    spherical: { radius: 14.5, theta: Math.PI / 4, phi: Math.PI / 3 },
    targetSpherical: { radius: 14.5, theta: Math.PI / 4, phi: Math.PI / 3 },
    clock: new THREE.Clock(),
    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2(-999, -999),
  });

  // Setup Three.js scene on mount
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = container.clientWidth || 700;
    const height = container.clientHeight || 360;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0c1020, 0.025);
    stateRef.current.scene = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 100);
    stateRef.current.camera = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    stateRef.current.renderer = renderer;

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(10, 15, 10);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x6366f1, 0.8);
    dirLight2.position.set(-10, -5, -10);
    scene.add(dirLight2);

    const coreLight = new THREE.PointLight(0x00e5ff, 2.5, 18);
    coreLight.position.set(0, 0, 0);
    scene.add(coreLight);
    stateRef.current.coreLight = coreLight;

    // 5. Starfield / Ambient Particles
    const starCount = 350;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPos[i] = (Math.random() - 0.5) * 45;
      starPos[i + 1] = (Math.random() - 0.5) * 28;
      starPos[i + 2] = (Math.random() - 0.5) * 45;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x818cf8,
      size: 0.16,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);
    stateRef.current.starField = starField;

    // 6. Holographic Deliberation Floor Rings
    const floorGroup = new THREE.Group();
    floorGroup.position.y = -2.2;
    floorGroup.rotation.x = Math.PI / 2;

    const ringRadii = [3.0, 5.2, 7.4];
    ringRadii.forEach((r, idx) => {
      const ringGeo = new THREE.RingGeometry(r - 0.03, r + 0.03, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: idx === 1 ? 0x6366f1 : 0x2e3860,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: idx === 1 ? 0.35 : 0.18,
      });
      floorGroup.add(new THREE.Mesh(ringGeo, ringMat));
    });
    scene.add(floorGroup);
    stateRef.current.floorGrid = floorGroup;

    // 7. Central Core (Chairman / Consensus Hub)
    const coreGroup = new THREE.Group();

    // Inner glowing sphere
    const coreGeo = new THREE.SphereGeometry(1.15, 32, 32);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00b4d8,
      emissiveIntensity: 0.75,
      roughness: 0.2,
      metalness: 0.8,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreGroup.add(coreMesh);
    stateRef.current.coreMesh = coreMesh;

    // Outer geometric crystalline shell
    const outerGeo = new THREE.IcosahedronGeometry(1.5, 1);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
    });
    const coreWireframe = new THREE.Mesh(outerGeo, outerMat);
    coreGroup.add(coreWireframe);
    stateRef.current.coreWireframe = coreWireframe;

    // Rotating equator rings around core
    const coreRings = [];
    [1.85, 2.05].forEach((rad, i) => {
      const torusGeo = new THREE.TorusGeometry(rad, 0.025, 16, 64);
      const torusMat = new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.5 - i * 0.15,
      });
      const ring = new THREE.Mesh(torusGeo, torusMat);
      ring.rotation.x = i === 0 ? Math.PI / 2 : Math.PI / 3;
      coreGroup.add(ring);
      coreRings.push(ring);
    });
    stateRef.current.coreRings = coreRings;

    scene.add(coreGroup);
    stateRef.current.coreGroup = coreGroup;

    // Resize handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth || 700;
      const h = container.clientHeight || 360;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // Animation Loop
    const animate = () => {
      stateRef.current.animId = requestAnimationFrame(animate);

      const state = stateRef.current;
      const time = state.clock.getElapsedTime();

      // Camera Spherical Interpolation
      if (autoRotate && !state.isDragging) {
        state.targetSpherical.theta += 0.0035;
      }

      state.spherical.theta += (state.targetSpherical.theta - state.spherical.theta) * 0.08;
      state.spherical.phi += (state.targetSpherical.phi - state.spherical.phi) * 0.08;
      state.spherical.radius += (state.targetSpherical.radius - state.spherical.radius) * 0.08;

      const r = state.spherical.radius;
      const p = Math.max(0.15, Math.min(Math.PI - 0.25, state.spherical.phi));
      const t = state.spherical.theta;

      camera.position.x = r * Math.sin(p) * Math.sin(t);
      camera.position.y = r * Math.cos(p);
      camera.position.z = r * Math.sin(p) * Math.cos(t);
      camera.lookAt(0, 0, 0);

      // Core Breathing & Rotation
      if (state.coreGroup) {
        const pulse = 1.0 + Math.sin(time * 2.8) * 0.06;
        state.coreMesh.scale.set(pulse, pulse, pulse);
        state.coreWireframe.rotation.x = time * 0.2;
        state.coreWireframe.rotation.y = time * 0.35;

        state.coreRings.forEach((ring, idx) => {
          ring.rotation.z = time * (0.4 + idx * 0.2) * (idx % 2 === 0 ? 1 : -1);
        });
      }

      // Member Nodes Floating & Gyro Rotation
      state.memberMeshes.forEach((item, idx) => {
        const { group, gyroRing, auraSphere, data } = item;
        const isThinking = data?.status === 'thinking';
        const isDone = data?.status === 'completed';

        // Floating vertical oscillation
        const bobSpeed = isThinking ? 3.5 : 1.8;
        const bobAmp = isThinking ? 0.22 : 0.12;
        group.position.y = Math.sin(time * bobSpeed + idx * 1.3) * bobAmp;

        // Gyro ring spin
        const ringSpeed = isThinking ? 4.0 : 1.2;
        gyroRing.rotation.x += 0.015 * ringSpeed;
        gyroRing.rotation.y += 0.02 * ringSpeed;

        // Aura pulse
        if (isThinking) {
          const auraScale = 1.0 + Math.sin(time * 4.5 + idx) * 0.18;
          auraSphere.scale.set(auraScale, auraScale, auraScale);
          auraSphere.material.opacity = 0.35 + Math.sin(time * 4.5) * 0.15;
        } else if (isDone) {
          auraSphere.scale.set(1.05, 1.05, 1.05);
          auraSphere.material.opacity = 0.25;
        }
      });

      // Flowing Data Packets
      state.dataPackets.forEach((pkt) => {
        pkt.progress += pkt.speed;
        if (pkt.progress > 1) pkt.progress = 0;

        const p1 = pkt.startPos;
        const p2 = pkt.endPos;
        pkt.mesh.position.lerpVectors(p1, p2, pkt.progress);
        // arc slightly
        pkt.mesh.position.y += Math.sin(pkt.progress * Math.PI) * 0.6;
      });

      // Ambient Starfield Drift
      if (state.starField) {
        state.starField.rotation.y = time * 0.02;
      }
      if (state.floorGrid) {
        state.floorGrid.rotation.z = -time * 0.015;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (stateRef.current.animId) {
        cancelAnimationFrame(stateRef.current.animId);
      }
      renderer.dispose();
    };
  }, []);

  // Update Core & Synapses Colors on activeStage Change
  useEffect(() => {
    const state = stateRef.current;
    if (!state.scene || !state.coreMesh) return;

    const theme = isComplete ? STAGE_COLORS.done : STAGE_COLORS[activeStage] || STAGE_COLORS[1];

    state.coreMesh.material.color.setHex(theme.core);
    state.coreMesh.material.emissive.setHex(theme.ring);
    state.coreWireframe.material.color.setHex(theme.core);
    state.coreRings.forEach((r) => r.material.color.setHex(theme.ring));
    if (state.coreLight) state.coreLight.color.setHex(theme.core);
  }, [activeStage, isComplete]);

  // Rebuild / Update Member Orbs when `members` array changes
  useEffect(() => {
    const state = stateRef.current;
    if (!state.scene) return;

    // Remove existing member groups and beams
    state.memberMeshes.forEach((item) => state.scene.remove(item.group));
    state.memberMeshes = [];

    state.beamLines.forEach((line) => state.scene.remove(line));
    state.beamLines = [];

    state.dataPackets.forEach((pkt) => state.scene.remove(pkt.mesh));
    state.dataPackets = [];

    const activeList = members.length > 0 ? members : [
      { name: 'Model 1', role: 'generalist', status: 'thinking' },
      { name: 'Model 2', role: 'contrarian', status: 'thinking' },
      { name: 'Model 3', role: 'first_principles', status: 'thinking' },
      { name: 'Model 4', role: 'executor', status: 'thinking' },
    ];

    const N = activeList.length;
    const orbitRadius = 5.4;
    const newPositions = [];

    activeList.forEach((member, i) => {
      const angle = (2 * Math.PI * i) / N - Math.PI / 2;
      const x = Math.cos(angle) * orbitRadius;
      const z = Math.sin(angle) * orbitRadius;
      const y = 0;

      const memberGroup = new THREE.Group();
      memberGroup.position.set(x, y, z);
      memberGroup.userData = { model: member.name, index: i };

      const colorHex = MEMBER_PALETTE[i % MEMBER_PALETTE.length];
      const isDone = member.status === 'completed';
      const isThinking = member.status === 'thinking';

      // 1. Core Sphere
      const sphereGeo = new THREE.SphereGeometry(0.52, 28, 28);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: isDone ? 0x10b981 : colorHex,
        emissive: isDone ? 0x059669 : isThinking ? colorHex : 0x1e293b,
        emissiveIntensity: isThinking ? 0.9 : isDone ? 0.7 : 0.25,
        roughness: 0.25,
        metalness: 0.7,
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.userData = { model: member.name };
      memberGroup.add(sphere);

      // 2. Translucent Aura Shell
      const auraGeo = new THREE.SphereGeometry(0.72, 20, 20);
      const auraMat = new THREE.MeshBasicMaterial({
        color: isDone ? 0x10b981 : colorHex,
        transparent: true,
        opacity: isThinking ? 0.35 : 0.15,
        wireframe: true,
      });
      const auraSphere = new THREE.Mesh(auraGeo, auraMat);
      memberGroup.add(auraSphere);

      // 3. Gyroscope Orbital Ring
      const torusGeo = new THREE.TorusGeometry(0.95, 0.022, 14, 40);
      const torusMat = new THREE.MeshBasicMaterial({
        color: isDone ? 0x34d399 : colorHex,
        transparent: true,
        opacity: 0.65,
      });
      const gyroRing = new THREE.Mesh(torusGeo, torusMat);
      memberGroup.add(gyroRing);

      state.scene.add(memberGroup);

      state.memberMeshes.push({
        group: memberGroup,
        sphere,
        auraSphere,
        gyroRing,
        data: member,
        basePos: new THREE.Vector3(x, y, z),
      });

      // 4. Synapse Beam Line to Core
      const points = [new THREE.Vector3(x, y, z), new THREE.Vector3(0, 0, 0)];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: isThinking ? colorHex : 0x334155,
        transparent: true,
        opacity: isThinking ? 0.55 : 0.25,
      });
      const beamLine = new THREE.Line(lineGeo, lineMat);
      state.scene.add(beamLine);
      state.beamLines.push(beamLine);

      // 5. Traveling Data Packets
      const packetGeo = new THREE.SphereGeometry(0.08, 12, 12);
      const packetMat = new THREE.MeshBasicMaterial({
        color: isDone ? 0x34d399 : colorHex,
        transparent: true,
        opacity: 0.9,
      });
      const packetMesh = new THREE.Mesh(packetGeo, packetMat);
      state.scene.add(packetMesh);

      state.dataPackets.push({
        mesh: packetMesh,
        startPos: isDone ? new THREE.Vector3(x, y, z) : new THREE.Vector3(0, 0, 0),
        endPos: isDone ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(x, y, z),
        progress: (i / N),
        speed: 0.012 + (i % 3) * 0.003,
      });

      newPositions.push({ name: member.name, x, z, index: i });
    });

    // In Stage 2: Add Cross-Evaluation Mesh between members
    if (activeStage === 2) {
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const pA = state.memberMeshes[i].basePos;
          const pB = state.memberMeshes[j].basePos;
          const crossGeo = new THREE.BufferGeometry().setFromPoints([pA, pB]);
          const crossMat = new THREE.LineBasicMaterial({
            color: 0xa855f7,
            transparent: true,
            opacity: 0.35,
          });
          const crossLine = new THREE.Line(crossGeo, crossMat);
          state.scene.add(crossLine);
          state.beamLines.push(crossLine);
        }
      }
    }

    setNodePositions(newPositions);
  }, [members, activeStage]);

  // Pointer Interaction Handlers (Orbit Drag & Hover)
  const handlePointerDown = (e) => {
    stateRef.current.isDragging = true;
    stateRef.current.prevPointer = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e) => {
    const state = stateRef.current;
    if (state.isDragging) {
      const dx = e.clientX - state.prevPointer.x;
      const dy = e.clientY - state.prevPointer.y;
      state.prevPointer = { x: e.clientX, y: e.clientY };

      state.targetSpherical.theta -= dx * 0.008;
      state.targetSpherical.phi -= dy * 0.008;
      // Clamp phi to prevent inversion
      state.targetSpherical.phi = Math.max(0.2, Math.min(Math.PI - 0.25, state.targetSpherical.phi));
      return;
    }

    // Raycast hover
    if (!canvasRef.current || !state.camera) return;
    const rect = canvasRef.current.getBoundingClientRect();
    state.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    state.raycaster.setFromCamera(state.mouse, state.camera);
    const meshes = state.memberMeshes.map((m) => m.sphere);
    const intersects = state.raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
      const modelName = intersects[0].object.userData.model;
      setHoveredModel(modelName);
      if (canvasRef.current) canvasRef.current.style.cursor = 'pointer';
    } else {
      setHoveredModel(null);
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
    }
  };

  const handlePointerUp = () => {
    stateRef.current.isDragging = false;
  };

  const handleClick = (e) => {
    const state = stateRef.current;
    if (!canvasRef.current || !state.camera) return;
    const rect = canvasRef.current.getBoundingClientRect();
    state.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    state.raycaster.setFromCamera(state.mouse, state.camera);
    const meshes = state.memberMeshes.map((m) => m.sphere);
    const intersects = state.raycaster.intersectObjects(meshes);

    if (intersects.length > 0 && onSelectModel) {
      const modelName = intersects[0].object.userData.model;
      onSelectModel(modelName);
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const state = stateRef.current;
    state.targetSpherical.radius += e.deltaY * 0.012;
    state.targetSpherical.radius = Math.max(8.0, Math.min(22.0, state.targetSpherical.radius));
  };

  const resetView = () => {
    stateRef.current.targetSpherical = { radius: 14.5, theta: Math.PI / 4, phi: Math.PI / 3 };
  };

  return (
    <div
      ref={containerRef}
      className="council-3d-container"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClick={handleClick}
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} className="council-3d-canvas" />

      {/* Floating Center Badge for Deliberation Hub */}
      <div className="hologram-center-badge">
        <div className={`core-glow-indicator stage-${activeStage}`} />
        <span className="core-title">
          {activeStage === 3 ? (chairman?.name || 'Presidente') : 'Conselho Deliberativo'}
        </span>
      </div>

      {/* 3D Scene Controls HUD */}
      <div className="council-3d-controls">
        <button
          type="button"
          className={`c3d-btn ${autoRotate ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setAutoRotate((prev) => !prev);
          }}
          title="Auto-rotacionar câmara"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
          </svg>
          <span>{autoRotate ? 'Auto' : 'Pausado'}</span>
        </button>

        <button
          type="button"
          className="c3d-btn"
          onClick={(e) => {
            e.stopPropagation();
            resetView();
          }}
          title="Centralizar visão"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
          <span>Recentralizar</span>
        </button>
      </div>

      {/* Hover Info Tooltip */}
      {hoveredModel && (
        <div className="c3d-hover-tag">
          <span className="dot pulse" />
          <strong>{hoveredModel}</strong>
        </div>
      )}
    </div>
  );
}
