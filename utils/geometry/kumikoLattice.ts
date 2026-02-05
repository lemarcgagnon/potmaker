/**
 * KUMIKO LATTICE GEOMETRY
 *
 * Traditional Japanese Kumiko patterns with proper geometric construction.
 * Based on authentic patterns: hexagonal frames with internal subdivisions.
 *
 * Patterns:
 * - Kikkou (亀甲): Hexagonal tortoise shell - simple hex grid
 * - Asanoha (麻の葉): Hemp leaf - hex with 6-fold star from center
 */

import { DesignParams } from '../../types';
import { calculatePointData } from './profileMath';

// ============================================================================
// TYPES
// ============================================================================

interface Vec2 {
  u: number;
  v: number;
}

interface LatticeEdge {
  start: Vec2;
  end: Vec2;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SQRT3 = Math.sqrt(3);
const PI = Math.PI;

// Hexagon size: circumradius (center to vertex)
// Chosen so that hex width (vertex to vertex) = 1 unit
const HEX_R = 0.5;

// Hex geometry derived values
const HEX_W = HEX_R * 2;           // Width (vertex to vertex horizontally)
const HEX_H = HEX_R * SQRT3;       // Height (flat edge to flat edge)

// Spacing between hex centers in a honeycomb grid
const HEX_HORIZ_SPACING = HEX_R * 1.5;      // Horizontal distance between columns
const HEX_VERT_SPACING = HEX_R * SQRT3;     // Vertical distance between rows

// ============================================================================
// HEXAGON GEOMETRY
// ============================================================================

/**
 * Get center position of hex at grid coordinates (col, row)
 * Using offset coordinates (odd-q vertical layout)
 */
function hexCenter(col: number, row: number): Vec2 {
  const offset = (col % 2 === 0) ? 0 : HEX_VERT_SPACING / 2;
  return {
    u: col * HEX_HORIZ_SPACING,
    v: row * HEX_VERT_SPACING + offset
  };
}

/**
 * Get the 6 vertices of a flat-top hexagon centered at (cu, cv)
 * Returns vertices starting from right, going counter-clockwise
 *
 *       2---1
 *      /     \
 *     3       0
 *      \     /
 *       4---5
 */
function hexVertices(cu: number, cv: number): Vec2[] {
  const verts: Vec2[] = [];
  for (let i = 0; i < 6; i++) {
    // Flat-top hex: vertices at 0°, 60°, 120°, 180°, 240°, 300°
    const angle = (PI / 3) * i;
    verts.push({
      u: cu + HEX_R * Math.cos(angle),
      v: cv + HEX_R * Math.sin(angle)
    });
  }
  return verts;
}

/**
 * Get midpoints of the 6 edges of a hexagon
 * Edge i connects vertex i to vertex (i+1)%6
 */
function hexEdgeMidpoints(cu: number, cv: number): Vec2[] {
  const verts = hexVertices(cu, cv);
  const mids: Vec2[] = [];
  for (let i = 0; i < 6; i++) {
    const next = (i + 1) % 6;
    mids.push({
      u: (verts[i].u + verts[next].u) / 2,
      v: (verts[i].v + verts[next].v) / 2
    });
  }
  return mids;
}

// ============================================================================
// EDGE COLLECTION HELPER
// ============================================================================

class EdgeCollector {
  private edges: LatticeEdge[] = [];
  private edgeSet = new Set<string>();

  private key(a: Vec2, b: Vec2): string {
    // Round to avoid floating point issues
    const ax = a.u.toFixed(5), ay = a.v.toFixed(5);
    const bx = b.u.toFixed(5), by = b.v.toFixed(5);
    // Normalize direction
    if (ax < bx || (ax === bx && ay < by)) {
      return `${ax},${ay}-${bx},${by}`;
    }
    return `${bx},${by}-${ax},${ay}`;
  }

  add(start: Vec2, end: Vec2): void {
    const k = this.key(start, end);
    if (!this.edgeSet.has(k)) {
      this.edgeSet.add(k);
      this.edges.push({ start, end });
    }
  }

  getEdges(): LatticeEdge[] {
    return this.edges;
  }
}

// ============================================================================
// PATTERN GENERATORS
// ============================================================================

/**
 * Generate Kikkou (亀甲) - Tortoise Shell pattern
 * Simple hexagonal grid - just the hex outlines
 */
function generateKikkouPattern(cols: number, rows: number): LatticeEdge[] {
  const collector = new EdgeCollector();

  for (let c = -1; c <= cols + 1; c++) {
    for (let r = -1; r <= rows + 1; r++) {
      const center = hexCenter(c, r);
      const verts = hexVertices(center.u, center.v);

      // Add all 6 edges of the hexagon
      for (let i = 0; i < 6; i++) {
        const next = (i + 1) % 6;
        collector.add(verts[i], verts[next]);
      }
    }
  }

  return collector.getEdges();
}

/**
 * Generate Asanoha (麻の葉) - Hemp Leaf pattern
 * Hexagonal grid with 6-pointed star inside each hex
 *
 * Construction:
 * 1. Hexagon outline (6 edges)
 * 2. Lines from center to each vertex (6 lines)
 * 3. Lines from center to each edge midpoint (6 lines)
 *
 * This creates the characteristic 12-fold star pattern
 */
function generateAsanohaPattern(cols: number, rows: number): LatticeEdge[] {
  const collector = new EdgeCollector();

  for (let c = -1; c <= cols + 1; c++) {
    for (let r = -1; r <= rows + 1; r++) {
      const center = hexCenter(c, r);
      const verts = hexVertices(center.u, center.v);
      const mids = hexEdgeMidpoints(center.u, center.v);

      // 1. Hexagon outline
      for (let i = 0; i < 6; i++) {
        const next = (i + 1) % 6;
        collector.add(verts[i], verts[next]);
      }

      // 2. Lines from center to each vertex
      for (let i = 0; i < 6; i++) {
        collector.add(center, verts[i]);
      }

      // 3. Lines from center to each edge midpoint
      for (let i = 0; i < 6; i++) {
        collector.add(center, mids[i]);
      }
    }
  }

  return collector.getEdges();
}

// ============================================================================
// 3D PROJECTION
// ============================================================================

interface Vertex3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Project a UV point onto the 3D surface
 */
function projectToSurface(
  u: number,
  v: number,
  scale: number,
  tilesAround: number,
  height: number,
  params: DesignParams,
  isInner: boolean,
  thickness: number
): Vertex3D | null {
  // Convert tile coords to actual coords
  const theta = (u / tilesAround) * PI * 2;
  const y = v * scale;

  // Bounds check
  if (y < 0 || y > height) return null;

  // Get surface radius
  const p = calculatePointData(y, theta, params);
  let r = p.r;

  if (isInner) {
    r = Math.max(0.01, r - thickness);
  }

  return {
    x: r * Math.cos(theta),
    y: y,
    z: r * Math.sin(theta)
  };
}

// ============================================================================
// LATTICE BAR GENERATION
// ============================================================================

/**
 * Generate a rectangular bar along an edge
 */
function generateBar(
  edge: LatticeEdge,
  lineWidthUV: number,
  scale: number,
  tilesAround: number,
  height: number,
  params: DesignParams,
  thickness: number,
  segments: number
): { vertices: number[], indices: number[] } {
  const vertices: number[] = [];
  const indices: number[] = [];

  const du = edge.end.u - edge.start.u;
  const dv = edge.end.v - edge.start.v;
  const len = Math.sqrt(du * du + dv * dv);

  if (len < 0.0001) return { vertices, indices };

  // Perpendicular direction for bar width
  const perpU = (-dv / len) * lineWidthUV * 0.5;
  const perpV = (du / len) * lineWidthUV * 0.5;

  // Collect valid cross-sections
  const sections: { oL: Vertex3D, oR: Vertex3D, iL: Vertex3D, iR: Vertex3D }[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = edge.start.u + t * du;
    const v = edge.start.v + t * dv;

    const oL = projectToSurface(u - perpU, v - perpV, scale, tilesAround, height, params, false, thickness);
    const oR = projectToSurface(u + perpU, v + perpV, scale, tilesAround, height, params, false, thickness);
    const iL = projectToSurface(u - perpU, v - perpV, scale, tilesAround, height, params, true, thickness);
    const iR = projectToSurface(u + perpU, v + perpV, scale, tilesAround, height, params, true, thickness);

    if (oL && oR && iL && iR) {
      sections.push({ oL, oR, iL, iR });
    }
  }

  if (sections.length < 2) return { vertices, indices };

  // Build vertex buffer
  let idx = 0;
  const sectionIndices: { oL: number, oR: number, iL: number, iR: number }[] = [];

  for (const s of sections) {
    vertices.push(s.oL.x, s.oL.y, s.oL.z);
    vertices.push(s.oR.x, s.oR.y, s.oR.z);
    vertices.push(s.iL.x, s.iL.y, s.iL.z);
    vertices.push(s.iR.x, s.iR.y, s.iR.z);
    sectionIndices.push({ oL: idx, oR: idx + 1, iL: idx + 2, iR: idx + 3 });
    idx += 4;
  }

  // Build faces between sections
  for (let i = 0; i < sectionIndices.length - 1; i++) {
    const c = sectionIndices[i];
    const n = sectionIndices[i + 1];

    // Outer face
    indices.push(c.oL, c.oR, n.oR);
    indices.push(c.oL, n.oR, n.oL);

    // Inner face (reversed winding)
    indices.push(c.iR, c.iL, n.iL);
    indices.push(c.iR, n.iL, n.iR);

    // Left side
    indices.push(c.oL, n.oL, n.iL);
    indices.push(c.oL, n.iL, c.iL);

    // Right side
    indices.push(n.oR, c.oR, c.iR);
    indices.push(n.oR, c.iR, n.iR);
  }

  // End caps
  const first = sectionIndices[0];
  const last = sectionIndices[sectionIndices.length - 1];

  // Start cap
  indices.push(first.oL, first.iL, first.iR);
  indices.push(first.oL, first.iR, first.oR);

  // End cap
  indices.push(last.oR, last.iR, last.iL);
  indices.push(last.oR, last.iL, last.oL);

  return { vertices, indices };
}

// ============================================================================
// EDGE CLIPPING
// ============================================================================

/**
 * Clip edge to visible height region
 */
function clipToRegion(edge: LatticeEdge, minV: number, maxV: number): LatticeEdge | null {
  let { start, end } = edge;

  // Ensure start.v <= end.v
  if (start.v > end.v) {
    [start, end] = [end, start];
  }

  // Completely outside?
  if (end.v < minV || start.v > maxV) return null;

  const dv = end.v - start.v;
  const du = end.u - start.u;

  let newStart = start;
  let newEnd = end;

  if (dv > 0.0001) {
    if (start.v < minV) {
      const t = (minV - start.v) / dv;
      newStart = { u: start.u + t * du, v: minV };
    }
    if (end.v > maxV) {
      const t = (maxV - start.v) / dv;
      newEnd = { u: start.u + t * du, v: maxV };
    }
  }

  return { start: newStart, end: newEnd };
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export interface KumikoLatticeResult {
  vertices: number[];
  indices: number[];
}

/**
 * Generate Kumiko lattice geometry
 */
export function generateKumikoLattice(
  pattern: 'kumiko-kikkou' | 'kumiko-asanoha',
  params: DesignParams
): KumikoLatticeResult {
  const { height, thickness, skinScale, skinLineWidth, radiusTop, radiusBottom } = params;

  const scale = Math.max(0.5, skinScale);

  // Calculate tiling
  const refRadius = (radiusTop + radiusBottom) / 2;
  const refCircumference = 2 * PI * refRadius;
  const tilesAround = Math.max(1, Math.round(refCircumference / scale));
  const tilesHeight = height / scale;

  // How many hex columns/rows we need
  const cols = Math.ceil(tilesAround / HEX_HORIZ_SPACING) + 2;
  const rows = Math.ceil(tilesHeight / HEX_VERT_SPACING) + 2;

  // Generate pattern edges
  let edges: LatticeEdge[];
  if (pattern === 'kumiko-kikkou') {
    edges = generateKikkouPattern(cols, rows);
  } else {
    edges = generateAsanohaPattern(cols, rows);
  }

  // Apply rotation if specified
  if (params.skinRotation !== 0) {
    const rad = params.skinRotation * (PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cu = tilesAround / 2;
    const cv = tilesHeight / 2;

    edges = edges.map(e => ({
      start: {
        u: cu + (e.start.u - cu) * cos - (e.start.v - cv) * sin,
        v: cv + (e.start.u - cu) * sin + (e.start.v - cv) * cos
      },
      end: {
        u: cu + (e.end.u - cu) * cos - (e.end.v - cv) * sin,
        v: cv + (e.end.u - cu) * sin + (e.end.v - cv) * cos
      }
    }));
  }

  // Clip to visible region
  const clippedEdges: LatticeEdge[] = [];
  for (const edge of edges) {
    const clipped = clipToRegion(edge, 0, tilesHeight);
    if (clipped) {
      clippedEdges.push(clipped);
    }
  }

  // Line width (enforce FDM minimum 0.8mm)
  const minLineWidthCm = 0.08;
  const lineWidthCm = Math.max(minLineWidthCm, scale * skinLineWidth);
  const lineWidthUV = lineWidthCm / scale;

  // Segments per bar (more for curved surfaces)
  const segments = 4;

  // Generate all bars
  const allVertices: number[] = [];
  const allIndices: number[] = [];
  let indexOffset = 0;

  for (const edge of clippedEdges) {
    const bar = generateBar(
      edge, lineWidthUV, scale, tilesAround, height,
      params, thickness, segments
    );

    if (bar.vertices.length === 0) continue;

    allVertices.push(...bar.vertices);
    for (const i of bar.indices) {
      allIndices.push(i + indexOffset);
    }
    indexOffset += bar.vertices.length / 3;
  }

  return { vertices: allVertices, indices: allIndices };
}

/**
 * Check if pattern uses analytical Kumiko generator
 */
export function isAnalyticalKumikoPattern(pattern: string): boolean {
  return pattern === 'kumiko-kikkou' || pattern === 'kumiko-asanoha';
}
