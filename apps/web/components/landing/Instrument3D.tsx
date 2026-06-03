'use client';

import { useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * THE INSTRUMENT — a 3D armillary calibration gauge, the bureau made object:
 * three nested hairline rings, a ticked outer scale, a volt needle and a wire
 * core. Driven by a scroll-progress ref (0..1):
 *
 *   0.00–0.35  assembly — the rings tilt from a flat disc into the armillary
 *   0.15–0.65  the needle sweeps up the scale as confidence "calibrates"
 *   always     slow instrument rotation (accelerating slightly with progress)
 *
 * Rendering is transparent-alpha so the lamp-black page shows through.
 */

const VOLT = '#cff04e';
const PAPER = '#ece8df';
const MUTEDC = '#9b9485';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function Armillary({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const root = useRef<THREE.Group>(null);
  const ringA = useRef<THREE.Group>(null);
  const ringB = useRef<THREE.Group>(null);
  const ringC = useRef<THREE.Group>(null);
  const needle = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);

  // 48 scale ticks around the outer ring, every 6th one long + volt.
  const ticks = useMemo(
    () =>
      Array.from({ length: 48 }).map((_, i) => {
        const a = (i / 48) * Math.PI * 2;
        const major = i % 6 === 0;
        const rOut = 2.42;
        const len = major ? 0.16 : 0.08;
        return {
          position: [Math.cos(a) * (rOut - len / 2), Math.sin(a) * (rOut - len / 2), 0] as const,
          rotation: [0, 0, a] as const,
          len,
          major
        };
      }),
    []
  );

  useFrame((_state, delta) => {
    const p = progressRef.current;
    const assembly = Math.min(1, p / 0.35); // 0..1 over the first act

    if (root.current) {
      // slow instrument rotation, accelerating slightly as it calibrates
      root.current.rotation.y += delta * (0.1 + p * 0.16);
      root.current.rotation.x = lerp(0.42, 0.18, assembly);
      const s = lerp(0.62, 1, assembly);
      root.current.scale.setScalar(s);
    }
    // rings tilt from coplanar (flat disc) into the armillary arrangement
    if (ringA.current) ringA.current.rotation.x = lerp(0, Math.PI / 2, assembly);
    if (ringB.current) {
      ringB.current.rotation.x = lerp(0, Math.PI / 2.6, assembly);
      ringB.current.rotation.y = lerp(0, Math.PI / 3.2, assembly);
      ringB.current.rotation.z += delta * 0.22;
    }
    if (ringC.current) {
      ringC.current.rotation.y = lerp(0, Math.PI / 2.2, assembly);
      ringC.current.rotation.z -= delta * 0.17;
    }
    // the needle sweeps up the dial as the instrument "finds" its reading
    if (needle.current) {
      const sweep = Math.max(0, Math.min(1, (p - 0.15) / 0.5));
      needle.current.rotation.z = lerp(-Math.PI * 0.78, Math.PI * 0.22, sweep);
    }
    if (core.current) {
      core.current.rotation.x += delta * 0.3;
      core.current.rotation.y -= delta * 0.2;
    }
  });

  return (
    <group ref={root}>
      {/* outer scale ring + ticks (the dial plane) */}
      <mesh>
        <torusGeometry args={[2.42, 0.008, 6, 96]} />
        <meshStandardMaterial color={PAPER} metalness={0.4} roughness={0.5} />
      </mesh>
      {ticks.map((t, i) => (
        <mesh key={i} position={t.position as unknown as THREE.Vector3} rotation={t.rotation as unknown as THREE.Euler}>
          <boxGeometry args={[t.len, 0.012, 0.012]} />
          <meshStandardMaterial
            color={t.major ? VOLT : MUTEDC}
            emissive={t.major ? VOLT : '#000000'}
            emissiveIntensity={t.major ? 0.9 : 0}
            metalness={0.3}
            roughness={0.6}
          />
        </mesh>
      ))}

      {/* nested armillary rings */}
      <group ref={ringA}>
        <mesh>
          <torusGeometry args={[2.05, 0.01, 6, 96]} />
          <meshStandardMaterial color={PAPER} metalness={0.5} roughness={0.45} transparent opacity={0.85} />
        </mesh>
      </group>
      <group ref={ringB}>
        <mesh>
          <torusGeometry args={[1.68, 0.014, 6, 96]} />
          <meshStandardMaterial color={VOLT} emissive={VOLT} emissiveIntensity={0.55} metalness={0.6} roughness={0.35} />
        </mesh>
      </group>
      <group ref={ringC}>
        <mesh>
          <torusGeometry args={[1.32, 0.009, 6, 80]} />
          <meshStandardMaterial color={MUTEDC} metalness={0.4} roughness={0.6} transparent opacity={0.7} />
        </mesh>
      </group>

      {/* the needle */}
      <group ref={needle}>
        <mesh position={[0.95, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 1.9, 12]} />
          <meshStandardMaterial color={VOLT} emissive={VOLT} emissiveIntensity={1.1} metalness={0.5} roughness={0.3} />
        </mesh>
        <mesh position={[1.95, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.04, 0.14, 12]} />
          <meshStandardMaterial color={VOLT} emissive={VOLT} emissiveIntensity={1.2} />
        </mesh>
      </group>

      {/* hub + wire core */}
      <mesh>
        <sphereGeometry args={[0.07, 24, 24]} />
        <meshStandardMaterial color={PAPER} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh ref={core}>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshStandardMaterial color={PAPER} wireframe transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

export default function Instrument3D({
  progressRef,
  active = true
}: {
  progressRef: MutableRefObject<number>;
  /** When false (hero off-screen), the render loop pauses — zero GPU cost. */
  active?: boolean;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 6.4], fov: 42 }}
      dpr={[1, 1.5]}
      frameloop={active ? 'always' : 'never'}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      style={{ background: 'transparent' }}
      aria-hidden
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 5, 6]} intensity={1.3} />
      <pointLight position={[-4, -2, 3]} intensity={6} color={VOLT} distance={12} decay={2} />
      <Armillary progressRef={progressRef} />
    </Canvas>
  );
}
