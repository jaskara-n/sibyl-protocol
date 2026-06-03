'use client';

import { useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

/**
 * THE INSTRUMENT — a 3D gauge with a gyroscope heart. The dial (scale arc,
 * engraved numerals, needle, etched verdict) faces the reader and stays
 * legible; the armillary rings spin inside it. All live data is IN the scene:
 *
 *   · scale numerals 0–100 engraved along the 180° measuring arc
 *   · the live % value rides the needle's tip
 *   · the verdict (LONG · bps · agents · market) is etched under the hub
 *
 * Scroll (0..1 via progressRef): assembly → needle sweep to the live reading.
 */

const VOLT = '#cff04e';
const PAPER = '#ece8df';
const MUTEDC = '#b5ae9f';
const FONT = '/fonts/GeistMono.ttf';

/** value 0..100 → dial angle (radians): a 180° arc from -140.4° to +39.6° */
function dialAngle(v: number): number {
  return -Math.PI * 0.78 + Math.PI * (Math.max(0, Math.min(100, v)) / 100);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function Armillary({
  progressRef,
  confidence,
  accent,
  direction,
  metricsLine,
  marketLine
}: {
  progressRef: MutableRefObject<number>;
  confidence: number;
  accent: string;
  direction: string;
  metricsLine: string;
  marketLine: string;
}) {
  const root = useRef<THREE.Group>(null);
  const gyro = useRef<THREE.Group>(null);
  const ringA = useRef<THREE.Group>(null);
  const ringB = useRef<THREE.Group>(null);
  const ringC = useRef<THREE.Group>(null);
  const needle = useRef<THREE.Group>(null);
  const tipLabel = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);

  // scale ticks only along the measuring arc — a gauge, not a clock
  const ticks = useMemo(() => {
    const out: { a: number; major: boolean }[] = [];
    for (let v = 0; v <= 100; v += 2.5) {
      out.push({ a: dialAngle(v), major: v % 25 === 0 });
    }
    return out;
  }, []);

  const smooth = useRef(0);

  useFrame((_state, delta) => {
    // fast damp: hugs the scroll position (accurate), kills frame jitter only
    smooth.current += (progressRef.current - smooth.current) * Math.min(1, delta * 10);
    const p = smooth.current;
    const assembly = Math.min(1, p / 0.35);

    if (root.current) {
      root.current.rotation.x = lerp(0.4, 0.14, assembly);
      root.current.scale.setScalar(lerp(0.62, 1, assembly));
    }
    // the gyroscope heart spins; the dial stays legible
    if (gyro.current) gyro.current.rotation.y += delta * (0.12 + p * 0.18);
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
    // needle sweeps the arc and settles on the LIVE reading
    if (needle.current) {
      const sweep = Math.max(0, Math.min(1, (p - 0.15) / 0.5));
      needle.current.rotation.z = lerp(dialAngle(0), dialAngle(confidence), sweep);
      // the value label rides the tip, counter-rotated to stay upright
      if (tipLabel.current) tipLabel.current.rotation.z = -needle.current.rotation.z;
    }
    if (core.current) {
      core.current.rotation.x += delta * 0.3;
      core.current.rotation.y -= delta * 0.2;
    }
  });

  return (
    <group ref={root}>
      {/* ---------- THE DIAL (faces the reader, always legible) ---------- */}
      <mesh>
        <torusGeometry args={[2.42, 0.008, 6, 96]} />
        <meshStandardMaterial color={PAPER} metalness={0.4} roughness={0.5} transparent opacity={0.8} />
      </mesh>

      {/* scale ticks along the measuring arc */}
      {ticks.map((t, i) => {
        const rOut = 2.42;
        const len = t.major ? 0.18 : 0.08;
        return (
          <mesh
            key={i}
            position={[Math.cos(t.a) * (rOut - len / 2), Math.sin(t.a) * (rOut - len / 2), 0]}
            rotation={[0, 0, t.a]}
          >
            <boxGeometry args={[len, t.major ? 0.018 : 0.01, 0.01]} />
            <meshStandardMaterial
              color={t.major ? VOLT : MUTEDC}
              emissive={t.major ? VOLT : '#000000'}
              emissiveIntensity={t.major ? 0.9 : 0}
            />
          </mesh>
        );
      })}

      {/* engraved scale numerals */}
      {[0, 25, 50, 75, 100].map((v) => {
        const a = dialAngle(v);
        const r = 2.02;
        return (
          <Text
            key={v}
            font={FONT}
            position={[Math.cos(a) * r, Math.sin(a) * r, 0]}
            fontSize={0.13}
            letterSpacing={0.06}
            color={v === 50 ? VOLT : MUTEDC}
            anchorX="center"
            anchorY="middle"
          >
            {v}
          </Text>
        );
      })}

      {/* the needle — colored by the live direction, value riding its tip */}
      <group ref={needle}>
        <mesh position={[0.95, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 1.9, 12]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.1} metalness={0.5} roughness={0.3} />
        </mesh>
        <mesh position={[1.95, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.04, 0.14, 12]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.2} />
        </mesh>
        <group ref={tipLabel} position={[2.32, 0, 0]}>
          <Text font={FONT} fontSize={0.21} letterSpacing={0.04} color={accent} anchorX="center" anchorY="middle">
            {`${Math.round(confidence)}%`}
          </Text>
        </group>
      </group>

      {/* the verdict, etched under the hub */}
      <Text
        font={FONT}
        position={[0, -1.06, 0.05]}
        fontSize={0.3}
        letterSpacing={0.14}
        color={accent}
        anchorX="center"
        anchorY="middle"
      >
        {direction}
      </Text>
      <Text
        font={FONT}
        position={[0, -1.38, 0.05]}
        fontSize={0.105}
        letterSpacing={0.16}
        color={MUTEDC}
        anchorX="center"
        anchorY="middle"
      >
        {metricsLine}
      </Text>
      <Text
        font={FONT}
        position={[0, -1.58, 0.05]}
        fontSize={0.095}
        letterSpacing={0.16}
        color={VOLT}
        anchorX="center"
        anchorY="middle"
      >
        {marketLine}
      </Text>

      {/* ---------- THE GYROSCOPE HEART (spins inside the dial) ---------- */}
      <group ref={gyro}>
        <group ref={ringA}>
          <mesh>
            <torusGeometry args={[2.0, 0.01, 6, 96]} />
            <meshStandardMaterial color={PAPER} metalness={0.5} roughness={0.45} transparent opacity={0.85} />
          </mesh>
        </group>
        <group ref={ringB}>
          <mesh>
            <torusGeometry args={[1.64, 0.014, 6, 96]} />
            <meshStandardMaterial color={VOLT} emissive={VOLT} emissiveIntensity={0.55} metalness={0.6} roughness={0.35} />
          </mesh>
        </group>
        <group ref={ringC}>
          <mesh>
            <torusGeometry args={[1.3, 0.009, 6, 80]} />
            <meshStandardMaterial color={MUTEDC} metalness={0.4} roughness={0.6} transparent opacity={0.7} />
          </mesh>
        </group>
        <mesh>
          <sphereGeometry args={[0.07, 24, 24]} />
          <meshStandardMaterial color={PAPER} metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh ref={core}>
          <icosahedronGeometry args={[0.55, 1]} />
          <meshStandardMaterial color={PAPER} wireframe transparent opacity={0.16} />
        </mesh>
      </group>
    </group>
  );
}

export default function Instrument3D({
  progressRef,
  active = true,
  confidence = 60,
  accent = VOLT,
  direction = 'FLAT',
  metricsLine = '',
  marketLine = ''
}: {
  progressRef: MutableRefObject<number>;
  /** When false (hero off-screen), the render loop pauses — zero GPU cost. */
  active?: boolean;
  /** live consensus confidence 0..100 (needle's resting angle) */
  confidence?: number;
  /** direction color for the needle + verdict */
  accent?: string;
  /** LONG / SHORT / FLAT — etched under the hub */
  direction?: string;
  /** e.g. "403 BPS · 5 AGENTS" */
  metricsLine?: string;
  /** e.g. "LIVE · MNT-USD" */
  marketLine?: string;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 7.7], fov: 42 }}
      dpr={[1, 1.5]}
      frameloop={active ? 'always' : 'never'}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      style={{ background: 'transparent' }}
      aria-hidden
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 5, 6]} intensity={1.3} />
      <pointLight position={[-4, -2, 3]} intensity={6} color={VOLT} distance={12} decay={2} />
      <Armillary
        progressRef={progressRef}
        confidence={confidence}
        accent={accent}
        direction={direction}
        metricsLine={metricsLine}
        marketLine={marketLine}
      />
    </Canvas>
  );
}
