/**
 * SUSPENSION HUB GEOMETRY MODULE — Approach A: Simple Conical Spokes
 *
 * Generates a self-supporting spider-arm hub for lamp shades.
 * All geometry is FDM-printable without supports (≥45° from horizontal).
 *
 * GEOMETRY STRUCTURE:
 * 1. Hub ring: Conical surface from hole edge (high) to outer edge (low)
 *    - Slopes downward at 45° minimum for self-support
 *    - Constant thickness (parallel top/bottom surfaces)
 *
 * 2. Spokes: Thick trapezoidal slabs from hub outer edge to wall
 *    - Each spoke has: top face, bottom face, left wall, right wall, tip cap
 *    - Slopes from hub down to wall at ≥45°
 *
 * 3. Vent gaps: Simply no geometry between spokes
 *    - Hub outer edge has vertical closing wall in gap regions
 *
 * 4. Wall connection: Spoke tips positioned AT wall inner radius
 *    - mergeVertices() will fuse with main body mesh
 *
 * FDM COMPLIANCE (per .claude/3dprintrules.md):
 * - All overhangs ≤45° from vertical (surfaces ≥45° from horizontal)
 * - Minimum thickness: 2mm (0.2cm)
 * - Watertight manifold mesh
 */

import * as THREE from 'three';
import { mergeVertices } from 'three-stdlib';
import { DesignParams } from '../../types';

export interface SuspensionConfig {
  // Position
  centerY: number;           // Y position of hub center (at hole inner edge)

  // Hub dimensions
  holeRadius: number;        // Radius of center hole (for cord/socket)
  hubWidth: number;          // Radial width of hub ring
  hubThickness: number;      // Vertical thickness of hub material

  // Spoke dimensions
  spokeCount: number;        // Number of spokes (2-8)
  spokeWidthDeg: number;     // Angular width of each spoke in degrees
  spokeAngle: number;        // Slope angle in degrees (from horizontal, ≥45°)

  // Wall interface
  wallRadiusAtY: (y: number, theta: number) => number;  // Get wall inner radius at (y, theta)
  wallThickness: number;     // Wall thickness (for reference)
  shadeHeight: number;       // Total shade height (for bounds checking)
}

export interface SuspensionResult {
  vertices: number[];
  indices: number[];
}

// FDM printability constant
const MIN_SELF_SUPPORTING_ANGLE = 45; // degrees from horizontal

/**
 * Generate the complete suspension hub geometry.
 * Returns vertices and indices for a watertight mesh.
 */
export function generateSuspensionHub(
  config: SuspensionConfig,
  radialSegments: number = 64
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

  // Enforce minimum printable angle
  const effectiveAngle = Math.max(spokeAngle, MIN_SELF_SUPPORTING_ANGLE);
  const slopeRad = effectiveAngle * Math.PI / 180;
  const tanSlope = Math.tan(slopeRad);

  // Hub geometry
  const hubOuterR = holeRadius + hubWidth;
  const hubInnerY = centerY;                          // Top of hub at hole edge
  const hubOuterY = centerY - hubWidth * tanSlope;    // Hub slopes down toward wall

  // Ensure hub doesn't go below floor
  const clampedHubOuterY = Math.max(0.1, hubOuterY);

  // Spoke angular parameters
  const spokeWidthRad = spokeWidthDeg * Math.PI / 180;
  const spokeStep = (2 * Math.PI) / spokeCount;

  // Helper to add vertex and return its index
  const addVertex = (x: number, y: number, z: number): number => {
    vertices.push(x, y, z);
    return vertexIndex++;
  };

  // Helper to add a quad (two triangles) with correct winding
  const addQuad = (a: number, b: number, c: number, d: number, flip = false) => {
    if (flip) {
      indices.push(a, c, b, a, d, c);
    } else {
      indices.push(a, b, c, a, c, d);
    }
  };

  // Helper to add a triangle
  const addTri = (a: number, b: number, c: number, flip = false) => {
    if (flip) {
      indices.push(a, c, b);
    } else {
      indices.push(a, b, c);
    }
  };

  // ============================================
  // STEP 1: Build hub ring (conical, with thickness)
  // ============================================
  // Hub ring has 4 surfaces:
  // - Inner cylinder (around hole)
  // - Outer edge (vertical wall in gaps, transitions to spokes)
  // - Top conical surface
  // - Bottom conical surface

  const hubSegments = radialSegments;

  // Store ring vertices for reuse
  const hubInnerBot: number[] = [];  // Inner ring, bottom surface
  const hubInnerTop: number[] = [];  // Inner ring, top surface
  const hubOuterBot: number[] = [];  // Outer ring, bottom surface
  const hubOuterTop: number[] = [];  // Outer ring, top surface

  for (let j = 0; j <= hubSegments; j++) {
    const theta = (j / hubSegments) * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    // Inner ring (at hole edge, higher Y)
    hubInnerBot.push(addVertex(holeRadius * cosT, hubInnerY, holeRadius * sinT));
    hubInnerTop.push(addVertex(holeRadius * cosT, hubInnerY + hubThickness, holeRadius * sinT));

    // Outer ring (lower Y due to slope)
    hubOuterBot.push(addVertex(hubOuterR * cosT, clampedHubOuterY, hubOuterR * sinT));
    hubOuterTop.push(addVertex(hubOuterR * cosT, clampedHubOuterY + hubThickness, hubOuterR * sinT));
  }

  // Build hub ring faces
  for (let j = 0; j < hubSegments; j++) {
    // Inner cylinder (faces inward toward hole) - faces need to point INTO the hole
    addQuad(hubInnerBot[j], hubInnerBot[j + 1], hubInnerTop[j + 1], hubInnerTop[j]);

    // Top conical surface (faces up)
    addQuad(hubInnerTop[j], hubInnerTop[j + 1], hubOuterTop[j + 1], hubOuterTop[j]);

    // Bottom conical surface (faces down)
    addQuad(hubInnerBot[j], hubOuterBot[j], hubOuterBot[j + 1], hubInnerBot[j + 1]);
  }

  // ============================================
  // STEP 2: Identify spoke and gap regions
  // ============================================
  type Region = { startTheta: number; endTheta: number; isSpoke: boolean; centerTheta?: number };
  const regions: Region[] = [];

  for (let k = 0; k < spokeCount; k++) {
    const spokeCenterTheta = k * spokeStep;

    // Gap before this spoke (from previous spoke end to this spoke start)
    const prevSpokeEnd = ((k - 1 + spokeCount) % spokeCount) * spokeStep + spokeWidthRad / 2;
    const thisSpokeStart = spokeCenterTheta - spokeWidthRad / 2;

    // Normalize angles
    let gapStart = prevSpokeEnd;
    let gapEnd = thisSpokeStart;
    if (k === 0) {
      gapStart = (spokeCount - 1) * spokeStep + spokeWidthRad / 2 - 2 * Math.PI;
    }
    if (gapEnd > gapStart + 0.01) {
      regions.push({ startTheta: gapStart, endTheta: gapEnd, isSpoke: false });
    }

    // This spoke
    regions.push({
      startTheta: thisSpokeStart,
      endTheta: spokeCenterTheta + spokeWidthRad / 2,
      isSpoke: true,
      centerTheta: spokeCenterTheta
    });
  }

  // ============================================
  // STEP 3: Build spokes (from hub outer edge to wall)
  // ============================================
  const SPOKE_RADIAL_STEPS = 12;

  for (let k = 0; k < spokeCount; k++) {
    const spokeCenterTheta = k * spokeStep;
    const spokeStartTheta = spokeCenterTheta - spokeWidthRad / 2;
    const spokeEndTheta = spokeCenterTheta + spokeWidthRad / 2;

    // Determine spoke segments (angular resolution for this spoke)
    const spokeAngularSegs = Math.max(2, Math.ceil((spokeWidthRad / (2 * Math.PI)) * hubSegments));

    // Build spoke grid: grid[angular][radial] = { bot, top }
    const spokeGrid: { bot: number; top: number }[][] = [];

    for (let s = 0; s <= spokeAngularSegs; s++) {
      const theta = spokeStartTheta + (s / spokeAngularSegs) * spokeWidthRad;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Find where spoke meets wall at this angle
      let wallR = hubOuterR;
      let wallY = clampedHubOuterY;

      // Scan outward from hub until we hit wall inner surface
      for (let scanR = hubOuterR; scanR < hubOuterR * 4; scanR += 0.02) {
        const scanY = clampedHubOuterY - (scanR - hubOuterR) * tanSlope;
        if (scanY < 0.05 || scanY > shadeHeight - 0.05) break;

        const innerWallR = wallRadiusAtY(scanY, theta);
        if (scanR >= innerWallR - 0.001) {
          // Found wall intersection
          wallR = innerWallR;
          wallY = scanY;
          break;
        }
      }

      // Clamp to valid range
      wallR = Math.max(hubOuterR + 0.1, wallR);
      wallY = Math.max(0.05, Math.min(shadeHeight - 0.05, wallY));

      // Build radial vertices for this angular position
      const radialRow: { bot: number; top: number }[] = [];

      for (let r = 0; r <= SPOKE_RADIAL_STEPS; r++) {
        const t = r / SPOKE_RADIAL_STEPS;
        const rPos = hubOuterR + (wallR - hubOuterR) * t;
        const yPos = clampedHubOuterY + (wallY - clampedHubOuterY) * t;

        const bot = addVertex(rPos * cosT, yPos, rPos * sinT);
        const top = addVertex(rPos * cosT, yPos + hubThickness, rPos * sinT);

        radialRow.push({ bot, top });
      }

      spokeGrid.push(radialRow);
    }

    // Build spoke faces
    for (let s = 0; s < spokeAngularSegs; s++) {
      for (let r = 0; r < SPOKE_RADIAL_STEPS; r++) {
        // Bottom face (faces down)
        addQuad(
          spokeGrid[s][r].bot, spokeGrid[s + 1][r].bot,
          spokeGrid[s + 1][r + 1].bot, spokeGrid[s][r + 1].bot,
          true
        );
        // Top face (faces up)
        addQuad(
          spokeGrid[s][r].top, spokeGrid[s + 1][r].top,
          spokeGrid[s + 1][r + 1].top, spokeGrid[s][r + 1].top
        );
      }
    }

    // Left side wall (s = 0)
    for (let r = 0; r < SPOKE_RADIAL_STEPS; r++) {
      addQuad(
        spokeGrid[0][r].bot, spokeGrid[0][r + 1].bot,
        spokeGrid[0][r + 1].top, spokeGrid[0][r].top
      );
    }

    // Right side wall (s = spokeAngularSegs)
    for (let r = 0; r < SPOKE_RADIAL_STEPS; r++) {
      addQuad(
        spokeGrid[spokeAngularSegs][r].bot, spokeGrid[spokeAngularSegs][r].top,
        spokeGrid[spokeAngularSegs][r + 1].top, spokeGrid[spokeAngularSegs][r + 1].bot
      );
    }

    // Spoke tip cap (at wall)
    for (let s = 0; s < spokeAngularSegs; s++) {
      addQuad(
        spokeGrid[s][SPOKE_RADIAL_STEPS].bot, spokeGrid[s + 1][SPOKE_RADIAL_STEPS].bot,
        spokeGrid[s + 1][SPOKE_RADIAL_STEPS].top, spokeGrid[s][SPOKE_RADIAL_STEPS].top,
        true
      );
    }

    // Hub connection: close the gap between hub outer ring and spoke inner edge
    // This creates a watertight connection
    for (let s = 0; s < spokeAngularSegs; s++) {
      const thetaA = spokeStartTheta + (s / spokeAngularSegs) * spokeWidthRad;
      const thetaB = spokeStartTheta + ((s + 1) / spokeAngularSegs) * spokeWidthRad;

      // Find closest hub vertices - handle negative angles correctly
      const jARaw = Math.round((thetaA / (2 * Math.PI)) * hubSegments);
      const jBRaw = Math.round((thetaB / (2 * Math.PI)) * hubSegments);
      const jA = ((jARaw % hubSegments) + hubSegments) % hubSegments;
      const jB = ((jBRaw % hubSegments) + hubSegments) % hubSegments;

      // Skip degenerate quads where indices are the same
      if (jA === jB) continue;

      // Connect hub outer to spoke inner (r=0)
      // These faces bridge any gap between hub ring and spoke
      addQuad(hubOuterBot[jA], hubOuterBot[jB], spokeGrid[s + 1][0].bot, spokeGrid[s][0].bot);
      addQuad(hubOuterTop[jA], spokeGrid[s][0].top, spokeGrid[s + 1][0].top, hubOuterTop[jB]);
    }
  }

  // ============================================
  // STEP 4: Close hub outer wall in gap regions
  // ============================================
  // Between spokes, the hub outer edge needs a vertical wall

  for (let k = 0; k < spokeCount; k++) {
    const thisSpokeCenterTheta = k * spokeStep;
    const nextSpokeCenterTheta = ((k + 1) % spokeCount) * spokeStep;

    const gapStartTheta = thisSpokeCenterTheta + spokeWidthRad / 2;
    let gapEndTheta = nextSpokeCenterTheta - spokeWidthRad / 2;
    if (gapEndTheta < gapStartTheta) gapEndTheta += 2 * Math.PI;

    // Only create wall if there's a meaningful gap
    if (gapEndTheta - gapStartTheta < 0.01) continue;

    // Find hub segment indices for this gap
    const jStart = Math.ceil((gapStartTheta / (2 * Math.PI)) * hubSegments);
    const jEnd = Math.floor((gapEndTheta / (2 * Math.PI)) * hubSegments);

    for (let j = jStart; j < jEnd; j++) {
      const jIdx = j % hubSegments;
      const jNext = (j + 1) % hubSegments;

      // Vertical wall at hub outer edge (faces outward)
      addQuad(
        hubOuterBot[jIdx], hubOuterBot[jNext],
        hubOuterTop[jNext], hubOuterTop[jIdx],
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
 * Bridges the isolated module to the main app.
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
    spokeAngle: Math.max(MIN_SELF_SUPPORTING_ANGLE, params.suspensionAngle),
    wallRadiusAtY: getWallInnerRadius,
    wallThickness: params.thickness,
    shadeHeight: params.height,
  };
}
