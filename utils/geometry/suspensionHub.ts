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
  spokeWidthMm: number;      // Width of each spoke in mm (at hub outer edge)
  spokeAngle: number;        // Slope angle in degrees (from horizontal, ≥45°)

  // Arch bridge settings
  archDepthFactor: number;   // 0-1: How deep the arches curve (0=flat, 1=full 45° depth)
  flipped: boolean;          // If true, spokes go DOWN from hub (for upside-down printing)

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
    spokeWidthMm,
    spokeAngle,
    archDepthFactor,
    flipped,
    wallRadiusAtY,
    shadeHeight
  } = config;

  // Enforce minimum printable angle for spokes
  const effectiveAngle = Math.max(spokeAngle, MIN_SELF_SUPPORTING_ANGLE);
  const slopeRad = effectiveAngle * Math.PI / 180;
  const tanSlope = Math.tan(slopeRad);

  // Hub ring always uses a fixed 45° slope (self-supporting, independent of spoke angle)
  // This prevents the ring from becoming impractically tall at steep spoke angles
  const HUB_RING_TAN = Math.tan(MIN_SELF_SUPPORTING_ANGLE * Math.PI / 180); // = 1.0

  // Slope direction: normal = spokes go UP (negative Y delta), flipped = spokes go DOWN (positive Y delta)
  const slopeSign = flipped ? 1 : -1;

  // Hub geometry
  const hubOuterR = holeRadius + hubWidth;
  const hubInnerY = centerY;                                          // Hub center at hole edge
  const hubOuterY = centerY + slopeSign * hubWidth * HUB_RING_TAN;   // Hub outer edge (fixed 45° slope)

  // Ensure hub stays within bounds
  const clampedHubOuterY = flipped
    ? Math.min(shadeHeight - 0.1, hubOuterY)  // Flipped: don't go above ceiling
    : Math.max(0.1, hubOuterY);                // Normal: don't go below floor

  // Spoke angular parameters
  // Convert mm width to radians at hub outer edge (hubOuterR is in cm, spokeWidthMm is in mm)
  const spokeWidthRad = spokeWidthMm / (hubOuterR * 10);
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
  // Spokes WIDEN as they approach the hub ring.
  // At wall: narrow (spokeWidthRad)
  // At hub: wider (controlled by archDepthFactor)
  // Two adjacent spokes meet at the hub, forming a bridge.
  // ============================================
  const SPOKE_RADIAL_STEPS = 12;

  // Calculate the gap between spokes at the wall
  const gapWidthAtWall = spokeStep - spokeWidthRad;

  // Maximum extra width each spoke can add (half the gap, so two spokes fill it)
  const maxExtraWidth = (gapWidthAtWall / 2) * archDepthFactor;

  for (let k = 0; k < spokeCount; k++) {
    const spokeCenterTheta = k * spokeStep;

    // Spoke width varies with radius:
    // - At wall (r=1): spokeWidthRad (narrow)
    // - At hub (r=0): spokeWidthRad + 2*maxExtraWidth (wide)
    const spokeWidthAtHub = spokeWidthRad + 2 * maxExtraWidth;

    // Use the wider width for angular segments
    const spokeAngularSegs = Math.max(4, Math.ceil((spokeWidthAtHub / (2 * Math.PI)) * hubSegments));

    // Build spoke grid: grid[angular][radial] = { bot, top }
    const spokeGrid: { bot: number; top: number }[][] = [];

    for (let s = 0; s <= spokeAngularSegs; s++) {
      const angularT = s / spokeAngularSegs; // 0 to 1 across spoke width

      // Build radial vertices for this angular position
      const radialRow: { bot: number; top: number }[] = [];

      for (let r = 0; r <= SPOKE_RADIAL_STEPS; r++) {
        const radialT = r / SPOKE_RADIAL_STEPS; // 0 at hub, 1 at wall

        // Spoke width at this radial position (thin at wall, widening toward hub ring)
        // sin curve: narrow at wall attachment, broadening as they reach the hub
        const archT = Math.sin((1 - radialT) * Math.PI / 2); // 1 at hub, 0 at wall
        const widthAtR = spokeWidthRad + 2 * maxExtraWidth * archT;

        // Theta position: interpolate across current width
        const startTheta = spokeCenterTheta - widthAtR / 2;
        const theta = startTheta + angularT * widthAtR;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        // Find where spoke meets wall at this angle
        // The spoke MUST always connect to the wall - never float free
        let wallY = clampedHubOuterY;
        let wallR = hubOuterR;

        // Scan outward from hub until we hit wall inner surface
        for (let scanR = hubOuterR; scanR < hubOuterR * 6; scanR += 0.01) {
          const scanY = clampedHubOuterY + slopeSign * (scanR - hubOuterR) * tanSlope;

          // Check bounds - clamp to valid range
          const clampedScanY = Math.max(0.05, Math.min(shadeHeight - 0.05, scanY));

          const innerWallR = wallRadiusAtY(clampedScanY, theta);

          if (scanR >= innerWallR - 0.001) {
            // Found wall intersection
            wallR = innerWallR;
            wallY = clampedScanY;
            break;
          }

          // If we've gone out of Y bounds, force connection to wall at boundary
          if (scanY < 0.05 || scanY > shadeHeight - 0.05) {
            wallY = clampedScanY;
            wallR = wallRadiusAtY(clampedScanY, theta);
            break;
          }
        }

        // ALWAYS ensure spoke connects to wall - get wall radius at final Y
        wallR = wallRadiusAtY(wallY, theta);

        // Ensure minimum spoke length (at least 0.3cm beyond hub)
        if (wallR < hubOuterR + 0.3) {
          wallR = hubOuterR + 0.3;
        }

        // Radius and Y position
        const rPos = hubOuterR + (wallR - hubOuterR) * radialT;
        const yPos = clampedHubOuterY + (wallY - clampedHubOuterY) * radialT;

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

    // Left side wall (s = 0) - simple vertical wall along spoke edge
    for (let r = 0; r < SPOKE_RADIAL_STEPS; r++) {
      addQuad(
        spokeGrid[0][r].bot, spokeGrid[0][r + 1].bot,
        spokeGrid[0][r + 1].top, spokeGrid[0][r].top
      );
    }

    // Right side wall (s = spokeAngularSegs) - simple vertical wall
    for (let r = 0; r < SPOKE_RADIAL_STEPS; r++) {
      addQuad(
        spokeGrid[spokeAngularSegs][r + 1].bot, spokeGrid[spokeAngularSegs][r].bot,
        spokeGrid[spokeAngularSegs][r].top, spokeGrid[spokeAngularSegs][r + 1].top
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

    // Hub connection: close the gap between hub outer ring and spoke inner edge (at r=0)
    // The spoke width at hub is spokeWidthAtHub
    const spokeStartAtHub = spokeCenterTheta - spokeWidthAtHub / 2;
    for (let s = 0; s < spokeAngularSegs; s++) {
      const thetaA = spokeStartAtHub + (s / spokeAngularSegs) * spokeWidthAtHub;
      const thetaB = spokeStartAtHub + ((s + 1) / spokeAngularSegs) * spokeWidthAtHub;

      // Find closest hub vertices - handle negative angles correctly
      const jARaw = Math.round((thetaA / (2 * Math.PI)) * hubSegments);
      const jBRaw = Math.round((thetaB / (2 * Math.PI)) * hubSegments);
      const jA = ((jARaw % hubSegments) + hubSegments) % hubSegments;
      const jB = ((jBRaw % hubSegments) + hubSegments) % hubSegments;

      // Skip degenerate quads where indices are the same
      if (jA === jB) continue;

      // Connect hub outer to spoke inner (r=0)
      addQuad(hubOuterBot[jA], hubOuterBot[jB], spokeGrid[s + 1][0].bot, spokeGrid[s][0].bot);
      addQuad(hubOuterTop[jA], spokeGrid[s][0].top, spokeGrid[s + 1][0].top, hubOuterTop[jB]);
    }
  }

  // ============================================
  // STEP 4: Close any remaining gaps at hub outer edge
  // ============================================
  // When archDepthFactor < 1, spokes don't fully meet.
  // Close the remaining gap with a simple vertical wall.

  if (archDepthFactor < 0.99) {
    const remainingGapWidth = gapWidthAtWall * (1 - archDepthFactor);

    for (let k = 0; k < spokeCount; k++) {
      const thisSpokeCenterTheta = k * spokeStep;
      const nextSpokeCenterTheta = ((k + 1) % spokeCount) * spokeStep;

      // Gap at hub level (after widening)
      const thisWidenedEnd = thisSpokeCenterTheta + spokeWidthRad / 2 + maxExtraWidth;
      let nextWidenedStart = nextSpokeCenterTheta - spokeWidthRad / 2 - maxExtraWidth;
      if (nextWidenedStart < thisWidenedEnd) nextWidenedStart += 2 * Math.PI;

      const gapStart = thisWidenedEnd;
      const gapEnd = nextWidenedStart;
      const gapWidth = gapEnd - gapStart;

      if (gapWidth < 0.01) continue; // Gap is closed

      // Close with vertical wall at hub outer edge
      const GAP_SEGS = Math.max(2, Math.ceil((gapWidth / (2 * Math.PI)) * hubSegments));

      for (let g = 0; g < GAP_SEGS; g++) {
        const thetaA = gapStart + (g / GAP_SEGS) * gapWidth;
        const thetaB = gapStart + ((g + 1) / GAP_SEGS) * gapWidth;

        const jA = ((Math.round((thetaA / (2 * Math.PI)) * hubSegments) % hubSegments) + hubSegments) % hubSegments;
        const jB = ((Math.round((thetaB / (2 * Math.PI)) * hubSegments) % hubSegments) + hubSegments) % hubSegments;

        if (jA !== jB) {
          // Vertical wall from bottom to top at hub outer edge
          addQuad(hubOuterBot[jA], hubOuterBot[jB], hubOuterTop[jB], hubOuterTop[jA]);
        }
      }
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
    spokeWidthMm: params.suspensionRibWidth, // Width in mm
    spokeAngle: Math.max(MIN_SELF_SUPPORTING_ANGLE, params.suspensionAngle),
    archDepthFactor: params.suspensionArchPower, // 0-1 arch depth
    flipped: params.suspensionFlipped, // Flip spoke direction
    wallRadiusAtY: getWallInnerRadius,
    wallThickness: params.thickness,
    shadeHeight: params.height,
  };
}
