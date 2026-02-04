/**
 * GEOMETRY MODULE - LEGACY COMPATIBILITY
 *
 * This file re-exports from the new modular structure for backwards compatibility.
 * New code should import directly from './geometry/index' or specific modules.
 *
 * Structure:
 * - utils/geometry/profileMath.ts    — Core math functions
 * - utils/geometry/bodyGeometry.ts   — Main body generation
 * - utils/geometry/saucerGeometry.ts — Saucer generation
 * - utils/geometry/suspensionHub.ts  — [R&D] Suspension hub
 */

export {
  generateBodyGeometry,
  generateSaucerGeometry,
  calculatePointData,
  addQuad,
  type PointData
} from './geometry/index';
