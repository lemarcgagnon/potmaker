# Manifold PRO — Procedural 3D Designer

A real-time parametric designer for 3D-printable pots, planters, and lamp shades. Tweak 40+ parameters with instant preview, then export watertight STL files ready for your slicer.

## Features

### Design Modes
- **Pot** — Planters with drainage holes, adjustable floors, and matching saucers
- **Shade** — Lamp shades (suspension hub system in development)

### Profile Curves
- **Standard** — Linear taper with optional bulge
- **Cone** — Pure linear taper, no curvature
- **Elliptic** — Circular/elliptical profile
- **Bell** — Power-curve taper for bell shapes
- **Tulip** — Hermite S-curve transition
- **Barrel** — Cosine-eased rounded form
- **Hourglass** — Concave middle section
- **Trumpet** — Exponential flare at top
- **Ogee** — Architectural double-curve
- **Vase** — Built-in belly and neck
- **Polygon** — Flat-sided cross-section (3-12 sides)

### Surface Modifiers
- **Curvature/Bulge** — Adjustable with height bias control
- **Twist** — Spiral rotation along height
- **Base Flare** — Stability foot at bottom
- **Top Flare** — Lip/rim flare (auto-clamped to 30° for FDM)
- **Vertical Ribs** — Fluting with configurable count and depth
- **Horizontal Ripples** — Wave pattern (auto-clamped to 35° for FDM)
- **Terracing/Steps** — Stepped profile with smart beveling

### Skin Patterns (Kumiko-style)
- **Diamond, Hexgrid, Asanoha, Seigaiha, Shippo, Yagasuri**
- **Modes**: Embossed, Carved, or Pierced (cut-through)
- Auto-suppressed on steep surfaces (>35°) for FDM printability

### Pot Features
- Configurable floor thickness
- Drainage hole with adjustable diameter
- Bottom lift with 35° minimum slope enforcement
- Matching saucer with gap tolerance and flare angle

### Export
- Binary STL with correct mm scaling (geometry authored in cm, exported at 10×)
- Y-up to Z-up rotation for slicer compatibility
- Origin placed on build plate
- Individual parts or ZIP bundle with timestamps

## FDM 3D Printing Compliance

The geometry engine enforces printability constraints:

| Feature | Constraint | Enforcement |
|---------|------------|-------------|
| Wall taper | ≤30° | UI warning |
| Rim bevel | ≤45° | UI warning at 30° |
| Top flare | ≤30° | Auto-clamped |
| Ripple amplitude | ≤35° slope | Auto-clamped |
| Floor angle (lifted) | ≥35° | Auto-corrected |
| Pierce mode | ≤35° surface | Auto-suppressed |
| Wall thickness | ≥2mm | UI minimum 0.2cm |

See `.claude/3dprintrules.md` for complete FDM design guidelines.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| 3D | Three.js, @react-three/fiber, @react-three/drei |
| Export | STLExporter (binary), JSZip |
| Language | TypeScript 5 |

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
  layout.tsx              Root layout
  page.tsx                Entry point
  globals.css             Tailwind + global styles

components/
  ManifoldDesigner.tsx    State management, export pipeline
  Scene.tsx               Three.js canvas, lighting, camera
  Sidebar.tsx             3-tab control panel (Form / Details / Finish)

utils/
  geometry.ts             Re-exports from geometry/ (backwards compatible)
  patterns.ts             Skin pattern evaluation (kumiko)
  geometry/
    index.ts              Module exports
    profileMath.ts        Core math: calculatePointData, profile curves
    bodyGeometry.ts       Main body walls, rim, floor generation
    saucerGeometry.ts     Drip tray generation
    suspensionHub.ts      [R&D] Lamp shade mounting system

types.ts                  DesignParams interface and defaults

.claude/
  3dprintrules.md         FDM design guidelines
```

## Geometry Engine

The geometry system is modular, with each concern in its own file:

### profileMath.ts — Core Mathematics
Calculates surface position for any point (y, theta). Applies in order:
1. Vertical stepping (terracing with smart beveling)
2. Profile curve (bell, tulip, barrel, etc.)
3. Curvature/bulge with height bias
4. Base and top flares
5. Ripple waves (amplitude-clamped for FDM)
6. Twist rotation
7. Rib/flute modulation
8. Skin pattern displacement
9. Polygon cross-section

### bodyGeometry.ts — Main Body
Generates outer shell, inner shell, top rim, and bottom cap:
- Pierce mode support for cut-through patterns
- 35° overhang suppression on steep surfaces
- Pot floor with flat or lifted cone (35° minimum)
- Shade open rim

### saucerGeometry.ts — Drip Tray
Generates matching saucer that follows pot profile:
- Configurable gap tolerance
- Wall and base thickness
- Flare angle

### suspensionHub.ts — [In Development]
Isolated R&D module for lamp shade mounting system:
- Central hole for cord/socket
- Spoke arms from hub to wall
- FDM-printable geometry (≥35° angles)

## STL Export Pipeline

1. Clone geometry (scene is never mutated)
2. Scale 10× (cm → mm for slicers)
3. Rotate +90° around X (Y-up → Z-up)
4. Translate so bottom sits at Z=0 (build plate)
5. Export as binary STL or ZIP bundle

## Design Defaults

| Parameter | Default | Exported (mm) |
|-----------|---------|---------------|
| Height | 15 cm | 150 mm |
| Top radius | 10 cm | 100 mm |
| Bottom radius | 8 cm | 80 mm |
| Wall thickness | 0.4 cm | 4 mm |
| Floor thickness | 0.8 cm | 8 mm |

All dimensions are well within printable ranges for a 0.4mm nozzle.

## Development

### Testing Suspension Hub in Isolation

```bash
cd utils/geometry
npx ts-node suspensionHub.test.ts
# Opens /tmp/suspension_hub_test.stl for slicer verification
```

### Branch Structure
- `main` — Stable release
- `with-skin` — Skin pattern feature branch
- `working-on-suspension-hub` — Suspension hub R&D

## License

MIT
