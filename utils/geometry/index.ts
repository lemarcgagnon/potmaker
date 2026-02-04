/**
 * GEOMETRY MODULE INDEX
 *
 * Re-exports all geometry generation functions.
 * Import from here for clean access to all generators.
 *
 * Structure:
 * - profileMath.ts    — Core math (calculatePointData, addQuad)
 * - bodyGeometry.ts   — Main body walls, rim, floor
 * - saucerGeometry.ts — Drip tray for pots
 * - suspensionHub.ts  — [R&D] Lamp shade mounting system
 */

// Core math utilities
export { calculatePointData, addQuad, type PointData } from './profileMath';

// Geometry generators
export { generateBodyGeometry } from './bodyGeometry';
export { generateSaucerGeometry } from './saucerGeometry';

// Suspension hub (R&D module - not yet integrated)
// export { generateSuspensionHub } from './suspensionHub';
