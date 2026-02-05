/**
 * SAUCER GEOMETRY MODULE
 *
 * Generates the saucer/drip tray that sits under the pot.
 * The saucer follows the pot's profile with a gap for easy removal.
 *
 * Now includes:
 * - Skin patterns (embossed, carved, pierced) on outer wall
 * - Surface textures (ribs, ripples) on outer wall
 * - Twist applied to decorative features
 * - FDM overhang suppression for pierced patterns
 */

import * as THREE from 'three';
import { mergeVertices } from 'three-stdlib';
import { DesignParams } from '../../types';
import { calculatePointData, addQuad } from './profileMath';
import { evaluateSkinPattern } from '../patterns';

export const generateSaucerGeometry = (params: DesignParams): THREE.BufferGeometry => {
  const {
    radialSegments: baseRadialSegments,
    saucerHeight,
    saucerGap,
    saucerWallThickness,
    saucerBaseThickness,
    saucerSlope,
    skinPattern,
    skinMode,
    skinScale,
    twist,
    ribCount,
    ribAmplitude,
    rippleAmplitude,
    rippleFrequency
  } = params;

  // --- Dynamic resolution ---
  let heightSegments = Math.max(10, Math.ceil(saucerHeight * 10));
  let radialSegments = baseRadialSegments;

  const hasPattern = skinPattern !== 'none';
  const hasPierce = hasPattern && skinMode === 'pierced';
  const hasTexture = ribCount > 0 || rippleAmplitude > 0;

  if (hasPattern) {
    const scale = Math.max(0.1, skinScale);
    const smooth = Math.max(1, Math.min(20, params.skinSmoothing ?? 2));
    const segsPerTile = Math.ceil(8 * smooth);

    const tilesAlongHeight = saucerHeight / scale;
    const patternHeightSegs = Math.ceil(tilesAlongHeight * segsPerTile);
    heightSegments = Math.min(800, Math.max(heightSegments, patternHeightSegs));

    const avgPotRadius = (params.radiusTop + params.radiusBottom) / 2;
    const avgSaucerRadius = avgPotRadius + saucerGap + saucerWallThickness / 2;
    const circumference = 2 * Math.PI * avgSaucerRadius;
    const tilesAroundCirc = circumference / scale;
    const patternRadialSegs = Math.ceil(tilesAroundCirc * segsPerTile);
    radialSegments = Math.min(800, Math.max(radialSegments, patternRadialSegs));
  }

  const vertices: number[] = [];
  const indices: number[] = [];

  let vertexIndex = 0;

  const gridInner: number[] = [];
  const gridOuter: number[] = [];
  const pierceOuter: number[] = [];

  const flareTan = Math.tan(saucerSlope * (Math.PI / 180));
  const cols = radialSegments + 1;

  // --- Build vertex grids ---
  for (let i = 0; i <= heightSegments; i++) {
    const t = i / heightSegments;

    // INNER SHELL: starts at floor top, goes up to saucer top
    const yInner = saucerBaseThickness + t * (saucerHeight - saucerBaseThickness);
    const yPotInner = yInner - saucerBaseThickness;

    // OUTER SHELL: starts at saucer bottom, goes up to saucer top
    const yOuter = t * saucerHeight;
    const yPotOuter = yOuter - saucerBaseThickness;

    for (let j = 0; j <= radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2;

      // --- INNER RADIUS (follows pot profile + gap) ---
      const pInner = calculatePointData(Math.max(0, yPotInner), theta, params);
      let rInner = pInner.r + saucerGap;
      rInner += (yInner - saucerBaseThickness) * flareTan;

      vertices.push(rInner * Math.cos(theta), yInner, rInner * Math.sin(theta));
      gridInner.push(vertexIndex++);

      // --- OUTER RADIUS (with surface features) ---
      const pOuter = calculatePointData(Math.max(0, yPotOuter), theta, params);
      let rOuter = pOuter.r + saucerGap + saucerWallThickness;
      rOuter += (yOuter - saucerBaseThickness) * flareTan;

      // Apply twist
      const tSaucer = t;
      const twistedTheta = theta + (twist * Math.PI / 180) * tSaucer;

      // Apply ribs to outer wall
      if (ribCount > 0 && ribAmplitude > 0) {
        // Fade ribs at top/bottom edges
        const ribFade = Math.sin(Math.PI * tSaucer);
        const ribPattern = Math.cos(twistedTheta * ribCount);
        rOuter += ribAmplitude * ribFade * ribPattern;
      }

      // Apply ripples to outer wall
      if (rippleAmplitude > 0 && rippleFrequency > 0) {
        const rippleFade = Math.sin(Math.PI * tSaucer);
        const ripplePattern = Math.sin(rippleFrequency * Math.PI * tSaucer);
        rOuter += rippleAmplitude * rippleFade * ripplePattern;
      }

      // Apply skin pattern to outer wall
      let pierceVal = 0;
      if (hasPattern) {
        const skinResult = evaluateSkinPattern(yOuter, twistedTheta, rOuter, params);

        if (skinMode === 'embossed') {
          rOuter += skinResult.delta;
        } else if (skinMode === 'carved') {
          rOuter += skinResult.delta;
        } else if (skinMode === 'pierced') {
          pierceVal = skinResult.pierce;
        }
      }

      // For pierce mode, pull outer radius inward where pierced
      if (hasPierce && pierceVal > 0) {
        rOuter = Math.max(rInner + 0.01, rOuter - saucerWallThickness * pierceVal);
      }

      vertices.push(rOuter * Math.cos(theta), yOuter, rOuter * Math.sin(theta));
      gridOuter.push(vertexIndex++);
      pierceOuter.push(pierceVal);
    }
  }

  // --- FDM 35° overhang suppression for pierce mode ---
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

  // Pierce threshold for face culling
  const pierceThreshold = 0.5;

  // 1. Build Walls (Inner facing in, Outer facing out)
  for (let i = 0; i < heightSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const row1 = i * cols + j;
      const row2 = (i + 1) * cols + j;

      // Pierce culling for inner wall (matches outer)
      if (hasPierce) {
        const minP = Math.min(
          pierceOuter[row1], pierceOuter[row1 + 1],
          pierceOuter[row2], pierceOuter[row2 + 1]
        );
        if (minP > pierceThreshold) continue;
      }

      // Inner Wall (faces inward)
      addQuad(indices, gridInner[row1], gridInner[row1 + 1], gridInner[row2 + 1], gridInner[row2]);

      // Outer Wall (faces outward)
      addQuad(indices, gridOuter[row1], gridOuter[row1 + 1], gridOuter[row2 + 1], gridOuter[row2], true);
    }
  }

  // 2. Top Rim (Connects Inner top to Outer top)
  const topStart = heightSegments * cols;
  for (let j = 0; j < radialSegments; j++) {
    const i1 = gridInner[topStart + j];
    const i2 = gridInner[topStart + j + 1];
    const o1 = gridOuter[topStart + j];
    const o2 = gridOuter[topStart + j + 1];
    addQuad(indices, i1, i2, o2, o1);
  }

  // 3. Bottom Floor Generation
  // Inner Floor Center (y = saucerBaseThickness)
  vertices.push(0, saucerBaseThickness, 0);
  const cTop = vertexIndex++;

  // Outer Bottom Center (y = 0)
  vertices.push(0, 0, 0);
  const cBottom = vertexIndex++;

  // Inner Floor Faces (Top of the floor slab)
  for (let j = 0; j < radialSegments; j++) {
    const curr = gridInner[j];
    const next = gridInner[j + 1];
    indices.push(cTop, next, curr);
  }

  // Outer Bottom Faces (Bottom of the floor slab)
  for (let j = 0; j < radialSegments; j++) {
    const curr = gridOuter[j];
    const next = gridOuter[j + 1];
    indices.push(cBottom, curr, next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  const merged = mergeVertices(geometry, 1e-4);
  merged.computeVertexNormals();

  return merged;
};
