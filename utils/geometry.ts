import * as THREE from 'three';
import { mergeVertices } from 'three-stdlib';
import { DesignParams } from '../types';
import { evaluateSkinPattern } from './patterns';

/**
 * Calculates the exact radius at a specific point in 3D space.
 * This handles Vertical Profile (Bulge, Taper, Steps) AND Horizontal Profile (Twist, Ribs).
 */
const calculatePointData = (
  y: number, 
  theta: number, 
  params: DesignParams
) => {
  const { 
    height: h, 
    radiusTop: rT, 
    radiusBottom: rB, 
    profile, // New Profile param
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
  let t = y / Math.max(0.1, h); // Avoid division by zero
  // Clamping t for safety
  t = Math.max(0, Math.min(1, t));

  // 1. VERTICAL STEPS (Terracing)
  let tStepped = t;
  
  if (stepCount > 0) {
    const totalSteps = stepCount;
    const rawStep = t * totalSteps;
    const stepIndex = Math.floor(rawStep);
    const fraction = rawStep - stepIndex; // 0..1 within current step
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

  // Determine Taper T based on profile
  let taperT = tStepped;

  if (profile === 'bell') {
      // Bell: Power-curve taper. Base 2.0 for pronounced shape.
      // Curvature > 0 -> Convex (bulges), < 0 -> Concave (flares)
      const power = Math.pow(2.0, -curvature);
      taperT = Math.pow(tStepped, power);
  } else if (profile === 'tulip') {
      // Tulip: Hermite S-Curve 3t^2 - 2t^3
      taperT = tStepped * tStepped * (3 - 2 * tStepped);
  } else if (profile === 'barrel') {
      // Barrel: Cosine ease — naturally rounded transition
      taperT = 0.5 - 0.5 * Math.cos(Math.PI * tStepped);
  } else if (profile === 'trumpet') {
      // Trumpet: Exponential — most radius change near the top
      const k = 2.5;
      taperT = (Math.exp(k * tStepped) - 1) / (Math.exp(k) - 1);
  } else if (profile === 'ogee') {
      // Ogee: Cubic ease-in-out S (architectural double curve)
      if (tStepped < 0.5) {
          taperT = 4 * tStepped * tStepped * tStepped;
      } else {
          taperT = 1 - Math.pow(-2 * tStepped + 2, 3) / 2;
      }
  } else if (profile === 'vase') {
      // Vase: Built-in belly + neck via sin(2πt) offset
      taperT = tStepped + 0.12 * Math.sin(2 * Math.PI * tStepped);
  }
  // cone and standard: taperT stays linear (tStepped)

  // Calculate Base Taper
  const rLinear = rB + (rT - rB) * taperT;
  baseRadius = rLinear;

  // Additive Bulge — skipped for bell (uses power curve) and cone (pure linear)
  if (profile !== 'bell' && profile !== 'cone' && Math.abs(curvature) > 0.01) {
    const safeBias = Math.max(0.1, Math.min(0.9, curveBias));
    
    // Bias shaping function
    // For bias=0.5, k=1. Bias<0.5 pulls peak down, Bias>0.5 pulls peak up.
    const k = Math.log(0.5) / Math.log(safeBias);
    const shapedT = Math.pow(tStepped, k);

    let bulge = 0;

    if (profile === 'elliptic') {
         // Elliptic/Circular profile: sqrt(1 - x^2)
         // Map shapedT (0..1) to x (-1..1)
         const x = 2 * shapedT - 1;
         const safeX = Math.max(-1, Math.min(1, x));
         bulge = curvature * Math.sqrt(1 - safeX * safeX);
    } else {
         // Standard & Tulip (Sine Wave)
         bulge = curvature * Math.sin(Math.PI * shapedT);
    }

    baseRadius += bulge;
  }

  // 3. BASE FLARE (Stability Foot)
  // Adds radius near the bottom y=0
  if (baseFlareWidth > 0 && baseFlareHeight > 0 && y < baseFlareHeight) {
     const yRel = y / baseFlareHeight;
     const tFlare = 1 - yRel;
     const flareShape = tFlare * tFlare;
     baseRadius += baseFlareWidth * flareShape;
  }

  // 3b. TOP FLARE (Lip) with 30deg overhang constraint
  if (topFlareWidth > 0 && topFlareHeight > 0 && y > (h - topFlareHeight)) {
    const yRel = (h - y) / topFlareHeight;  // 0 at top, 1 at bottom of zone
    const tFlare = 1 - yRel;                // 1 at top, 0 at bottom

    // Clamp width so max slope <= tan(30deg)
    // Quadratic dr/dy max = 2*W/H at tFlare=1 => W_max = tan(30)*H/2
    const maxWidth = Math.tan(Math.PI / 6) * topFlareHeight / 2;
    const w = Math.min(topFlareWidth, maxWidth);

    baseRadius += w * tFlare * tFlare;
  }

  // 4. VERTICAL RIPPLES (Applied to absolute Y) — clamped for 35deg FDM overhang
  if (rippleAmplitude > 0 && rippleFrequency > 0) {
    // Max slope from ripple: amplitude * frequency * 2π / height
    // Constraint: slope <= tan(35°) so ripples stay printable without supports
    const maxRippleAmp = Math.tan(35 * Math.PI / 180) * h / (rippleFrequency * 2 * Math.PI);
    const effectiveAmp = Math.min(rippleAmplitude, maxRippleAmp);
    baseRadius += effectiveAmp * Math.sin(t * rippleFrequency * Math.PI * 2);
  }

  // 5. TWIST (Modifies Angle)
  const twistRad = twist * (Math.PI / 180) * t;
  const thetaTwisted = theta + twistRad;

  // 6. RIBS / FLUTING (Modifies Radius based on Angle)
  if (ribCount > 0 && ribAmplitude > 0) {
    baseRadius += ribAmplitude * Math.cos(ribCount * thetaTwisted);
  }

  // 6b. SKIN PATTERN (Kumiko-style decorative surface pattern)
  let pierceAmount = 0;
  if (params.skinPattern !== 'none') {
    const skinResult = evaluateSkinPattern(y, thetaTwisted, baseRadius, params);
    baseRadius += skinResult.delta;
    pierceAmount = skinResult.pierce;
  }

  // 7. POLYGON CROSS-SECTION (Flat-sided: triangle, square, hex, etc.)
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

// --- GEOMETRY GENERATORS ---

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
    // Starts at `saucerBaseThickness` (floor level) and goes up to `saucerHeight`.
    const yInner = saucerBaseThickness + t * (saucerHeight - saucerBaseThickness);
    // Corresponding Pot Height (0-based) for radius sampling
    const yPotInner = yInner - saucerBaseThickness;

    // OUTER SHELL:
    // Starts at 0 (table level) and goes up to `saucerHeight`.
    // Note: We stretch the outer shell vertically 0..H vs Inner Base..H.
    // This connects the bottom outer rim (y=0) to the bottom inner rim (y=base) via the wall/floor corner.
    const yOuter = t * saucerHeight;
    // We map outer radius profile roughly to inner profile to keep walls parallel-ish visually
    const yPotOuter = yOuter - saucerBaseThickness; 

    for (let j = 0; j <= radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2;
      
      // Calculate Inner Radius based on pot profile + gap
      const pInner = calculatePointData(Math.max(0, yPotInner), theta, params);
      let rInner = pInner.r + saucerGap;
      rInner += (yInner - saucerBaseThickness) * flareTan; // Flare starts from inside floor

      // Calculate Outer Radius
      // We base it on pot profile at outer height + gap + wall thickness
      // Use Max(0) to clamp negative Y at bottom to pot base radius
      const pOuter = calculatePointData(Math.max(0, yPotOuter), theta, params);
      let rOuter = pOuter.r + saucerGap + saucerWallThickness;
      rOuter += (yOuter - saucerBaseThickness) * flareTan; // Flare logic consistent with inner

      vertices.push(rInner * Math.cos(theta), yInner, rInner * Math.sin(theta));
      gridInner.push(vertexIndex++);

      vertices.push(rOuter * Math.cos(theta), yOuter, rOuter * Math.sin(theta));
      gridOuter.push(vertexIndex++);
    }
  }

  const cols = radialSegments + 1;
  const addQuad = (a: number, b: number, c: number, d: number, flipped = false) => {
    if (flipped) {
      indices.push(a, d, c, a, c, b);
    } else {
      indices.push(a, b, c, a, c, d);
    }
  };

  // 1. Build Walls (Inner facing in, Outer facing out)
  for (let i = 0; i < heightSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const row1 = i * cols + j;
      const row2 = (i + 1) * cols + j;
      
      // Inner Wall (faces inward)
      addQuad(gridInner[row1], gridInner[row1+1], gridInner[row2+1], gridInner[row2]);
      
      // Outer Wall (faces outward)
      addQuad(gridOuter[row1], gridOuter[row1+1], gridOuter[row2+1], gridOuter[row2], true);
    }
  }

  // 2. Top Rim (Connects Inner top to Outer top)
  const topStart = heightSegments * cols;
  for (let j = 0; j < radialSegments; j++) {
    const i1 = gridInner[topStart + j];
    const i2 = gridInner[topStart + j + 1];
    const o1 = gridOuter[topStart + j];
    const o2 = gridOuter[topStart + j + 1];
    addQuad(i1, i2, o2, o1);
  }

  // 3. Bottom Floor Generation
  // Inner Floor Center (y = saucerBaseThickness)
  vertices.push(0, saucerBaseThickness, 0);
  const cTop = vertexIndex++;
  
  // Outer Bottom Center (y = 0)
  vertices.push(0, 0, 0); 
  const cBottom = vertexIndex++;

  // Inner Floor Faces (Top of the floor slab)
  // Connects Center Top to Inner Ring Bottom (i=0)
  for (let j = 0; j < radialSegments; j++) {
    const curr = gridInner[j];
    const next = gridInner[j + 1]; 
    indices.push(cTop, next, curr);
  }

  // Outer Bottom Faces (Bottom of the floor slab)
  // Connects Center Bottom to Outer Ring Bottom (i=0)
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

export const generateBodyGeometry = (params: DesignParams): THREE.BufferGeometry => {
  const {
    height, radialSegments: baseRadialSegments, thickness, mode,
    rimAngle, rimAngleBottom, 
    baseFlareWidth, baseFlareHeight, 
    drainageHoleSize, bottomLift,
    enableSuspension, 
    suspensionHeight, suspensionHoleSize, suspensionThickness, suspensionAngle,
    suspensionRibCount, suspensionRibWidth, suspensionRimWidth,
    suspensionAnchorDepth, 
    radiusTop, radiusBottom,
    potFloorThickness // NEW: Explicit pot floor thickness
  } = params;

  const h = height;
  const rT = radiusTop;
  const rB = radiusBottom;

  // Dynamic height segments — match saucer's approach instead of hardcoding 200.
  // Too many segments create degenerate thin triangles that confuse slicers.
  let heightSegments = Math.min(200, Math.max(40, Math.ceil(height * 8)));
  let radialSegments = baseRadialSegments;

  // Boost resolution for skin patterns so tile detail is captured
  if (params.skinPattern !== 'none') {
    const scale = Math.max(0.1, params.skinScale);
    const smooth = Math.max(1, Math.min(20, params.skinSmoothing ?? 2));
    const segsPerTile = Math.ceil(8 * smooth);

    // Height: tiles along height × segments per tile
    const tilesAlongHeight = height / scale;
    const patternHeightSegs = Math.ceil(tilesAlongHeight * segsPerTile);
    heightSegments = Math.min(2000, Math.max(heightSegments, patternHeightSegs));

    // Radial: tiles around circumference × segments per tile
    const avgRadius = (radiusTop + radiusBottom) / 2;
    const circumference = 2 * Math.PI * avgRadius;
    const tilesAroundCirc = circumference / scale;
    const patternRadialSegs = Math.ceil(tilesAroundCirc * segsPerTile);
    radialSegments = Math.min(2000, Math.max(radialSegments, patternRadialSegs));
  }
  
  const vertices: number[] = [];
  const indices: number[] = [];
  
  const gridOuter: number[] = [];
  const gridInner: number[] = [];
  const pierceOuter: number[] = [];
  const pierceInner: number[] = [];
  const cols = radialSegments + 1;
  const hasPierce = params.skinPattern !== 'none' && params.skinMode === 'pierced';

  let vertexIndex = 0;

  // 1. Outer Shell
  for (let i = 0; i <= heightSegments; i++) {
    const y = (i / heightSegments) * height;
    for (let j = 0; j <= radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2;
      const p = calculatePointData(y, theta, params);
      const pierceVal = p.pierce ?? 0;

      // Pierce: push outer shell INWARD in void areas so texture is on the outside
      let rOuter = p.r;
      if (hasPierce && pierceVal > 0) {
        rOuter = Math.max(0.01, p.r - thickness * pierceVal);
      }

      vertices.push(rOuter * Math.cos(theta), y, rOuter * Math.sin(theta));
      gridOuter.push(vertexIndex++);
      pierceOuter.push(pierceVal);
    }
  }

  // --- FDM 35° overhang suppression for pierce mode ---
  // Compute local wall angle from vertex positions and suppress pierce on steep surfaces
  if (hasPierce) {
    const maxPierceAngle = 35 * Math.PI / 180;
    for (let i = 0; i <= heightSegments; i++) {
      for (let j = 0; j <= radialSegments; j++) {
        const idx = i * cols + j;
        if (pierceOuter[idx] <= 0.01) continue;

        const iBelow = Math.max(0, i - 1);
        const iAbove = Math.min(heightSegments, i + 1);
        const idxBelow = iBelow * cols + j;
        const idxAbove = iAbove * cols + j;

        const viB = gridOuter[idxBelow] * 3;
        const viA = gridOuter[idxAbove] * 3;
        const rBelow = Math.sqrt(vertices[viB] ** 2 + vertices[viB + 2] ** 2);
        const rAbove = Math.sqrt(vertices[viA] ** 2 + vertices[viA + 2] ** 2);
        const yBelow = vertices[viB + 1];
        const yAbove = vertices[viA + 1];

        const dy = yAbove - yBelow;
        if (dy > 0.001) {
          const wallAngle = Math.atan2(Math.abs(rAbove - rBelow), dy);
          if (wallAngle > maxPierceAngle) {
            pierceOuter[idx] = 0;
          } else if (wallAngle > maxPierceAngle * 0.7) {
            const fade = 1 - (wallAngle - maxPierceAngle * 0.7) / (maxPierceAngle * 0.3);
            pierceOuter[idx] *= fade;
          }
        }
      }
    }
  }

  // 2. Inner Shell
  // Safety: Ensure rim deltas don't exceed height
  const rimDeltaTop = thickness * Math.tan(rimAngle * (Math.PI / 180));
  let innerTopY = height - rimDeltaTop;

  const rimDeltaBottom = thickness * Math.tan(rimAngleBottom * (Math.PI / 180));
  const baseInnerY = mode === 'pot' ? potFloorThickness : 0;
  let innerBottomY = baseInnerY + rimDeltaBottom;

  // CRITICAL SAFETY FIX: Prevent inner shell inversion if thickness/angles are extreme
  if (innerTopY <= innerBottomY + 0.1) {
      innerTopY = innerBottomY + 0.1;
  }

  for (let i = 0; i <= heightSegments; i++) {
    const t = i / heightSegments;
    const y = innerBottomY + t * (innerTopY - innerBottomY);

    for (let j = 0; j <= radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2;
      const p = calculatePointData(y, theta, params);
      // Use OUTER shell's pierce value for face culling alignment
      const pierceT = hasPierce ? pierceOuter[i * cols + j] : 0;
      // Inner shell stays at constant thickness (smooth inside surface)
      const rInner = Math.max(0.01, p.r - thickness);
      const xInner = rInner * Math.cos(theta);
      const zInner = rInner * Math.sin(theta);

      vertices.push(xInner, y, zInner);
      gridInner.push(vertexIndex++);
      pierceInner.push(pierceT);
    }
  }

  const addQuad = (a: number, b: number, c: number, d: number, flipped = false) => {
    if (flipped) {
      indices.push(a, d, c);
      indices.push(a, c, b);
    } else {
      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  };

  // Pierce threshold for face culling
  const pierceThreshold = 0.5;

  // Outer Faces
  for (let i = 0; i < heightSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const row1 = i * cols + j;
      const row2 = (i + 1) * cols + j;

      // Skip faces where all 4 corners are heavily pierced
      if (hasPierce) {
        const minP = Math.min(
          pierceOuter[row1], pierceOuter[row1 + 1],
          pierceOuter[row2], pierceOuter[row2 + 1]
        );
        if (minP > pierceThreshold) continue;
      }

      const a = gridOuter[row1];
      const b = gridOuter[row1 + 1];
      const c = gridOuter[row2 + 1];
      const d = gridOuter[row2];
      addQuad(a, b, c, d, true);
    }
  }

  // Inner Faces
  for (let i = 0; i < heightSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const row1 = i * cols + j;
      const row2 = (i + 1) * cols + j;

      // Skip faces where all 4 corners are heavily pierced
      if (hasPierce) {
        const minP = Math.min(
          pierceInner[row1], pierceInner[row1 + 1],
          pierceInner[row2], pierceInner[row2 + 1]
        );
        if (minP > pierceThreshold) continue;
      }

      const a = gridInner[row1];
      const b = gridInner[row1 + 1];
      const c = gridInner[row2 + 1];
      const d = gridInner[row2];
      addQuad(a, b, c, d);
    }
  }

  // Top Rim
  const topRowOuterStart = heightSegments * cols;
  const topRowInnerStart = (heightSegments + 1) * cols + (heightSegments * cols); 
  const outerTopIdx = (heightSegments) * cols;
  const innerTopIdx = 0 + (heightSegments) * cols;

  for (let j = 0; j < radialSegments; j++) {
    const a = gridOuter[outerTopIdx + j];
    const b = gridOuter[outerTopIdx + j + 1];
    const c = gridInner[innerTopIdx + j + 1];
    const d = gridInner[innerTopIdx + j];
    addQuad(a, b, c, d, true);
  }

  // Bottom Cap (Floor OR Open Rim OR Suspension)
  // Outer (bottom-facing) surface enforces a 35° minimum slope for FDM printability.
  // When bottomLift > 0 and the naive cone would be too shallow, the floor splits into
  // a flat ring (on the build plate) plus a 35° cone to the raised center/hole.
  if (mode === 'pot') {
    const holeRadius = Math.max(0, drainageHoleSize / 2);
    const liftY = bottomLift;
    const MIN_FLOOR_ANGLE = 35 * (Math.PI / 180);

    if (liftY <= 0.01) {
        // ====== NO LIFT: FLAT FLOOR ======
        if (holeRadius <= 0.05) {
            // Closed flat
            vertices.push(0, 0, 0);
            const cOuter = vertexIndex++;
            vertices.push(0, potFloorThickness, 0);
            const cInner = vertexIndex++;
            for (let j = 0; j < radialSegments; j++) {
              indices.push(cOuter, gridOuter[j], gridOuter[j + 1]);
            }
            for (let j = 0; j < radialSegments; j++) {
              indices.push(cInner, gridInner[j + 1], gridInner[j]);
            }
        } else {
            // Flat with drain hole
            const gridHoleO: number[] = [];
            const gridHoleI: number[] = [];
            for (let j = 0; j <= radialSegments; j++) {
               const theta = (j / radialSegments) * Math.PI * 2;
               const cx = holeRadius * Math.cos(theta);
               const cz = holeRadius * Math.sin(theta);
               vertices.push(cx, 0, cz);
               gridHoleO.push(vertexIndex++);
               vertices.push(cx, potFloorThickness, cz);
               gridHoleI.push(vertexIndex++);
            }
            for (let j = 0; j < radialSegments; j++) {
                addQuad(gridOuter[j], gridOuter[j+1], gridHoleO[j+1], gridHoleO[j]);
            }
            for (let j = 0; j < radialSegments; j++) {
                addQuad(gridInner[j], gridInner[j+1], gridHoleI[j+1], gridHoleI[j], true);
            }
            for (let j = 0; j < radialSegments; j++) {
                addQuad(gridHoleO[j], gridHoleO[j+1], gridHoleI[j+1], gridHoleI[j]);
            }
        }
    } else {
        // ====== WITH LIFT: 35° ANGLE-CONSTRAINED FLOOR ======
        // rConeBase = radius from center where the 35° cone meets y=0
        const tanA = Math.tan(MIN_FLOOR_ANGLE);
        const rConeBase = holeRadius + liftY / tanA;

        // --- Outer surface: flat ring (y=0) + 35° cone to center ---
        const gridTransO: number[] = [];
        for (let j = 0; j <= radialSegments; j++) {
            const theta = (j / radialSegments) * Math.PI * 2;
            const pO = calculatePointData(0, theta, params);
            const rT = Math.min(pO.r, rConeBase);
            vertices.push(rT * Math.cos(theta), 0, rT * Math.sin(theta));
            gridTransO.push(vertexIndex++);
        }

        // Flat ring: wall outer row → transition ring (faces down)
        for (let j = 0; j < radialSegments; j++) {
            addQuad(gridOuter[j], gridOuter[j+1], gridTransO[j+1], gridTransO[j]);
        }

        if (holeRadius <= 0.05) {
            // Cone: transition → center (outer, faces down)
            vertices.push(0, liftY, 0);
            const cOuter = vertexIndex++;
            for (let j = 0; j < radialSegments; j++) {
                indices.push(cOuter, gridTransO[j], gridTransO[j + 1]);
            }
            // Inner surface: simple fan from inner row to center (faces up, unchanged)
            vertices.push(0, potFloorThickness + liftY, 0);
            const cInner = vertexIndex++;
            for (let j = 0; j < radialSegments; j++) {
                indices.push(cInner, gridInner[j + 1], gridInner[j]);
            }
        } else {
            // Cone: transition → hole ring (outer) + inner fan + hole tube
            const gridHoleO: number[] = [];
            const gridHoleI: number[] = [];
            for (let j = 0; j <= radialSegments; j++) {
                const theta = (j / radialSegments) * Math.PI * 2;
                const cx = holeRadius * Math.cos(theta);
                const cz = holeRadius * Math.sin(theta);
                vertices.push(cx, liftY, cz);
                gridHoleO.push(vertexIndex++);
                vertices.push(cx, potFloorThickness + liftY, cz);
                gridHoleI.push(vertexIndex++);
            }
            // Outer cone: transition → hole (faces down)
            for (let j = 0; j < radialSegments; j++) {
                addQuad(gridTransO[j], gridTransO[j+1], gridHoleO[j+1], gridHoleO[j]);
            }
            // Inner: wall inner row → hole inner (faces up, unchanged)
            for (let j = 0; j < radialSegments; j++) {
                addQuad(gridInner[j], gridInner[j+1], gridHoleI[j+1], gridHoleI[j], true);
            }
            // Hole tube (faces inward)
            for (let j = 0; j < radialSegments; j++) {
                addQuad(gridHoleO[j], gridHoleO[j+1], gridHoleI[j+1], gridHoleI[j]);
            }
        }
    }

  } else {
    // --- SHADE MODE ---
    
    // 1. Open Bottom Rim (Standard)
    const outerBotIdx = 0;
    const innerBotIdx = 0;
    for (let j = 0; j < radialSegments; j++) {
      const a = gridOuter[outerBotIdx + j];
      const b = gridOuter[outerBotIdx + j + 1];
      const c = gridInner[innerBotIdx + j + 1];
      const d = gridInner[innerBotIdx + j];
      addQuad(a, b, c, d);
    }

    // 2. Suspension System — DISABLED FOR REDESIGN
    // TODO: Implement new suspension hub system
    // See utils/suspensionHub.ts for R&D module
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  const merged = mergeVertices(geometry, 1e-4);
  merged.computeVertexNormals();

  return merged;
};