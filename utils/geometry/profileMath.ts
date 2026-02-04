/**
 * PROFILE MATH MODULE
 *
 * Core mathematical functions for calculating surface positions.
 * This is the foundation used by all geometry generators.
 *
 * Handles:
 * - Profile curves (cone, bell, tulip, barrel, etc.)
 * - Surface textures (ribs, ripples, steps)
 * - Base/top flares
 * - Skin patterns (kumiko)
 * - Polygon cross-sections
 */

import { DesignParams } from '../../types';
import { evaluateSkinPattern } from '../patterns';

/**
 * Result from calculatePointData
 */
export interface PointData {
  x: number;
  y: number;
  z: number;
  r: number;      // Radius at this point
  pierce: number; // Pierce amount for skin patterns (0-1)
}

/**
 * Calculates the exact radius at a specific point in 3D space.
 * This handles Vertical Profile (Bulge, Taper, Steps) AND Horizontal Profile (Twist, Ribs).
 */
export const calculatePointData = (
  y: number,
  theta: number,
  params: DesignParams
): PointData => {
  const {
    height: h,
    radiusTop: rT,
    radiusBottom: rB,
    profile,
    curvature,
    curveBias,
    stepCount,
    rippleAmplitude,
    rippleFrequency,
    twist,
    ribCount,
    ribAmplitude,
    baseFlareWidth,
    baseFlareHeight,
    topFlareWidth,
    topFlareHeight
  } = params;

  // Normalize Height (0 to 1)
  let t = y / Math.max(0.1, h);
  t = Math.max(0, Math.min(1, t));

  // 1. VERTICAL STEPS (Terracing)
  let tStepped = t;

  if (stepCount > 0) {
    const totalSteps = stepCount;
    const rawStep = t * totalSteps;
    const stepIndex = Math.floor(rawStep);
    const fraction = rawStep - stepIndex;
    const minSlope = 0.36;
    const dr = Math.abs(rT - rB) / totalSteps;
    const dy = h / totalSteps;

    let bevelRatio = 0.2;
    if (dr > 0.001) {
       const requiredDy = dr * minSlope;
       const calculatedRatio = requiredDy / dy;
       bevelRatio = Math.max(bevelRatio, Math.min(0.9, calculatedRatio));
    }

    if (fraction < (1 - bevelRatio)) {
      tStepped = stepIndex / totalSteps;
    } else {
      const transT = (fraction - (1 - bevelRatio)) / bevelRatio;
      tStepped = (stepIndex + transT) / totalSteps;
    }
  }

  // 2. BASE RADIUS GENERATION (Profiles)
  let baseRadius = 0;
  let taperT = tStepped;

  if (profile === 'bell') {
      const power = Math.pow(2.0, -curvature);
      taperT = Math.pow(tStepped, power);
  } else if (profile === 'tulip') {
      taperT = tStepped * tStepped * (3 - 2 * tStepped);
  } else if (profile === 'barrel') {
      taperT = 0.5 - 0.5 * Math.cos(Math.PI * tStepped);
  } else if (profile === 'trumpet') {
      const k = 2.5;
      taperT = (Math.exp(k * tStepped) - 1) / (Math.exp(k) - 1);
  } else if (profile === 'ogee') {
      if (tStepped < 0.5) {
          taperT = 4 * tStepped * tStepped * tStepped;
      } else {
          taperT = 1 - Math.pow(-2 * tStepped + 2, 3) / 2;
      }
  } else if (profile === 'vase') {
      taperT = tStepped + 0.12 * Math.sin(2 * Math.PI * tStepped);
  }

  // Calculate Base Taper
  const rLinear = rB + (rT - rB) * taperT;
  baseRadius = rLinear;

  // Additive Bulge
  if (profile !== 'bell' && profile !== 'cone' && Math.abs(curvature) > 0.01) {
    const safeBias = Math.max(0.1, Math.min(0.9, curveBias));
    const k = Math.log(0.5) / Math.log(safeBias);
    const shapedT = Math.pow(tStepped, k);

    let bulge = 0;
    if (profile === 'elliptic') {
         const x = 2 * shapedT - 1;
         const safeX = Math.max(-1, Math.min(1, x));
         bulge = curvature * Math.sqrt(1 - safeX * safeX);
    } else {
         bulge = curvature * Math.sin(Math.PI * shapedT);
    }
    baseRadius += bulge;
  }

  // 3. BASE FLARE (Stability Foot)
  if (baseFlareWidth > 0 && baseFlareHeight > 0 && y < baseFlareHeight) {
     const yRel = y / baseFlareHeight;
     const tFlare = 1 - yRel;
     const flareShape = tFlare * tFlare;
     baseRadius += baseFlareWidth * flareShape;
  }

  // 3b. TOP FLARE (Lip) with 30deg overhang constraint
  if (topFlareWidth > 0 && topFlareHeight > 0 && y > (h - topFlareHeight)) {
    const yRel = (h - y) / topFlareHeight;
    const tFlare = 1 - yRel;
    const maxWidth = Math.tan(Math.PI / 6) * topFlareHeight / 2;
    const w = Math.min(topFlareWidth, maxWidth);
    baseRadius += w * tFlare * tFlare;
  }

  // 4. VERTICAL RIPPLES — clamped for 35deg FDM overhang
  if (rippleAmplitude > 0 && rippleFrequency > 0) {
    const maxRippleAmp = Math.tan(35 * Math.PI / 180) * h / (rippleFrequency * 2 * Math.PI);
    const effectiveAmp = Math.min(rippleAmplitude, maxRippleAmp);
    baseRadius += effectiveAmp * Math.sin(t * rippleFrequency * Math.PI * 2);
  }

  // 5. TWIST (Modifies Angle)
  const twistRad = twist * (Math.PI / 180) * t;
  const thetaTwisted = theta + twistRad;

  // 6. RIBS / FLUTING
  if (ribCount > 0 && ribAmplitude > 0) {
    baseRadius += ribAmplitude * Math.cos(ribCount * thetaTwisted);
  }

  // 6b. SKIN PATTERN (Kumiko-style)
  let pierceAmount = 0;
  if (params.skinPattern !== 'none') {
    const skinResult = evaluateSkinPattern(y, thetaTwisted, baseRadius, params);
    baseRadius += skinResult.delta;
    pierceAmount = skinResult.pierce;
  }

  // 7. POLYGON CROSS-SECTION
  if (profile === 'polygon') {
    const N = Math.max(3, Math.min(12, Math.round(params.polygonSides)));
    const sector = (2 * Math.PI) / N;
    const a = ((thetaTwisted % sector) + sector) % sector;
    baseRadius *= Math.cos(Math.PI / N) / Math.cos(a - Math.PI / N);
  }

  baseRadius = Math.max(0.1, baseRadius);

  // Return Polar Coordinates converted to 3D position
  const x = baseRadius * Math.cos(theta);
  const z = baseRadius * Math.sin(theta);

  return { x, y, z, r: baseRadius, pierce: pierceAmount };
};

/**
 * Helper to add a quad (two triangles) to an index array.
 * Used by all geometry generators.
 */
export const addQuad = (
  indices: number[],
  a: number,
  b: number,
  c: number,
  d: number,
  flipped = false
): void => {
  if (flipped) {
    indices.push(a, d, c);
    indices.push(a, c, b);
  } else {
    indices.push(a, b, c);
    indices.push(a, c, d);
  }
};
