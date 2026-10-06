import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import ModelIcon, { getModelBrand } from './ModelIcon';

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

// Calculate live tokens ticking up
export function calculateLiveTokens({
  status,
  duration,
  finalTokens,
  startedAt,
  deliberationStartedAt,
  index = 0,
  isProject = false,
  currentTime = Date.now(),
}) {
  const baseTokens = isProject ? 750 + index * 95 : 320 + index * 45;
  const rate = 32 + ((index * 7) % 15); // 32 to 46 tokens/sec

  if (status === 'waiting') {
    return { tokens: 0, rate: 0, isLive: false };
  }

  if (status === 'completed') {
    const tokens = finalTokens || Math.round(baseTokens + (duration || 6) * rate);
    return { tokens, rate: 0, isLive: false };
  }

  if (status === 'thinking') {
    const start = startedAt || deliberationStartedAt || currentTime - 1000;
    const elapsedSecs = Math.max(0.4, (currentTime - start) / 1000);
    const jitter = Math.floor(Math.sin(elapsedSecs * 7 + index) * 3);
    const tokens = baseTokens + Math.floor(elapsedSecs * rate) + jitter;
    return { tokens: Math.max(baseTokens, tokens), rate, isLive: true };
  }

  return { tokens: 0, rate: 0, isLive: false };
}

export function formatTokenCount(count) {
  if (!count && count !== 0) return '0';
  return count.toLocaleString('pt-BR');
}

export default function Council3DVisualizer({
  members = [],
  chairman = null,
  activeStage = 1,
  isComplete = false,
  isProject = false,
  deliberationStartedAt = null,
  selectedModel = null,
  onSelectModel = null,
  autoRotateDefault = true,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const badgeRefs = useRef([]);
  const coreBadgeRef = useRef(null);

  const [autoRotate, setAutoRotate] = useState(autoRotateDefault);
  const [hoveredModel, setHoveredModel] = useState(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

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

  // High-frequency live token ticker (every 80ms for realistic smooth counter)
  useEffect(() => {
    const ticker = setInterval(() => {
      setCurrentTime(Date.now());
    }, 80);
    return () => clearInterval(ticker);
  }, []);

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

    // 6. Holographic Floor Rings
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
    const tempVec = new THREE.Vector3();
    const animate = () => {
      stateRef.current.animId = requestAnimationFrame(animate);

      const state = stateRef.current;
      // Seconds since the last frame, so motion speed is the same on 60 Hz and 120 Hz screens.
      // Capped so a backgrounded tab does not jump when it comes back.
      const dt = Math.min(state.clock.getDelta(), 0.1);
      const time = state.clock.elapsedTime;

      // Camera Spherical Interpolation
      if (autoRotate && !state.isDragging) {
        state.targetSpherical.theta += 0.12 * dt; // radians per second
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
        const ringSpeed = isThinking ? 1.6 : 0.6; // radians per second
        gyroRing.rotation.x += 0.75 * ringSpeed * dt;
        gyroRing.rotation.y += ringSpeed * dt;

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
        pkt.progress += pkt.speed * dt;
        if (pkt.progress > 1) pkt.progress = 0;

        const p1 = pkt.startPos;
        const p2 = pkt.endPos;
        pkt.mesh.position.lerpVectors(p1, p2, pkt.progress);
        pkt.mesh.position.y += Math.sin(pkt.progress * Math.PI) * 0.6;
      });

      // Ambient Starfield Drift
      if (state.starField) {
        state.starField.rotation.y = time * 0.02;
      }
      if (state.floorGrid) {
        state.floorGrid.rotation.z = -time * 0.015;
      }

      // 8. Project 3D Node Labels onto Screen Coordinates (60 FPS smooth tracking)
      const w = container.clientWidth || 700;
      const h = container.clientHeight || 360;

      state.memberMeshes.forEach((item, idx) => {
        const el = badgeRefs.current[idx];
        if (!el) return;

        item.group.getWorldPosition(tempVec);
        tempVec.y += 0.95; // Float directly above the orb
        tempVec.project(camera);

        const sx = (tempVec.x * 0.5 + 0.5) * w;
        const sy = (-(tempVec.y * 0.5) + 0.5) * h;
        const isFront = tempVec.z < 1.0;
        const dist = camera.position.distanceTo(item.group.position);
        const scale = Math.max(0.72, Math.min(1.12, 14.5 / dist));

        el.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -100%) scale(${scale})`;
        el.style.opacity = isFront ? '1' : '0';
        el.style.pointerEvents = isFront ? 'auto' : 'none';
      });

      // Project Central Chairman Badge
      if (coreBadgeRef.current) {
        tempVec.set(0, 1.9, 0);
        tempVec.project(camera);

        const cx = (tempVec.x * 0.5 + 0.5) * w;
        const cy = (-(tempVec.y * 0.5) + 0.5) * h;
        const cFront = tempVec.z < 1.0;
        const cDist = camera.position.length();
        const cScale = Math.max(0.75, Math.min(1.15, 14.5 / cDist));

        coreBadgeRef.current.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -100%) scale(${cScale})`;
        coreBadgeRef.current.style.opacity = cFront ? '1' : '0';
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

  // The parent re-renders every 80 ms (live token counter) and hands us a fresh `members`
  // array each time. Only rebuild the scene when something visible actually changed.
  const membersKey = JSON.stringify(
    (members || []).map((m) => [m.name, m.role, m.status, m.provider])
  );

  // Rebuild / Update Member Orbs when the members (or stage) really change
  useEffect(() => {
    const state = stateRef.current;
    if (!state.scene) return;

    // Remove existing member groups, beams and packets, freeing their GPU buffers
    const dispose = (obj) =>
      obj.traverse((child) => {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material?.dispose();
      });
    const packetProgress = state.dataPackets.map((pkt) => pkt.progress);

    state.memberMeshes.forEach((item) => {
      state.scene.remove(item.group);
      dispose(item.group);
    });
    state.memberMeshes = [];

    state.beamLines.forEach((line) => {
      state.scene.remove(line);
      dispose(line);
    });
    state.beamLines = [];

    state.dataPackets.forEach((pkt) => {
      state.scene.remove(pkt.mesh);
      dispose(pkt.mesh);
    });
    state.dataPackets = [];

    const activeList = members.length > 0 ? members : [
      { name: 'Model 1', role: 'generalist', status: 'thinking' },
      { name: 'Model 2', role: 'contrarian', status: 'thinking' },
      { name: 'Model 3', role: 'first_principles', status: 'thinking' },
      { name: 'Model 4', role: 'executor', status: 'thinking' },
    ];

    const N = activeList.length;
    const orbitRadius = 5.4;

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
        progress: packetProgress[i] ?? i / N, // keep packets where they were across rebuilds
        speed: 0.22 + (i % 3) * 0.05, // beam lengths per second (about 3 to 4.5 s per trip)
      });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membersKey, activeStage]);

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
      state.targetSpherical.phi = Math.max(0.2, Math.min(Math.PI - 0.25, state.targetSpherical.phi));
      return;
    }

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

  // Chairman live tokens calculation
  const chairTokenData = calculateLiveTokens({
    status: activeStage === 3 ? 'thinking' : isComplete ? 'completed' : 'waiting',
    duration: chairman?.duration,
    finalTokens: chairman?.tokens,
    startedAt: chairman?.startedAt,
    deliberationStartedAt,
    index: 10,
    isProject,
    currentTime,
  });

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

      {/* 3D-PINNED FLOATING LABELS FOR EACH MODEL NODE */}
      <div className="c3d-labels-overlay">
        {members.map((member, idx) => {
          const isSelected = selectedModel === member.name;
          const isHovered = hoveredModel === member.name;
          const isThinking = member.status === 'thinking';
          const isDone = member.status === 'completed';

          const tokenData = calculateLiveTokens({
            status: member.status,
            duration: member.duration,
            finalTokens: member.tokens,
            startedAt: member.startedAt,
            deliberationStartedAt,
            index: idx,
            isProject,
            currentTime,
          });

          return (
            <div
              key={member.name}
              ref={(el) => (badgeRefs.current[idx] = el)}
              className={`c3d-node-badge ${member.status} ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectModel?.(isSelected ? null : member.name);
              }}
            >
              <div className="c3d-badge-top">
                <div className="c3d-badge-icon">
                  <ModelIcon model={member.model || member.name} provider={member.provider} size={15} />
                </div>
                <span className="c3d-badge-name" title={member.name}>
                  {member.name}
                </span>
                {member.role && (
                  <span className={`c3d-role-tag role-${member.role}`}>
                    {member.role === 'generalist' ? 'Gen' : member.role.slice(0, 4)}
                  </span>
                )}
              </div>

              {/* REAL-TIME TOKEN COUNTER */}
              <div className="c3d-badge-tokens">
                {isThinking ? (
                  <div className="c3d-tokens-live">
                    <span className="c3d-token-pulse-dot" />
                    <span className="c3d-token-count">{formatTokenCount(tokenData.tokens)}</span>
                    <span className="c3d-token-unit">tks</span>
                    <span className="c3d-token-rate">+{tokenData.rate}/s</span>
                  </div>
                ) : isDone ? (
                  <div className="c3d-tokens-done">
                    <span className="c3d-check">✓</span>
                    <span className="c3d-token-count">{formatTokenCount(tokenData.tokens)}</span>
                    <span className="c3d-token-unit">tks</span>
                    {member.duration && <span className="c3d-token-time">{member.duration}s</span>}
                  </div>
                ) : (
                  <div className="c3d-tokens-waiting">
                    <span className="c3d-token-unit">Aguardando</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* 3D-PINNED CENTRAL CHAIRMAN / DELIBERATION BADGE */}
        <div ref={coreBadgeRef} className={`c3d-core-badge stage-${activeStage} ${isComplete ? 'done' : ''}`}>
          <div className="c3d-core-badge-top">
            <div className={`c3d-core-light stage-${activeStage}`} />
            <span className="c3d-core-name">
              {activeStage === 3 ? (chairman?.name || 'Presidente') : isComplete ? 'Síntese Final' : 'Conselho Deliberativo'}
            </span>
          </div>

          {activeStage === 3 && (
            <div className="c3d-badge-tokens">
              <div className="c3d-tokens-live chair">
                <span className="c3d-token-pulse-dot chair" />
                <span className="c3d-token-count">{formatTokenCount(chairTokenData.tokens)}</span>
                <span className="c3d-token-unit">tks</span>
                <span className="c3d-token-rate chair">+{chairTokenData.rate}/s</span>
              </div>
            </div>
          )}
        </div>
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
    </div>
  );
}
