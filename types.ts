export type DesignMode = 'pot' | 'shade';
export type ShapeProfile = 'standard' | 'elliptic' | 'bell' | 'tulip' | 'cone' | 'barrel' | 'hourglass' | 'trumpet' | 'ogee' | 'vase' | 'polygon';

export interface DesignParams {
  mode: DesignMode;
  profile: ShapeProfile; // New: Shape Profile
  radiusTop: number;
  radiusBottom: number;
  height: number;
  thickness: number;
  potFloorThickness: number; // Thickness of the pot floor
  radialSegments: number;
  color: string;
  wireframe: boolean;
  torusSize: number;
  
  // Rim Configuration
  rimAngle: number; // Angle of the top rim surface (bevel). Positive = Inward slope.
  rimAngleBottom: number; // Angle of the bottom rim surface (Floor slope).

  // Base Stability (Flare)
  baseFlareWidth: number; // Extra radius at bottom
  baseFlareHeight: number; // Height of the flare transition

  // Top Flare (Lip)
  topFlareWidth: number;   // Extra radius at top
  topFlareHeight: number;  // Height of the top flare transition zone
  
  // Drainage (Pot Mode)
  drainageHoleSize: number; // Diameter of the hole in cm
  bottomLift: number; // Elevation of the center floor (Concavity)

  // Suspension (Shade Mode)
  enableSuspension: boolean; // Toggle for the entire system
  suspensionHeight: number; // 0 to 1 (Ratio of total height)
  suspensionHoleSize: number; // Diameter of socket hole
  suspensionThickness: number; // Thickness of the holder arm
  suspensionAngle: number; // Angle in degrees (45 = self supporting cone)
  suspensionRibCount: number; // Number of arms (vents)
  suspensionRibWidth: number; // Width of each arm in degrees
  suspensionRimWidth: number; // Width of the solid inner ring (hub)
  suspensionAnchorDepth: number; // How deep (in mm) the arm tries to embed into the wall
  suspensionArchPower: number; // Arch curve power (0.1–1.0). Lower = more dramatic arch
  suspensionButtressExtent: number; // How far hub bridges extend outward between spokes (cm)
  suspensionButtressArc: number; // Shape exponent (0.3–3.0). Lower = wider arch, higher = narrower

  // Saucer Configuration
  saucerHeight: number;
  saucerGap: number; // Distance between pot wall and saucer inner wall
  saucerWallThickness: number; // Thickness of the saucer material
  saucerBaseThickness: number; // Thickness of the saucer floor
  saucerSlope: number; // Angle/Flare of the saucer (degrees)
  saucerSeparation: number; // View separation

  // Polygon Cross-Section
  polygonSides: number; // Number of flat sides (3–12) when profile is 'polygon'

  // Shape Modifiers
  curvature: number; // Positive for bulge, negative for hourglass
  curveBias: number; // 0 to 1, where the peak of the curve is
  
  // Surface Modifiers
  rippleAmplitude: number; // Depth of the waves
  rippleFrequency: number; // How many waves along height
  stepCount: number; // Number of vertical terraces (0 = smooth)
  
  // Twist & Pattern
  twist: number; // Global rotation in degrees
  ribCount: number; // Number of decorative ribs/flutes
  ribAmplitude: number; // Depth of the ribs

  // View Options
  showBody: boolean;
  showSaucer: boolean;
}

export const DEFAULT_PARAMS: DesignParams = {
  mode: 'pot',
  profile: 'standard', // Default
  radiusTop: 10.0,
  radiusBottom: 8.0,
  height: 15.0,
  thickness: 0.4,
  potFloorThickness: 0.8, // Default sturdy floor
  radialSegments: 128,
  color: '#d2b48c',
  wireframe: false,
  torusSize: 0.6,
  
  rimAngle: 0,
  rimAngleBottom: 0,
  
  baseFlareWidth: 0,
  baseFlareHeight: 3.0,

  topFlareWidth: 0,
  topFlareHeight: 3.0,
  
  drainageHoleSize: 0,
  bottomLift: 0,

  // Shade Suspension Defaults
  enableSuspension: true,
  suspensionHeight: 0.5, 
  suspensionHoleSize: 4.0, 
  suspensionThickness: 0.4,
  suspensionAngle: 45, 
  suspensionRibCount: 4, 
  suspensionRibWidth: 40,
  suspensionRimWidth: 1.0, // 1cm solid hub
  suspensionAnchorDepth: 0.2, // 2mm embed default
  suspensionArchPower: 0.35, // Pronounced arch by default
  suspensionButtressExtent: 0.3, // Small corner fillets
  suspensionButtressArc: 0.5, // Moderate arch shape

  // Saucer Defaults
  saucerHeight: 2.0,
  saucerGap: 0.3,
  saucerWallThickness: 0.6,
  saucerBaseThickness: 0.4,
  saucerSlope: 15,
  saucerSeparation: 0,
  
  polygonSides: 6,

  curvature: 0,
  curveBias: 0.5,
  
  rippleAmplitude: 0,
  rippleFrequency: 10,
  stepCount: 0,
  
  twist: 0,
  ribCount: 0,
  ribAmplitude: 0,

  showBody: true,
  showSaucer: true,
};