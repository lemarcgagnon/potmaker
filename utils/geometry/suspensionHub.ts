/**
 * SUSPENSION HUB GEOMETRY MODULE — Approach A: Simple Conical Spokes
 *
 * Generates a self-supporting spider-arm hub for lamp shades.
 * All geometry is FDM-printable without supports (≥45° from horizontal).
 *
 * GEOMETRY STRUCTURE:
 * 1. Hub ring: Conical surface from hole edge (high) to outer edge (low)
 * 2. Spokes: Thick trapezoidal slabs from hub outer edge to wall
 * 3. Vent gaps: Simply no geometry between spokes
 * 4. Wall connection: Spoke tips positioned AT wall inner radius
 *
 * WINDING CONVENTION (right-hand rule for addQuad(a,b,c,d) → tris (a,b,c) + (a,c,d)):
 * - Top faces (+Y normal): CCW viewed from +Y
 * - Bottom faces (-Y normal): CCW viewed from -Y (CW from +Y)
 * - Inner wall (inward normal): CCW viewed from center
 * - Outer wall (outward normal): CCW viewed from outside
 */

import * as THREE from 'three';
import { mergeVertices } from 'three-stdlib';
import { DesignParams } from '../../types';

export interface SuspensionConfig {
  centerY: number;
  holeRadius: number;
  hubWidth: number;
  hubThickness: number;
  spokeCount: number;
  spokeWidthMm: number;
  spokeWallWidthMm: number;
  spokeAngle: number;
  archDepthFactor: number;
  flipped: boolean;
  spokeHollow: number;
  socketDepth: number;
  socketWall: number;
  socketChamferAngle: number;
  socketChamferDepth: number;
  wallRadiusAtY: (y: number, theta: number) => number;
  wallThickness: number;
  shadeHeight: number;
}

export interface SuspensionResult {
  vertices: number[];
  indices: number[];
  colors: number[];
}

const MIN_SELF_SUPPORTING_ANGLE = 45;

export function generateSuspensionHub(
  config: SuspensionConfig,
  radialSegments: number = 64
): SuspensionResult {
  const vertices: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  let vertexIndex = 0;
  let vColor = [0.6, 0.6, 0.6];

  const {
    centerY, holeRadius, hubWidth, hubThickness, spokeCount,
    spokeWidthMm, spokeWallWidthMm, spokeAngle, archDepthFactor,
    flipped, spokeHollow, socketDepth, socketWall,
    socketChamferAngle, socketChamferDepth, wallRadiusAtY, shadeHeight
  } = config;

  const slopeRad = Math.max(spokeAngle, MIN_SELF_SUPPORTING_ANGLE) * Math.PI / 180;
  const tanSlope = Math.tan(slopeRad);
  const HUB_RING_TAN = 1.0;
  const slopeSign = flipped ? 1 : -1;
  const hubOuterR = holeRadius + hubWidth;
  const wallAttachY = Math.max(0.5, Math.min(shadeHeight - 0.5, centerY));
  const repWallR = wallRadiusAtY(wallAttachY, 0);
  const radialTravel = Math.max(0, repWallR - hubOuterR);
  const hubOuterY = wallAttachY - slopeSign * radialTravel * tanSlope;
  const hubInnerY = hubOuterY - slopeSign * hubWidth * HUB_RING_TAN;
  const clampedHubOuterY = Math.max(0.1, Math.min(shadeHeight - 0.1, hubOuterY));

  const spokeWidthRad = spokeWidthMm / (hubOuterR * 10);
  const wallWidthRad = spokeWallWidthMm / (repWallR * 10);
  const spokeStep = (2 * Math.PI) / spokeCount;

  const addVertex = (x: number, y: number, z: number): number => {
    vertices.push(x, y, z);
    colors.push(vColor[0], vColor[1], vColor[2]);
    return vertexIndex++;
  };

  const addQuad = (a: number, b: number, c: number, d: number) => {
    indices.push(a, b, c, a, c, d);
  };

  const addTri = (a: number, b: number, c: number) => {
    indices.push(a, b, c);
  };

  const hubSegments = radialSegments;
  const rimWidth = Math.min(0.2, (hubOuterR - holeRadius) / 4);
  const rimInnerR = holeRadius + rimWidth;
  const rimOuterR_hub = hubOuterR - rimWidth;

  const hubInnerBot: number[] = [];
  const hubInnerTop: number[] = [];
  const rimInnerBot: number[] = [];
  const rimInnerTop: number[] = [];
  const rimOuterBot: number[] = [];
  const rimOuterTop: number[] = [];
  const hubOuterBot: number[] = [];
  const hubOuterTop: number[] = [];

  for (let j = 0; j < hubSegments; j++) {
    const theta = (j / hubSegments) * Math.PI * 2;
    const cosT = Math.cos(theta), sinT = Math.sin(theta);
    hubInnerBot.push(addVertex(holeRadius * cosT, hubInnerY, holeRadius * sinT));
    hubInnerTop.push(addVertex(holeRadius * cosT, hubInnerY + hubThickness, holeRadius * sinT));
    rimInnerBot.push(addVertex(rimInnerR * cosT, hubInnerY, rimInnerR * sinT));
    rimInnerTop.push(addVertex(rimInnerR * cosT, hubInnerY + hubThickness, rimInnerR * sinT));
    rimOuterBot.push(addVertex(rimOuterR_hub * cosT, clampedHubOuterY, rimOuterR_hub * sinT));
    rimOuterTop.push(addVertex(rimOuterR_hub * cosT, clampedHubOuterY + hubThickness, rimOuterR_hub * sinT));
    hubOuterBot.push(addVertex(hubOuterR * cosT, clampedHubOuterY, hubOuterR * sinT));
    hubOuterTop.push(addVertex(hubOuterR * cosT, clampedHubOuterY + hubThickness, hubOuterR * sinT));
  }

  // --- Compute spoke regions BEFORE ring faces so we can skip outer wall in spoke zones ---
  const inSpokeRegion = new Uint8Array(hubSegments);
  const SPOKE_RADIAL_STEPS = spokeHollow > 0 ? 32 : 12;
  const gapWidthAtWall = spokeStep - spokeWidthRad;
  const maxExtraWidth = (gapWidthAtWall / 2) * archDepthFactor;

  // Pre-compute spoke grids and mark spoke regions
  const spokeGrids: { bot: number; top: number }[][][] = [];
  const spokeCutoutMasks: boolean[][][] = [];
  const spokeAngularSegsList: number[] = [];

  for (let k = 0; k < spokeCount; k++) {
    const spokeCenterTheta = k * spokeStep;
    const spokeWidthAtHub = spokeWidthRad + 2 * maxExtraWidth;
    const baseAngSegs = Math.max(4, Math.ceil((spokeWidthAtHub / (2 * Math.PI)) * hubSegments));
    const spokeAngularSegs = spokeHollow > 0 ? Math.max(16, baseAngSegs * 2) : baseAngSegs;
    spokeAngularSegsList.push(spokeAngularSegs);
    const spokeGrid: { bot: number; top: number }[][] = [];
    const indicesUsed = new Set<number>();

    for (let s = 0; s <= spokeAngularSegs; s++) {
      const angularT = s / spokeAngularSegs;
      const radialRow: { bot: number; top: number }[] = [];
      for (let r = 0; r <= SPOKE_RADIAL_STEPS; r++) {
        const radialT = r / SPOKE_RADIAL_STEPS;
        const widthAtR = (wallWidthRad + (spokeWidthRad - wallWidthRad) * (1 - radialT)) + 2 * maxExtraWidth * Math.sin((1 - radialT) * Math.PI / 2);
        const theta = spokeCenterTheta - widthAtR / 2 + angularT * widthAtR;
        if (r === 0) {
          const normTheta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          const hubIdx = Math.round(normTheta / (2 * Math.PI) * hubSegments) % hubSegments;
          radialRow.push({ bot: hubOuterBot[hubIdx], top: hubOuterTop[hubIdx] });
          indicesUsed.add(hubIdx);
          continue;
        }
        const wallR = Math.max(wallRadiusAtY(wallAttachY, theta), hubOuterR + 0.3);
        const rPos = hubOuterR + (wallR - hubOuterR) * radialT;
        const yPos = clampedHubOuterY + (wallAttachY - clampedHubOuterY) * radialT;
        const cosT = Math.cos(theta), sinT = Math.sin(theta);
        radialRow.push({ bot: addVertex(rPos * cosT, yPos, rPos * sinT), top: addVertex(rPos * cosT, yPos + hubThickness, rPos * sinT) });
      }
      spokeGrid.push(radialRow);
    }
    spokeGrids.push(spokeGrid);

    // Compute cutout mask
    const minPhysicalWidth = Math.min(spokeWidthMm, spokeWallWidthMm);
    const effectiveHollow = Math.min(spokeHollow, minPhysicalWidth > 4 ? (1 - 4 / minPhysicalWidth) / 0.82 : 0);
    const cutoutMask: boolean[][] = [];
    if (effectiveHollow > 0) {
      for (let s = 0; s < spokeAngularSegs; s++) {
        cutoutMask[s] = [];
        for (let r = 0; r < SPOKE_RADIAL_STEPS; r++) {
          const u = ((s + 0.5) / spokeAngularSegs - 0.5) * 2, v = ((r + 0.5) / SPOKE_RADIAL_STEPS - 0.5) * 2;
          const size = effectiveHollow * 0.82;
          cutoutMask[s][r] = size > 0 && (u/size)**2 + (v/(size*1.15))**2 < 1;
        }
      }
    }
    spokeCutoutMasks.push(cutoutMask);

    // Mark spoke regions on hub
    const sorted = Array.from(indicesUsed).sort((a, b) => a - b);
    const isWrapped = sorted.length > 1 && (sorted[sorted.length - 1] - sorted[0] > hubSegments / 2);
    if (!isWrapped) { for (let j = sorted[0]; j < sorted[sorted.length - 1]; j++) inSpokeRegion[j] = 1; }
    else {
      let b = 0; for (let i = 0; i < sorted.length - 1; i++) if (sorted[i + 1] - sorted[i] > 1) { b = i; break; }
      for (let j = sorted[b + 1]; j < hubSegments; j++) inSpokeRegion[j] = 1;
      for (let j = 0; j < sorted[b]; j++) inSpokeRegion[j] = 1;
    }
  }

  // --- Emit hub ring faces with correct outward normals ---
  // Winding: addQuad(a,b,c,d) → tris (a,b,c)+(a,c,d), CCW from normal side
  for (let j = 0; j < hubSegments; j++) {
    const n = (j + 1) % hubSegments;
    // 1. Inner wall (normal toward center)
    addQuad(hubInnerBot[j], hubInnerBot[n], hubInnerTop[n], hubInnerTop[j]);
    // 2. Top inner shelf (normal +Y)
    addQuad(rimInnerTop[j], hubInnerTop[j], hubInnerTop[n], rimInnerTop[n]);
    // 3. Top middle cone (normal +Y)
    addQuad(rimOuterTop[j], rimInnerTop[j], rimInnerTop[n], rimOuterTop[n]);
    // 4. Top outer shelf (normal +Y)
    addQuad(hubOuterTop[j], rimOuterTop[j], rimOuterTop[n], hubOuterTop[n]);
    // 5. Outer wall — GAP ONLY (normal outward)
    if (!inSpokeRegion[j]) {
      addQuad(hubOuterBot[j], hubOuterTop[j], hubOuterTop[n], hubOuterBot[n]);
    }
    // 6. Bottom outer shelf (normal -Y)
    addQuad(hubOuterBot[j], hubOuterBot[n], rimOuterBot[n], rimOuterBot[j]);
    // 7. Bottom middle cone (normal -Y)
    addQuad(rimOuterBot[j], rimOuterBot[n], rimInnerBot[n], rimInnerBot[j]);
    // 8. Bottom inner shelf (normal -Y)
    addQuad(rimInnerBot[j], rimInnerBot[n], hubInnerBot[n], hubInnerBot[j]);
  }

  // --- Socket tube (independent solid overlapping hub ring) ---
  const hasSocket = socketDepth > 0;
  if (hasSocket) {
    const effectiveSocketWall = Math.max(0.2, socketWall);
    const tubeOuterR = Math.min(holeRadius + effectiveSocketWall, hubOuterR - 0.2);
    const tubeEndY = hubInnerY + slopeSign * socketDepth;
    const tubeOverlapY = hubInnerY + 0.02;
    const hasChamfer = socketChamferAngle > 0 && socketChamferDepth > 0;
    const chamferWidth = hasChamfer ? socketChamferDepth * Math.tan(socketChamferAngle * Math.PI / 180) : 0;
    const chamferTopR = hasChamfer ? Math.min(holeRadius + chamferWidth, tubeOuterR - 0.2) : holeRadius;
    const chamferBotY = hasChamfer ? tubeOverlapY + slopeSign * Math.min(socketChamferDepth, socketDepth * 0.9) : tubeOverlapY;

    const tubeEndIn: number[] = [], tubeEndOut: number[] = [], tubeCapOut: number[] = [], tubeCapIn: number[] = [], chamTop: number[] = [], chamBot: number[] = [];
    for (let j = 0; j < hubSegments; j++) {
      const theta = (j / hubSegments) * Math.PI * 2;
      const cosT = Math.cos(theta), sinT = Math.sin(theta);
      tubeEndIn.push(addVertex(holeRadius * cosT, tubeEndY, holeRadius * sinT));
      tubeEndOut.push(addVertex(tubeOuterR * cosT, tubeEndY, tubeOuterR * sinT));
      tubeCapOut.push(addVertex(tubeOuterR * cosT, tubeOverlapY, tubeOuterR * sinT));
      if (hasChamfer) { chamTop.push(addVertex(chamferTopR * cosT, tubeOverlapY, chamferTopR * sinT)); chamBot.push(addVertex(holeRadius * cosT, chamferBotY, holeRadius * sinT)); }
      else { tubeCapIn.push(addVertex(holeRadius * cosT, tubeOverlapY, holeRadius * sinT)); }
    }

    // Socket tube winding: use actual Y positions to determine "lower" vs "upper" ring.
    // Inner wall (normal toward center): from center, CCW is lowerY[j] → lowerY[n] → upperY[n] → upperY[j]
    // Outer wall (normal outward): from outside, CCW is lowerY[j] → upperY[j] → upperY[n] → lowerY[n]
    // End cap / overlap cap: horizontal face, normal determined by whether it faces +Y or -Y.

    for (let j = 0; j < hubSegments; j++) {
      const n = (j + 1) % hubSegments;
      if (hasChamfer) {
        if (slopeSign < 0) {
          // Not flipped: tubeEndY < tubeOverlapY (end below, overlap above)
          // chamBot < chamTop in Y, tubeEndIn at bottom
          // Inner wall chamfer: normal inward, lower=chamBot, upper=chamTop
          addQuad(chamBot[j], chamBot[n], chamTop[n], chamTop[j]);
          // Inner wall tube section: lower=tubeEndIn, upper=chamBot
          addQuad(tubeEndIn[j], tubeEndIn[n], chamBot[n], chamBot[j]);
          // Outer wall: lower=tubeEndOut, upper=tubeCapOut
          addQuad(tubeEndOut[j], tubeCapOut[j], tubeCapOut[n], tubeEndOut[n]);
          // End cap: faces -Y (outward, bottom)
          addQuad(tubeEndOut[j], tubeEndOut[n], tubeEndIn[n], tubeEndIn[j]);
          // Overlap cap: faces +Y (outward, top)
          addQuad(tubeCapOut[j], chamTop[j], chamTop[n], tubeCapOut[n]);
        } else {
          // Flipped: tubeEndY > tubeOverlapY (end above, overlap below)
          // chamBotY > tubeOverlapY, and chamTop is at tubeOverlapY (lower Y than chamBot!)
          // Inner wall chamfer: normal inward, lower=chamTop, upper=chamBot
          addQuad(chamTop[j], chamTop[n], chamBot[n], chamBot[j]);
          // Inner wall tube section: lower=chamBot is wrong — tubeEndIn is ABOVE chamBot
          // lower=chamBot, upper=tubeEndIn (chamBotY < tubeEndY)
          addQuad(chamBot[j], chamBot[n], tubeEndIn[n], tubeEndIn[j]);
          // Outer wall: lower=tubeCapOut (at overlapY), upper=tubeEndOut (at endY)
          addQuad(tubeCapOut[j], tubeEndOut[j], tubeEndOut[n], tubeCapOut[n]);
          // End cap: faces +Y (outward, top)
          addQuad(tubeEndOut[j], tubeEndIn[j], tubeEndIn[n], tubeEndOut[n]);
          // Overlap cap: faces -Y (outward, bottom)
          addQuad(tubeCapOut[j], tubeCapOut[n], chamTop[n], chamTop[j]);
        }
      } else {
        if (slopeSign < 0) {
          // Not flipped: tubeEndY < tubeOverlapY
          // Inner wall: lower=tubeEndIn, upper=tubeCapIn
          addQuad(tubeEndIn[j], tubeEndIn[n], tubeCapIn[n], tubeCapIn[j]);
          // Outer wall: lower=tubeEndOut, upper=tubeCapOut
          addQuad(tubeEndOut[j], tubeCapOut[j], tubeCapOut[n], tubeEndOut[n]);
          // End cap: -Y (bottom)
          addQuad(tubeEndOut[j], tubeEndOut[n], tubeEndIn[n], tubeEndIn[j]);
          // Top cap: +Y (top)
          addQuad(tubeCapOut[j], tubeCapIn[j], tubeCapIn[n], tubeCapOut[n]);
        } else {
          // Flipped: tubeEndY > tubeOverlapY
          // Inner wall: lower=tubeCapIn, upper=tubeEndIn
          addQuad(tubeCapIn[j], tubeCapIn[n], tubeEndIn[n], tubeEndIn[j]);
          // Outer wall: lower=tubeCapOut, upper=tubeEndOut
          addQuad(tubeCapOut[j], tubeEndOut[j], tubeEndOut[n], tubeCapOut[n]);
          // End cap: +Y (top)
          addQuad(tubeEndOut[j], tubeEndIn[j], tubeEndIn[n], tubeEndOut[n]);
          // Overlap cap: -Y (bottom)
          addQuad(tubeCapOut[j], tubeCapOut[n], tubeCapIn[n], tubeCapIn[j]);
        }
      }
    }
  }

  // --- Emit spoke faces ---
  // Spoke grid: s = angular index (0..spokeAngularSegs), r = radial index (0..SPOKE_RADIAL_STEPS)
  // r=0 is at hub outer edge, r=SPOKE_RADIAL_STEPS is at wall (spoke tip)
  // s increases CCW (same direction as hub theta)
  //
  // Top face (normal +Y): CCW from +Y → s increases leftward viewed from +Y at angle θ
  //   For quad at (s,r): corners are grid[s][r], grid[s+1][r], grid[s+1][r+1], grid[s][r+1]
  //   CCW from +Y: grid[s][r].top → grid[s+1][r].top → grid[s+1][r+1].top → grid[s][r+1].top
  //
  // Bottom face (normal -Y): CCW from -Y (CW from +Y)
  //   grid[s][r].bot → grid[s][r+1].bot → grid[s+1][r+1].bot → grid[s+1][r].bot

  for (let k = 0; k < spokeCount; k++) {
    const spokeGrid = spokeGrids[k];
    const cutoutMask = spokeCutoutMasks[k];
    const spokeAngularSegs = spokeAngularSegsList[k];
    const minPhysicalWidth = Math.min(spokeWidthMm, spokeWallWidthMm);
    const effectiveHollow = Math.min(spokeHollow, minPhysicalWidth > 4 ? (1 - 4 / minPhysicalWidth) / 0.82 : 0);

    for (let s = 0; s < spokeAngularSegs; s++) {
      for (let r = 0; r < SPOKE_RADIAL_STEPS; r++) {
        if (effectiveHollow > 0 && cutoutMask[s] && cutoutMask[s][r]) {
          // Cutout boundary walls — these face INTO the cutout hole
          // s-side wall (s boundary, looking from lower s into cutout): normal points in -s direction
          if (s === 0 || !cutoutMask[s-1][r]) {
            // Wall at s=s, from r to r+1. Normal faces toward lower s (inward to cutout from -s side).
            // Viewed from -s direction: r increases rightward, top is up
            // CCW: bot_r → bot_r+1 → top_r+1 → top_r
            addQuad(spokeGrid[s][r].bot, spokeGrid[s][r+1].bot, spokeGrid[s][r+1].top, spokeGrid[s][r].top);
          }
          // s+1-side wall (looking from higher s into cutout): normal points in +s direction
          if (s === spokeAngularSegs-1 || !cutoutMask[s+1][r]) {
            addQuad(spokeGrid[s+1][r+1].bot, spokeGrid[s+1][r].bot, spokeGrid[s+1][r].top, spokeGrid[s+1][r+1].top);
          }
          // r-side wall (at r boundary, looking from lower r into cutout): normal faces toward lower r
          if (r === 0 || !cutoutMask[s][r-1]) {
            addQuad(spokeGrid[s+1][r].bot, spokeGrid[s][r].bot, spokeGrid[s][r].top, spokeGrid[s+1][r].top);
          }
          // r+1-side wall (looking from higher r into cutout): normal faces toward higher r
          if (r === SPOKE_RADIAL_STEPS-1 || !cutoutMask[s][r+1]) {
            addQuad(spokeGrid[s][r+1].bot, spokeGrid[s+1][r+1].bot, spokeGrid[s+1][r+1].top, spokeGrid[s][r+1].top);
          }
          continue;
        }
        // Normal spoke quad
        if (r === 0 && spokeGrid[s][0].bot === spokeGrid[s+1][0].bot) {
          // Degenerate at r=0 (same hub vertex) — emit triangles
          // Bottom tri: hub_bot → grid[s+1][1].bot → grid[s][1].bot (normal -Y)
          addTri(spokeGrid[s][0].bot, spokeGrid[s][1].bot, spokeGrid[s+1][1].bot);
          // Top tri: hub_top → grid[s+1][1].top → grid[s][1].top (normal +Y)
          addTri(spokeGrid[s][0].top, spokeGrid[s+1][1].top, spokeGrid[s][1].top);
        } else {
          // Bottom face (normal -Y): CW from +Y
          addQuad(spokeGrid[s][r].bot, spokeGrid[s][r+1].bot, spokeGrid[s+1][r+1].bot, spokeGrid[s+1][r].bot);
          // Top face (normal +Y): CCW from +Y
          addQuad(spokeGrid[s][r].top, spokeGrid[s+1][r].top, spokeGrid[s+1][r+1].top, spokeGrid[s][r+1].top);
        }
      }
    }

    // Spoke side walls (s=0 and s=spokeAngularSegs edges)
    // At s=0: normal faces toward -s (lower theta, away from spoke).
    // At s=spokeAngularSegs: normal faces toward +s (higher theta, away from spoke).
    // These must be consistent with adjacent gap wall and spoke top/bottom faces.
    // s=0 wall: top[r] → top[r+1] → bot[r+1] → bot[r]
    // s=max wall: bot[r] → bot[r+1] → top[r+1] → top[r]
    for (let r = 0; r < SPOKE_RADIAL_STEPS; r++) {
      addQuad(spokeGrid[0][r].top, spokeGrid[0][r+1].top, spokeGrid[0][r+1].bot, spokeGrid[0][r].bot);
      addQuad(spokeGrid[spokeAngularSegs][r].bot, spokeGrid[spokeAngularSegs][r+1].bot, spokeGrid[spokeAngularSegs][r+1].top, spokeGrid[spokeAngularSegs][r].top);
    }

    // Spoke tip wall (at r=SPOKE_RADIAL_STEPS): normal faces outward (toward higher r, away from center)
    // This is like outer wall — CCW from outside (higher r)
    // Viewed from outside: s increases leftward (CCW from +Y), top is up
    // CCW: bot[s] → top[s] → top[s+1] → bot[s+1]
    for (let s = 0; s < spokeAngularSegs; s++) {
      addQuad(spokeGrid[s][SPOKE_RADIAL_STEPS].bot, spokeGrid[s][SPOKE_RADIAL_STEPS].top, spokeGrid[s+1][SPOKE_RADIAL_STEPS].top, spokeGrid[s+1][SPOKE_RADIAL_STEPS].bot);
    }
  }

  return { vertices, indices, colors };
}

export function createSuspensionGeometry(result: SuspensionResult): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(result.vertices, 3));
  if (result.colors.length > 0) geometry.setAttribute('color', new THREE.Float32BufferAttribute(result.colors, 3));
  geometry.setIndex(result.indices);
  const merged = mergeVertices(geometry, 1e-4);
  merged.computeVertexNormals();
  return merged;
}

export function createConfigFromParams(params: DesignParams, getWallInnerRadius: (y: number, theta: number) => number): SuspensionConfig {
  return {
    centerY: params.height * params.suspensionHeight,
    holeRadius: params.suspensionHoleSize / 2,
    hubWidth: params.suspensionRimWidth,
    hubThickness: Math.max(0.2, params.suspensionThickness),
    spokeCount: params.suspensionRibCount,
    spokeWidthMm: params.suspensionRibWidth,
    spokeWallWidthMm: params.suspensionWallWidth ?? params.suspensionRibWidth,
    spokeAngle: Math.max(MIN_SELF_SUPPORTING_ANGLE, params.suspensionAngle),
    archDepthFactor: params.suspensionArchPower,
    flipped: params.suspensionFlipped,
    spokeHollow: params.spokeHollow ?? 0,
    socketDepth: params.suspensionSocketDepth ?? 0,
    socketWall: Math.max(0.2, params.suspensionSocketWall ?? 0.2),
    socketChamferAngle: params.suspensionSocketChamferAngle ?? 0,
    socketChamferDepth: params.suspensionSocketChamferDepth ?? 0.2,
    wallRadiusAtY: getWallInnerRadius,
    wallThickness: params.thickness,
    shadeHeight: params.height,
  };
}
