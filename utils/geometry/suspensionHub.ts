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
 * 5. Socket tube: Topologically integrated into hub ring (shared vertex rings)
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
  /** Body inner wall grid info for spoke-body topological connection */
  bodyGridInfo?: {
    innerBottomY: number;
    innerTopY: number;
    heightSegments: number;
  };
}

export interface SuspensionResult {
  vertices: number[];
  indices: number[];
  colors: number[];
  /** Body grid cells covered by spoke tips — bodyGeometry skips inner wall faces here */
  spokeRegions?: {
    iMin: number;
    iMax: number;
    spokeJRanges: [number, number][];  // [jMin, jMax] per spoke (body theta grid indices)
  };
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
  const thick = hubThickness;

  const spokeWidthRad = spokeWidthMm / (hubOuterR * 10);
  const wallWidthRad = spokeWallWidthMm / (repWallR * 10);
  const spokeStep = (2 * Math.PI) / spokeCount;

  // --- Body grid snapping for spoke-body topological integration ---
  const integrateWithBody = !!config.bodyGridInfo;
  let snappedYBot = wallAttachY;
  let snappedYTop = wallAttachY + thick;
  const bodyThetaStep = 2 * Math.PI / radialSegments;
  const intermediateBodyYs: number[] = [];
  let bodyIBot = 0, bodyITop = 0;

  if (config.bodyGridInfo) {
    const { innerBottomY, innerTopY, heightSegments: bodyHeightSegs } = config.bodyGridInfo;
    const bodyYStep = (innerTopY - innerBottomY) / bodyHeightSegs;
    bodyIBot = Math.round((wallAttachY - innerBottomY) / bodyYStep);
    bodyITop = Math.round((wallAttachY + thick - innerBottomY) / bodyYStep);
    bodyIBot = Math.max(0, Math.min(bodyHeightSegs, bodyIBot));
    bodyITop = Math.max(bodyIBot + 1, Math.min(bodyHeightSegs, bodyITop));
    snappedYBot = innerBottomY + bodyIBot * bodyYStep;
    snappedYTop = innerBottomY + bodyITop * bodyYStep;
    for (let i = bodyIBot + 1; i < bodyITop; i++) {
      intermediateBodyYs.push(innerBottomY + i * bodyYStep);
    }
  }

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

  // --- Socket tube constants (computed before vertex loop) ---
  const hasSocket = socketDepth > 0;
  const effectiveSocketWall = Math.max(0.2, socketWall);
  const rawTubeOuterR = hasSocket ? Math.min(holeRadius + effectiveSocketWall, hubOuterR - 0.2) : 0;
  // When tubeOuterR ≈ rimInnerR, mergeVertices fuses them → non-manifold.
  // Fix: share the rim inner ring as the junction ring and skip the degenerate face.
  const socketSharesRim = hasSocket && Math.abs(rawTubeOuterR - rimInnerR) < 0.02;
  const tubeOuterR = socketSharesRim ? rimInnerR : rawTubeOuterR;
  const tubeEndY = hasSocket ? hubInnerY + slopeSign * socketDepth : 0;
  const hasChamfer = hasSocket && socketChamferAngle > 0 && socketChamferDepth > 0;
  const chamferWidth = hasChamfer ? socketChamferDepth * Math.tan(socketChamferAngle * Math.PI / 180) : 0;
  const chamferTopR = hasChamfer ? Math.min(holeRadius + chamferWidth, tubeOuterR - 0.2) : holeRadius;
  // junctionY: where tube outer wall meets hub ring bottom shelf
  const junctionY = hubInnerY;
  // chamferBotY: narrow end of chamfer, between tubeEndY and junctionY
  const chamferBotY = hasChamfer
    ? tubeEndY + slopeSign * Math.min(socketChamferDepth, socketDepth * 0.9)
    : 0;
  // chamTopY: offset 0.002 from junctionY to avoid mergeVertices T-junction fusion
  const chamTopY = hasChamfer ? junctionY - slopeSign * 0.002 : 0;

  // --- Vertex rings ---
  // When hasSocket: innerLow/innerHigh replace hubInnerBot/hubInnerTop
  //   innerLow = bottom of continuous inner wall (at tubeEndY)
  //   innerHigh = top of continuous inner wall (at hubInnerY + thick)
  // When !hasSocket: hubInnerBot/hubInnerTop at hubInnerY / hubInnerY+thick

  // These arrays are ALWAYS used for face emission (aliased when !hasSocket)
  const innerBot: number[] = [];   // hubInnerBot or innerLow
  const innerTop: number[] = [];   // hubInnerTop or innerHigh
  const rimInnerBot: number[] = [];
  const rimInnerTop: number[] = [];
  const rimOuterBot: number[] = [];
  const rimOuterTop: number[] = [];
  const hubOuterBot: number[] = [];
  const hubOuterTop: number[] = [];

  // Socket-only rings
  const tubeOutEnd: number[] = [];
  const tubeOutJunction: number[] = [];
  const chamBotRing: number[] = [];
  const chamTopRing: number[] = [];

  for (let j = 0; j < hubSegments; j++) {
    const theta = (j / hubSegments) * Math.PI * 2;
    const cosT = Math.cos(theta), sinT = Math.sin(theta);

    if (hasSocket) {
      // Determine Y positions based on flipped state
      // Not flipped (slopeSign < 0): tubeEndY < hubInnerY, tube extends DOWN
      //   innerLow at (holeR, tubeEndY), innerHigh at (holeR, hubInnerY + thick)
      // Flipped (slopeSign > 0): tubeEndY > hubInnerY + thick, tube extends UP
      //   innerLow at (holeR, hubInnerY), innerHigh at (holeR, tubeEndY)

      if (slopeSign < 0) {
        // Not flipped: innerLow = tubeEndY (bottom), innerHigh = hubInnerY + thick (top)
        innerBot.push(addVertex(holeRadius * cosT, tubeEndY, holeRadius * sinT));
        innerTop.push(addVertex(holeRadius * cosT, hubInnerY + thick, holeRadius * sinT));
      } else {
        // Flipped: innerLow = hubInnerY (bottom), innerHigh = tubeEndY (top)
        innerBot.push(addVertex(holeRadius * cosT, hubInnerY, holeRadius * sinT));
        innerTop.push(addVertex(holeRadius * cosT, tubeEndY, holeRadius * sinT));
      }

      // Tube outer end ring (at tubeEndY, tubeOuterR)
      tubeOutEnd.push(addVertex(tubeOuterR * cosT, tubeEndY, tubeOuterR * sinT));

      // Tube outer junction ring — when socketSharesRim, reuse rim inner ring (populated below)
      if (!socketSharesRim) {
        if (slopeSign < 0) {
          tubeOutJunction.push(addVertex(tubeOuterR * cosT, junctionY, tubeOuterR * sinT));
        } else {
          tubeOutJunction.push(addVertex(tubeOuterR * cosT, junctionY + thick, tubeOuterR * sinT));
        }
      }

      // Chamfer rings
      if (hasChamfer) {
        chamBotRing.push(addVertex(holeRadius * cosT, chamferBotY, holeRadius * sinT));
        chamTopRing.push(addVertex(chamferTopR * cosT, chamTopY, chamferTopR * sinT));
      }
    } else {
      // No socket: standard hubInnerBot/hubInnerTop
      innerBot.push(addVertex(holeRadius * cosT, hubInnerY, holeRadius * sinT));
      innerTop.push(addVertex(holeRadius * cosT, hubInnerY + thick, holeRadius * sinT));
    }

    rimInnerBot.push(addVertex(rimInnerR * cosT, hubInnerY, rimInnerR * sinT));
    rimInnerTop.push(addVertex(rimInnerR * cosT, hubInnerY + thick, rimInnerR * sinT));
    rimOuterBot.push(addVertex(rimOuterR_hub * cosT, clampedHubOuterY, rimOuterR_hub * sinT));
    rimOuterTop.push(addVertex(rimOuterR_hub * cosT, clampedHubOuterY + thick, rimOuterR_hub * sinT));
    hubOuterBot.push(addVertex(hubOuterR * cosT, clampedHubOuterY, hubOuterR * sinT));
    hubOuterTop.push(addVertex(hubOuterR * cosT, clampedHubOuterY + thick, hubOuterR * sinT));
  }

  // When socketSharesRim, tube outer junction ring IS the rim inner ring
  if (socketSharesRim) {
    if (slopeSign < 0) {
      for (let j = 0; j < hubSegments; j++) tubeOutJunction.push(rimInnerBot[j]);
    } else {
      for (let j = 0; j < hubSegments; j++) tubeOutJunction.push(rimInnerTop[j]);
    }
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
  // Per-spoke: body theta index at each angular position of the tip (when integrateWithBody)
  const spokeTipBodyJ: number[][] = [];
  const spokeCollapsed: boolean[] = [];  // true when tip collapsed to single body column

  for (let k = 0; k < spokeCount; k++) {
    const spokeCenterTheta = k * spokeStep;
    const spokeWidthAtHub = spokeWidthRad + 2 * maxExtraWidth;
    const baseAngSegs = Math.max(4, Math.ceil((spokeWidthAtHub / (2 * Math.PI)) * hubSegments));
    const spokeAngularSegs = spokeHollow > 0 ? Math.max(16, baseAngSegs * 2) : baseAngSegs;
    spokeAngularSegsList.push(spokeAngularSegs);
    const spokeGrid: { bot: number; top: number }[][] = [];
    const indicesUsed = new Set<number>();
    const tipBodyJ: number[] = [];

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
        if (r === SPOKE_RADIAL_STEPS && integrateWithBody) {
          // Snap tip to body grid: theta → nearest body theta, Y → snapped body Y
          const jBody = Math.round(theta / bodyThetaStep);
          const normJ = ((jBody % radialSegments) + radialSegments) % radialSegments;
          const normTheta = normJ * bodyThetaStep;
          tipBodyJ.push(normJ);
          const wallR = Math.max(wallRadiusAtY(snappedYBot, normTheta), hubOuterR + 0.3);
          const cosT = Math.cos(normTheta), sinT = Math.sin(normTheta);
          radialRow.push({
            bot: addVertex(wallR * cosT, snappedYBot, wallR * sinT),
            top: addVertex(wallR * cosT, snappedYTop, wallR * sinT)
          });
          continue;
        }
        const wallR = Math.max(wallRadiusAtY(wallAttachY, theta), hubOuterR + 0.3);
        const rPos = hubOuterR + (wallR - hubOuterR) * radialT;
        const yPos = clampedHubOuterY + (wallAttachY - clampedHubOuterY) * radialT;
        const cosT = Math.cos(theta), sinT = Math.sin(theta);
        radialRow.push({ bot: addVertex(rPos * cosT, yPos, rPos * sinT), top: addVertex(rPos * cosT, yPos + thick, rPos * sinT) });
      }
      spokeGrid.push(radialRow);
    }
    spokeGrids.push(spokeGrid);
    spokeTipBodyJ.push(tipBodyJ);

    // Check if tip collapsed to single body column (spoke too narrow for body grid)
    // In this case, don't integrate: use normal side walls and emit tip wall (degenerate)
    const tipCollapsed = integrateWithBody && tipBodyJ.length > 0 &&
      new Set(tipBodyJ).size === 1;
    if (tipCollapsed) {
      // Replace snapped tip vertices with original wall positions (tip becomes overlapping solid)
      for (let s = 0; s <= spokeAngularSegs; s++) {
        const angularT = s / spokeAngularSegs;
        const theta = spokeCenterTheta - wallWidthRad / 2 + angularT * wallWidthRad;
        const wallR = Math.max(wallRadiusAtY(wallAttachY, theta), hubOuterR + 0.3);
        const cosT = Math.cos(theta), sinT = Math.sin(theta);
        const botIdx = spokeGrid[s][SPOKE_RADIAL_STEPS].bot;
        const topIdx = spokeGrid[s][SPOKE_RADIAL_STEPS].top;
        vertices[botIdx * 3] = wallR * cosT; vertices[botIdx * 3 + 1] = wallAttachY; vertices[botIdx * 3 + 2] = wallR * sinT;
        vertices[topIdx * 3] = wallR * cosT; vertices[topIdx * 3 + 1] = wallAttachY + thick; vertices[topIdx * 3 + 2] = wallR * sinT;
      }
    }
    spokeCollapsed.push(tipCollapsed);

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

  // Compute spoke body grid regions for body inner wall face skipping
  const spokeJRanges: [number, number][] = [];
  if (integrateWithBody) {
    for (let k = 0; k < spokeCount; k++) {
      const tipJs = spokeTipBodyJ[k];
      if (tipJs.length > 0 && !spokeCollapsed[k]) {
        spokeJRanges.push([tipJs[0], tipJs[tipJs.length - 1]]);
      }
    }
  }

  // --- Emit hub ring faces with correct outward normals ---
  // Winding: addQuad(a,b,c,d) → tris (a,b,c)+(a,c,d), CCW from normal side
  //
  // When hasSocket, faces 1 (inner wall) and 8 (bottom inner shelf) are replaced
  // by integrated socket tube faces A-D. The inner wall runs continuously from
  // innerBot (tubeEnd) to innerTop, and the bottom shelf connects tubeOutJunction
  // to rimInnerBot instead of hubInnerBot to rimInnerBot.

  for (let j = 0; j < hubSegments; j++) {
    const n = (j + 1) % hubSegments;

    if (hasSocket) {
      // --- SOCKET INTEGRATED FACES ---
      if (slopeSign < 0) {
        // NOT FLIPPED: tube extends down. innerBot at tubeEndY, innerTop at hubInnerY+thick.
        // tubeOutEnd at tubeEndY, tubeOutJunction at hubInnerY (junctionY).

        // Face A: Inner wall (normal toward center) — continuous from innerBot to innerTop
        if (hasChamfer) {
          // A1: innerBot → chamBotRing (lower tube section)
          addQuad(innerBot[j], innerBot[n], chamBotRing[n], chamBotRing[j]);
          // A2: chamBotRing → chamTopRing (chamfer surface, widens from holeR to chamferTopR)
          addQuad(chamBotRing[j], chamBotRing[n], chamTopRing[n], chamTopRing[j]);
          // A3: chamTopRing → innerTop (upper inner wall)
          addQuad(chamTopRing[j], chamTopRing[n], innerTop[n], innerTop[j]);
        } else {
          // A: Full continuous inner wall
          addQuad(innerBot[j], innerBot[n], innerTop[n], innerTop[j]);
        }

        // Face B: End cap (normal -Y, facing down)
        // Must traverse innerBot[n]→innerBot[j] (opposite face A's j→n)
        // Must traverse tubeOutEnd[j]→tubeOutEnd[n] (opposite face C's n→j)
        addQuad(tubeOutEnd[j], tubeOutEnd[n], innerBot[n], innerBot[j]);

        // Face C: Tube outer wall (normal outward)
        addQuad(tubeOutEnd[j], tubeOutJunction[j], tubeOutJunction[n], tubeOutEnd[n]);

        // Face D: Junction ledge (normal -Y, replaces old bottom inner shelf)
        // Skip when socketSharesRim — tubeOutJunction IS rimInnerBot, face would be degenerate
        if (!socketSharesRim) {
          addQuad(rimInnerBot[j], rimInnerBot[n], tubeOutJunction[n], tubeOutJunction[j]);
        }

        // Face 2: Top inner shelf (normal +Y) — innerTop replaces hubInnerTop
        addQuad(rimInnerTop[j], innerTop[j], innerTop[n], rimInnerTop[n]);

      } else {
        // FLIPPED: tube extends up. innerBot at hubInnerY, innerTop at tubeEndY.
        // tubeOutEnd at tubeEndY, tubeOutJunction at hubInnerY+thick (top of hub ring).

        // Face A: Inner wall (normal toward center) — continuous from innerBot to innerTop
        if (hasChamfer) {
          // A1: innerBot → chamTopRing (lower section, chamTop is closer to hub)
          // Flipped: chamTopY > hubInnerY but < chamBotY < tubeEndY
          // chamTopRing is at chamTopY (just above hubInnerY+thick-0.002)
          // chamBotRing is at chamferBotY (between chamTopY and tubeEndY)
          // innerBot at hubInnerY, innerTop at tubeEndY
          // Wall goes: innerBot → chamTopRing → chamBotRing → innerTop (all at holeR except chamTop at chamferTopR)
          addQuad(innerBot[j], innerBot[n], chamTopRing[n], chamTopRing[j]);
          // A2: chamTopRing → chamBotRing (chamfer surface)
          addQuad(chamTopRing[j], chamTopRing[n], chamBotRing[n], chamBotRing[j]);
          // A3: chamBotRing → innerTop (upper tube section)
          addQuad(chamBotRing[j], chamBotRing[n], innerTop[n], innerTop[j]);
        } else {
          // A: Full continuous inner wall
          addQuad(innerBot[j], innerBot[n], innerTop[n], innerTop[j]);
        }

        // Face B: End cap (normal +Y, facing up)
        addQuad(tubeOutEnd[j], innerTop[j], innerTop[n], tubeOutEnd[n]);

        // Face C: Tube outer wall (normal outward)
        // tubeOutJunction at hubInnerY+thick (lower Y), tubeOutEnd at tubeEndY (higher Y)
        addQuad(tubeOutJunction[j], tubeOutEnd[j], tubeOutEnd[n], tubeOutJunction[n]);

        // Face D: Junction ledge (normal +Y, replaces old top inner shelf)
        // Skip when socketSharesRim — tubeOutJunction IS rimInnerTop, face would be degenerate
        if (!socketSharesRim) {
          addQuad(tubeOutJunction[n], rimInnerTop[n], rimInnerTop[j], tubeOutJunction[j]);
        }

        // Face 8: Bottom inner shelf (normal -Y) — innerBot replaces hubInnerBot
        addQuad(rimInnerBot[j], rimInnerBot[n], innerBot[n], innerBot[j]);
      }
    } else {
      // --- NO SOCKET: Original faces 1, 2, 8 ---
      // 1. Inner wall (normal toward center)
      addQuad(innerBot[j], innerBot[n], innerTop[n], innerTop[j]);
      // 2. Top inner shelf (normal +Y)
      addQuad(rimInnerTop[j], innerTop[j], innerTop[n], rimInnerTop[n]);
      // 8. Bottom inner shelf (normal -Y)
      addQuad(rimInnerBot[j], rimInnerBot[n], innerBot[n], innerBot[j]);
    }

    // --- SHARED FACES (always emitted) ---
    if (hasSocket && slopeSign < 0) {
      // Not flipped + socket: top inner shelf already emitted above (face 2)
    } else if (hasSocket && slopeSign > 0) {
      // Flipped + socket: bottom inner shelf already emitted above (face 8)
    }

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
          if (s === 0 || !cutoutMask[s-1][r]) {
            addQuad(spokeGrid[s][r].bot, spokeGrid[s][r+1].bot, spokeGrid[s][r+1].top, spokeGrid[s][r].top);
          }
          if (s === spokeAngularSegs-1 || !cutoutMask[s+1][r]) {
            addQuad(spokeGrid[s+1][r+1].bot, spokeGrid[s+1][r].bot, spokeGrid[s+1][r].top, spokeGrid[s+1][r+1].top);
          }
          if (r === 0 || !cutoutMask[s][r-1]) {
            addQuad(spokeGrid[s+1][r].bot, spokeGrid[s][r].bot, spokeGrid[s][r].top, spokeGrid[s+1][r].top);
          }
          if (r === SPOKE_RADIAL_STEPS-1 || !cutoutMask[s][r+1]) {
            addQuad(spokeGrid[s][r+1].bot, spokeGrid[s+1][r+1].bot, spokeGrid[s+1][r+1].top, spokeGrid[s][r+1].top);
          }
          continue;
        }
        // Normal spoke quad
        if (r === 0 && spokeGrid[s][0].bot === spokeGrid[s+1][0].bot) {
          addTri(spokeGrid[s][0].bot, spokeGrid[s][1].bot, spokeGrid[s+1][1].bot);
          addTri(spokeGrid[s][0].top, spokeGrid[s+1][1].top, spokeGrid[s][1].top);
        } else {
          addQuad(spokeGrid[s][r].bot, spokeGrid[s][r+1].bot, spokeGrid[s+1][r+1].bot, spokeGrid[s+1][r].bot);
          addQuad(spokeGrid[s][r].top, spokeGrid[s+1][r].top, spokeGrid[s+1][r+1].top, spokeGrid[s][r+1].top);
        }
      }
    }

    // Spoke side walls
    // When integrateWithBody, the last radial step's side wall needs intermediate Y
    // vertices on the TIP edge to match body grid edges at the hole boundary.
    // We use triangle fans from interior vertices to avoid T-junctions on the interior edge.
    for (let r = 0; r < SPOKE_RADIAL_STEPS; r++) {
      const isLastStep = r === SPOKE_RADIAL_STEPS - 1;

      if (isLastStep && integrateWithBody && !spokeCollapsed[k] && intermediateBodyYs.length > 0) {
        // Triangle fan approach: keep interior edge undivided, subdivide only tip edge.
        // For s=0: fan from interiorTop (A) through [tipTop, tip_mids descending, tipBot, interiorBot]
        // For s=max: fan from interiorBot (D) through [tipBot, tip_mids ascending, tipTop, interiorTop]

        for (const side of [0, spokeAngularSegs] as const) {
          const intBot = spokeGrid[side][r].bot;
          const intTop = spokeGrid[side][r].top;
          const tipBot = spokeGrid[side][r + 1].bot;
          const tipTop = spokeGrid[side][r + 1].top;

          // Create intermediate tip vertices at body grid Y positions
          const tipTheta = side === 0
            ? spokeTipBodyJ[k][0] * bodyThetaStep
            : spokeTipBodyJ[k][spokeTipBodyJ[k].length - 1] * bodyThetaStep;

          const tipMidVerts: number[] = [];
          for (const yi of intermediateBodyYs) {
            const tipR = Math.max(wallRadiusAtY(yi, tipTheta), hubOuterR + 0.3);
            tipMidVerts.push(addVertex(tipR * Math.cos(tipTheta), yi, tipR * Math.sin(tipTheta)));
          }

          if (side === 0) {
            // s=0 side: fan from interiorTop (A)
            // Original winding: addQuad(A, B, C, D) = (intTop, tipTop, tipBot, intBot)
            // Fan vertices from B down to D: [tipTop, ...tipMids descending, tipBot, intBot]
            const fanVerts = [tipTop, ...tipMidVerts.slice().reverse(), tipBot, intBot];
            for (let p = 0; p < fanVerts.length - 1; p++) {
              addTri(intTop, fanVerts[p], fanVerts[p + 1]);
            }
          } else {
            // s=max side: fan from interiorBot (D)
            // Original winding: addQuad(D, C, B, A) = (intBot, tipBot, tipTop, intTop)
            // Fan vertices from C up to A: [tipBot, ...tipMids ascending, tipTop, intTop]
            const fanVerts = [tipBot, ...tipMidVerts, tipTop, intTop];
            for (let p = 0; p < fanVerts.length - 1; p++) {
              addTri(intBot, fanVerts[p], fanVerts[p + 1]);
            }
          }
        }
      } else {
        // Normal side wall quads
        addQuad(spokeGrid[0][r].top, spokeGrid[0][r+1].top, spokeGrid[0][r+1].bot, spokeGrid[0][r].bot);
        addQuad(spokeGrid[spokeAngularSegs][r].bot, spokeGrid[spokeAngularSegs][r+1].bot, spokeGrid[spokeAngularSegs][r+1].top, spokeGrid[spokeAngularSegs][r].top);
      }
    }

    // Spoke tip wall — skip when integrated with body (body inner wall provides the surface)
    // Emit for collapsed spokes (too narrow for body grid) — they remain overlapping solids
    if (!integrateWithBody || spokeCollapsed[k]) {
      for (let s = 0; s < spokeAngularSegs; s++) {
        addQuad(spokeGrid[s][SPOKE_RADIAL_STEPS].bot, spokeGrid[s][SPOKE_RADIAL_STEPS].top, spokeGrid[s+1][SPOKE_RADIAL_STEPS].top, spokeGrid[s+1][SPOKE_RADIAL_STEPS].bot);
      }
    }
  }

  const result: SuspensionResult = { vertices, indices, colors };
  if (integrateWithBody && spokeJRanges.length > 0) {
    result.spokeRegions = {
      iMin: bodyIBot,
      iMax: bodyITop,
      spokeJRanges,
    };
  }
  return result;
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
