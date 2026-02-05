/**
 * SUSPENSION HUB TEST HARNESS
 *
 * Run this to test the suspension hub module in isolation.
 * Usage: npx ts-node utils/suspensionHub.test.ts
 *
 * This generates a test STL file that can be loaded in a slicer
 * to verify printability without the full shade geometry.
 */

import * as fs from 'fs';
import { generateSuspensionHub, SuspensionConfig } from './suspensionHub';

// Simple STL export (ASCII format for debugging)
function exportToSTL(vertices: number[], indices: number[], filename: string): void {
  let stl = 'solid suspension_hub_test\n';

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const v0 = [vertices[i0], vertices[i0 + 1], vertices[i0 + 2]];
    const v1 = [vertices[i1], vertices[i1 + 1], vertices[i1 + 2]];
    const v2 = [vertices[i2], vertices[i2 + 1], vertices[i2 + 2]];

    // Compute normal
    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const len = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
    if (len > 0) {
      n[0] /= len;
      n[1] /= len;
      n[2] /= len;
    }

    stl += `  facet normal ${n[0]} ${n[1]} ${n[2]}\n`;
    stl += '    outer loop\n';
    stl += `      vertex ${v0[0]} ${v0[1]} ${v0[2]}\n`;
    stl += `      vertex ${v1[0]} ${v1[1]} ${v1[2]}\n`;
    stl += `      vertex ${v2[0]} ${v2[1]} ${v2[2]}\n`;
    stl += '    endloop\n';
    stl += '  endfacet\n';
  }

  stl += 'endsolid suspension_hub_test\n';
  fs.writeFileSync(filename, stl);
  console.log(`Exported ${indices.length / 3} triangles to ${filename}`);
}

// Test configuration simulating a simple conical shade
const testConfig: SuspensionConfig = {
  centerY: 7.5,              // Hub at 50% of 15cm height
  holeRadius: 2.0,           // 4cm diameter hole
  hubWidth: 1.0,             // 1cm hub ring width
  hubThickness: 0.4,         // 4mm thick material
  spokeCount: 4,             // 4 spokes
  spokeWidthMm: 15,          // 15mm spoke width at hub
  spokeWallWidthMm: 15,      // 15mm spoke width at wall
  spokeAngle: 45,            // 45° slope
  archDepthFactor: 0.35,     // Arch depth
  flipped: false,            // Normal orientation
  spokeHollow: 0,            // Solid spokes
  socketDepth: 0,            // No socket tube
  socketWall: 0.2,           // 2mm wall thickness
  wallThickness: 0.3,        // 3mm wall
  shadeHeight: 15,           // 15cm tall shade

  // Simple conical wall: radius varies linearly from 8cm at bottom to 10cm at top
  wallRadiusAtY: (y: number, _theta: number) => {
    const t = y / 15;  // 0 at bottom, 1 at top
    const outerR = 8 + 2 * t;  // 8cm at bottom, 10cm at top
    return outerR - 0.3;  // Inner wall (subtract wall thickness)
  },
};

console.log('Generating suspension hub test geometry...');
console.log('Config:', JSON.stringify(testConfig, null, 2));

const result = generateSuspensionHub(testConfig, 64);

console.log(`Generated ${result.vertices.length / 3} vertices, ${result.indices.length / 3} triangles`);

// Validate mesh
let issues = 0;
for (let i = 0; i < result.indices.length; i++) {
  if (result.indices[i] >= result.vertices.length / 3) {
    console.error(`Invalid index at ${i}: ${result.indices[i]}`);
    issues++;
  }
}
if (issues === 0) {
  console.log('Mesh validation: PASSED');
} else {
  console.log(`Mesh validation: FAILED (${issues} issues)`);
}

// Export
exportToSTL(result.vertices, result.indices, '/tmp/suspension_hub_test.stl');
console.log('\nOpen /tmp/suspension_hub_test.stl in your slicer to verify printability.');
