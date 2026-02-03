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
      // Bell: Use curvature to control the power/exponent of the taper
      // Curvature 0 -> Linear
      // Curvature > 0 -> Convex Bell (bulges out) -> Power < 1
      // Curvature < 0 -> Concave Bell (flares out) -> Power > 1
      // Map -8..8 to decent power range
      const power = Math.pow(1.5, -curvature); 
      taperT = Math.pow(tStepped, power);
  } else if (profile === 'tulip') {
      // Tulip: S-Curve taper
      // Hermite smoothstep-like: 3t^2 - 2t^3
      taperT = tStepped * tStepped * (3 - 2 * tStepped);
  }

  // Calculate Base Taper
  const rLinear = rB + (rT - rB) * taperT;
  baseRadius = rLinear;

  // Additive Bulge (Standard, Elliptic, Tulip)
  // Bell uses curvature for exponent, so skips this.
  if (profile !== 'bell' && Math.abs(curvature) > 0.01) {
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

  // 4. VERTICAL RIPPLES (Applied to absolute Y)
  if (rippleAmplitude > 0) {
    baseRadius += rippleAmplitude * Math.sin(t * rippleFrequency * Math.PI * 2);
  }

  // 5. TWIST (Modifies Angle)
  const twistRad = twist * (Math.PI / 180) * t;
  const thetaTwisted = theta + twistRad;

  // 6. RIBS / FLUTING (Modifies Radius based on Angle)
  if (ribCount > 0 && ribAmplitude > 0) {
    baseRadius += ribAmplitude * Math.cos(ribCount * thetaTwisted);
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
  if (mode === 'pot') {
    const holeRadius = Math.max(0, drainageHoleSize / 2);
    const liftY = bottomLift; 
    
    if (holeRadius <= 0.05) {
        // Closed Bottom
        vertices.push(0, liftY, 0);
        const centerOuter = vertexIndex++;
        // Change: Use potFloorThickness
        vertices.push(0, potFloorThickness + liftY, 0);
        const centerInner = vertexIndex++;

        for (let j = 0; j < radialSegments; j++) {
          const curr = gridOuter[j];
          const next = gridOuter[j + 1];
          indices.push(centerOuter, curr, next);
        }
        for (let j = 0; j < radialSegments; j++) {
          const curr = gridInner[j];
          const next = gridInner[j + 1];
          indices.push(centerInner, next, curr);
        }
    } else {
        // Hole Bottom
        const gridHoleOuter: number[] = [];
        const gridHoleInner: number[] = [];
        
        for (let j = 0; j <= radialSegments; j++) {
           const theta = (j / radialSegments) * Math.PI * 2;
           const x = holeRadius * Math.cos(theta);
           const z = holeRadius * Math.sin(theta);
           vertices.push(x, liftY, z);
           gridHoleOuter.push(vertexIndex++);
           // Change: Use potFloorThickness
           vertices.push(x, potFloorThickness + liftY, z);
           gridHoleInner.push(vertexIndex++);
        }
        
        for (let j = 0; j < radialSegments; j++) {
            const out1 = gridOuter[j];
            const out2 = gridOuter[j+1];
            const hole1 = gridHoleOuter[j];
            const hole2 = gridHoleOuter[j+1];
            addQuad(out1, out2, hole2, hole1);
        }
        for (let j = 0; j < radialSegments; j++) {
            const in1 = gridInner[j];
            const in2 = gridInner[j+1];
            const hole1 = gridHoleInner[j];
            const hole2 = gridHoleInner[j+1];
            addQuad(in1, in2, hole2, hole1, true);
        }
        for (let j = 0; j < radialSegments; j++) {
            const lower1 = gridHoleOuter[j];
            const lower2 = gridHoleOuter[j+1];
            const upper1 = gridHoleInner[j];
            const upper2 = gridHoleInner[j+1];
            addQuad(lower1, lower2, upper2, upper1);
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

       // --- A. GENERATE SOLID HUB RING (360 degrees) ---
       const hubOuterBottom: number[] = [];
       const hubOuterTop: number[] = [];
       const hubInnerBottom: number[] = [];
       const hubInnerTop: number[] = [];

       for (let j = 0; j <= radialSegments; j++) {
           const theta = (j / radialSegments) * Math.PI * 2;
           const hubOuterR = holeRadius + rimW;
           
           // Inner Vertices (Hole)
           vertices.push(holeRadius * Math.cos(theta), hubInnerY, holeRadius * Math.sin(theta));
           hubInnerBottom.push(vertexIndex++);
           vertices.push(holeRadius * Math.cos(theta), hubInnerY + suspThick, holeRadius * Math.sin(theta));
           hubInnerTop.push(vertexIndex++);

           // Outer Vertices (Rim Edge)
           vertices.push(hubOuterR * Math.cos(theta), hubOuterY, hubOuterR * Math.sin(theta));
           hubOuterBottom.push(vertexIndex++);
           vertices.push(hubOuterR * Math.cos(theta), hubOuterY + suspThick, hubOuterR * Math.sin(theta));
           hubOuterTop.push(vertexIndex++);
       }
       
       // Build Hub Faces
       for (let j = 0; j < radialSegments; j++) {
           addQuad(hubOuterBottom[j], hubOuterBottom[j+1], hubInnerBottom[j+1], hubInnerBottom[j], true);
           addQuad(hubOuterTop[j], hubOuterTop[j+1], hubInnerTop[j+1], hubInnerTop[j]);
           addQuad(hubInnerBottom[j], hubInnerBottom[j+1], hubInnerTop[j+1], hubInnerTop[j]);
           addQuad(hubOuterBottom[j], hubOuterBottom[j+1], hubOuterTop[j+1], hubOuterTop[j], true); 
       }

       // --- B. GENERATE SPOKES (From Hub Outer to Wall) ---
       const arms = Math.max(2, Math.min(12, suspensionRibCount || 4));
       const armWidthDeg = Math.max(5, Math.min(90, suspensionRibWidth || 40));
       const armWidthRad = armWidthDeg * (Math.PI / 180);
       const segmentsPerArm = Math.max(2, Math.floor(radialSegments / arms * (armWidthDeg / 360))); 

       // Constants for radial scanning
       const tanA = Math.tan(angleRad);
       const dr = 0.05; // 0.5mm step resolution
       const maxScanR = Math.max(rT, rB) * 1.5; // Max bounds

       for (let k = 0; k < arms; k++) {
           const centerTheta = (k / arms) * Math.PI * 2;
           const startTheta = centerTheta - (armWidthRad / 2);
           
           const armOuterBottom: number[] = [];
           const armOuterTop: number[] = [];
           const armInnerBottom: number[] = [];
           const armInnerTop: number[] = [];

           for (let s = 0; s <= segmentsPerArm; s++) {
               const theta = startTheta + (s / segmentsPerArm) * armWidthRad;
               const hubOuterR = holeRadius + rimW - 0.05; 
               
               // --- RADIAL WALL SCANNER & CLAMP ---
               // 1. Scan outwards to find the inner wall surface
               let collisionR = hubOuterR;
               let foundInnerWall = false;

               for (let r = hubOuterR; r < maxScanR; r += dr) {
                   const yBot = centerHoleY - (r - holeRadius) * tanA;
                   
                   // Check bounds
                   if (yBot < 0 || yBot > h) { collisionR = r; foundInnerWall = true; break; }

                   // Calc Wall Inner Limit
                   const pBot = calculatePointData(yBot, theta, params);
                   const limitBot = Math.max(0.1, pBot.r - thickness);

                   if (r >= limitBot) {
                       collisionR = r;
                       foundInnerWall = true;
                       break;
                   }
               }
               
               // 2. CONVERGENT HARD CLAMP
               // Iterate 3 times to account for slope/curve discrepancy
               // We also check Neighboring angles (Left/Right) to avoid "rib slicing"
               
               if (foundInnerWall) {
                   // A. Desired Position: Inner Wall + Anchor Depth
                   let desiredR = collisionR + anchorDepth;
                   const neighborOffset = 0.05; // ~3 degrees check

                   for(let iter=0; iter<3; iter++) {
                       // B. Calculate Heights at this new desiredR
                       const yBotAtTip = centerHoleY - (desiredR - holeRadius) * tanA;
                       const yTopAtTip = yBotAtTip + suspThick;

                       // C. Check Current Angle + Neighbors for absolute safest limit
                       const anglesToCheck = [theta, theta - neighborOffset, theta + neighborOffset];
                       let strictestLimit = Infinity;

                       for(const checkTheta of anglesToCheck) {
                           const pBotOuter = calculatePointData(yBotAtTip, checkTheta, params);
                           const pTopOuter = calculatePointData(yTopAtTip, checkTheta, params);
                           const limit = Math.min(pBotOuter.r, pTopOuter.r);
                           if(limit < strictestLimit) strictestLimit = limit;
                       }

                       const hardLimitR = strictestLimit - safetyMargin;

                       // D. Apply the Clamp
                       if (desiredR > hardLimitR) {
                           desiredR = hardLimitR;
                       }
                   }
                   
                   collisionR = desiredR;
               } else {
                   // Fallback if no wall found (e.g. infinite plane), just clamp to max
                   collisionR = maxScanR; 
               }

               // --- Generate Vertices using validated collisionR ---
               const finalY = centerHoleY - (collisionR - holeRadius) * tanA;
               
               // Outer (Wall Interface)
               vertices.push(collisionR * Math.cos(theta), finalY, collisionR * Math.sin(theta));
               armOuterBottom.push(vertexIndex++);
               vertices.push(collisionR * Math.cos(theta), finalY + suspThick, collisionR * Math.sin(theta));
               armOuterTop.push(vertexIndex++);
               
               // Inner (Hub Interface)
               const distHub = hubOuterR - holeRadius;
               const dyHubLocal = distHub * tanA;
               const hubY = centerHoleY - dyHubLocal;

               vertices.push(hubOuterR * Math.cos(theta), hubY, hubOuterR * Math.sin(theta));
               armInnerBottom.push(vertexIndex++);
               vertices.push(hubOuterR * Math.cos(theta), hubY + suspThick, hubOuterR * Math.sin(theta));
               armInnerTop.push(vertexIndex++);
           }

           // --- BUILD FACES FOR THIS ARM ---
           for (let s = 0; s < segmentsPerArm; s++) {
               addQuad(armOuterBottom[s], armOuterBottom[s+1], armInnerBottom[s+1], armInnerBottom[s], true); // Bot
               addQuad(armOuterTop[s], armOuterTop[s+1], armInnerTop[s+1], armInnerTop[s]); // Top
               addQuad(armInnerBottom[s], armInnerBottom[s+1], armInnerTop[s+1], armInnerTop[s]); // Inner Cap
               addQuad(armOuterBottom[s], armOuterBottom[s+1], armOuterTop[s+1], armOuterTop[s], true); // Outer Cap (Hidden in wall)
           }
           
           // D. SIDE WALLS (Caps for Venting)
           addQuad(
               armOuterBottom[0], armInnerBottom[0], 
               armInnerTop[0], armOuterTop[0]
           ); 
           const last = segmentsPerArm;
           addQuad(
               armOuterBottom[last], armOuterTop[last],
               armInnerTop[last], armInnerBottom[last]
           );
       }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  const merged = mergeVertices(geometry, 1e-4);
  merged.computeVertexNormals();

  return merged;
};