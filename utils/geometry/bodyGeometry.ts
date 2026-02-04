/**
 * BODY GEOMETRY MODULE
 *
 * Generates the main body (pot or shade) walls.
 * Handles:
 * - Outer and inner shell generation
 * - Pierce mode for skin patterns
 * - Top rim
 * - Bottom cap (pot floor or shade open rim)
 *
 * Note: Suspension hub is handled separately in suspensionHub.ts
 */

import * as THREE from 'three';
import { mergeVertices } from 'three-stdlib';
import { DesignParams } from '../../types';
import { calculatePointData, addQuad } from './profileMath';
import { generateSuspensionHub, createConfigFromParams } from './suspensionHub';

export const generateBodyGeometry = (params: DesignParams): THREE.BufferGeometry => {
  const {
    height,
    radialSegments: baseRadialSegments,
    thickness,
    mode,
    radiusTop,
    radiusBottom,
    drainageHoleSize,
    bottomLift,
    potFloorThickness
  } = params;

  const h = height;

  // Dynamic height segments
  let heightSegments = Math.min(200, Math.max(40, Math.ceil(height * 8)));
  let radialSegments = baseRadialSegments;

  // Boost resolution for skin patterns
  if (params.skinPattern !== 'none') {
    const scale = Math.max(0.1, params.skinScale);
    const smooth = Math.max(1, Math.min(20, params.skinSmoothing ?? 2));
    const segsPerTile = Math.ceil(8 * smooth);

    const tilesAlongHeight = height / scale;
    const patternHeightSegs = Math.ceil(tilesAlongHeight * segsPerTile);
    heightSegments = Math.min(2000, Math.max(heightSegments, patternHeightSegs));

    const avgRadius = (radiusTop + radiusBottom) / 2;
    const circumference = 2 * Math.PI * avgRadius;
    const tilesAroundCirc = circumference / scale;
    const patternRadialSegs = Math.ceil(tilesAroundCirc * segsPerTile);
    radialSegments = Math.min(2000, Math.max(radialSegments, patternRadialSegs));
  }

  const vertices: number[] = [];
  const indices: number[] = [];

  const gridOuter: number[] = [];
  const gridInner: number[] = [];
  const pierceOuter: number[] = [];
  const pierceInner: number[] = [];
  const cols = radialSegments + 1;
  const hasPierce = params.skinPattern !== 'none' && params.skinMode === 'pierced';

  let vertexIndex = 0;

  // 1. Outer Shell
  for (let i = 0; i <= heightSegments; i++) {
    const y = (i / heightSegments) * height;
    for (let j = 0; j <= radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2;
      const p = calculatePointData(y, theta, params);
      const pierceVal = p.pierce ?? 0;

      let rOuter = p.r;
      if (hasPierce && pierceVal > 0) {
        rOuter = Math.max(0.01, p.r - thickness * pierceVal);
      }

      vertices.push(rOuter * Math.cos(theta), y, rOuter * Math.sin(theta));
      gridOuter.push(vertexIndex++);
      pierceOuter.push(pierceVal);
    }
  }

  // FDM 35° overhang suppression for pierce mode
  if (hasPierce) {
    const maxPierceAngle = 35 * Math.PI / 180;
    for (let i = 0; i <= heightSegments; i++) {
      for (let j = 0; j <= radialSegments; j++) {
        const idx = i * cols + j;
        if (pierceOuter[idx] <= 0.01) continue;

        const iBelow = Math.max(0, i - 1);
        const iAbove = Math.min(heightSegments, i + 1);
        const idxBelow = iBelow * cols + j;
        const idxAbove = iAbove * cols + j;

        const viB = gridOuter[idxBelow] * 3;
        const viA = gridOuter[idxAbove] * 3;
        const rBelow = Math.sqrt(vertices[viB] ** 2 + vertices[viB + 2] ** 2);
        const rAbove = Math.sqrt(vertices[viA] ** 2 + vertices[viA + 2] ** 2);
        const yBelow = vertices[viB + 1];
        const yAbove = vertices[viA + 1];

        const dy = yAbove - yBelow;
        if (dy > 0.001) {
          const wallAngle = Math.atan2(Math.abs(rAbove - rBelow), dy);
          if (wallAngle > maxPierceAngle) {
            pierceOuter[idx] = 0;
          } else if (wallAngle > maxPierceAngle * 0.7) {
            const fade = 1 - (wallAngle - maxPierceAngle * 0.7) / (maxPierceAngle * 0.3);
            pierceOuter[idx] *= fade;
          }
        }
      }
    }
  }

  // 2. Inner Shell
  const rimDeltaTop = thickness * Math.tan(params.rimAngle * (Math.PI / 180));
  let innerTopY = height - rimDeltaTop;

  const rimDeltaBottom = thickness * Math.tan((params.rimAngleBottom || 0) * (Math.PI / 180));
  const baseInnerY = mode === 'pot' ? potFloorThickness : 0;
  let innerBottomY = baseInnerY + rimDeltaBottom;

  if (innerTopY <= innerBottomY + 0.1) {
      innerTopY = innerBottomY + 0.1;
  }

  for (let i = 0; i <= heightSegments; i++) {
    const t = i / heightSegments;
    const y = innerBottomY + t * (innerTopY - innerBottomY);

    for (let j = 0; j <= radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2;
      const p = calculatePointData(y, theta, params);
      const pierceT = hasPierce ? pierceOuter[i * cols + j] : 0;
      const rInner = Math.max(0.01, p.r - thickness);
      const xInner = rInner * Math.cos(theta);
      const zInner = rInner * Math.sin(theta);

      vertices.push(xInner, y, zInner);
      gridInner.push(vertexIndex++);
      pierceInner.push(pierceT);
    }
  }

  // Local addQuad helper that uses our indices array
  const addQ = (a: number, b: number, c: number, d: number, flipped = false) => {
    addQuad(indices, a, b, c, d, flipped);
  };

  // Pierce threshold for face culling
  const pierceThreshold = 0.5;

  // Outer Faces
  for (let i = 0; i < heightSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const row1 = i * cols + j;
      const row2 = (i + 1) * cols + j;

      if (hasPierce) {
        const minP = Math.min(
          pierceOuter[row1], pierceOuter[row1 + 1],
          pierceOuter[row2], pierceOuter[row2 + 1]
        );
        if (minP > pierceThreshold) continue;
      }

      const a = gridOuter[row1];
      const b = gridOuter[row1 + 1];
      const c = gridOuter[row2 + 1];
      const d = gridOuter[row2];
      addQ(a, b, c, d, true);
    }
  }

  // Inner Faces
  for (let i = 0; i < heightSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const row1 = i * cols + j;
      const row2 = (i + 1) * cols + j;

      if (hasPierce) {
        const minP = Math.min(
          pierceInner[row1], pierceInner[row1 + 1],
          pierceInner[row2], pierceInner[row2 + 1]
        );
        if (minP > pierceThreshold) continue;
      }

      const a = gridInner[row1];
      const b = gridInner[row1 + 1];
      const c = gridInner[row2 + 1];
      const d = gridInner[row2];
      addQ(a, b, c, d);
    }
  }

  // Top Rim
  const outerTopIdx = heightSegments * cols;
  const innerTopIdx = heightSegments * cols;

  for (let j = 0; j < radialSegments; j++) {
    const a = gridOuter[outerTopIdx + j];
    const b = gridOuter[outerTopIdx + j + 1];
    const c = gridInner[innerTopIdx + j + 1];
    const d = gridInner[innerTopIdx + j];
    addQ(a, b, c, d, true);
  }

  // Bottom Cap (Floor OR Open Rim)
  if (mode === 'pot') {
    generatePotFloor(
      vertices, indices, vertexIndex,
      gridOuter, gridInner,
      radialSegments, potFloorThickness,
      drainageHoleSize, bottomLift,
      params, calculatePointData
    );
  } else {
    // SHADE MODE: Open Bottom Rim
    const outerBotIdx = 0;
    const innerBotIdx = 0;
    for (let j = 0; j < radialSegments; j++) {
      const a = gridOuter[outerBotIdx + j];
      const b = gridOuter[outerBotIdx + j + 1];
      const c = gridInner[innerBotIdx + j + 1];
      const d = gridInner[innerBotIdx + j];
      addQ(a, b, c, d);
    }

    // SUSPENSION HUB (when enabled)
    if (params.enableSuspension) {
      // Function to get wall inner radius at any (y, theta)
      const getWallInnerRadius = (y: number, theta: number): number => {
        const p = calculatePointData(y, theta, params);
        return Math.max(0.01, p.r - thickness);
      };

      const hubConfig = createConfigFromParams(params, getWallInnerRadius);
      const hubResult = generateSuspensionHub(hubConfig, radialSegments);

      // Append hub vertices (offset indices by current vertex count)
      const hubVertexOffset = vertexIndex;
      for (let i = 0; i < hubResult.vertices.length; i += 3) {
        vertices.push(hubResult.vertices[i], hubResult.vertices[i + 1], hubResult.vertices[i + 2]);
        vertexIndex++;
      }

      // Append hub indices (with offset)
      for (let i = 0; i < hubResult.indices.length; i++) {
        indices.push(hubResult.indices[i] + hubVertexOffset);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  const merged = mergeVertices(geometry, 1e-4);
  merged.computeVertexNormals();

  return merged;
};

/**
 * Generate pot floor geometry (flat or lifted with drain hole)
 * Enforces 35° minimum slope for FDM printability
 */
function generatePotFloor(
  vertices: number[],
  indices: number[],
  startVertexIndex: number,
  gridOuter: number[],
  gridInner: number[],
  radialSegments: number,
  potFloorThickness: number,
  drainageHoleSize: number,
  bottomLift: number,
  params: DesignParams,
  calcPoint: typeof calculatePointData
): void {
  let vertexIndex = startVertexIndex;
  const holeRadius = Math.max(0, drainageHoleSize / 2);
  const liftY = bottomLift;
  const MIN_FLOOR_ANGLE = 35 * (Math.PI / 180);

  const addQ = (a: number, b: number, c: number, d: number, flipped = false) => {
    addQuad(indices, a, b, c, d, flipped);
  };

  if (liftY <= 0.01) {
    // ====== NO LIFT: FLAT FLOOR ======
    if (holeRadius <= 0.05) {
      // Closed flat
      vertices.push(0, 0, 0);
      const cOuter = vertexIndex++;
      vertices.push(0, potFloorThickness, 0);
      const cInner = vertexIndex++;
      for (let j = 0; j < radialSegments; j++) {
        indices.push(cOuter, gridOuter[j], gridOuter[j + 1]);
      }
      for (let j = 0; j < radialSegments; j++) {
        indices.push(cInner, gridInner[j + 1], gridInner[j]);
      }
    } else {
      // Flat with drain hole
      const gridHoleO: number[] = [];
      const gridHoleI: number[] = [];
      for (let j = 0; j <= radialSegments; j++) {
        const theta = (j / radialSegments) * Math.PI * 2;
        const cx = holeRadius * Math.cos(theta);
        const cz = holeRadius * Math.sin(theta);
        vertices.push(cx, 0, cz);
        gridHoleO.push(vertexIndex++);
        vertices.push(cx, potFloorThickness, cz);
        gridHoleI.push(vertexIndex++);
      }
      for (let j = 0; j < radialSegments; j++) {
        addQ(gridOuter[j], gridOuter[j+1], gridHoleO[j+1], gridHoleO[j]);
      }
      for (let j = 0; j < radialSegments; j++) {
        addQ(gridInner[j], gridInner[j+1], gridHoleI[j+1], gridHoleI[j], true);
      }
      for (let j = 0; j < radialSegments; j++) {
        addQ(gridHoleO[j], gridHoleO[j+1], gridHoleI[j+1], gridHoleI[j]);
      }
    }
  } else {
    // ====== WITH LIFT: 35° ANGLE-CONSTRAINED FLOOR ======
    const tanA = Math.tan(MIN_FLOOR_ANGLE);
    const rConeBase = holeRadius + liftY / tanA;

    const gridTransO: number[] = [];
    for (let j = 0; j <= radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2;
      const pO = calcPoint(0, theta, params);
      const rT = Math.min(pO.r, rConeBase);
      vertices.push(rT * Math.cos(theta), 0, rT * Math.sin(theta));
      gridTransO.push(vertexIndex++);
    }

    // Flat ring: wall outer row → transition ring
    for (let j = 0; j < radialSegments; j++) {
      addQ(gridOuter[j], gridOuter[j+1], gridTransO[j+1], gridTransO[j]);
    }

    if (holeRadius <= 0.05) {
      // Cone: transition → center
      vertices.push(0, liftY, 0);
      const cOuter = vertexIndex++;
      for (let j = 0; j < radialSegments; j++) {
        indices.push(cOuter, gridTransO[j], gridTransO[j + 1]);
      }
      vertices.push(0, potFloorThickness + liftY, 0);
      const cInner = vertexIndex++;
      for (let j = 0; j < radialSegments; j++) {
        indices.push(cInner, gridInner[j + 1], gridInner[j]);
      }
    } else {
      // Cone with drain hole
      const gridHoleO: number[] = [];
      const gridHoleI: number[] = [];
      for (let j = 0; j <= radialSegments; j++) {
        const theta = (j / radialSegments) * Math.PI * 2;
        const cx = holeRadius * Math.cos(theta);
        const cz = holeRadius * Math.sin(theta);
        vertices.push(cx, liftY, cz);
        gridHoleO.push(vertexIndex++);
        vertices.push(cx, potFloorThickness + liftY, cz);
        gridHoleI.push(vertexIndex++);
      }
      for (let j = 0; j < radialSegments; j++) {
        addQ(gridTransO[j], gridTransO[j+1], gridHoleO[j+1], gridHoleO[j]);
      }
      for (let j = 0; j < radialSegments; j++) {
        addQ(gridInner[j], gridInner[j+1], gridHoleI[j+1], gridHoleI[j], true);
      }
      for (let j = 0; j < radialSegments; j++) {
        addQ(gridHoleO[j], gridHoleO[j+1], gridHoleI[j+1], gridHoleI[j]);
      }
    }
  }
}
