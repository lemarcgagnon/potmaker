import * as THREE from 'three';
import { mergeVertices } from 'three-stdlib';
import { DesignParams } from '../types';

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
  
  return { x, y, z, r: baseRadius };
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
    height, radialSegments, thickness, mode, 
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
  const heightSegments = Math.min(200, Math.max(40, Math.ceil(height * 8)));
  
  const vertices: number[] = [];
  const indices: number[] = [];
  
  const gridOuter: number[] = [];
  const gridInner: number[] = [];
  
  let vertexIndex = 0;

  // 1. Outer Shell
  for (let i = 0; i <= heightSegments; i++) {
    const y = (i / heightSegments) * height;
    for (let j = 0; j <= radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2;
      const { x, z } = calculatePointData(y, theta, params);
      vertices.push(x, y, z);
      gridOuter.push(vertexIndex++);
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
      const rInner = Math.max(0.01, p.r - thickness);
      const xInner = rInner * Math.cos(theta);
      const zInner = rInner * Math.sin(theta);
      
      vertices.push(xInner, y, zInner);
      gridInner.push(vertexIndex++);
    }
  }

  const cols = radialSegments + 1;
  const addQuad = (a: number, b: number, c: number, d: number, flipped = false) => {
    if (flipped) {
      indices.push(a, d, c);
      indices.push(a, c, b);
    } else {
      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  };

  // Outer Faces
  for (let i = 0; i < heightSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const row1 = i * cols + j;
      const row2 = (i + 1) * cols + j;
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

    // 2. Suspension System (VENTED SPIDER ARMS + HUB)
    if (enableSuspension && suspensionHoleSize > 0) {
       // Reference Config
       const centerHoleY = height * suspensionHeight;
       const suspThick = suspensionThickness;
       const holeRadius = suspensionHoleSize / 2;
       const angleRad = (suspensionAngle || 45) * (Math.PI / 180);
       const rimW = Math.max(0.1, suspensionRimWidth || 1.0); // Solid Hub Width
       
       const anchorDepth = suspensionAnchorDepth !== undefined ? suspensionAnchorDepth : 0.2;
       const safetyMargin = 0.05;

       // Pre-calculate Hub Heights
       // Hub Inner (at hole)
       const hubInnerY = centerHoleY;
       // Hub Outer (at hole + rim)
       const dyHub = rimW * Math.tan(angleRad);
       const hubOuterY = centerHoleY - dyHub;

       // Pre-compute spoke layout (needed for corner arches in hub ring)
       const arms = Math.max(2, Math.min(12, suspensionRibCount || 4));
       const armWidthDeg = Math.max(5, Math.min(90, suspensionRibWidth || 40));
       const armWidthRad = armWidthDeg * (Math.PI / 180);
       const halfArm = armWidthRad / 2;
       const gapSpan = (2 * Math.PI / arms) - armWidthRad;
       const halfGap = Math.max(0.01, gapSpan / 2);

       // Corner arch parameters
       const archDrop = params.suspensionButtressExtent ?? 1.5;
       const archCurvePow = Math.max(0.3, Math.min(3.0, params.suspensionButtressArc ?? 1.0));

       // Compute arch offset at any angle — smoothly drops below hub ring
       // near spoke edges, zero at spoke centers and at vent-gap midpoints.
       const getArchOffset = (theta: number): number => {
           if (archDrop <= 0 || gapSpan <= 0.01) return 0;

           // Find signed distance to nearest spoke edge
           // Positive = in vent gap, Negative = inside spoke
           let minSignedDist = Infinity;
           for (let kk = 0; kk < arms; kk++) {
               const center = (kk / arms) * Math.PI * 2;
               // Signed angular distance from spoke center
               let d = ((theta - center) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
               const edgeDist = Math.abs(d) - halfArm; // >0 outside, <0 inside
               if (Math.abs(edgeDist) < Math.abs(minSignedDist)) {
                   minSignedDist = edgeDist;
               }
           }

           if (minSignedDist >= halfGap) return 0; // at or past mid-gap

           if (minSignedDist <= 0) {
               // Inside spoke — smooth transition zone near the edge
               const transZone = halfArm * 0.3;
               if (-minSignedDist > transZone) return 0;
               const t = 1 - (-minSignedDist / transZone);
               return archDrop * t * t; // quadratic ease-in
           }

           // In vent gap — arch rises from max drop to zero at mid-gap
           const frac = minSignedDist / halfGap;
           const rise = Math.pow(Math.sin(Math.PI / 2 * frac), archCurvePow);
           return archDrop * (1 - rise);
       };

       // Pre-compute which hub ring segments are covered by spokes
       // so we can skip outer-wall faces there (the spoke hub cap replaces them)
       const hubStep = (2 * Math.PI) / radialSegments;
       const spokeSegmentSet = new Set<number>();
       const spokeStartIndices: number[] = [];
       const spokeEndIndices: number[] = [];

       for (let k = 0; k < arms; k++) {
           const cTheta = (k / arms) * Math.PI * 2;
           const sTheta = cTheta - armWidthRad / 2;
           const eTheta = sTheta + armWidthRad;
           const si = Math.round(sTheta / hubStep);
           const ei = Math.round(eTheta / hubStep);
           spokeStartIndices.push(si);
           spokeEndIndices.push(ei);
           for (let j = si; j < ei; j++) {
               spokeSegmentSet.add(((j % radialSegments) + radialSegments) % radialSegments);
           }
       }

       // --- A. GENERATE SOLID HUB RING (360 degrees) ---
       // The outer bottom edge incorporates corner arches — it dips down
       // near spoke edges, forming self-supporting brackets for FDM printing.
       const hubOuterBottom: number[] = [];
       const hubOuterTop: number[] = [];
       const hubInnerBottom: number[] = [];
       const hubInnerTop: number[] = [];

       const tanAngle = Math.tan(angleRad);

       for (let j = 0; j <= radialSegments; j++) {
           const theta = (j / radialSegments) * Math.PI * 2;
           const hubOuterR = holeRadius + rimW;
           const archOffset = getArchOffset(theta);

           // Corner arch: extend outer-bottom OUTWARD along cone slope
           // instead of dropping straight down. This makes the arch tips
           // follow the spoke direction and merge into the spoke side walls.
           const archRadialExt = tanAngle > 0.01 ? archOffset / tanAngle : 0;
           const archR = hubOuterR + archRadialExt;
           const archY = hubOuterY - archOffset;

           // Inner Vertices (Hole) — unchanged
           vertices.push(holeRadius * Math.cos(theta), hubInnerY, holeRadius * Math.sin(theta));
           hubInnerBottom.push(vertexIndex++);
           vertices.push(holeRadius * Math.cos(theta), hubInnerY + suspThick, holeRadius * Math.sin(theta));
           hubInnerTop.push(vertexIndex++);

           // Outer Vertices — bottom extends along cone slope, top stays at hubOuterR
           // This creates a tapered bracket: wider at bottom, meeting hub ring at top
           vertices.push(archR * Math.cos(theta), archY, archR * Math.sin(theta));
           hubOuterBottom.push(vertexIndex++);
           vertices.push(hubOuterR * Math.cos(theta), hubOuterY + suspThick, hubOuterR * Math.sin(theta));
           hubOuterTop.push(vertexIndex++);
       }

       // Build Hub Faces — skip outer wall quads where spokes attach
       for (let j = 0; j < radialSegments; j++) {
           addQuad(hubOuterBottom[j], hubOuterBottom[j+1], hubInnerBottom[j+1], hubInnerBottom[j], true);
           addQuad(hubOuterTop[j], hubOuterTop[j+1], hubInnerTop[j+1], hubInnerTop[j]);
           addQuad(hubInnerBottom[j], hubInnerBottom[j+1], hubInnerTop[j+1], hubInnerTop[j]);
           // Only build outer wall where spokes DON'T connect
           if (!spokeSegmentSet.has(j)) {
               addQuad(hubOuterBottom[j], hubOuterBottom[j+1], hubOuterTop[j+1], hubOuterTop[j], true);
           }
       }

       // --- B. GENERATE ARCHED SPOKES (Hub → Wall, self-supporting for FDM) ---
       // Spokes use radial subdivisions with a power-curve arch so the geometry
       // is steep (nearly vertical) at the hub and gentle at the wall.
       // This ensures every layer during FDM printing has minimal overhang.
       // Spoke angular vertices snap to hub ring grid for perfect vertex fusion.

       // Constants for radial scanning
       const tanA = Math.tan(angleRad);
       const dr = 0.05; // 0.5mm step resolution
       const maxScanR = Math.max(rT, rB) * 1.5; // Max bounds

       // Arch parameters — lower power = more dramatic arch
       const RADIAL_STEPS = 8; // Subdivisions from hub to wall
       const ARCH_POWER = Math.max(0.1, Math.min(1.0, params.suspensionArchPower ?? 0.35));

       // Angular sweep for conservative wall sampling
       const ribHalfWave = params.ribCount > 0 ? Math.PI / Math.max(1, params.ribCount) : 0;
       const sweepHalf = Math.max(0.15, ribHalfWave, armWidthRad * 0.5);
       const sweepStep = Math.max(0.03, sweepHalf / 6); // ~6 samples per side

       for (let k = 0; k < arms; k++) {
           const hubOuterR = holeRadius + rimW; // exact hub ring radius — keeps spoke attached

           // Spoke angular positions snapped to hub ring grid
           const spokeStartIdx = spokeStartIndices[k];
           const spokeEndIdx = spokeEndIndices[k];
           const segmentsPerArm = Math.max(2, spokeEndIdx - spokeStartIdx);

           // --- Phase 1: Scanner — find collisionR per angular segment ---
           const collisionRs: number[] = [];

           for (let s = 0; s <= segmentsPerArm; s++) {
               const theta = (spokeStartIdx + s) * hubStep;

               // RADIAL WALL SCANNER (multi-angle conservative)
               let collisionR = hubOuterR;
               let foundInnerWall = false;

               for (let r = hubOuterR; r < maxScanR; r += dr) {
                   const yBot = centerHoleY - (r - holeRadius) * tanA;
                   if (yBot < 0 || yBot > h) { collisionR = r; foundInnerWall = true; break; }

                   let innermost = Infinity;
                   for (let dTheta = -sweepHalf; dTheta <= sweepHalf; dTheta += sweepStep) {
                       const p = calculatePointData(yBot, theta + dTheta, params);
                       innermost = Math.min(innermost, p.r - thickness);
                   }
                   const limitBot = Math.max(0.1, innermost);

                   if (r >= limitBot) {
                       collisionR = r;
                       foundInnerWall = true;
                       break;
                   }
               }

               // Fallback: if scanner didn't find wall, compute directly from profile
               if (!foundInnerWall) {
                   const fallbackY = Math.max(0.01, Math.min(h - 0.01, centerHoleY));
                   const fp = calculatePointData(fallbackY, theta, params);
                   collisionR = Math.max(hubOuterR, fp.r - thickness);
               }

               // CONVERGENT HARD CLAMP — always runs, guarantees spoke meets wall
               let desiredR = collisionR + anchorDepth;
               for (let iter = 0; iter < 3; iter++) {
                   const yBotAtTip = centerHoleY - (desiredR - holeRadius) * tanA;
                   const yTopAtTip = yBotAtTip + suspThick;

                   let strictestLimit = Infinity;
                   for (let dTheta = -sweepHalf; dTheta <= sweepHalf; dTheta += sweepStep) {
                       const checkTheta = theta + dTheta;
                       const pBot = calculatePointData(
                           Math.max(0.01, Math.min(h - 0.01, yBotAtTip)), checkTheta, params
                       );
                       const pTop = calculatePointData(
                           Math.max(0.01, Math.min(h - 0.01, yTopAtTip)), checkTheta, params
                       );
                       const limit = Math.min(pBot.r, pTop.r);
                       if (limit < strictestLimit) strictestLimit = limit;
                   }

                   const hardLimitR = strictestLimit - safetyMargin;
                   if (desiredR > hardLimitR) desiredR = hardLimitR;
               }
               collisionRs.push(Math.max(hubOuterR + 0.1, desiredR));
           }

           // --- Phase 2: Generate 2D vertex grid with arch curve ---
           // armGrid[s][r] = { bot: vertexIndex, top: vertexIndex }
           // s = angular segment (0..segmentsPerArm), r = radial step (0..RADIAL_STEPS)
           // r=0 is hub end, r=RADIAL_STEPS is wall end
           const armGrid: { bot: number; top: number }[][] = [];

           for (let s = 0; s <= segmentsPerArm; s++) {
               const theta = (spokeStartIdx + s) * hubStep;
               const wallR = collisionRs[s];

               // Hub end Y (linear at hub outer edge)
               const hubDistFromHole = hubOuterR - holeRadius;
               const hubY = centerHoleY - hubDistFromHole * tanA;
               // Wall end Y (linear at wall)
               const wallY = centerHoleY - (wallR - holeRadius) * tanA;

               const radialRow: { bot: number; top: number }[] = [];

               for (let r = 0; r <= RADIAL_STEPS; r++) {
                   const t = r / RADIAL_STEPS; // 0 at hub, 1 at wall
                   const archT = Math.pow(Math.max(0.001, t), ARCH_POWER); // power curve

                   const rPos = hubOuterR + (wallR - hubOuterR) * t; // linear radial
                   const yPos = hubY + (wallY - hubY) * archT; // arched Y

                   vertices.push(rPos * Math.cos(theta), yPos, rPos * Math.sin(theta));
                   const botIdx = vertexIndex++;
                   vertices.push(rPos * Math.cos(theta), yPos + suspThick, rPos * Math.sin(theta));
                   const topIdx = vertexIndex++;

                   radialRow.push({ bot: botIdx, top: topIdx });
               }

               armGrid.push(radialRow);
           }

           // --- Phase 3: Build faces ---
           // Bottom and top surfaces (quad strips across angular × radial)
           for (let s = 0; s < segmentsPerArm; s++) {
               for (let r = 0; r < RADIAL_STEPS; r++) {
                   // Bottom face (facing down)
                   addQuad(
                       armGrid[s][r].bot, armGrid[s+1][r].bot,
                       armGrid[s+1][r+1].bot, armGrid[s][r+1].bot,
                       true
                   );
                   // Top face (facing up)
                   addQuad(
                       armGrid[s][r].top, armGrid[s+1][r].top,
                       armGrid[s+1][r+1].top, armGrid[s][r+1].top
                   );
               }
           }

           // Hub edge cap (r=0, inner edge connecting to hub ring)
           for (let s = 0; s < segmentsPerArm; s++) {
               addQuad(
                   armGrid[s][0].bot, armGrid[s+1][0].bot,
                   armGrid[s+1][0].top, armGrid[s][0].top
               );
           }

           // Wall edge cap (r=RADIAL_STEPS, embedded in wall)
           for (let s = 0; s < segmentsPerArm; s++) {
               addQuad(
                   armGrid[s][RADIAL_STEPS].bot, armGrid[s+1][RADIAL_STEPS].bot,
                   armGrid[s+1][RADIAL_STEPS].top, armGrid[s][RADIAL_STEPS].top,
                   true
               );
           }

           // Side walls (vent caps at s=0 and s=last)
           for (let r = 0; r < RADIAL_STEPS; r++) {
               addQuad(
                   armGrid[0][r].bot, armGrid[0][r+1].bot,
                   armGrid[0][r+1].top, armGrid[0][r].top
               );
               addQuad(
                   armGrid[segmentsPerArm][r].bot, armGrid[segmentsPerArm][r].top,
                   armGrid[segmentsPerArm][r+1].top, armGrid[segmentsPerArm][r+1].bot
               );
           }
       }

       // Corner arches are now integrated into the hub ring geometry (section A).
       // The hub ring's outer-bottom edge dips near spoke edges via getArchOffset().
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  const merged = mergeVertices(geometry, 1e-4);
  merged.computeVertexNormals();

  return merged;
};