/**
 * SAUCER GEOMETRY MODULE
 *
 * Generates the saucer/drip tray that sits under the pot.
 * The saucer follows the pot's profile with a gap for easy removal.
 */

import * as THREE from 'three';
import { mergeVertices } from 'three-stdlib';
import { DesignParams } from '../../types';
import { calculatePointData, addQuad } from './profileMath';

export const generateSaucerGeometry = (params: DesignParams): THREE.BufferGeometry => {
  const {
    radialSegments,
    saucerHeight,
    saucerGap,
    saucerWallThickness,
    saucerBaseThickness,
    saucerSlope
  } = params;

  const heightSegments = Math.max(10, Math.ceil(saucerHeight * 10));
  const vertices: number[] = [];
  const indices: number[] = [];

  let vertexIndex = 0;

  const gridInner: number[] = [];
  const gridOuter: number[] = [];

  const flareTan = Math.tan(saucerSlope * (Math.PI / 180));

  for (let i = 0; i <= heightSegments; i++) {
    const t = i / heightSegments;

    // INNER SHELL:
    const yInner = saucerBaseThickness + t * (saucerHeight - saucerBaseThickness);
    const yPotInner = yInner - saucerBaseThickness;

    // OUTER SHELL:
    const yOuter = t * saucerHeight;
    const yPotOuter = yOuter - saucerBaseThickness;

    for (let j = 0; j <= radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2;

      // Calculate Inner Radius based on pot profile + gap
      const pInner = calculatePointData(Math.max(0, yPotInner), theta, params);
      let rInner = pInner.r + saucerGap;
      rInner += (yInner - saucerBaseThickness) * flareTan;

      // Calculate Outer Radius
      const pOuter = calculatePointData(Math.max(0, yPotOuter), theta, params);
      let rOuter = pOuter.r + saucerGap + saucerWallThickness;
      rOuter += (yOuter - saucerBaseThickness) * flareTan;

      vertices.push(rInner * Math.cos(theta), yInner, rInner * Math.sin(theta));
      gridInner.push(vertexIndex++);

      vertices.push(rOuter * Math.cos(theta), yOuter, rOuter * Math.sin(theta));
      gridOuter.push(vertexIndex++);
    }
  }

  const cols = radialSegments + 1;

  // 1. Build Walls (Inner facing in, Outer facing out)
  for (let i = 0; i < heightSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const row1 = i * cols + j;
      const row2 = (i + 1) * cols + j;

      // Inner Wall (faces inward)
      addQuad(indices, gridInner[row1], gridInner[row1+1], gridInner[row2+1], gridInner[row2]);

      // Outer Wall (faces outward)
      addQuad(indices, gridOuter[row1], gridOuter[row1+1], gridOuter[row2+1], gridOuter[row2], true);
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
    const next = gridOuter[j+1];
    indices.push(cBottom, curr, next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  const merged = mergeVertices(geometry, 1e-4);
  merged.computeVertexNormals();

  return merged;
};
