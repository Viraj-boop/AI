"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Instances, Instance } from "@react-three/drei";
import * as THREE from "three";

// Generate points on a sphere
const randomPointOnSphere = (radius: number) => {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.sin(phi) * Math.sin(theta);
  const z = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
};

const COUNT = 1500;
const RADIUS = 1.6;

function Particles() {
  const ref = useRef<THREE.InstancedMesh>(null);
  
  const positions = useMemo(() => {
    const arr = [];
    for (let i = 0; i < COUNT; i++) {
       arr.push(randomPointOnSphere(RADIUS + (Math.random() * 0.05)));
    }
    return arr;
  }, []);

  useFrame((state, delta) => {
    if (ref.current) {
        ref.current.rotation.y += delta * 0.05;
        // Simple subtle pulser
        const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.03;
        ref.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <Instances ref={ref} limit={COUNT} range={COUNT}>
      <sphereGeometry args={[0.012, 8, 8]} />
      <meshBasicMaterial color="#10b981" transparent opacity={0.6} />
      {positions.map((pos, i) => (
        <Instance key={i} position={pos} />
      ))}
    </Instances>
  );
}

// Draw realistic cyber connection arcs between some random points
function CyberArcs() {
   const groupRef = useRef<THREE.Group>(null);
   
   useFrame((state, delta) => {
       if (groupRef.current) {
           groupRef.current.rotation.y += delta * 0.05;
       }
   });

   // Generate some arcs
   const arcs = useMemo(() => {
     const arcArr = [];
     for (let i = 0; i < 30; i++) {
          const start = randomPointOnSphere(RADIUS);
          const end = randomPointOnSphere(RADIUS);
          
          const mid = start.clone().lerp(end, 0.5).normalize().multiplyScalar(RADIUS + 0.2 + Math.random() * 0.4);
          const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
          const points = curve.getPoints(24);
          arcArr.push(points);
     }
     return arcArr;
   }, []);

   return (
       <group ref={groupRef}>
           {arcs.map((points, i) => {
               const posArray = new Float32Array(points.flatMap(p => [p.x, p.y, p.z]));
               return (
                   <line key={i}>
                       <bufferGeometry>
                           <bufferAttribute
                               attach="attributes-position"
                               array={posArray}
                               count={points.length}
                               itemSize={3}
                           />
                       </bufferGeometry>
                       <lineBasicMaterial color="#06b6d4" transparent opacity={0.3} />
                   </line>
               );
           })}
       </group>
   )
}

function MainSphere() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (meshRef.current) {
        meshRef.current.rotation.y += delta * 0.05;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[RADIUS - 0.05, 32, 32]} />
      <meshBasicMaterial color="#09090b" wireframe transparent opacity={0.3} />
    </mesh>
  );
}

export function CyberGlobe({ className = "" }: { className?: string }) {
  return (
    <div className={`absolute inset-0 w-full h-full pointer-events-auto ${className}`}>
      <Canvas camera={{ position: [0, 0, 4.5], fov: 60 }} className="absolute inset-0 z-0">
         <ambientLight intensity={0.5} />
         
         <group rotation={[0.2, 0, -0.1]}>
             <MainSphere />
             <Particles />
             <CyberArcs />
         </group>

         <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.8} />
      </Canvas>
    </div>
  );
}
