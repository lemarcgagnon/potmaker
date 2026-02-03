# Manifold PRO — Procedural 3D Designer

A real-time parametric designer for 3D-printable pots, planters, and lamp shades. Tweak 40+ parameters with instant preview, then export watertight STL files ready for your slicer.

## Features

### Design Modes
- **Pot** — Planters with drainage holes, adjustable floors, and matching saucers
- **Shade** — Lamp shades with a spoked suspension hub for hanging hardware

### Parametric Controls
- **Profile curves** — Standard, Elliptic, Bell, Tulip
- **Shape modifiers** — Curvature/bulge, twist, base flare for stability
- **Surface textures** — Vertical ribs/flutes, horizontal ripples, terracing/steps
- **Rim bevels** — Top and bottom slope angles
- **Saucer** — Auto-fit to pot geometry with adjustable gap, wall thickness, and flare
- **Suspension hub** — Configurable spoke count, width, angle, and anchor depth

### Export
- Binary STL with correct mm scaling (geometry is authored in cm, exported at 10x for slicers)
- Y-up to Z-up rotation, origin placed on build plate
- Individual part or ZIP bundle export with timestamps

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
  layout.tsx          Root layout
  page.tsx            Entry point
  globals.css         Tailwind + global styles
components/
  ManifoldDesigner.tsx  State management, export pipeline
  Scene.tsx             Three.js canvas, lighting, camera
  Sidebar.tsx           3-tab control panel (Form / Details / Finish)
utils/
  geometry.ts           Procedural mesh generation engine
types.ts                DesignParams interface and defaults
```

## Geometry Engine

All geometry is procedurally generated in `utils/geometry.ts`. For each vertex the engine applies, in order:

1. Vertical stepping (terracing with smart beveling)
2. Base radius from selected profile curve
3. Curvature/bulge with adjustable bias
4. Base flare (stability foot)
5. Ripple waves
6. Twist rotation
7. Rib/flute modulation

The body is a closed shell (outer wall + inner wall + rim + floor/hub), producing a watertight manifold mesh every time. Vertex merging and dynamic segment counts keep triangle counts reasonable.

## STL Export Pipeline

1. Clone geometry (scene is never mutated)
2. Scale 10x (cm to mm — slicers assume millimeters)
3. Rotate +90 deg around X (Three.js Y-up to slicer Z-up)
4. Translate so bottom sits at Z=0 (build plate)
5. Export as binary STL or ZIP bundle

## Design Defaults

The default pot is 15 cm tall, 10 cm top radius, 8 cm bottom radius, 0.4 cm wall thickness, and 0.8 cm floor. After export scaling these become 150 mm, 100 mm, 80 mm, 4 mm, and 8 mm respectively — all well within printable ranges for a 0.4 mm nozzle.

## License

MIT
