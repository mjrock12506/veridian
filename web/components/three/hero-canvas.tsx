"use client";

import * as React from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import * as THREE from "three";

const ACCENT = "#22dca9";
const ACCENT_DIM = "#0fa07a";
const RADIUS = 1.65;

/** Even point distribution on a sphere (Fibonacci lattice). */
function fibonacciSphere(count: number, radius: number) {
  const positions = new Float32Array(count * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  return positions;
}

function GlobePoints() {
  const positions = React.useMemo(() => fibonacciSphere(900, RADIUS), []);
  const geom = React.useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  return (
    <points geometry={geom}>
      <pointsMaterial
        size={0.022}
        color={ACCENT}
        sizeAttenuation
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </points>
  );
}

/** A single arc above the globe with a glowing dot traveling along it. */
function Arc({ start, end, lift, speed, offset }: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  lift: number;
  speed: number;
  offset: number;
}) {
  const dot = React.useRef<THREE.Mesh>(null);
  const curve = React.useMemo(() => {
    const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(RADIUS + lift);
    return new THREE.QuadraticBezierCurve3(start, mid, end);
  }, [start, end, lift]);

  const lineGeom = React.useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(50));
    return g;
  }, [curve]);

  useFrame((state) => {
    if (!dot.current) return;
    const t = (state.clock.elapsedTime * speed + offset) % 1;
    const p = curve.getPointAt(t);
    dot.current.position.copy(p);
    const scale = 0.05 + Math.sin(t * Math.PI) * 0.05;
    dot.current.scale.setScalar(scale);
  });

  return (
    <group>
      <line>
        <primitive object={lineGeom} attach="geometry" />
        <lineBasicMaterial color={ACCENT} transparent opacity={0.35} />
      </line>
      <mesh ref={dot}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color={"#7ffadf"} />
      </mesh>
    </group>
  );
}

function Arcs() {
  const arcs = React.useMemo(() => {
    const pts = fibonacciSphere(60, RADIUS);
    const pick = (i: number) =>
      new THREE.Vector3(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
    const pairs: [number, number][] = [
      [3, 41], [12, 50], [22, 7], [33, 58], [46, 18], [9, 37],
    ];
    return pairs.map(([a, b], i) => ({
      start: pick(a),
      end: pick(b),
      lift: 0.5 + (i % 3) * 0.22,
      speed: 0.12 + (i % 4) * 0.04,
      offset: (i / pairs.length),
    }));
  }, []);

  return (
    <>
      {arcs.map((a, i) => (
        <Arc key={i} {...a} />
      ))}
    </>
  );
}

function StarField() {
  const positions = React.useMemo(() => {
    const n = 220;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 6 + Math.random() * 6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, []);
  const geom = React.useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);
  return (
    <points geometry={geom}>
      <pointsMaterial size={0.03} color={"#9fb4c9"} transparent opacity={0.5} depthWrite={false} />
    </points>
  );
}

function Globe() {
  const group = React.useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.12;
  });
  return (
    <group ref={group}>
      {/* Faint solid core for depth */}
      <mesh>
        <sphereGeometry args={[RADIUS * 0.985, 48, 48]} />
        <meshBasicMaterial color={"#04131a"} transparent opacity={0.65} />
      </mesh>
      {/* Wireframe shell */}
      <mesh>
        <icosahedronGeometry args={[RADIUS * 1.003, 2]} />
        <meshBasicMaterial color={ACCENT_DIM} wireframe transparent opacity={0.12} />
      </mesh>
      <GlobePoints />
      <Arcs />
    </group>
  );
}

export default function HeroCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 0.2, 5], fov: 42 }}
      dpr={[1, 1.8]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.6} />
      <pointLight position={[4, 3, 5]} intensity={1.2} color={ACCENT} />
      <StarField />
      <Float speed={1.1} rotationIntensity={0.25} floatIntensity={0.4}>
        <Globe />
      </Float>
    </Canvas>
  );
}
