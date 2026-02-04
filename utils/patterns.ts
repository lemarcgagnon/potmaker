import { DesignParams } from '../types';

/**
 * Skin Pattern System — Kumiko-style geometric line patterns.
 *
 * Coordinate system:
 *   Map (y, thetaTwisted) to metric UV space:
 *     u = theta/(2π) * circumference  (horizontal cm)
 *     v = y                            (vertical cm)
 *   Divide both by skinScale for tile-normalized coords.
 *   Apply skinRotation before tiling.
 *
 * Each pattern function returns a "void amount" in [0, 1]:
 *   0 = on a line/edge (solid)
 *   1 = center of a void (empty)
 *
 * evaluateSkinPattern() converts void amount → { delta, pierce }
 * based on mode (embossed / carved / pierced).
 */

// --- Utility ---

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const fract = (x: number): number => x - Math.floor(x);

const mod = (x: number, m: number): number => ((x % m) + m) % m;

// --- Pattern Functions ---
// Each takes tile-normalized (u, v) and lineWidth fraction, returns void amount [0,1].

/** Diamond / diagonal grid — two families of lines at 45° */
const patternDiamond = (u: number, v: number, lw: number): number => {
  const d1 = Math.abs(fract(u + v) - 0.5) * 2; // 0 at line, 1 at void center
  const d2 = Math.abs(fract(u - v) - 0.5) * 2;
  const dist = Math.min(d1, d2); // distance to nearest line
  return smoothstep(0, lw, dist);
};

/** Hexagonal grid — SDF to nearest hex edge using axial coords */
const patternHexgrid = (u: number, v: number, lw: number): number => {
  // Scale so hex tiles are roughly 1 unit
  const sx = u;
  const sy = v * 1.1547; // 2/sqrt(3)

  // Axial → cube offset
  const q = sx - sy / 2;
  const r = sy;

  // Nearest hex center via cube rounding
  const x = q;
  const z = r;
  const y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);

  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;

  // Fractional position within hex cell
  const fx = x - rx;
  const fz = z - rz;
  const fy = -(fx + fz);

  // Hex SDF: max of 3 axis projections
  const hexDist = Math.max(Math.abs(fx), Math.abs(fy), Math.abs(fz));
  // hexDist is 0 at center, 0.5 at edge
  const edgeDist = 0.5 - hexDist; // 0 at edge, 0.5 at center
  const normalized = edgeDist * 2; // 0 at edge, 1 at center
  return smoothstep(0, lw, normalized);
};

/** Asanoha — hemp leaf: hex grid with 6-fold radial star lines within each cell */
const patternAsanoha = (u: number, v: number, lw: number): number => {
  const sx = u;
  const sy = v * 1.1547;

  const q = sx - sy / 2;
  const r = sy;
  const x = q;
  const z = r;
  const y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);

  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;

  const fx = x - rx;
  const fz = z - rz;

  // Hex edge distance (outer boundary)
  const fy = -(fx + fz);
  const hexDist = Math.max(Math.abs(fx), Math.abs(fy), Math.abs(fz));
  const edgeDist = (0.5 - hexDist) * 2;

  // 6-fold star lines from center
  // Convert fractional position to angle
  const px = fx + fz * 0.5;
  const py = fz * 0.866;
  const dist = Math.sqrt(px * px + py * py);

  let starLine = 1.0;
  if (dist > 0.01) {
    const angle = Math.atan2(py, px);
    // 6 lines at 30° intervals (π/6)
    const sector = mod(angle, Math.PI / 3);
    const lineD = dist * Math.abs(Math.sin(sector));
    starLine = smoothstep(0, lw * 0.4, lineD);
  }

  const hexLine = smoothstep(0, lw, edgeDist);
  return Math.min(hexLine, starLine);
};

/** Seigaiha — concentric wave arcs in offset rows */
const patternSeigaiha = (u: number, v: number, lw: number): number => {
  const rings = 3; // concentric rings per cell

  // Brick offset: shift every other row
  const row = Math.floor(v);
  const uShifted = u + (row % 2) * 0.5;

  // Cell center
  const cu = Math.floor(uShifted) + 0.5;
  const cv = row + 0.5;

  // Also check overlapping cell from row above (offset pattern)
  let minVoid = 1.0;

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const cr = row + dr;
      const shift = (cr % 2 === 0) ? 0 : 0.5;
      const cellU = Math.floor(u + shift - dc) + 0.5 + dc;
      const cellV = cr + 0.5;
      const actualU = u + ((cr % 2 !== 0) ? 0.5 : 0);

      const dx = actualU - (Math.floor(actualU) + 0.5) + dc;
      // Simpler: distance from each potential center
      const ddx = u + ((cr % 2) * 0.5) - (Math.floor(u + (cr % 2) * 0.5) + 0.5) ;
      const ddy = v - (cr + 0.5);
      const d = Math.sqrt(ddx * ddx + ddy * ddy);

      // Concentric ring pattern
      const ringDist = fract(d * rings);
      const lineDist = Math.abs(ringDist - 0.5) * 2;
      const ringVoid = smoothstep(0, lw, lineDist);

      // Only apply within the semicircle
      if (d < 0.55 && ddy <= 0.05) {
        minVoid = Math.min(minVoid, ringVoid);
      }
    }
  }

  return minVoid;
};

/** Shippo — four overlapping circles per cell (seven treasures) */
const patternShippo = (u: number, v: number, lw: number): number => {
  // Four circle centers at corners of each unit cell
  // Each circle has radius 0.5
  const radius = 0.5;
  let minDist = 1.0;

  const fu = fract(u);
  const fv = fract(v);

  for (let i = 0; i <= 1; i++) {
    for (let j = 0; j <= 1; j++) {
      const dx = fu - i;
      const dy = fv - j;
      const d = Math.sqrt(dx * dx + dy * dy);
      const circleDist = Math.abs(d - radius);
      minDist = Math.min(minDist, circleDist);
    }
  }

  // Normalize: 0 on circle boundary, grows away
  return smoothstep(0, lw * 0.5, minDist);
};

/** Yagasuri — arrow feather: brick-offset chevron V-shapes + horizontal lines */
const patternYagasuri = (u: number, v: number, lw: number): number => {
  // Brick offset rows
  const row = Math.floor(v);
  const uShifted = u + (row % 2) * 0.5;
  const fu = fract(uShifted);
  const fv = fract(v);

  // Chevron (V shape): two diagonal lines meeting at center
  const cx = 0.5;
  const dx = fu - cx;
  // V shape: |fv - 0.5| = |dx| (diagonal lines from top center)
  const chevronDist = Math.abs(fv - (0.5 - Math.abs(dx)));
  const chevronLine = smoothstep(0, lw * 0.5, chevronDist);

  // Horizontal lines at row boundaries
  const hDist = Math.min(fv, 1.0 - fv);
  const hLine = smoothstep(0, lw * 0.3, hDist);

  // Vertical cell boundaries
  const vDist = Math.min(fu, 1.0 - fu);
  const vLine = smoothstep(0, lw * 0.3, vDist);

  return Math.min(chevronLine, Math.min(hLine, vLine));
};

// --- Pattern Dispatcher ---

type PatternFn = (u: number, v: number, lw: number) => number;

const PATTERN_MAP: Record<string, PatternFn> = {
  diamond: patternDiamond,
  hexgrid: patternHexgrid,
  asanoha: patternAsanoha,
  seigaiha: patternSeigaiha,
  shippo: patternShippo,
  yagasuri: patternYagasuri,
};

// --- Entry Point ---

export interface SkinResult {
  delta: number;  // Radius change (+ for embossed, - for carved)
  pierce: number; // 0–1 void amount for pierce mode
}

export const evaluateSkinPattern = (
  y: number,
  thetaTwisted: number,
  baseRadius: number,
  params: DesignParams
): SkinResult => {
  const { skinPattern, skinMode, skinScale, skinDepth, skinLineWidth, skinRotation } = params;

  if (skinPattern === 'none') return { delta: 0, pierce: 0 };

  const patternFn = PATTERN_MAP[skinPattern];
  if (!patternFn) return { delta: 0, pierce: 0 };

  // Map to tile-normalized UV space
  // Use a FIXED reference radius so tiles don't shift between height rows.
  // Round to integer tile count so the pattern wraps seamlessly at θ=0/2π.
  const scale = Math.max(0.1, skinScale);
  const refRadius = Math.max(0.1, (params.radiusTop + params.radiusBottom) / 2);
  const refCircumference = 2 * Math.PI * refRadius;
  const tilesAround = Math.max(1, Math.round(refCircumference / scale));

  let u = (thetaTwisted / (2 * Math.PI)) * tilesAround;
  let v = y / scale;

  // Apply rotation
  if (skinRotation !== 0) {
    const rad = skinRotation * (Math.PI / 180);
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);
    const ru = u * cosR - v * sinR;
    const rv = u * sinR + v * cosR;
    u = ru;
    v = rv;
  }

  // Enforce minimum connection width
  const minLW = (params.skinConnectionWidth ?? 0.08) / scale;
  const lineWidth = Math.max(0.1, Math.min(0.6, Math.max(skinLineWidth, minLW)));
  let voidAmount = patternFn(u, v, lineWidth);
  if (params.skinInvert) voidAmount = 1 - voidAmount;

  // Apply mode
  // Convention: voidAmount=1 at shape interiors, 0 on grid lines.
  // Embossed: grid lines protrude (solid lattice raised above surface)
  // Carved: grid lines are grooved into the surface
  // Pierced: shape interiors are cut through, grid lines remain
  const depth = Math.max(0, skinDepth);

  switch (skinMode) {
    case 'embossed':
      return { delta: depth * (1 - voidAmount), pierce: 0 };

    case 'carved':
      return { delta: -depth * voidAmount, pierce: 0 };

    case 'pierced':
      return { delta: 0, pierce: voidAmount };

    default:
      return { delta: 0, pierce: 0 };
  }
};
