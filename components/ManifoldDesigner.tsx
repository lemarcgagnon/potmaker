"use client";

import React, { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import JSZip from 'jszip';
import { DEFAULT_PARAMS, DesignParams } from '../types';
import { Scene } from './Scene';
import { Sidebar } from './Sidebar';
import { Box, Layers, RefreshCw, Eye, EyeOff, RotateCw, ZoomIn } from 'lucide-react';

export interface ManifoldDesignerProps {
  className?: string;
  style?: React.CSSProperties;
  initialParams?: Partial<DesignParams>;
  onExportStart?: () => void;
  onExportComplete?: () => void;
}

export const ManifoldDesigner: React.FC<ManifoldDesignerProps> = ({
  className = "",
  style,
  initialParams,
  onExportStart,
  onExportComplete
}) => {
  const [params, setParams] = useState<DesignParams>({ ...DEFAULT_PARAMS, ...initialParams });
  const [autoRotate, setAutoRotate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const exportRef = useRef<THREE.Group>(null);

  const handleRefreshGeometry = () => {
    setRefreshKey(k => k + 1);
  };

  // Reactivity: Update internal state if the parent provides new initialParams
  useEffect(() => {
    if (initialParams) {
        setParams(prev => ({ ...prev, ...initialParams }));
    }
  }, [initialParams]);

  const getTimestamp = () => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  };

  const handleExport = async (type: 'body' | 'saucer' | 'all') => {
    if (!exportRef.current) return;
    if (onExportStart) onExportStart();

    const exporter = new STLExporter();
    const timestamp = getTimestamp();

    // Bake geometry into a clean STL with bottom at Z=0 (Y-up → Z-up)
    const exportObject = (obj: THREE.Object3D) => {
      if (!(obj instanceof THREE.Mesh) || !obj.geometry) return null;

      try {
        // Clone geometry so we don't mutate the scene
        const geo = obj.geometry.clone();

        // Scale cm → mm for STL (slicers assume mm)
        const scaleMatrix = new THREE.Matrix4().makeScale(10, 10, 10);
        geo.applyMatrix4(scaleMatrix);

        // Rotate +90° around X to convert Y-up (Three.js) to Z-up (STL/slicer)
        const rotMatrix = new THREE.Matrix4().makeRotationX(Math.PI / 2);
        geo.applyMatrix4(rotMatrix);

        // Shift geometry so the bottom sits exactly on Z=0 (the build plate)
        geo.computeBoundingBox();
        if (geo.boundingBox) {
          const shift = new THREE.Matrix4().makeTranslation(0, 0, -geo.boundingBox.min.z);
          geo.applyMatrix4(shift);
        }

        // Create a temp mesh with identity transform — no scene graph dependency
        const tempMesh = new THREE.Mesh(geo);
        tempMesh.updateMatrixWorld(true);

        const result = exporter.parse(tempMesh, { binary: true });

        if (result instanceof DataView) {
          return result.buffer;
        }
        return result;
      } catch (e) {
        console.error("Export failed for object:", obj.name, e);
        return null;
      }
    };

    if (type === 'all') {
      const zip = new JSZip();
      let hasContent = false;

      const bodyMesh = exportRef.current.getObjectByName('BodyMesh');
      if (bodyMesh) {
        const result = exportObject(bodyMesh);
        if (result) {
          const name = params.mode === 'pot' ? 'pot' : 'shade';
          zip.file(`manifold_${name}.stl`, result);
          hasContent = true;
        }
      }

      const saucerMesh = exportRef.current.getObjectByName('SaucerMesh');
      if (saucerMesh && params.mode === 'pot') {
        const result = exportObject(saucerMesh);
        if (result) {
          zip.file('manifold_saucer.stl', result);
          hasContent = true;
        }
      }

      if (!hasContent) {
        alert('No geometry to export.');
        return;
      }

      try {
        const content = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `manifold_set_${timestamp}.zip`;
        link.click();
        URL.revokeObjectURL(link.href);
      } catch (err) {
        console.error("Failed to generate zip", err);
      }

    } else {
      let objectToExport: THREE.Object3D | undefined;
      let filenamePart = '';

      if (type === 'body') {
        objectToExport = exportRef.current.getObjectByName('BodyMesh');
        filenamePart = params.mode === 'pot' ? 'pot' : 'shade';
      } else if (type === 'saucer') {
        objectToExport = exportRef.current.getObjectByName('SaucerMesh');
        filenamePart = 'saucer';
      }

      if (objectToExport) {
        const result = exportObject(objectToExport);
        if (result) {
          const blob = new Blob([result], { type: 'application/octet-stream' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `manifold_${filenamePart}_${timestamp}.stl`;
          link.click();
          URL.revokeObjectURL(link.href);
        }
      }
    }

    if (onExportComplete) onExportComplete();
  };

  const handleScreenshot = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const timestamp = getTimestamp();
    const link = document.createElement('a');
    link.download = `manifold_${params.mode}_${timestamp}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const toggleParam = (key: keyof DesignParams) => {
      setParams(p => ({...p, [key]: !p[key as keyof DesignParams]}));
  };

  return (
    <div
      className={`flex flex-col md:flex-row overflow-hidden bg-[#1a1a1a] text-white ${className}`}
      style={style}
    >
      {/* 3D Canvas Area */}
      <div className="flex-1 relative order-2 md:order-1 min-h-[300px] bg-gradient-to-b from-gray-900 to-[#121212]">

        {/* Floating Toolbar (Glassmorphism) */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex gap-2 p-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10 shadow-xl transition-all hover:bg-black/50 hover:scale-105">
           <button
             onClick={() => toggleParam('wireframe')}
             className={`p-2.5 rounded-full transition-all ${params.wireframe ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-white/10'}`}
             title="Toggle Wireframe"
           >
             <Box className="w-5 h-5" />
           </button>

           <div className="w-px h-6 bg-white/10 self-center mx-1" />

           <button
             onClick={() => toggleParam('showBody')}
             className={`p-2.5 rounded-full transition-all ${!params.showBody ? 'text-gray-500' : 'text-gray-300 hover:bg-white/10'}`}
             title="Toggle Body Visibility"
           >
             {params.showBody ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
           </button>

           {params.mode === 'pot' && (
             <button
               onClick={() => toggleParam('showSaucer')}
               className={`p-2.5 rounded-full transition-all ${!params.showSaucer ? 'text-gray-500' : 'text-gray-300 hover:bg-white/10'}`}
               title="Toggle Saucer Visibility"
             >
               <Layers className="w-5 h-5" />
             </button>
           )}

            <div className="w-px h-6 bg-white/10 self-center mx-1" />

           <button
             onClick={() => setAutoRotate(!autoRotate)}
             className={`p-2.5 rounded-full transition-all ${autoRotate ? 'bg-green-600 text-white animate-spin-slow' : 'text-gray-300 hover:bg-white/10'}`}
             title="Auto Rotate"
           >
             <RotateCw className="w-5 h-5" />
           </button>
        </div>

        <Scene params={{...params}} exportRef={exportRef} autoRotate={autoRotate} refreshKey={refreshKey} />
      </div>

      {/* Sidebar Controls */}
      <div className="order-1 md:order-2 h-[45vh] md:h-full w-full md:w-[360px] shadow-2xl z-20 flex-shrink-0 relative">
        <Sidebar params={params} setParams={setParams} onExport={handleExport} onScreenshot={handleScreenshot} onRefresh={handleRefreshGeometry} />
      </div>
    </div>
  );
};
