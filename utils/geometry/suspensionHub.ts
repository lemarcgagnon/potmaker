/**
 * SUSPENSION HUB GEOMETRY MODULE
 *
 * Isolated R&D module for generating the lamp shade suspension system.
 * This creates a spider-arm hub that holds the shade from inside.
 *
 * DESIGN REQUIREMENTS:
 * 1. Central hole for cord/socket (user-configurable diameter)
 * 2. Solid hub ring around the hole
 * 3. Spokes extending from hub to wall (configurable count)
 * 4. Vent gaps between spokes for heat dissipation
 * 5. All geometry must be FDM printable (no overhangs > 35°)
 * 6. All parts must be watertight and connected (no floating regions)
 * 7. Minimum 2mm material thickness throughout
 *
 * GEOMETRY APPROACH:
 * The hub is a single continuous mesh with these parts:
 * - Hub disk: flat or slightly conical ring from hole edge to spoke attachment
 * - Spokes: thick ribs that slope down from hub to wall inner surface
 * - The spoke tips EMBED into the wall thickness (shared vertices)
 */

import * as THREE from 'three';
import { mergeVertices } from 'three-stdlib';
import { DesignParams } from '../../types';

export interface SuspensionConfig {
  // Position
  centerY: number;           // Y position of hub center (height in shade)

  // Hub dimensions
  holeRadius: number;        // Radius of center hole (for cord)
  hubWidth: number;          // Width of solid hub ring
  hubThickness: number;      // Vertical thickness of hub material

  // Spoke dimensions
  spokeCount: number;        // Number of spokes (2-8)
  spokeWidthDeg: number;     // Angular width of each spoke in degrees
  spokeAngle: number;        // Slope angle in degrees (from horizontal)

  // Wall interface
  wallRadiusAtY: (y: number, theta: number) => number;  // Function to get wall inner radius
  wallThickness: number;     // Wall thickness (for embedding)
  shadeHeight: number;       // Total shade height (for bounds checking)
}

export interface SuspensionResult {
  vertices: number[];
  indices: number[];
}

/**
 * Generate the complete suspension hub geometry.
 * Returns vertices and indices that can be merged with the main shade geometry.
 */
export function generateSuspensionHub(
  config: SuspensionConfig,
  radialSegments: number
): SuspensionResult {
  const vertices: number[] = [];
  const indices: number[] = [];
  let vertexIndex = 0;

  const {
    centerY,
    holeRadius,
    hubWidth,
    hubThickness,
    spokeCount,
    spokeWidthDeg,
    spokeAngle,
    wallRadiusAtY,
    shadeHeight
  } = config;

  // Derived values
  const spokeAngleRad = spokeAngle * Math.PI / 180;
  const spokeWidthRad = spokeWidthDeg * Math.PI / 180;
  const tanAngle = Math.tan(spokeAngleRad);
  const hubOuterR = holeRadius + hubWidth;

  // Minimum printable angle (35° from horizontal)
  const MIN_PRINT_ANGLE = 35 * Math.PI / 180;
  const minTan = Math.tan(MIN_PRINT_ANGLE);

  // Ensure spoke angle is printable
  const effectiveTan = Math.max(tanAngle, minTan);

  // Hub sits at centerY, slopes down toward wall
  // Hub inner edge (at hole): Y = centerY
  // Hub outer edge: Y = centerY - hubWidth * effectiveTan (slopes down)
  const hubInnerY = centerY;
  const hubOuterY = centerY - hubWidth * effectiveTan;

  // Helper to add a quad (two triangles)
  const addQuad = (a: number, b: number, c: number, d: number, flip = false) => {
    if (flip) {
      indices.push(a, c, b, a, d, c);
    } else {
      indices.push(a, b, c, a, c, d);
    }
  };

  // ============================================
  // STEP 1: Generate hub disk (center hole to spoke attachment ring)
  // ============================================
  // The hub is a conical ring that slopes from hole edge down to outer edge.
  // This ensures printability (no horizontal overhang at center).

  const hubInnerRing: { bot: number; top: number }[] = [];
  const hubOuterRing: { bot: number; top: number }[] = [];

  for (let j = 0; j <= radialSegments; j++) {
    const theta = (j / radialSegments) * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    // Inner ring (at hole edge)
    vertices.push(holeRadius * cosT, hubInnerY, holeRadius * sinT);
    const innerBot = vertexIndex++;
    vertices.push(holeRadius * cosT, hubInnerY + hubThickness, holeRadius * sinT);
    const innerTop = vertexIndex++;
    hubInnerRing.push({ bot: innerBot, top: innerTop });

    // Outer ring (at spoke attachment)
    vertices.push(hubOuterR * cosT, hubOuterY, hubOuterR * sinT);
    const outerBot = vertexIndex++;
    vertices.push(hubOuterR * cosT, hubOuterY + hubThickness, hubOuterR * sinT);
    const outerTop = vertexIndex++;
    hubOuterRing.push({ bot: outerBot, top: outerTop });
  }

  // Build hub disk faces
  for (let j = 0; j < radialSegments; j++) {
    // Bottom face (faces down)
    addQuad(
      hubOuterRing[j].bot, hubOuterRing[j + 1].bot,
      hubInnerRing[j + 1].bot, hubInnerRing[j].bot,
      true
    );
    // Top face (faces up)
    addQuad(
      hubOuterRing[j].top, hubOuterRing[j + 1].top,
      hubInnerRing[j + 1].top, hubInnerRing[j].top
    );
    // Inner hole wall (faces inward toward hole)
    addQuad(
      hubInnerRing[j].bot, hubInnerRing[j + 1].bot,
      hubInnerRing[j + 1].top, hubInnerRing[j].top
    );
  }

  // ============================================
  // STEP 2: Compute spoke and gap regions
  // ============================================
  const hubStep = (2 * Math.PI) / radialSegments;
  const spokeRegions: { startJ: number; endJ: number; centerTheta: number }[] = [];
  const gapRegions: { startJ: number; endJ: number }[] = [];

  for (let k = 0; k < spokeCount; k++) {
    const centerTheta = (k / spokeCount) * Math.PI * 2;
    const startTheta = centerTheta - spokeWidthRad / 2;
    const endTheta = centerTheta + spokeWidthRad / 2;

    const startJ = Math.floor(startTheta / hubStep);
    const endJ = Math.ceil(endTheta / hubStep);

    spokeRegions.push({ startJ, endJ, centerTheta });
  }

  // Compute gap regions (between spokes)
  for (let k = 0; k < spokeCount; k++) {
    const thisSpoke = spokeRegions[k];
    const nextSpoke = spokeRegions[(k + 1) % spokeCount];

    let gapStart = thisSpoke.endJ;
    let gapEnd = nextSpoke.startJ;
    if (gapEnd < gapStart) gapEnd += radialSegments;

    if (gapEnd - gapStart >= 2) {
      gapRegions.push({ startJ: gapStart, endJ: gapEnd });
    }
  }

  // ============================================
  // STEP 3: Generate spokes (hub outer ring to wall)
  // ============================================
  // Each spoke is a thick rib that slopes from hub outer edge to wall.
  // The spoke uses radial subdivisions with vertices at each step.
  // Spoke tips stop AT the wall inner surface (embedded).

  const SPOKE_RADIAL_STEPS = 8;

  for (const spoke of spokeRegions) {
    const { startJ, endJ } = spoke;
    const segCount = endJ - startJ;
    if (segCount < 1) continue;

    // Build spoke grid: spokeGrid[s][r] where s=angular, r=radial
    const spokeGrid: { bot: number; top: number }[][] = [];

    for (let s = 0; s <= segCount; s++) {
      const jIdx = (startJ + s + radialSegments) % radialSegments;
      const theta = jIdx * hubStep;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Find where spoke meets wall at this angle
      let wallR = hubOuterR;
      let wallY = hubOuterY;

      // Scan outward until we hit the wall inner surface
      for (let scanR = hubOuterR; scanR < hubOuterR * 3; scanR += 0.05) {
        const scanY = hubOuterY - (scanR - hubOuterR) * effectiveTan;
        if (scanY < 0.01 || scanY > shadeHeight - 0.01) break;

        const innerWallR = wallRadiusAtY(scanY, theta);
        if (scanR >= innerWallR) {
          wallR = innerWallR;
          wallY = scanY;
          break;
        }
      }

      // Clamp wall position
      wallR = Math.max(hubOuterR + 0.2, wallR);
      wallY = Math.max(0.01, Math.min(shadeHeight - 0.01, wallY));

      const radialRow: { bot: number; top: number }[] = [];

      for (let r = 0; r <= SPOKE_RADIAL_STEPS; r++) {
        if (r === 0) {
          // Reuse hub outer ring vertices for watertight connection
          radialRow.push(hubOuterRing[jIdx]);
          continue;
        }

        const t = r / SPOKE_RADIAL_STEPS;
        // Linear interpolation (spoke is a flat surface, not arched)
        const rPos = hubOuterR + (wallR - hubOuterR) * t;
        const yPos = hubOuterY + (wallY - hubOuterY) * t;

        vertices.push(rPos * cosT, yPos, rPos * sinT);
        const botIdx = vertexIndex++;
        vertices.push(rPos * cosT, yPos + hubThickness, rPos * sinT);
        const topIdx = vertexIndex++;

        radialRow.push({ bot: botIdx, top: topIdx });
      }

      spokeGrid.push(radialRow);
    }

    // Build spoke faces
    for (let s = 0; s < segCount; s++) {
      for (let r = 0; r < SPOKE_RADIAL_STEPS; r++) {
        // Bottom face
        addQuad(
          spokeGrid[s][r].bot, spokeGrid[s + 1][r].bot,
          spokeGrid[s + 1][r + 1].bot, spokeGrid[s][r + 1].bot,
          true
        );
        // Top face
        addQuad(
          spokeGrid[s][r].top, spokeGrid[s + 1][r].top,
          spokeGrid[s + 1][r + 1].top, spokeGrid[s][r + 1].top
        );
      }
    }

    // Spoke side walls (left and right edges)
    for (let r = 0; r < SPOKE_RADIAL_STEPS; r++) {
      // Left edge
      addQuad(
        spokeGrid[0][r].bot, spokeGrid[0][r + 1].bot,
        spokeGrid[0][r + 1].top, spokeGrid[0][r].top
      );
      // Right edge
      addQuad(
        spokeGrid[segCount][r].bot, spokeGrid[segCount][r].top,
        spokeGrid[segCount][r + 1].top, spokeGrid[segCount][r + 1].bot
      );
    }

    // Spoke tip (wall end) - closed cap
    for (let s = 0; s < segCount; s++) {
      addQuad(
        spokeGrid[s][SPOKE_RADIAL_STEPS].bot,
        spokeGrid[s + 1][SPOKE_RADIAL_STEPS].bot,
        spokeGrid[s + 1][SPOKE_RADIAL_STEPS].top,
        spokeGrid[s][SPOKE_RADIAL_STEPS].top,
        true
      );
    }
  }

  // ============================================
  // STEP 4: Close hub outer wall in gap regions
  // ============================================
  // Where there are no spokes, the hub outer edge needs a vertical wall.

  for (const gap of gapRegions) {
    const { startJ, endJ } = gap;

    for (let j = startJ; j < endJ; j++) {
      const jIdx = (j + radialSegments) % radialSegments;
      const jNext = (j + 1) % radialSegments;

      addQuad(
        hubOuterRing[jIdx].bot, hubOuterRing[jNext].bot,
        hubOuterRing[jNext].top, hubOuterRing[jIdx].top,
        true
      );
    }
  }

  return { vertices, indices };
}

/**
 * Create a THREE.js BufferGeometry from suspension result.
 */
export function createSuspensionGeometry(result: SuspensionResult): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(result.vertices, 3));
  geometry.setIndex(result.indices);
  const merged = mergeVertices(geometry, 1e-4);
  merged.computeVertexNormals();
  return merged;
}

/**
 * Helper to create config from DesignParams.
 * This bridges the isolated module back to the main app.
 */
export function createConfigFromParams(
  params: DesignParams,
  getWallInnerRadius: (y: number, theta: number) => number
): SuspensionConfig {
  return {
    centerY: params.height * params.suspensionHeight,
    holeRadius: params.suspensionHoleSize / 2,
    hubWidth: params.suspensionRimWidth,
    hubThickness: Math.max(0.2, params.suspensionThickness), // Min 2mm
    spokeCount: params.suspensionRibCount,
    spokeWidthDeg: params.suspensionRibWidth,
    spokeAngle: params.suspensionAngle,
    wallRadiusAtY: getWallInnerRadius,
    wallThickness: params.thickness,
    shadeHeight: params.height,
  };
}
