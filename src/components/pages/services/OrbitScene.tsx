"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Trionn-style services-hero orbit — the real WebGL treatment (three.js via
 * @react-three/fiber, the same stack trionn.com renders its services ring
 * with), art-directed to the Maple palette:
 *
 *   • A wide elliptical orbit (unit ring, shallow X-tilt) fitted EXACTLY to
 *     the hero — the ring and its relics never leave the screen.
 *   • Six relics — one per discipline, each a literal read of its craft:
 *       0 AI ................ porcelain orb with a gold intelligence ring
 *       1 Web & App ......... gold layer stack (structure/stack)
 *       2 Product Design .... faceted gold gem (the cut object)
 *       3 Website & Mobile .. porcelain device frame with a gold notch
 *       4 Immersive & 3D .... gold torus knot (space folded on itself)
 *       5 Branding .......... the site's ✦ four-point star, extruded in gold
 *   • RoomEnvironment reflections make the gold/porcelain read as material,
 *     and maroon depth-fog melts the far arc into the hero ground.
 *   • Pointer movement retilts and yaws the rig (damped); hovering a
 *     discipline line — or nearing a relic — ignites it.
 */

const ORBIT_SPEED = 0.085; // rad/s — one lap ≈ 74s, matches the capture's drift
const NODE_LOCAL = 0.098; // relic size as a fraction of the orbit radius
const BASE_TILT_X = 0.29; // shallow opening — ellipse height ≈ 0.28 of width
const BASE_TILT_Z = -0.07; // the reference ring leans a touch anticlockwise

export type OrbitPointer = {
  /** 0..1 across the host (0.5 = centre) */
  px: number;
  py: number;
  /** NDC of the pointer within the host, for relic proximity tests */
  nx: number;
  ny: number;
};

/* Material palette — antique gold + cream porcelain on the maroon ground */
const GOLD = { color: "#c9a262", metalness: 1.0, roughness: 0.24, envMapIntensity: 1.25 };
const PORCELAIN = { color: "#fff3d3", metalness: 0.08, roughness: 0.4, envMapIntensity: 0.7 };

/* Per-relic motion voice: [selfSpinX, selfSpinY], resting orientation */
const SELF_SPIN: [number, number][] = [
  [0.1, 0.3],
  [0.05, 0.22],
  [0.14, 0.31],
  [0.04, 0.18],
  [0.12, 0.26],
  [0.05, 0.14],
];
const INIT_ROT: [number, number, number][] = [
  [0.25, 0.2, 0],
  [0.14, 0.35, 0.05],
  [0.4, 0.55, 0.2],
  [0.1, -0.3, 0.04],
  [0.55, 0.3, 0],
  [0.3, -0.2, 0.12],
];

/* Disassembled end state (trionn's services orbit): as the page scrolls the
   relics leave the ring for fixed seats at the screen PERIPHERY — three down
   each side at spread heights, framing the intro copy — while the guide
   ellipses fade out. Targets are fractions of the half-viewport (screen
   space), so the scatter composition holds on every aspect ratio. z nudges
   a few units toward the camera for a hint of approach. */
const SCATTER_TARGET: [number, number, number][] = [
  [-0.86, 0.58, 3],
  [0.87, 0.62, 2],
  [-0.92, -0.02, 4],
  [0.93, 0.04, 2.5],
  [-0.8, -0.6, 3.5],
  [0.85, -0.56, 2],
];
/** Extra settle-rotation each relic picks up while detaching. */
const SCATTER_TUMBLE = [0.6, -0.8, 1.1, -0.5, 0.9, -0.7];

/* Entrance choreography: on load the relics arrive ONE BY ONE — each glides
   in radially from outside the ring while growing from nothing, takes its
   seat, and the orbit's drift carries on beneath it. */
const INTRO_START = 0.2; // s before the first relic sets off
const INTRO_STAGGER = 0.3; // s between consecutive relics
const INTRO_TRAVEL = 0.9; // s each relic takes to arrive
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const outCubic = (t: number) => 1 - (1 - t) ** 3;

/** Rounded-rectangle path (optionally as a punch-out hole). */
function roundedRect(w: number, h: number, r: number) {
  const p = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
  return p;
}

/** The site's ✦ four-point star as a THREE.Shape (concave quadratics). */
function starShape() {
  const s = new THREE.Shape();
  const IN = 0.11; // waist — how far the concave curve pulls to centre
  s.moveTo(1, 0);
  s.quadraticCurveTo(IN, IN, 0, 1);
  s.quadraticCurveTo(-IN, IN, -1, 0);
  s.quadraticCurveTo(-IN, -IN, 0, -1);
  s.quadraticCurveTo(IN, -IN, 1, 0);
  return s;
}

/** The six relic geometries (unit-ish, centred). mat = body, alt = accent. */
function ShapeMeshes({
  type,
  mat,
  alt,
}: {
  type: number;
  mat: THREE.MeshStandardMaterial;
  alt: THREE.MeshStandardMaterial;
}) {
  const extruded = useMemo(() => {
    if (type === 3) {
      const frame = roundedRect(1.35, 0.9, 0.18);
      frame.holes.push(roundedRect(1.11, 0.66, 0.12));
      const g = new THREE.ExtrudeGeometry(frame, {
        depth: 0.12,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelSegments: 2,
        curveSegments: 20,
      });
      g.center();
      return g;
    }
    if (type === 5) {
      const g = new THREE.ExtrudeGeometry(starShape(), {
        depth: 0.22,
        bevelEnabled: true,
        bevelThickness: 0.045,
        bevelSize: 0.045,
        bevelSegments: 3,
        curveSegments: 28,
      });
      g.center();
      return g;
    }
    return null;
  }, [type]);
  useEffect(() => () => extruded?.dispose(), [extruded]);

  switch (type % 6) {
    case 0: // AI — porcelain orb, gold intelligence ring + bead
      return (
        <>
          <mesh material={mat}>
            <sphereGeometry args={[0.5, 48, 48]} />
          </mesh>
          <group rotation={[1.25, 0.4, 0]}>
            <mesh material={alt}>
              <torusGeometry args={[0.8, 0.042, 12, 80]} />
            </mesh>
            <mesh material={alt} position={[0.8, 0, 0]}>
              <sphereGeometry args={[0.085, 20, 20]} />
            </mesh>
          </group>
        </>
      );
    case 1: // Web & App — gold layer stack
      return (
        <>
          {[-1, 0, 1].map((k) => (
            <mesh
              key={k}
              material={k === 0 ? alt : mat}
              position={[k * 0.1, k * 0.18, -k * 0.07]}
              rotation={[0, k * 0.07, 0]}
            >
              <boxGeometry args={[1.12, 0.075, 0.72]} />
            </mesh>
          ))}
        </>
      );
    case 2: // Product Design — faceted gem
      return (
        <mesh material={mat}>
          <icosahedronGeometry args={[0.62, 0]} />
        </mesh>
      );
    case 3: // Website & Mobile — porcelain device frame, gold notch
      return (
        <>
          {extruded ? <mesh material={mat} geometry={extruded} /> : null}
          <mesh material={alt} position={[0, 0.33, 0.05]}>
            <boxGeometry args={[0.28, 0.05, 0.05]} />
          </mesh>
        </>
      );
    case 4: // Immersive & 3D — torus knot
      return (
        <mesh material={mat} scale={0.92}>
          <torusKnotGeometry args={[0.48, 0.15, 160, 20]} />
        </mesh>
      );
    default: // Branding — the ✦, plus its little companion star
      return (
        <>
          {extruded ? <mesh material={mat} geometry={extruded} scale={0.88} /> : null}
          {extruded ? (
            <mesh material={alt} geometry={extruded} scale={0.34} position={[0.62, 0.52, 0.12]} />
          ) : null}
        </>
      );
  }
}

function OrbitNode({
  index,
  pointer,
  activeRef,
  frozen,
  scatterS,
  introSkip,
}: {
  index: number;
  pointer: React.RefObject<OrbitPointer>;
  activeRef: React.RefObject<number | null>;
  frozen: boolean;
  /** smoothed 0..1 disassemble progress, written by the Rig each frame */
  scatterS: React.RefObject<number>;
  /** true = page loaded mid-scroll or reduced motion — start seated */
  introSkip: boolean;
}) {
  const outer = useRef<THREE.Group>(null!);
  const inner = useRef<THREE.Group>(null!);
  const glow = useRef(0);
  const proj = useMemo(() => new THREE.Vector3(), []);
  const basePos = useMemo(() => new THREE.Vector3(), []);
  const scatterPos = useMemo(() => new THREE.Vector3(), []);
  const invMat = useMemo(() => new THREE.Matrix4(), []);
  const { viewport } = useThree();
  const gold = index !== 0 && index !== 3;
  const [mat, alt] = useMemo(() => {
    const body = new THREE.MeshStandardMaterial({
      ...(gold ? GOLD : PORCELAIN),
      flatShading: index === 2,
      emissive: new THREE.Color("#ffb36b"),
      emissiveIntensity: 0.04,
    });
    const accent = new THREE.MeshStandardMaterial({
      ...(gold ? PORCELAIN : GOLD),
      emissive: new THREE.Color("#ffb36b"),
      emissiveIntensity: 0.04,
    });
    return [body, accent];
  }, [gold, index]);
  useEffect(
    () => () => {
      mat.dispose();
      alt.dispose();
    },
    [mat, alt]
  );

  const baseAngle = (index / 6) * Math.PI * 2 + 0.35;

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const a = baseAngle + (frozen ? 0 : t * ORBIT_SPEED);
    basePos.set(
      Math.cos(a),
      Math.sin(t * 0.45 + index * 2.3) * 0.04,
      Math.sin(a)
    );

    // Entrance: relic i sets off at its own staggered moment, gliding in
    // from beyond the ring while growing from nothing — one by one.
    const ie =
      introSkip || frozen
        ? 1
        : outCubic(clamp01((t - INTRO_START - index * INTRO_STAGGER) / INTRO_TRAVEL));
    if (ie < 1) {
      basePos.x += Math.cos(a) * (1 - ie) * 1.5;
      basePos.z += Math.sin(a) * (1 - ie) * 1.5;
      basePos.y += (1 - ie) * 0.6;
    }

    // Disassemble: blend the ring seat toward this relic's screen-periphery
    // target (smoothstepped so departure/arrival ease). The target lives in
    // WORLD space — pull it into this node's local (tilted, scaled, yawed)
    // frame via the parent's inverse matrix so the blend is a straight lerp.
    const sc = scatterS.current ?? 0;
    const k = sc * sc * (3 - 2 * sc);
    if (k > 0.001 && outer.current.parent) {
      scatterPos.set(
        (SCATTER_TARGET[index][0] * viewport.width) / 2,
        (SCATTER_TARGET[index][1] * viewport.height) / 2,
        SCATTER_TARGET[index][2]
      );
      invMat.copy(outer.current.parent.matrixWorld).invert();
      scatterPos.applyMatrix4(invMat);
      outer.current.position.lerpVectors(basePos, scatterPos, k);
    } else {
      outer.current.position.copy(basePos);
    }

    if (!frozen) {
      inner.current.rotation.x += dt * SELF_SPIN[index][0] * (1 + k * 1.2);
      inner.current.rotation.y += dt * SELF_SPIN[index][1] * (1 + k * 1.2);
    }
    inner.current.rotation.z = INIT_ROT[index][2] + SCATTER_TUMBLE[index] * k;

    // Proximity: project the relic to NDC and compare against the pointer
    proj.setFromMatrixPosition(outer.current.matrixWorld).project(state.camera);
    const p = pointer.current;
    const near = Math.hypot(proj.x - p.nx, proj.y - p.ny) < 0.17;
    const hot = activeRef.current === index || near;

    glow.current = THREE.MathUtils.damp(glow.current, hot ? 1 : 0, 6, dt);
    // detached relics swell a touch — they read as drifting toward the viewer;
    // during the entrance each grows from nothing as it arrives
    outer.current.scale.setScalar(
      NODE_LOCAL * (1 + glow.current * 0.45) * (1 + k * 0.5) * Math.max(ie, 0.001)
    );
    mat.emissiveIntensity = 0.04 + glow.current * 0.5;
    alt.emissiveIntensity = 0.04 + glow.current * 0.5;
  });

  return (
    <group ref={outer} scale={NODE_LOCAL}>
      <group ref={inner} rotation={INIT_ROT[index]}>
        <ShapeMeshes type={index} mat={mat} alt={alt} />
      </group>
    </group>
  );
}

/** Faint concentric guide ellipses — the sketchy multi-line ring of the capture.
    They dissolve as the orbit disassembles (gone by ~60% scatter, trionn's read). */
function OrbitLines({
  scatterS,
  introSkip,
}: {
  scatterS: React.RefObject<number>;
  introSkip: boolean;
}) {
  const circle = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  useEffect(() => () => circle.dispose(), [circle]);

  const rings: { s: number; o: number; rz: number }[] = [
    { s: 0.93, o: 0.1, rz: 0.02 },
    { s: 1.0, o: 0.18, rz: 0 },
    { s: 1.07, o: 0.08, rz: -0.025 },
  ];
  const mats = useRef<(THREE.LineBasicMaterial | null)[]>([]);

  useFrame((state) => {
    const fade = 1 - Math.min(1, (scatterS.current ?? 0) * 1.7);
    // the guide ellipses draw themselves in ahead of the arriving relics
    const intro = introSkip ? 1 : clamp01((state.clock.elapsedTime - 0.1) / 1.2);
    rings.forEach((r, i) => {
      const m = mats.current[i];
      if (m) m.opacity = r.o * fade * intro;
    });
  });

  return (
    <>
      {rings.map((r, i) => (
        <lineLoop key={i} geometry={circle} scale={r.s} rotation={[0, 0, r.rz]}>
          <lineBasicMaterial
            ref={(m) => {
              mats.current[i] = m;
            }}
            color="#fff3d3"
            transparent
            opacity={r.o}
            depthWrite={false}
          />
        </lineLoop>
      ))}
    </>
  );
}

/** RoomEnvironment IBL — what makes the gold read as gold. */
function StudioEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Rig({
  pointer,
  activeRef,
  frozen,
  centerYFrac,
  scatter,
  introSkip,
}: {
  pointer: React.RefObject<OrbitPointer>;
  activeRef: React.RefObject<number | null>;
  frozen: boolean;
  centerYFrac: number;
  /** raw scroll-driven 0..1 disassemble progress from the DOM wrapper */
  scatter: React.RefObject<number>;
  introSkip: boolean;
}) {
  const tilt = useRef<THREE.Group>(null!);
  const yaw = useRef<THREE.Group>(null!);
  const scatterS = useRef(0);
  const { viewport } = useThree();

  // Full-bleed fit (trionn): the ring's wide axis runs edge-to-edge — a hair
  // past, so the side relics kiss the viewport edges instead of floating
  // inside them. Height still guards the short axis on squat hosts.
  const halfW = viewport.width / 2;
  const halfH = viewport.height / 2;
  const S = Math.min(halfW * 1.02, halfH * 2.2);
  const yOff = (0.5 - centerYFrac) * viewport.height;

  useFrame((_, dt) => {
    const p = pointer.current;
    const tx = BASE_TILT_X + (p.py - 0.5) * 0.2;
    const tz = BASE_TILT_Z + (p.px - 0.5) * 0.08;
    const ty = -(p.px - 0.5) * 0.55;
    tilt.current.rotation.x = THREE.MathUtils.damp(tilt.current.rotation.x, tx, 2.5, dt);
    tilt.current.rotation.z = THREE.MathUtils.damp(tilt.current.rotation.z, tz, 2.5, dt);
    yaw.current.rotation.y = THREE.MathUtils.damp(yaw.current.rotation.y, ty, 2.5, dt);
    // One smoothed scatter value for the whole scene — wheel flicks glide
    scatterS.current = THREE.MathUtils.damp(
      scatterS.current,
      Math.min(1, Math.max(0, scatter.current ?? 0)),
      4.5,
      dt
    );
  });

  return (
    <group position={[0, yOff, 0]}>
      <group ref={tilt} rotation={[BASE_TILT_X, 0, BASE_TILT_Z]} scale={S}>
        <group ref={yaw}>
          <OrbitLines scatterS={scatterS} introSkip={introSkip} />
          {Array.from({ length: 6 }, (_, i) => (
            <OrbitNode
              key={i}
              index={i}
              pointer={pointer}
              activeRef={activeRef}
              frozen={frozen}
              scatterS={scatterS}
              introSkip={introSkip}
            />
          ))}
        </group>
      </group>
    </group>
  );
}

export default function OrbitScene({
  activeNodeIndex,
  running,
  scatter,
}: {
  activeNodeIndex: number | null;
  running: boolean;
  /** scroll-driven 0..1 disassemble progress (ref — read per frame) */
  scatter: React.RefObject<number>;
}) {
  const pointer = useRef<OrbitPointer>({ px: 0.5, py: 0.45, nx: 10, ny: 10 });
  const activeRef = useRef<number | null>(activeNodeIndex);
  activeRef.current = activeNodeIndex;
  const hostRef = useRef<HTMLDivElement>(null);

  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );
  // one-by-one entrance plays only for a fresh load AT the hero — a reload
  // mid-scroll starts seated/scattered (flying relics in and instantly
  // scattering them would read as a glitch)
  const introSkip = useMemo(() => (scatter.current ?? 0) > 0.05, [scatter]);
  // the ring wraps the "Area of expertise" title: on phones the title sits
  // higher up the screen than on desktop, so the ring centre follows it
  const centerYFrac = useMemo(
    () =>
      typeof window !== "undefined" && window.innerWidth < 1024 ? 0.36 : 0.47,
    []
  );

  useEffect(() => {
    if (reduced) return;
    const onMove = (e: MouseEvent) => {
      const host = hostRef.current;
      if (!host) return;
      const r = host.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      pointer.current.px = Math.min(1.15, Math.max(-0.15, fx));
      pointer.current.py = Math.min(1.15, Math.max(-0.15, fy));
      pointer.current.nx = fx * 2 - 1;
      pointer.current.ny = -(fy * 2 - 1);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [reduced]);

  return (
    <div ref={hostRef} className="absolute inset-0">
      <Canvas
        dpr={[1, 1.75]}
        frameloop={reduced ? "demand" : running ? "always" : "never"}
        camera={{ fov: 13, position: [0, 0, 60], near: 1, far: 140 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        {/* far arc melts into the hero's maroon ground */}
        <fog attach="fog" args={["#5d1411", 58, 84]} />
        <StudioEnvironment />
        <ambientLight intensity={0.3} color="#ffe8c0" />
        <directionalLight position={[6, 10, 8]} intensity={2.2} color="#ffd9a6" />
        <directionalLight position={[-8, -6, 4]} intensity={0.5} color="#7a2b20" />
        <pointLight position={[0, 3, 6]} intensity={80} color="#ffb36b" distance={40} />
        <Rig
          pointer={pointer}
          activeRef={activeRef}
          frozen={reduced}
          centerYFrac={centerYFrac}
          scatter={scatter}
          introSkip={introSkip}
        />
      </Canvas>
    </div>
  );
}
