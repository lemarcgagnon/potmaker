/**
 * Test script: Verify hub and body form a single connected shell after mergeVertices.
 * This tests the spoke-body topological integration.
 */
import { generateSuspensionHub, SuspensionConfig } from './suspensionHub';
import { mergeVertices } from 'three-stdlib';
import * as THREE from 'three';

function analyzePostMerge(label: string, config: SuspensionConfig, radialSegments: number) {
  // 1. Generate body inner wall as a simple cylindrical shell
  const heightSegments = 120;
  const height = config.shadeHeight;
  const thickness = config.wallThickness;
  const innerBottomY = 0;
  const innerTopY = height;
  const bodyThetaStep = 2 * Math.PI / radialSegments;

  const vertices: number[] = [];
  const indices: number[] = [];
  let vertexIndex = 0;
  const cols = radialSegments + 1;

  // Outer shell (simplified cylinder)
  const gridOuter: number[] = [];
  for (let i = 0; i <= heightSegments; i++) {
    const y = (i / heightSegments) * height;
    for (let j = 0; j <= radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2;
      const r = config.wallRadiusAtY(y, theta) + thickness;
      vertices.push(r * Math.cos(theta), y, r * Math.sin(theta));
      gridOuter.push(vertexIndex++);
    }
  }

  // Inner shell
  const gridInner: number[] = [];
  for (let i = 0; i <= heightSegments; i++) {
    const y = innerBottomY + (i / heightSegments) * (innerTopY - innerBottomY);
    for (let j = 0; j <= radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2;
      const r = config.wallRadiusAtY(y, theta);
      vertices.push(r * Math.cos(theta), y, r * Math.sin(theta));
      gridInner.push(vertexIndex++);
    }
  }

  // Pre-compute spoke skip regions (matching bodyGeometry.ts logic)
  const innerWallSkipSet = new Set<string>();
  const wallAttachY = Math.max(0.5, Math.min(height - 0.5, config.centerY));
  const thick = config.hubThickness;
  const bodyYStep = (innerTopY - innerBottomY) / heightSegments;
  const skipIBot = Math.max(0, Math.min(heightSegments, Math.round((wallAttachY - innerBottomY) / bodyYStep)));
  const skipITop = Math.max(skipIBot + 1, Math.min(heightSegments, Math.round((wallAttachY + thick - innerBottomY) / bodyYStep)));
  const repWallR = config.wallRadiusAtY(wallAttachY, 0);
  const wallWidthRad = config.spokeWallWidthMm / (repWallR * 10);
  const spokeStep = 2 * Math.PI / config.spokeCount;

  for (let k = 0; k < config.spokeCount; k++) {
    const center = k * spokeStep;
    const minTheta = center - wallWidthRad / 2;
    const maxTheta = center + wallWidthRad / 2;
    let jMin = Math.round(minTheta / bodyThetaStep);
    let jMax = Math.round(maxTheta / bodyThetaStep);
    jMin = ((jMin % radialSegments) + radialSegments) % radialSegments;
    jMax = ((jMax % radialSegments) + radialSegments) % radialSegments;

    for (let i = skipIBot; i < skipITop; i++) {
      if (jMin <= jMax) {
        for (let j = jMin; j < jMax; j++) innerWallSkipSet.add(`${i},${j}`);
      } else {
        for (let j = jMin; j < radialSegments; j++) innerWallSkipSet.add(`${i},${j}`);
        for (let j = 0; j < jMax; j++) innerWallSkipSet.add(`${i},${j}`);
      }
    }
  }

  const addQ = (a: number, b: number, c: number, d: number) => {
    indices.push(a, b, c, a, c, d);
  };
  const addQFlip = (a: number, b: number, c: number, d: number) => {
    indices.push(a, c, b, a, d, c);
  };

  // Outer faces
  for (let i = 0; i < heightSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const row1 = i * cols + j;
      const row2 = (i + 1) * cols + j;
      addQFlip(gridOuter[row1], gridOuter[row1 + 1], gridOuter[row2 + 1], gridOuter[row2]);
    }
  }

  // Inner faces (with spoke skip)
  for (let i = 0; i < heightSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      if (innerWallSkipSet.has(`${i},${j}`)) continue;
      const row1 = i * cols + j;
      const row2 = (i + 1) * cols + j;
      addQ(gridInner[row1], gridInner[row1 + 1], gridInner[row2 + 1], gridInner[row2]);
    }
  }

  // Top rim
  const topRow = heightSegments * cols;
  for (let j = 0; j < radialSegments; j++) {
    addQFlip(gridOuter[topRow + j], gridOuter[topRow + j + 1], gridInner[topRow + j + 1], gridInner[topRow + j]);
  }

  // Bottom rim
  for (let j = 0; j < radialSegments; j++) {
    addQ(gridOuter[j], gridOuter[j + 1], gridInner[j + 1], gridInner[j]);
  }

  // 2. Generate hub with bodyGridInfo
  config.bodyGridInfo = { innerBottomY, innerTopY, heightSegments };
  const hub = generateSuspensionHub(config, radialSegments);

  // Append hub vertices
  const hubOffset = vertexIndex;
  for (let i = 0; i < hub.vertices.length; i += 3) {
    vertices.push(hub.vertices[i], hub.vertices[i + 1], hub.vertices[i + 2]);
    vertexIndex++;
  }
  for (const idx of hub.indices) {
    indices.push(idx + hubOffset);
  }

  // 3. Create geometry and merge vertices
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  const merged = mergeVertices(geometry, 1e-4);

  // 4. Analyze merged mesh
  const pos = merged.getAttribute('position');
  const idx = merged.getIndex()!;
  const numVerts = pos.count;
  const numTris = idx.count / 3;

  // Edge analysis
  const edgeCount = new Map<string, number>();
  const directedEdges = new Map<string, number>();
  for (let i = 0; i < idx.count; i += 3) {
    const v = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
    // Skip degenerate triangles
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3];
      const key = [Math.min(a, b), Math.max(a, b)].join(',');
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
      directedEdges.set(`${a},${b}`, (directedEdges.get(`${a},${b}`) || 0) + 1);
    }
  }

  let openEdges = 0, multiEdges = 0, badWinding = 0;
  edgeCount.forEach((count, edge) => {
    if (count === 1) openEdges++;
    else if (count > 2) multiEdges++;
    if (count === 2) {
      const [v1, v2] = edge.split(',').map(Number);
      const f = directedEdges.get(`${v1},${v2}`) || 0;
      const bk = directedEdges.get(`${v2},${v1}`) || 0;
      if (f !== 1 || bk !== 1) badWinding++;
    }
  });

  // Connected components (BFS)
  const adj = new Map<number, Set<number>>();
  for (let i = 0; i < idx.count; i += 3) {
    const v = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3];
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    }
  }

  const visited = new Set<number>();
  let components = 0;
  for (const [node] of adj) {
    if (visited.has(node)) continue;
    components++;
    const queue = [node];
    while (queue.length > 0) {
      const cur = queue.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const neighbor of adj.get(cur)!) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
  }

  const status = openEdges === 0 && multiEdges === 0 && badWinding === 0 && components === 1 ? 'PASS' : 'FAIL';
  console.log(`${label}: verts=${numVerts} tris=${numTris} open=${openEdges} non-manifold=${multiEdges} bad-winding=${badWinding} components=${components} ${status}`);

  if (status === 'FAIL') {
    if (openEdges > 0) {
      console.log(`  Open edges: ${openEdges}`);
      let count = 0;
      edgeCount.forEach((c, edge) => {
        if (c === 1 && count < 5) {
          const [v1, v2] = edge.split(',').map(Number);
          const p1 = [pos.getX(v1), pos.getY(v1), pos.getZ(v1)].map(v => v.toFixed(3));
          const p2 = [pos.getX(v2), pos.getY(v2), pos.getZ(v2)].map(v => v.toFixed(3));
          console.log(`    [${p1}] → [${p2}]`);
          count++;
        }
      });
    }
    if (multiEdges > 0) {
      console.log(`  Non-manifold edges: ${multiEdges}`);
      let count = 0;
      edgeCount.forEach((c, edge) => {
        if (c > 2 && count < 5) {
          const [v1, v2] = edge.split(',').map(Number);
          const p1 = [pos.getX(v1), pos.getY(v1), pos.getZ(v1)].map(v => v.toFixed(3));
          const p2 = [pos.getX(v2), pos.getY(v2), pos.getZ(v2)].map(v => v.toFixed(3));
          console.log(`    [${p1}] → [${p2}] (${c} faces)`);
          count++;
        }
      });
    }
    if (components > 1) {
      console.log(`  Multiple shells: ${components} (should be 1)`);
    }
  }

  return hub.spokeRegions;
}

// Test configurations
const base: SuspensionConfig = {
  centerY: 7.5, holeRadius: 2.0, hubWidth: 1.0, hubThickness: 0.4,
  spokeCount: 3, spokeWidthMm: 15, spokeWallWidthMm: 15, spokeAngle: 45,
  archDepthFactor: 0.5, flipped: false, spokeHollow: 0, socketDepth: 0,
  socketWall: 0.4, socketChamferAngle: 0, socketChamferDepth: 0.2,
  wallThickness: 0.3, shadeHeight: 15,
  wallRadiusAtY: () => 10,
};

console.log('=== Combined Body+Hub Integration Test ===');
const regions = analyzePostMerge("basic", {...base}, 64);
console.log(`  spokeRegions: iMin=${regions?.iMin} iMax=${regions?.iMax} jRanges=${JSON.stringify(regions?.spokeJRanges)}`);

analyzePostMerge("socket", {...base, socketDepth: 2.0}, 64);
analyzePostMerge("socket+chamfer", {...base, socketDepth: 2.0, socketChamferAngle: 30, socketChamferDepth: 0.5}, 64);
analyzePostMerge("hollow", {...base, spokeHollow: 0.5}, 64);
analyzePostMerge("flipped", {...base, flipped: true}, 64);
analyzePostMerge("flipped+socket", {...base, flipped: true, socketDepth: 2.0}, 64);
analyzePostMerge("4-spokes", {...base, spokeCount: 4}, 64);
analyzePostMerge("narrow", {...base, spokeWidthMm: 5, spokeWallWidthMm: 5}, 64);
analyzePostMerge("everything", {...base, spokeHollow: 0.5, socketDepth: 2.0, socketChamferAngle: 30, socketChamferDepth: 0.5}, 64);
