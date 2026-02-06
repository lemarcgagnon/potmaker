"use client";

import React, { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, ContactShadows } from '@react-three/drei';
import { DesignParams } from '../types';
import { generateBodyGeometry, generateSaucerGeometry } from '../utils/geometry';

// Fix for missing JSX intrinsic elements in TypeScript
declare global {
  namespace JSX {
    interface IntrinsicElements {
      mesh: any;
      group: any;
      meshBasicMaterial: any;
      meshPhysicalMaterial: any;
      ambientLight: any;
      directionalLight: any;
      pointLight: any;
      color: any;
    }
  }
}

interface SceneProps {
  params: DesignParams;
  exportRef: React.RefObject<THREE.Group | null>;
  autoRotate?: boolean;
  refreshKey?: number;
}

const Model: React.FC<{ params: DesignParams }> = ({ params }) => {
  const isPot = params.mode === 'pot';

  // Separation logic (Exploded View)
  const saucerY = 0;
  // If pot, lift it by thickness + gap + separation distance
  const potY = isPot ? (params.thickness + 0.05 + (params.saucerSeparation || 0)) : 0;

  // Refs for geometry disposal
  const bodyMeshRef = useRef<THREE.Mesh>(null);
  const saucerMeshRef = useRef<THREE.Mesh>(null);

  // Generate Body Geometry
  const bodyGeometry = useMemo(() => generateBodyGeometry(params), [params]);

  // Generate Saucer Geometry (Now 3D matched)
  const saucerGeometry = useMemo(() => {
    if (!isPot) return null;
    return generateSaucerGeometry(params);
  }, [params, isPot]);

  // Dispose old geometry when new geometry is created
  useEffect(() => {
    return () => {
      bodyGeometry?.dispose();
    };
  }, [bodyGeometry]);

  useEffect(() => {
    return () => {
      saucerGeometry?.dispose();
    };
  }, [saucerGeometry]);

  // Material Logic:
  const renderMaterial = () => {
    if (params.wireframe) {
      return (
        <meshBasicMaterial
          color={params.color}
          wireframe={true}
          side={THREE.DoubleSide}
          transparent={true}
          opacity={0.15}
          depthWrite={false}
        />
      );
    }
    // Check if geometry has vertex colors (hub debug mode)
    const hasVertexColors = bodyGeometry?.getAttribute('color') != null;

    // Solid Opaque Material (Better for production use)
    return (
      <meshPhysicalMaterial
        color={hasVertexColors ? '#ffffff' : params.color}
        vertexColors={hasVertexColors}
        wireframe={false}
        side={THREE.DoubleSide}
        flatShading={false}
        transparent={false}
        roughness={0.2}
        metalness={0.1}
        clearcoat={0.8}
        clearcoatRoughness={0.1}
      />
    );
  };

  return (
    <>
      <mesh
        key={`body-${params.skinPattern}-${params.skinMode}`}
        ref={bodyMeshRef}
        name="BodyMesh"
        geometry={bodyGeometry}
        position={[0, potY, 0]}
        castShadow
        receiveShadow
        visible={params.showBody}
      >
        {renderMaterial()}
      </mesh>

      {isPot && saucerGeometry && (
        <mesh
          name="SaucerMesh"
          geometry={saucerGeometry}
          position={[0, saucerY, 0]}
          castShadow
          receiveShadow
          visible={params.showSaucer}
        >
          {renderMaterial()}
        </mesh>
      )}
    </>
  );
};

export const Scene: React.FC<SceneProps> = ({ params, exportRef, autoRotate = false, refreshKey = 0 }) => {
  return (
    <Canvas
      shadows
      camera={{ position: [25, 20, 25], fov: 45 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      className="w-full h-full bg-transparent"
    >
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={2}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-10, 10, -10]} intensity={1} color="#ccddee" />

      {/* Only show Environment reflections in solid mode for clarity */}
      {!params.wireframe && <Environment preset="city" blur={1} />}

      <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={40} blur={2} far={4} color="#000000" />

      <Grid
        infiniteGrid
        fadeDistance={50}
        sectionColor="#444444"
        cellColor="#222222"
        position={[0, -0.01, 0]}
      />

      <group ref={exportRef}>
        <Model key={refreshKey} params={params} />
      </group>

      <OrbitControls
        makeDefault
        dampingFactor={0.1}
        autoRotate={autoRotate}
        autoRotateSpeed={1.0}
        // Constraints to keep the view usable
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2 - 0.02} // Prevent going below ground
        minDistance={5} // Don't clip inside
        maxDistance={100} // Don't fly away
      />
    </Canvas>
  );
};
