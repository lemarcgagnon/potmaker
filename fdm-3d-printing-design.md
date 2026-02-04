# FDM 3D Printing Design Rules

> Skill for designing print-ready FDM parts that succeed on first attempt.

---

## 1. Overhangs & Angles

| Angle from Vertical | Printability |
|---------------------|--------------|
| 0–45° | ✅ No support needed |
| 45–60° | ⚠️ May need support, surface quality degrades |
| 60–90° | ❌ Requires support or redesign |

- **Self-supporting angle threshold**: 45° (conservative), 50–55° (aggressive with good cooling)
- **Horizontal overhangs (90°)**: Always fail without support

---

## 2. Bridging

| Span Length | Expectation |
|-------------|-------------|
| <20mm | Clean bridge |
| 20–50mm | Acceptable with good cooling |
| 50–80mm | Risky, expect sag |
| >80mm | Will fail — add support or intermediate pillars |

**Tips**:
- Bridge perpendicular to airflow from part cooling fan
- Reduce speed (20–30mm/s) and increase cooling for bridges
- Design bridge endpoints on solid perimeters, not infill

---

## 3. Wall Thickness

| Feature Type | Minimum | Recommended |
|--------------|---------|-------------|
| Vertical walls | 2× nozzle width (0.8mm for 0.4mm nozzle) | 3× nozzle (1.2mm) |
| Structural/load-bearing | 1.6mm | 2.0–2.4mm |
| Cosmetic thin walls | 1× nozzle (0.4mm) | 0.6mm+ |
| Around screw bosses | 2.0mm | 2.5–3.0mm |
| Around heat-set inserts | 2.5mm | 3.0mm+ |

**Rules**:
- Wall thickness should be multiples of nozzle width for clean prints
- Single-wall (vase mode) parts: 0.4–0.6mm only

---

## 4. Layer Height

| Consideration | Rule |
|---------------|------|
| Max layer height | ≤75% of nozzle diameter (0.3mm for 0.4mm nozzle) |
| Recommended range | 25–50% of nozzle (0.1–0.2mm for 0.4mm nozzle) |
| Fine detail | 0.08–0.12mm |
| Functional/fast | 0.2–0.28mm |
| Vertical curved surfaces | Smaller layers = smoother curves |

**Note**: Layer height determines Z-resolution and affects overhang quality.

---

## 5. Holes & Tolerances

### Hole Compensation (holes print smaller due to shrinkage & perimeter overlap)

| Hole Type | Add to Diameter |
|-----------|-----------------|
| Small holes (<6mm) | +0.3–0.5mm |
| Medium holes (6–15mm) | +0.2–0.4mm |
| Large holes (>15mm) | +0.1–0.3mm |

### Fit Types

| Fit | Clearance | Use Case |
|-----|-----------|----------|
| Press fit | 0.0–0.15mm interference | Permanent joints |
| Snug/friction fit | 0.1–0.2mm gap | Removable with force |
| Sliding fit | 0.3–0.5mm gap | Moving parts |
| Loose fit | 0.5–1.0mm gap | Easy assembly |

### Minimum Hole Sizes
- **Vertical holes**: ≥2mm diameter (smaller may close up)
- **Horizontal holes**: ≥3mm, use teardrop shape for support-free

### Horizontal Hole Strategy
Use **teardrop/diamond** shape with 45° peak at top to avoid supports:
```
    /\
   /  \
  |    |
   \  /
    \/
```

---

## 6. Pins, Posts & Bosses

| Feature | Minimum | Recommended |
|---------|---------|-------------|
| Pin/post diameter | 3mm | 4mm+ |
| Pin height (unsupported) | ≤5× diameter | ≤3× diameter |
| Screw boss outer diameter | Screw diameter × 2.5 | Screw diameter × 3 |
| Heat-set insert boss OD | Insert OD + 4mm | Insert OD + 5mm |

**Tips**:
- Add fillet at base of pins/posts (r=0.5–1mm) for strength
- Chamfer tops of pins for easier assembly
- For tall thin posts: add gussets or ribs

---

## 7. Text & Fine Detail

| Feature | Minimum Size |
|---------|--------------|
| Embossed text width | 0.6mm |
| Embossed text height | 0.5mm |
| Engraved text width | 0.6mm |
| Engraved text depth | 0.4mm (2 layers at 0.2mm) |
| Fine raised detail | 0.4mm wide × 0.3mm tall |
| Sharp edges/corners | Will round to ~0.2–0.4mm radius |

**Tips**:
- Sans-serif fonts print cleaner (Arial, Helvetica)
- Minimum font size: ~8pt embossed, ~10pt engraved
- Orient text facing up (top surface) for best quality

---

## 8. First Layer & Bed Adhesion

### Bottom Surface Design
- **Chamfer bottom edges**: 0.5–1mm at 45° (prevents elephant's foot)
- **Avoid small contact points**: Minimum 5mm² contact area per feature
- **Large flat bases**: Add brim in slicer for tall/narrow parts

### Aspect Ratio (Height:Base)
| Ratio | Stability |
|-------|-----------|
| <3:1 | ✅ Stable |
| 3:1–5:1 | ⚠️ Add brim |
| >5:1 | ❌ High tip-over risk — redesign or split |

### Warping Prevention
- Avoid large flat surfaces (>150mm) without ribs/texture
- Round or chamfer sharp corners on base (stress concentrators)
- Consider splitting into smaller parts
- Material matters: ABS/Nylon warp more than PLA/PETG

---

## 9. Part Orientation Strategy

### Strength Considerations
```
Strongest ← X/Y (in-plane) → along layer lines
Weakest  ← Z (vertical)    → layer adhesion (10–50% weaker)
```

**Rules**:
- Orient primary stress perpendicular to layer lines
- Screw holes: Orient axis vertical when possible (threads across layers are weak)
- Living hinges: Print flat, hinge line along X/Y

### Surface Quality Priority
| Surface Orientation | Quality |
|---------------------|---------|
| Top (facing up) | Best (smooth if ironed) |
| Bottom (on bed) | Good (textured or glossy per bed type) |
| Vertical walls | Good (layer lines visible) |
| Angled/sloped | Stairstepping visible (reduce layer height) |
| Overhangs w/ support | Worst (support marks) |

---

## 10. Support-Free Design Patterns

### Instead of 90° Overhangs
- **Chamfers at 45°** instead of horizontal shelves
- **Gothic arch** instead of semicircular arch
- **Angled transitions** instead of sharp steps

### Instead of Horizontal Holes
- **Teardrop/diamond** holes (45° self-supporting peak)
- **Slot + cap** (print open, glue cap after)

### Instead of Internal Cavities
- **Split design** with alignment features
- **Open bottom** with separate lid
- Always add **escape holes** (≥3mm) for trapped support/air

### Snap Fits (Support-Free)
- **Cantilever snaps**: Print hook pointing up at 45° max
- **Annular snaps**: Avoid or split design
- **Deflection**: Max 3–5% of beam length

---

## 11. Assembly Features

### Alignment Features
| Feature | Design Rule |
|---------|-------------|
| Locating pins | Diameter 3–5mm, height 2–3mm, 0.2mm clearance |
| Tongue & groove | Tongue 0.3mm smaller per side |
| Press-fit pegs | 0.1–0.15mm interference, add chamfer |

### Threaded Connections
| Method | When to Use |
|--------|-------------|
| Printed threads | M8+ only, 0.3–0.4mm clearance, coarse pitch |
| Tap after printing | M3–M6, print pilot hole 0.5mm under tap size |
| Heat-set inserts | Best for M2–M5, repeated assembly cycles |
| Self-tapping screws | Quick prototypes, ~85% of screw diameter hole |

---

## 12. Infill & Internal Structure

### Design Considerations
| Goal | Design Approach |
|------|-----------------|
| Maximize strength | Increase perimeters (4–6) over infill |
| Save material | Design internal ribs instead of solid |
| Stiff but light | Honeycomb internal structure (designed in CAD) |
| Load transfer | Ensure load path crosses solid perimeter walls |

**Note**: Infill is slicer-controlled, but design affects where it's placed.

---

## 13. Large Part Strategy

### When to Split
- Part exceeds build volume
- Would require excessive support
- Different sections need different orientations for strength
- Assembly access needed

### Split Joint Design
- **Alignment pins**: 4mm diameter, 5mm deep, 0.2mm clearance
- **Glue surface**: Add 2–3mm overlap flange
- **Fastener bosses**: If mechanical joint needed
- **Split along flat planes** when possible
- Hide split line in existing geometry (grooves, edges)

---

## 14. Material-Specific Adjustments

| Material | Special Considerations |
|----------|------------------------|
| PLA | Most forgiving, tight tolerances OK, brittle snaps |
| PETG | Add 0.1mm extra clearance, strings into holes |
| ABS | +0.3mm for warping compensation, round corners, enclosed printer |
| TPU | +0.5mm clearance, no small holes, slow print |
| Nylon | +0.5–1mm for shrinkage/warping, dry filament |

---

## 15. Pre-Export Checklist

```
GEOMETRY
□ All overhangs ≤45° or designed for support?
□ Bridges <50mm?
□ Walls ≥0.8mm (structural ≥1.6mm)?
□ No features thinner than nozzle width?
□ Holes oversized by 0.2–0.5mm?
□ Horizontal holes use teardrop/diamond?
□ Minimum 2mm vertical hole diameter?

FIRST LAYER
□ Flat stable base with adequate surface area?
□ Chamfered/filleted bottom edges?
□ Height:base ratio <5:1 (or use brim)?
□ No sharp corners on bottom (warping)?

ORIENTATION
□ Part oriented for strength (load ⟂ layers)?
□ Critical surfaces facing optimal direction?
□ Minimal support contact on visible surfaces?

ASSEMBLY
□ Press-fit tolerances set (0.1–0.15mm interference)?
□ Sliding tolerances set (0.3–0.5mm gap)?
□ Alignment features present for multi-part?
□ Escape holes for internal cavities?
□ Thread strategy selected (print/tap/insert)?

VALIDATION
□ Manifold/watertight mesh (no holes/flipped normals)?
□ Units correct (mm)?
□ Scale verified (1:1)?
□ STL resolution adequate (0.01–0.02mm deviation)?
```

---

## Quick Reference Card

| Rule | Value |
|------|-------|
| Max overhang angle | 45° |
| Max bridge span | 50mm |
| Min wall thickness | 0.8mm (2 perimeters) |
| Min vertical hole | 2mm ⌀ |
| Hole compensation | +0.3mm |
| Sliding clearance | 0.3–0.5mm |
| Press-fit interference | 0.1–0.15mm |
| Min embossed text | 0.6mm wide × 0.5mm tall |
| Min pin diameter | 3mm |
| Max unsupported pin | 5× diameter height |
| Bottom chamfer | 45° × 0.5–1mm |
| Safe aspect ratio | <3:1 (height:base) |

---

*Apply these rules during CAD design to minimize iterations between design and print.*
