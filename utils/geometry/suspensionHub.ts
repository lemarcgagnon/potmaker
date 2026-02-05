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
  centerY: number;           // Y position of wall attachment (user controls this via Height slider)

  // Hub dimensions
  holeRadius: number;        // Radius of center hole (for cord/socket)
  hubWidth: number;          // Radial width of hub ring
  hubThickness: number;      // Vertical thickness of hub material

  // Spoke dimensions
  spokeCount: number;        // Number of spokes (2-8)
  spokeWidthMm: number;      // Width of each spoke in mm (at hub outer edge)
  spokeWallWidthMm: number;  // Width of each spoke in mm (at wall attachment)
  spokeAngle: number;        // Slope angle in degrees (from horizontal, ≥45°)

  // Arch bridge settings
  archDepthFactor: number;   // 0-1: How deep the arches curve (0=flat, 1=full 45° depth)
  flipped: boolean;          // If true, spokes go DOWN from hub (for upside-down printing)
  spokeHollow: number;       // 0-1: Elliptical cutout in spoke center (0=solid, 1=max opening)

  // Socket tube
  socketDepth: number;       // Tube depth in cm (0 = no tube)
  socketWall: number;        // Tube wall thickness in cm
  socketChamferAngle: number; // Chamfer angle in degrees (0 = no chamfer)
  socketChamferDepth: number; // Chamfer depth in cm

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
    spokeWallWidthMm,
    spokeAngle,
    archDepthFactor,
    flipped,
    spokeHollow,
    socketDepth,
    socketWall,
    socketChamferAngle,
    socketChamferDepth,
    wallRadiusAtY,
    shadeHeight
  } = config;

  // Enforce minimum printable angle for spokes
  const effectiveAngle = Math.max(spokeAngle, MIN_SELF_SUPPORTING_ANGLE);
  const slopeRad = effectiveAngle * Math.PI / 180;
  const tanSlope = Math.tan(slopeRad);

  // Hub ring always uses a fixed 45° slope (self-supporting, independent of spoke angle)
  const HUB_RING_TAN = Math.tan(MIN_SELF_SUPPORTING_ANGLE * Math.PI / 180); // = 1.0

  // Slope direction: normal = spokes go UP (negative Y delta), flipped = spokes go DOWN (positive Y delta)
  const slopeSign = flipped ? 1 : -1;

  // Hub geometry
  const hubOuterR = holeRadius + hubWidth;

  // === INVERTED LOGIC: wall attachment height is the input, hub position is computed ===
  // centerY = where spokes attach to the wall (user controls this)
  const wallAttachY = Math.max(0.5, Math.min(shadeHeight - 0.5, centerY));

  // Compute hub position from wall attachment + spoke angle
  // Get representative wall radius at the attachment height
  const repWallR = wallRadiusAtY(wallAttachY, 0);
  const radialTravel = Math.max(0, repWallR - hubOuterR);
  // Hub outer edge: computed from wall attachment and spoke angle
  // Normal: hub is above wall attachment; Flipped: hub is below
  const hubOuterY = wallAttachY - slopeSign * radialTravel * tanSlope;
  const hubInnerY = hubOuterY - slopeSign * hubWidth * HUB_RING_TAN;

  // Clamp to valid range
  const clampedHubOuterY = Math.max(0.1, Math.min(shadeHeight - 0.1, hubOuterY));
  const clampedHubInnerY = Math.max(0.1, Math.min(shadeHeight - 0.1, hubInnerY));

  // Spoke angular parameters
  // Convert mm width to radians at the correct radius (cm → mm: multiply by 10)
  const spokeWidthRad = spokeWidthMm / (hubOuterR * 10);
  // Wall attach width uses wall radius so the mm value matches physical width at the tip
  const wallWidthRad = spokeWallWidthMm / (repWallR * 10);
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
  const hubInnerBot: number[] = [];  // Inner ring, bottom surface (at holeRadius, hubInnerY)
  const hubInnerTop: number[] = [];  // Inner ring, top surface
  const hubOuterBot: number[] = [];  // Outer ring, bottom surface
  const hubOuterTop: number[] = [];  // Outer ring, top surface

  // Socket tube: compute radii and positions (enforce 2mm min wall everywhere)
  const hasSocket = socketDepth > 0;
  const effectiveSocketWall = Math.max(0.2, socketWall); // 2mm min tube wall
  const tubeOuterR = hasSocket ? Math.min(holeRadius + effectiveSocketWall, hubOuterR - 0.2) : holeRadius;
  // Tube extends AWAY from shade body (into the shade interior)
  const tubeEndY = hasSocket ? hubInnerY + slopeSign * socketDepth : hubInnerY;

  // Chamfer: widens tube opening to ease bulb insertion
  const hasChamfer = hasSocket && socketChamferAngle > 0 && socketChamferDepth > 0;
  const chamferWidth = hasChamfer
    ? socketChamferDepth * Math.tan(socketChamferAngle * Math.PI / 180)
    : 0;
  const chamferTopR = hasChamfer
    ? Math.min(holeRadius + chamferWidth, tubeOuterR - 0.2)
    : holeRadius;
  // Chamfer bottom Y: chamfer extends into tube from hubInnerY
  const chamferBotY = hasChamfer
    ? hubInnerY + slopeSign * Math.min(socketChamferDepth, socketDepth * 0.9)
    : hubInnerY;

  // Socket tube vertex rings (only when tube present)
  const tubeEndInner: number[] = [];   // Inner ring at tube end (holeRadius, tubeEndY)
  const tubeEndOuter: number[] = [];   // Outer ring at tube end (tubeOuterR, tubeEndY)
  const tubeStartOuter: number[] = []; // Outer ring at hub level (tubeOuterR, hubInnerY)
  // Chamfer vertex rings (only when chamfer active)
  const chamferTop: number[] = [];     // Widened ring at hub level (chamferTopR, hubInnerY)
  const chamferBot: number[] = [];     // Ring where chamfer meets inner wall (holeRadius, chamferBotY)

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

    // Socket tube vertices
    if (hasSocket) {
      tubeEndInner.push(addVertex(holeRadius * cosT, tubeEndY, holeRadius * sinT));
      tubeEndOuter.push(addVertex(tubeOuterR * cosT, tubeEndY, tubeOuterR * sinT));
      tubeStartOuter.push(addVertex(tubeOuterR * cosT, hubInnerY, tubeOuterR * sinT));

      // Chamfer vertices
      if (hasChamfer) {
        chamferTop.push(addVertex(chamferTopR * cosT, hubInnerY, chamferTopR * sinT));
        chamferBot.push(addVertex(holeRadius * cosT, chamferBotY, holeRadius * sinT));
      }
    }
  }

  // Build hub ring faces
  for (let j = 0; j < hubSegments; j++) {
    // Inner cylinder (faces inward toward hole) - faces need to point INTO the hole
    // When socket tube is present, the inner wall continues down into the tube
    addQuad(hubInnerBot[j], hubInnerBot[j + 1], hubInnerTop[j + 1], hubInnerTop[j]);

    // Top conical surface (faces up)
    addQuad(hubInnerTop[j], hubInnerTop[j + 1], hubOuterTop[j + 1], hubOuterTop[j]);

    // Bottom conical surface (faces down)
    // When tube present: starts from tubeStartOuter (tubeOuterR) instead of hubInnerBot (holeRadius)
    if (hasSocket) {
      addQuad(tubeStartOuter[j], hubOuterBot[j], hubOuterBot[j + 1], tubeStartOuter[j + 1]);
    } else {
      addQuad(hubInnerBot[j], hubOuterBot[j], hubOuterBot[j + 1], hubInnerBot[j + 1]);
    }
  }

  // ============================================
  // STEP 1b: Socket tube geometry (when socketDepth > 0)
  // ============================================
  if (hasSocket) {
    for (let j = 0; j < hubSegments; j++) {
      if (hasChamfer) {
        // --- WITH CHAMFER ---
        // Chamfer surface: angled quad from chamferTop (wide, hubInnerY) to chamferBot (narrow, chamferBotY)
        addQuad(chamferTop[j], chamferTop[j + 1], chamferBot[j + 1], chamferBot[j]);

        // Tube inner wall: from chamferBot down to tubeEndInner (holeRadius cylinder)
        addQuad(chamferBot[j], chamferBot[j + 1], tubeEndInner[j + 1], tubeEndInner[j]);

        // Tube outer wall: from tubeEndY to hubInnerY at tubeOuterR, faces outward
        addQuad(tubeStartOuter[j], tubeStartOuter[j + 1], tubeEndOuter[j + 1], tubeEndOuter[j]);

        // Tube end cap: annular ring at tubeEndY
        const endCapFlip = slopeSign < 0;
        addQuad(tubeEndInner[j], tubeEndOuter[j], tubeEndOuter[j + 1], tubeEndInner[j + 1], endCapFlip);

        // Start cap: annular ring at hubInnerY from chamferTop (chamferTopR) to tubeStartOuter (tubeOuterR)
        const startCapFlip = slopeSign > 0;
        addQuad(chamferTop[j], tubeStartOuter[j], tubeStartOuter[j + 1], chamferTop[j + 1], startCapFlip);

        // Hub-to-chamfer bridge: annular ring from hubInnerBot (holeRadius) to chamferTop (chamferTopR) at hubInnerY
        // This connects the hub inner cylinder to the widened chamfer opening
        addQuad(hubInnerBot[j], chamferTop[j], chamferTop[j + 1], hubInnerBot[j + 1], startCapFlip);
      } else {
        // --- NO CHAMFER (original behavior) ---
        // Tube inner wall: from tubeEndY to hubInnerY at holeRadius, faces inward
        addQuad(tubeEndInner[j], tubeEndInner[j + 1], hubInnerBot[j + 1], hubInnerBot[j]);

        // Tube outer wall: from tubeEndY to hubInnerY at tubeOuterR, faces outward
        addQuad(tubeStartOuter[j], tubeStartOuter[j + 1], tubeEndOuter[j + 1], tubeEndOuter[j]);

        // Tube end cap: annular ring at tubeEndY, faces away from shade
        const endCapFlip = slopeSign < 0;
        addQuad(tubeEndInner[j], tubeEndOuter[j], tubeEndOuter[j + 1], tubeEndInner[j + 1], endCapFlip);

        // Tube start cap: annular ring at hubInnerY from holeRadius to tubeOuterR
        const startCapFlip = slopeSign > 0;
        addQuad(hubInnerBot[j], tubeStartOuter[j], tubeStartOuter[j + 1], hubInnerBot[j + 1], startCapFlip);
      }
    }
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
  // Boost grid resolution when cutout is active for smooth oval edges
  const SPOKE_RADIAL_STEPS = spokeHollow > 0 ? 32 : 12;

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

    // Use the wider width for angular segments; boost when cutout needs smooth oval
    const baseAngSegs = Math.max(4, Math.ceil((spokeWidthAtHub / (2 * Math.PI)) * hubSegments));
    const spokeAngularSegs = spokeHollow > 0 ? Math.max(16, baseAngSegs * 2) : baseAngSegs;

    // Build spoke grid: grid[angular][radial] = { bot, top }
    const spokeGrid: { bot: number; top: number }[][] = [];

    for (let s = 0; s <= spokeAngularSegs; s++) {
      const angularT = s / spokeAngularSegs; // 0 to 1 across spoke width

      // Build radial vertices for this angular position
      const radialRow: { bot: number; top: number }[] = [];

      for (let r = 0; r <= SPOKE_RADIAL_STEPS; r++) {
        const radialT = r / SPOKE_RADIAL_STEPS; // 0 at hub, 1 at wall

        // Spoke width: interpolate between wall width and hub width, plus arch widening
        const archT = Math.sin((1 - radialT) * Math.PI / 2); // 1 at hub, 0 at wall
        const baseWidth = wallWidthRad + (spokeWidthRad - wallWidthRad) * (1 - radialT);
        const widthAtR = baseWidth + 2 * maxExtraWidth * archT;

        // Theta position: interpolate across current width
        const startTheta = spokeCenterTheta - widthAtR / 2;
        const theta = startTheta + angularT * widthAtR;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        // Wall attachment at fixed height — direct radius lookup (no scanning needed)
        const wallR = Math.max(wallRadiusAtY(wallAttachY, theta), hubOuterR + 0.3);

        // Interpolate from hub outer edge to wall attachment
        const rPos = hubOuterR + (wallR - hubOuterR) * radialT;
        const yPos = clampedHubOuterY + (wallAttachY - clampedHubOuterY) * radialT;

        const bot = addVertex(rPos * cosT, yPos, rPos * sinT);
        const top = addVertex(rPos * cosT, yPos + hubThickness, rPos * sinT);

        radialRow.push({ bot, top });
      }

      spokeGrid.push(radialRow);
    }

    // Pre-compute elliptical cutout mask for this spoke
    // Enforce 2mm minimum solid margin around the cutout
    const minPhysicalWidth = Math.min(spokeWidthMm, spokeWallWidthMm);
    const maxHollowForMargin = minPhysicalWidth > 4
      ? (1 - 4 / minPhysicalWidth) / 0.82   // 2mm on each side
      : 0;                                     // spoke too narrow for any cutout
    const effectiveHollow = Math.min(spokeHollow, maxHollowForMargin);

    const cutoutMask: boolean[][] = [];
    if (effectiveHollow > 0) {
      for (let s = 0; s < spokeAngularSegs; s++) {
        cutoutMask[s] = [];
        for (let r = 0; r < SPOKE_RADIAL_STEPS; r++) {
          // Cell center in [-1, 1] normalized spoke space
          const u = ((s + 0.5) / spokeAngularSegs - 0.5) * 2;
          const v = ((r + 0.5) / SPOKE_RADIAL_STEPS - 0.5) * 2;

          // Ellipse size leaves structural margins on all sides
          const size = effectiveHollow * 0.82;
          if (size <= 0) { cutoutMask[s][r] = false; continue; }

          // Slightly elongated radially for a leaf shape
          const ex = u / size;
          const ey = v / (size * 1.15);
          cutoutMask[s][r] = (ex * ex + ey * ey) < 1;
        }
      }
    }

    // Build spoke faces (with cutout support)
    for (let s = 0; s < spokeAngularSegs; s++) {
      for (let r = 0; r < SPOKE_RADIAL_STEPS; r++) {
        const isCut = effectiveHollow > 0 && cutoutMask[s]?.[r];

        if (isCut) {
          // Add inner walls at cutout boundary for watertight mesh
          const leftSolid = s === 0 || !cutoutMask[s - 1][r];
          const rightSolid = s === spokeAngularSegs - 1 || !cutoutMask[s + 1]?.[r];
          const hubSolid = r === 0 || !cutoutMask[s][r - 1];
          const wallSolid = r === SPOKE_RADIAL_STEPS - 1 || !cutoutMask[s][r + 1];

          // Left inner wall (normal points right, into cutout)
          if (leftSolid) {
            addQuad(
              spokeGrid[s][r].top, spokeGrid[s][r + 1].top,
              spokeGrid[s][r + 1].bot, spokeGrid[s][r].bot
            );
          }
          // Right inner wall (normal points left, into cutout)
          if (rightSolid) {
            addQuad(
              spokeGrid[s + 1][r].bot, spokeGrid[s + 1][r + 1].bot,
              spokeGrid[s + 1][r + 1].top, spokeGrid[s + 1][r].top
            );
          }
          // Hub-side inner wall (normal points toward wall, into cutout)
          if (hubSolid) {
            addQuad(
              spokeGrid[s][r].bot, spokeGrid[s + 1][r].bot,
              spokeGrid[s + 1][r].top, spokeGrid[s][r].top
            );
          }
          // Wall-side inner wall (normal points toward hub, into cutout)
          if (wallSolid) {
            addQuad(
              spokeGrid[s][r + 1].top, spokeGrid[s + 1][r + 1].top,
              spokeGrid[s + 1][r + 1].bot, spokeGrid[s][r + 1].bot
            );
          }
          continue; // Skip top/bottom faces for cutout cells
        }

        // Solid cell — build top/bottom faces as normal
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
    spokeWidthMm: params.suspensionRibWidth, // Width at hub in mm
    spokeWallWidthMm: params.suspensionWallWidth ?? params.suspensionRibWidth, // Width at wall in mm
    spokeAngle: Math.max(MIN_SELF_SUPPORTING_ANGLE, params.suspensionAngle),
    archDepthFactor: params.suspensionArchPower, // 0-1 arch depth
    flipped: params.suspensionFlipped, // Flip spoke direction
    spokeHollow: params.spokeHollow ?? 0, // 0-1 cutout
    socketDepth: params.suspensionSocketDepth ?? 0,
    socketWall: Math.max(0.2, params.suspensionSocketWall ?? 0.2), // 2mm min for FDM
    socketChamferAngle: params.suspensionSocketChamferAngle ?? 0,
    socketChamferDepth: params.suspensionSocketChamferDepth ?? 0.2,
    wallRadiusAtY: getWallInnerRadius,
    wallThickness: params.thickness,
    shadeHeight: params.height,
  };
}
