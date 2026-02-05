"use client";

import React, { useState, useEffect, useRef } from 'react';
import { DesignParams, DEFAULT_PARAMS, ShapeProfile, SkinPatternType, SkinPatternMode } from '../types';
import {
  Download, Upload, Box, Layers, Palette, Cylinder, Package, Spline, Camera,
  Waves, Tornado, Wand2, Eye, EyeOff, RotateCcw, RefreshCw,
  ChevronsUp, ChevronsDown, Sliders, ChevronDown, ChevronRight, Lightbulb,
  Hexagon, FileJson
} from 'lucide-react';

interface SidebarProps {
  params: DesignParams;
  setParams: React.Dispatch<React.SetStateAction<DesignParams>>;
  onExport: (type: 'body' | 'saucer' | 'all') => void;
  onScreenshot?: () => void;
  onRefresh?: () => void;
}

// --- UNIT SYSTEM ---

type DisplayUnit = 'mm' | 'cm' | 'in';

const UNIT_FACTORS: Record<DisplayUnit, number> = {
  mm: 10,
  cm: 1,
  in: 1 / 2.54,
};

// --- SUB-COMPONENTS ---

const DualInput: React.FC<{
  label: string;
  value: number;       // Internal value (always cm for lengths)
  min: number;         // Internal min (cm)
  max: number;         // Internal max (cm)
  step?: number;       // Internal step (cm)
  onChange: (val: number) => void;
  unit?: string;       // 'cm' = length (converts), 'deg'/'%'/etc = passthrough
  displayUnit?: DisplayUnit;
  warning?: string;
}> = ({ label, value, min, max, step = 0.1, onChange, unit, displayUnit = 'cm', warning }) => {
  const isLength = unit === 'cm';
  const factor = isLength ? UNIT_FACTORS[displayUnit] : 1;
  const shownUnit = isLength ? displayUnit : (unit || '');

  const dVal = value * factor;
  const dMin = min * factor;
  const dMax = max * factor;
  const dStep = step * factor;
  const decimals = dStep < 0.1 ? 2 : dStep < 1 ? 1 : 0;

  const [text, setText] = useState(dVal.toFixed(decimals));
  const [focused, setFocused] = useState(false);

  // Sync display when value or unit changes (not while typing)
  useEffect(() => {
    if (!focused) setText(dVal.toFixed(decimals));
  }, [dVal, decimals, focused]);

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v / factor)));
  };

  const handleText = (e: React.ChangeEvent<HTMLInputElement>) => setText(e.target.value);

  const commitText = () => {
    setFocused(false);
    let v = parseFloat(text);
    if (isNaN(v)) { setText(dVal.toFixed(decimals)); return; }
    v = Math.max(dMin, v);
    setText(v.toFixed(decimals));
    onChange(v / factor);
  };

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex justify-between items-center mb-1.5">
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</label>
        {shownUnit && <span className="text-[10px] text-gray-500 font-mono">{shownUnit}</span>}
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={dMin}
          max={dMax}
          step={dStep}
          value={dVal}
          onChange={handleSlider}
          className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-colors"
        />
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={handleText}
          onFocus={() => setFocused(true)}
          onBlur={commitText}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="w-16 bg-gray-800 border border-gray-700 text-white text-xs font-mono py-1 px-1.5 rounded text-right focus:border-blue-500 focus:outline-none transition-colors"
        />
      </div>
      {warning && <p className="text-[10px] text-amber-400 mt-1">{warning}</p>}
    </div>
  );
};

const AccordionSection: React.FC<{ 
  title: string; 
  icon?: React.ReactNode; 
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode; 
}> = ({ title, icon, isOpen, onToggle, children }) => (
  <div className="mb-2 border border-gray-800 bg-gray-900/50 rounded-lg overflow-hidden transition-all hover:border-gray-700">
    <button 
      onClick={onToggle}
      className="w-full flex items-center justify-between p-3 bg-gray-800/50 hover:bg-gray-800 transition-colors"
    >
      <div className="flex items-center gap-2.5">
        {icon}
        <span className="text-sm font-semibold text-gray-200">{title}</span>
      </div>
      {isOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
    </button>
    
    {isOpen && (
      <div className="p-4 bg-gray-900/30 border-t border-gray-800/50 animate-in slide-in-from-top-2 duration-200">
        {children}
      </div>
    )}
  </div>
);

type Tab = 'form' | 'details' | 'finish';

export const Sidebar: React.FC<SidebarProps> = ({ params, setParams, onExport, onScreenshot, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<Tab>('form');
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>('cm');

  // Manage accordion states
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'dimensions': true,
    'shape': true,
    'global': true,
    'surface': false,
    'skinPattern': false,
    'saucer': false,
    'suspension': false,
    'view': true
  });

  const toggleSection = (id: string) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = (expand: boolean) => {
    const nextState = Object.keys(openSections).reduce((acc, key) => {
      acc[key] = expand;
      return acc;
    }, {} as Record<string, boolean>);
    setOpenSections(nextState);
  };

  const update = (key: keyof DesignParams, value: any) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    if (window.confirm("Are you sure you want to reset all parameters to default?")) {
        setParams(DEFAULT_PARAMS);
    }
  };

  const profilePresets: Record<ShapeProfile, Partial<DesignParams>> = {
    cone:       { profile: 'cone',       curvature: 0,    curveBias: 0.5 },
    standard:   { profile: 'standard',   curvature: 0,    curveBias: 0.5 },
    elliptic:   { profile: 'elliptic',   curvature: 3.0,  curveBias: 0.5 },
    bell:       { profile: 'bell',       curvature: 4.0,  curveBias: 0.5 },
    tulip:      { profile: 'tulip',      curvature: 2.0,  curveBias: 0.6 },
    barrel:     { profile: 'barrel',     curvature: 3.5,  curveBias: 0.5 },
    hourglass:  { profile: 'hourglass',  curvature: -3.5, curveBias: 0.5 },
    trumpet:    { profile: 'trumpet',    curvature: 0,    curveBias: 0.5 },
    ogee:       { profile: 'ogee',       curvature: 1.5,  curveBias: 0.5 },
    vase:       { profile: 'vase',       curvature: 0,    curveBias: 0.5 },
    polygon:    { profile: 'polygon',    curvature: 0,    curveBias: 0.5 },
  };

  const applyProfile = (p: ShapeProfile) => {
    setParams(prev => ({ ...prev, ...profilePresets[p] }));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadRecipe = () => {
    const recipe = {
      _format: 'manifold-pro-recipe',
      _version: 1,
      params: { ...params }
    };
    const json = JSON.stringify(recipe, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const name = params.mode === 'pot' ? 'pot' : 'shade';
    const ts = new Date().toISOString().slice(0, 10);
    link.download = `manifold_${name}_${ts}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadRecipe = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);

        // Validate format
        if (data._format !== 'manifold-pro-recipe' || !data.params) {
          alert('Invalid recipe file. Expected a Manifold PRO recipe (.json).');
          return;
        }

        // Merge with defaults to handle missing keys from older versions
        const loaded = { ...DEFAULT_PARAMS, ...data.params } as DesignParams;
        setParams(loaded);
      } catch {
        alert('Could not read file. Make sure it is a valid JSON recipe.');
      }
    };
    reader.readAsText(file);

    // Reset input so the same file can be re-uploaded
    e.target.value = '';
  };

  const handleAutoFitSaucer = () => {
    setParams(prev => ({
      ...prev,
      saucerGap: 0.3,
      saucerWallThickness: Math.max(0.6, prev.thickness * 1.5),
      saucerBaseThickness: Math.max(0.4, prev.thickness * 2.0),
      saucerHeight: Math.max(2.0, prev.radiusBottom * 0.2),
      saucerSlope: 15
    }));
  };

  return (
    <div className="w-full h-full bg-gray-950 border-l border-gray-800 flex flex-col overflow-hidden relative font-sans">
      
      {/* 1. Header Area */}
      <div className="p-4 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex justify-between items-center mb-4">
            <h1 className="text-lg font-bold text-white flex items-center gap-2 tracking-tight">
              <Box className="w-5 h-5 text-blue-500 fill-blue-500/20" />
              Manifold PRO
            </h1>
            <div className="flex items-center gap-1">
               <div className="flex bg-gray-950 rounded border border-gray-800 mr-2">
                 {(['mm', 'cm', 'in'] as DisplayUnit[]).map((u) => (
                   <button
                     key={u}
                     onClick={() => setDisplayUnit(u)}
                     className={`px-2 py-1 text-[10px] font-bold uppercase transition-all ${
                       displayUnit === u
                         ? 'bg-gray-700 text-white'
                         : 'text-gray-600 hover:text-gray-400'
                     }`}
                   >
                     {u}
                   </button>
                 ))}
               </div>
               <button onClick={() => expandAll(false)} className="p-1.5 hover:bg-gray-800 rounded text-gray-500 hover:text-white" title="Collapse All">
                 <ChevronsUp className="w-4 h-4" />
               </button>
               <button onClick={() => expandAll(true)} className="p-1.5 hover:bg-gray-800 rounded text-gray-500 hover:text-white" title="Expand All">
                 <ChevronsDown className="w-4 h-4" />
               </button>
               <div className="w-px h-6 bg-gray-800 mx-1"></div>
               <button onClick={handleReset} className="p-1.5 hover:bg-red-900/30 rounded text-gray-500 hover:text-red-400" title="Reset">
                 <RotateCcw className="w-4 h-4" />
               </button>
            </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex p-1 bg-gray-950 rounded-lg border border-gray-800">
          {[
            { id: 'form', label: 'Form', icon: Box },
            { id: 'details', label: 'Details', icon: Sliders },
            { id: 'finish', label: 'Finish', icon: Package },
          ].map((tab) => (
             <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-md transition-all ${
                  activeTab === tab.id 
                    ? 'bg-gray-800 text-white shadow-sm ring-1 ring-white/10' 
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900'
                }`}
             >
                <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? 'text-blue-400' : ''}`} />
                {tab.label}
             </button>
          ))}
        </div>
      </div>

      {/* 2. Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
        
        {/* --- TAB: FORM --- */}
        {activeTab === 'form' && (
          <div className="space-y-1 animate-in fade-in slide-in-from-right-4 duration-300">
             
             {/* Mode Selector */}
             <div className="bg-gray-900 rounded-lg p-3 mb-4 border border-gray-800">
                <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">Object Type</label>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => update('mode', 'pot')}
                        className={`py-2 px-3 rounded text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                            params.mode === 'pot' ? 'bg-blue-600/20 border-blue-500 text-blue-100' : 'bg-gray-950 border-gray-800 text-gray-500 hover:bg-gray-800'
                        }`}
                    >
                        <Cylinder className="w-3 h-3" /> Pot
                    </button>
                    <button
                        onClick={() => update('mode', 'shade')}
                        className={`py-2 px-3 rounded text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                            params.mode === 'shade' ? 'bg-blue-600/20 border-blue-500 text-blue-100' : 'bg-gray-950 border-gray-800 text-gray-500 hover:bg-gray-800'
                        }`}
                    >
                        <Lightbulb className="w-3 h-3" /> Shade
                    </button>
                </div>
             </div>

             <AccordionSection 
                title="Base Geometry" 
                icon={<Cylinder className="w-4 h-4 text-green-400" />}
                isOpen={openSections['dimensions']}
                onToggle={() => toggleSection('dimensions')}
             >
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">Profile Curve</label>
                  <div className="grid grid-cols-5 gap-1">
                      {(['cone', 'standard', 'elliptic', 'bell', 'tulip', 'barrel', 'hourglass', 'trumpet', 'ogee', 'vase', 'polygon'] as ShapeProfile[]).map((p) => (
                          <button
                              key={p}
                              onClick={() => applyProfile(p)}
                              className={`py-1.5 text-[10px] font-bold uppercase rounded border transition-all ${
                                  params.profile === p
                                      ? 'bg-gray-700 border-gray-600 text-white'
                                      : 'bg-gray-900 border-gray-800 text-gray-600 hover:text-gray-400'
                              }`}
                          >
                              {p.length <= 5 ? p : p.slice(0,4)}
                          </button>
                      ))}
                  </div>
                  {params.profile === 'polygon' && (
                    <div className="mt-2">
                      <DualInput label="Sides" value={params.polygonSides} min={3} max={12} step={1} onChange={(v) => update('polygonSides', Math.round(v))} />
                    </div>
                  )}
                </div>

                <DualInput label="Height" value={params.height} min={5} max={60} onChange={(v) => update('height', v)} unit="cm" displayUnit={displayUnit} />
                <DualInput label="Top Radius" value={params.radiusTop} min={2} max={30} onChange={(v) => update('radiusTop', v)} unit="cm" displayUnit={displayUnit} />
                <DualInput label="Bottom Radius" value={params.radiusBottom} min={2} max={30} onChange={(v) => update('radiusBottom', v)} unit="cm" displayUnit={displayUnit} />
                {(() => {
                  const wallAngle = Math.atan2(Math.abs(params.radiusTop - params.radiusBottom), params.height) * (180 / Math.PI);
                  return wallAngle > 30 ? (
                    <p className="text-[10px] text-amber-400 mt-1">
                      Wall taper is {wallAngle.toFixed(0)}° — exceeds 30° FDM overhang limit
                    </p>
                  ) : null;
                })()}
             </AccordionSection>

             <AccordionSection
                title="Construction"
                icon={<Spline className="w-4 h-4 text-purple-400" />}
                isOpen={openSections['shape']}
                onToggle={() => toggleSection('shape')}
             >
                <DualInput label="Wall Thickness" value={params.thickness} min={0.2} max={2.0} step={0.05} onChange={(v) => update('thickness', v)} unit="cm" displayUnit={displayUnit} />
                <DualInput
                  label="Top Rim Bevel" value={params.rimAngle} min={-45} max={45} step={1}
                  onChange={(v) => update('rimAngle', v)} unit="deg"
                  warning={Math.abs(params.rimAngle) > 30 ? `${Math.abs(params.rimAngle)}° exceeds 30° FDM overhang limit` : undefined}
                />

                {params.mode === 'pot' && (
                  <>
                    <div className="h-px bg-gray-800 my-4" />
                    <DualInput label="Floor Thickness" value={params.potFloorThickness} min={0.4} max={2.0} step={0.1} onChange={(v) => update('potFloorThickness', v)} unit="cm" displayUnit={displayUnit} />
                    <DualInput label="Drain Hole" value={params.drainageHoleSize} min={0} max={6} step={0.1} onChange={(v) => update('drainageHoleSize', v)} unit="cm" displayUnit={displayUnit} />
                    <DualInput label="Bottom Lift" value={params.bottomLift} min={0} max={3} step={0.1} onChange={(v) => update('bottomLift', v)} unit="cm" displayUnit={displayUnit} />
                    {params.bottomLift > 0.01 && (() => {
                      const holeR = Math.max(0, params.drainageHoleSize / 2);
                      const floorR = params.radiusBottom - params.thickness;
                      const naiveAngle = Math.atan2(params.bottomLift, floorR - holeR) * (180 / Math.PI);
                      return naiveAngle < 35 ? (
                        <p className="text-[10px] text-gray-400 mt-1">
                          Floor auto-corrected to 35° (naive {naiveAngle.toFixed(0)}° too shallow)
                        </p>
                      ) : (
                        <p className="text-[10px] text-green-500/70 mt-1">
                          Floor angle: {naiveAngle.toFixed(0)}°
                        </p>
                      );
                    })()}
                  </>
                )}
             </AccordionSection>
          </div>
        )}

        {/* --- TAB: DETAILS --- */}
        {activeTab === 'details' && (
           <div className="space-y-1 animate-in fade-in slide-in-from-right-4 duration-300">
              
              <AccordionSection
                title="Global Modifiers"
                icon={<Wand2 className="w-4 h-4 text-pink-400" />}
                isOpen={openSections['global'] ?? true}
                onToggle={() => toggleSection('global')}
              >
                  <DualInput label="Curvature (Bulge)" value={params.curvature} min={-6} max={6} step={0.1} onChange={(v) => update('curvature', v)} />
                  <DualInput label="Curve Height (Waist)" value={params.curveBias} min={0.1} max={0.9} step={0.05} onChange={(v) => update('curveBias', v)} />
                  <DualInput label="Twist" value={params.twist} min={-180} max={180} step={5} onChange={(v) => update('twist', v)} unit="deg" />
                  
                  <div className="mt-4 pt-4 border-t border-gray-800">
                    <DualInput label="Base Flare Width" value={params.baseFlareWidth} min={0} max={8} step={0.1} onChange={(v) => update('baseFlareWidth', v)} unit="cm" displayUnit={displayUnit} />
                    <DualInput label="Base Flare Height" value={params.baseFlareHeight} min={0} max={params.height * 0.5} step={0.1} onChange={(v) => update('baseFlareHeight', v)} unit="cm" displayUnit={displayUnit} />
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-800">
                    <DualInput
                      label="Top Flare Width" value={params.topFlareWidth} min={0} max={8} step={0.1}
                      onChange={(v) => update('topFlareWidth', v)} unit="cm" displayUnit={displayUnit}
                      warning={params.topFlareWidth > 0 && params.topFlareHeight > 0 &&
                        params.topFlareWidth > (Math.tan(Math.PI / 6) * params.topFlareHeight / 2)
                        ? `Clamped to ${(Math.tan(Math.PI / 6) * params.topFlareHeight / 2 * UNIT_FACTORS[displayUnit]).toFixed(1)} ${displayUnit} (30° limit)`
                        : undefined}
                    />
                    <DualInput label="Top Flare Height" value={params.topFlareHeight} min={0} max={params.height * 0.5} step={0.1} onChange={(v) => update('topFlareHeight', v)} unit="cm" displayUnit={displayUnit} />
                  </div>
              </AccordionSection>

              <AccordionSection
                title="Surface Texture"
                icon={<Waves className="w-4 h-4 text-cyan-400" />}
                isOpen={openSections['surface']}
                onToggle={() => toggleSection('surface')}
              >
                  <div className="mb-4">
                     <p className="text-[10px] uppercase text-gray-500 font-bold mb-2">Vertical Ribs</p>
                     <DualInput label="Count" value={params.ribCount} min={0} max={48} step={1} onChange={(v) => update('ribCount', v)} />
                     <DualInput label="Depth" value={params.ribAmplitude} min={0} max={2.0} step={0.1} onChange={(v) => update('ribAmplitude', v)} unit="cm" displayUnit={displayUnit} />
                  </div>
                  <div className="pt-2 border-t border-gray-800">
                     <p className="text-[10px] uppercase text-gray-500 font-bold mb-2 mt-2">Horizontal Ripples</p>
                     <DualInput label="Amplitude" value={params.rippleAmplitude} min={0} max={1.0} step={0.05} onChange={(v) => update('rippleAmplitude', v)} unit="cm" displayUnit={displayUnit} />
                     <DualInput label="Frequency" value={params.rippleFrequency} min={1} max={40} step={1} onChange={(v) => update('rippleFrequency', v)} />
                     {params.rippleAmplitude > 0 && params.rippleFrequency > 0 && (() => {
                        const maxAmp = Math.tan(35 * Math.PI / 180) * params.height / (params.rippleFrequency * 2 * Math.PI);
                        return params.rippleAmplitude > maxAmp ? (
                           <p className="text-[10px] text-amber-400 mt-1">
                              Clamped to {(maxAmp * (displayUnit === 'mm' ? 10 : displayUnit === 'in' ? 1/2.54 : 1)).toFixed(2)}{displayUnit} (35deg overhang limit)
                           </p>
                        ) : null;
                     })()}
                     <DualInput label="Steps (Terrace)" value={params.stepCount} min={0} max={30} step={1} onChange={(v) => update('stepCount', v)} />
                  </div>
              </AccordionSection>

              <AccordionSection
                title="Skin Pattern"
                icon={<Hexagon className="w-4 h-4 text-emerald-400" />}
                isOpen={openSections['skinPattern']}
                onToggle={() => toggleSection('skinPattern')}
              >
                  <div className="mb-4">
                     <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">Pattern</label>
                     <div className="grid grid-cols-4 gap-1">
                        {([
                          ['none', 'Off'],
                          ['kumiko', 'Kumiko'],
                          ['diamond', 'Diam'],
                          ['seigaiha', 'Seig'],
                          ['shippo', 'Ship'],
                          ['yagasuri', 'Yaga'],
                        ] as [string, string][]).map(([id, label]) => {
                            const isKumikoSelected = params.skinPattern.startsWith('kumiko-');
                            const isActive = id === 'kumiko'
                              ? isKumikoSelected
                              : params.skinPattern === id;
                            return (
                              <button
                                  key={id}
                                  onClick={() => {
                                    if (id === 'kumiko') {
                                      // Default to asanoha when selecting kumiko
                                      update('skinPattern', 'kumiko-asanoha');
                                      update('skinMode', 'pierced');
                                      // Kumiko needs higher smoothing for clean lattice edges
                                      if (params.skinSmoothing < 4) {
                                        update('skinSmoothing', 4);
                                      }
                                    } else {
                                      update('skinPattern', id as SkinPatternType);
                                    }
                                  }}
                                  className={`py-1.5 text-[10px] font-bold uppercase rounded border transition-all ${
                                      isActive
                                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-100'
                                          : 'bg-gray-900 border-gray-800 text-gray-600 hover:text-gray-400'
                                  }`}
                              >
                                  {label}
                              </button>
                            );
                        })}
                     </div>
                  </div>

                  {/* Kumiko Sub-patterns */}
                  {params.skinPattern.startsWith('kumiko-') && (
                    <div className="mb-4 pl-2 border-l-2 border-emerald-500/30">
                       <label className="text-[10px] font-semibold text-gray-500 uppercase mb-2 block">Kumiko Style</label>
                       <div className="grid grid-cols-2 gap-1">
                          {([
                            ['kumiko-asanoha', 'Asanoha', 'Hemp Leaf'],
                            ['kumiko-kikkou', 'Kikkou', 'Tortoise Shell'],
                          ] as [SkinPatternType, string, string][]).map(([id, label, desc]) => (
                              <button
                                  key={id}
                                  onClick={() => update('skinPattern', id)}
                                  className={`py-2 px-2 text-left rounded border transition-all ${
                                      params.skinPattern === id
                                          ? 'bg-emerald-600/20 border-emerald-500 text-emerald-100'
                                          : 'bg-gray-900 border-gray-800 text-gray-600 hover:text-gray-400'
                                  }`}
                              >
                                  <span className="text-[10px] font-bold uppercase block">{label}</span>
                                  <span className="text-[9px] text-gray-500">{desc}</span>
                              </button>
                          ))}
                       </div>
                       <button
                         onClick={onRefresh}
                         className="w-full mt-2 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] font-bold rounded border border-gray-700 flex items-center justify-center gap-1.5 transition-all"
                       >
                         <RefreshCw className="w-3 h-3" /> Rebuild Shape
                       </button>
                    </div>
                  )}

                  {params.skinPattern !== 'none' && (
                    <>
                      <div className="mb-4">
                         <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">Mode</label>
                         <div className="grid grid-cols-3 gap-1">
                            {([
                              ['embossed', 'Emboss'],
                              ['carved', 'Carved'],
                              ['pierced', 'Pierce'],
                            ] as [SkinPatternMode, string][]).map(([id, label]) => (
                                <button
                                    key={id}
                                    onClick={() => update('skinMode', id)}
                                    className={`py-1.5 text-[10px] font-bold uppercase rounded border transition-all ${
                                        params.skinMode === id
                                            ? 'bg-gray-700 border-gray-600 text-white'
                                            : 'bg-gray-900 border-gray-800 text-gray-600 hover:text-gray-400'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                         </div>
                      </div>

                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-semibold text-gray-400 uppercase">Invert Pattern</span>
                        <button
                          onClick={() => update('skinInvert', !params.skinInvert)}
                          className={`w-9 h-5 rounded-full transition-colors relative ${
                            params.skinInvert ? 'bg-emerald-600' : 'bg-gray-700'
                          }`}
                        >
                          <span className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${
                            params.skinInvert ? 'left-5' : 'left-1'
                          }`} />
                        </button>
                      </div>

                      <DualInput label="Tile Size" value={params.skinScale} min={0.5} max={6.0} step={0.1} onChange={(v) => update('skinScale', v)} unit="cm" displayUnit={displayUnit} />
                      {(() => {
                        // FDM constraint: Kumiko voids need min 2mm holes
                        const isKumiko = params.skinPattern.startsWith('kumiko-');
                        if (!isKumiko) return null;
                        const voidFraction = 1 - params.skinLineWidth;
                        const minScale = voidFraction > 0.1 ? 0.2 / voidFraction : 0.5;
                        return params.skinScale < minScale ? (
                          <p className="text-[10px] text-amber-400 mt-1">
                            Scale auto-boosted to {(minScale * 10).toFixed(0)}mm for printable 2mm holes
                          </p>
                        ) : null;
                      })()}
                      <DualInput label="Depth" value={params.skinDepth} min={0.05} max={0.5} step={0.01} onChange={(v) => update('skinDepth', v)} unit="cm" displayUnit={displayUnit} />
                      {(() => {
                        // FDM constraint: min emboss 0.5mm, min carve 0.4mm
                        const minDepth = params.skinMode === 'embossed' ? 0.05 : params.skinMode === 'carved' ? 0.04 : 0;
                        return params.skinDepth < minDepth && params.skinMode !== 'pierced' ? (
                          <p className="text-[10px] text-amber-400 mt-1">
                            Depth auto-boosted to {(minDepth * 10).toFixed(1)}mm for FDM visibility
                          </p>
                        ) : null;
                      })()}
                      <DualInput label="Line Width" value={params.skinLineWidth * 100} min={10} max={60} step={1} onChange={(v) => update('skinLineWidth', v / 100)} unit="%" />
                      {(() => {
                        // FDM constraint: Kumiko needs 0.8mm walls, others need 0.6mm
                        const isKumiko = params.skinPattern.startsWith('kumiko-');
                        const minThickness = isKumiko ? 0.08 : 0.06;
                        const physicalLW = params.skinScale * params.skinLineWidth;
                        const minLWPercent = (minThickness / params.skinScale) * 100;
                        return physicalLW < minThickness ? (
                          <p className="text-[10px] text-amber-400 mt-1">
                            Line width auto-boosted to {minLWPercent.toFixed(0)}% ({(minThickness * 10).toFixed(1)}mm min{isKumiko ? ' for Kumiko' : ''})
                          </p>
                        ) : null;
                      })()}
                      <DualInput label="Rotation" value={params.skinRotation} min={0} max={90} step={1} onChange={(v) => update('skinRotation', v)} unit="deg" />
                      <DualInput label="Connection Width" value={params.skinConnectionWidth} min={0.08} max={0.5} step={0.01} onChange={(v) => update('skinConnectionWidth', v)} unit="cm" displayUnit={displayUnit} />
                      {(() => {
                        const physicalLW = params.skinScale * params.skinLineWidth;
                        const connW = params.skinConnectionWidth;
                        return physicalLW < connW ? (
                          <p className="text-[10px] text-gray-400 mt-1">
                            Line width boosted to {(connW * 10).toFixed(1)}mm to maintain connections
                          </p>
                        ) : null;
                      })()}

                      <DualInput
                        label="Smoothing"
                        value={params.skinSmoothing}
                        min={params.skinPattern.startsWith('kumiko-') ? 4 : 1}
                        max={20}
                        step={0.5}
                        onChange={(v) => update('skinSmoothing', v)}
                      />
                      {params.skinPattern.startsWith('kumiko-') && params.skinSmoothing < 4 && (
                        <p className="text-[10px] text-emerald-400 mt-1">
                          Kumiko minimum smoothing: 4 (for clean lattice edges)
                        </p>
                      )}
                      {params.skinSmoothing >= 6 && (
                        <p className="text-[10px] text-amber-400 mt-1">
                          High smoothing — may be slow on complex designs
                        </p>
                      )}

                      {params.skinMode === 'pierced' && (
                        <p className="text-[10px] text-gray-500 mt-2">
                          Pierce auto-suppressed on surfaces steeper than 35°
                        </p>
                      )}
                    </>
                  )}
              </AccordionSection>

              {params.mode === 'pot' && (
                 <AccordionSection
                    title="Saucer Base"
                    icon={<Layers className="w-4 h-4 text-orange-400" />}
                    isOpen={openSections['saucer']}
                    onToggle={() => toggleSection('saucer')}
                 >
                     <button
                        onClick={handleAutoFitSaucer}
                        className="w-full py-2 mb-4 bg-gray-800 hover:bg-gray-700 text-blue-400 text-xs font-bold rounded border border-gray-700 hover:border-blue-500/50 flex items-center justify-center gap-2 transition-all"
                    >
                        <Wand2 className="w-3 h-3" /> Auto-Fit Geometry
                    </button>
                    <DualInput label="Saucer Height" value={params.saucerHeight} min={1} max={8} onChange={(v) => update('saucerHeight', v)} unit="cm" displayUnit={displayUnit} />
                    <DualInput label="Gap (Tolerance)" value={params.saucerGap} min={0.1} max={1.5} step={0.05} onChange={(v) => update('saucerGap', v)} unit="cm" displayUnit={displayUnit} />
                    <DualInput label="Wall Thickness" value={params.saucerWallThickness} min={0.2} max={2.0} step={0.05} onChange={(v) => update('saucerWallThickness', v)} unit="cm" displayUnit={displayUnit} />
                    <DualInput label="Floor Thickness" value={params.saucerBaseThickness} min={0.2} max={2.0} step={0.05} onChange={(v) => update('saucerBaseThickness', v)} unit="cm" displayUnit={displayUnit} />
                    <DualInput
                      label="Flare Angle" value={params.saucerSlope} min={0} max={45} step={1}
                      onChange={(v) => update('saucerSlope', v)} unit="deg"
                      warning={params.saucerSlope > 30 ? `${params.saucerSlope}° exceeds 30° FDM overhang limit` : undefined}
                    />
                    <DualInput label="Explode Distance" value={params.saucerSeparation} min={0} max={10} step={0.5} onChange={(v) => update('saucerSeparation', v)} unit="cm" displayUnit={displayUnit} />
                 </AccordionSection>
              )}

              {params.mode === 'shade' && (
                 <AccordionSection
                    title="Suspension Hub"
                    icon={<Lightbulb className="w-4 h-4 text-yellow-400" />}
                    isOpen={openSections['suspension']}
                    onToggle={() => toggleSection('suspension')}
                 >
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs text-gray-400">Enable Hub</span>
                      <button
                        onClick={() => update('enableSuspension', !params.enableSuspension)}
                        className={`w-10 h-5 rounded-full transition-colors ${params.enableSuspension ? 'bg-blue-600' : 'bg-gray-700'}`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${params.enableSuspension ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>

                    {params.enableSuspension && (
                      <>
                        {/* Socket Presets */}
                        <div className="mb-4">
                          <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">Socket Preset</label>
                          <div className="grid grid-cols-3 gap-1">
                            {([
                              ['none', 'None', 0, 0],
                              ['e26', 'E26', 3.3, 1.5],
                              ['e27', 'E27', 3.4, 1.5],
                            ] as [string, string, number, number][]).map(([id, label, holeDia, depth]) => {
                              const isActive = id === 'none'
                                ? (params.suspensionSocketDepth ?? 0) === 0
                                : params.suspensionHoleSize === holeDia && (params.suspensionSocketDepth ?? 0) === depth;
                              return (
                                <button
                                  key={id}
                                  onClick={() => {
                                    if (id === 'none') {
                                      setParams(prev => ({ ...prev, suspensionSocketDepth: 0 }));
                                    } else {
                                      setParams(prev => ({
                                        ...prev,
                                        suspensionHoleSize: holeDia,
                                        suspensionSocketDepth: depth,
                                        suspensionSocketChamferAngle: 30,
                                        suspensionSocketChamferDepth: 0.2,
                                      }));
                                    }
                                  }}
                                  className={`py-1.5 text-[10px] font-bold uppercase rounded border transition-all ${
                                    isActive
                                      ? 'bg-gray-700 border-gray-600 text-white'
                                      : 'bg-gray-900 border-gray-800 text-gray-600 hover:text-gray-400'
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[10px] text-gray-500 mt-1">
                            {(params.suspensionSocketDepth ?? 0) > 0 ? 'Socket tube grips bulb base' : 'No socket tube'}
                          </p>
                        </div>

                        <DualInput
                          label="Wall Attach Height"
                          value={params.suspensionHeight * 100}
                          min={10} max={95} step={5}
                          onChange={(v) => update('suspensionHeight', v / 100)}
                          unit="%"
                        />
                        <DualInput
                          label="Hole Diameter"
                          value={params.suspensionHoleSize}
                          min={2.5} max={15} step={0.1}
                          onChange={(v) => update('suspensionHoleSize', v)}
                          unit="cm" displayUnit={displayUnit}
                        />
                        {(params.suspensionSocketDepth ?? 0) > 0 && (
                          <>
                            <DualInput
                              label="Socket Depth"
                              value={params.suspensionSocketDepth}
                              min={0} max={10} step={0.1}
                              onChange={(v) => update('suspensionSocketDepth', v)}
                              unit="cm" displayUnit={displayUnit}
                            />
                            <DualInput
                              label="Socket Wall"
                              value={params.suspensionSocketWall}
                              min={0.2} max={1.0} step={0.05}
                              onChange={(v) => update('suspensionSocketWall', v)}
                              unit="cm" displayUnit={displayUnit}
                            />
                            <DualInput
                              label="Socket Chamfer"
                              value={params.suspensionSocketChamferAngle}
                              min={0} max={60} step={5}
                              onChange={(v) => update('suspensionSocketChamferAngle', v)}
                              unit="deg"
                            />
                            {params.suspensionSocketChamferAngle > 0 && (
                              <DualInput
                                label="Chamfer Depth"
                                value={params.suspensionSocketChamferDepth}
                                min={0} max={2.0} step={0.05}
                                onChange={(v) => update('suspensionSocketChamferDepth', v)}
                                unit="cm" displayUnit={displayUnit}
                              />
                            )}
                          </>
                        )}
                        <DualInput
                          label="Hub Width"
                          value={params.suspensionRimWidth}
                          min={0.5} max={3} step={0.1}
                          onChange={(v) => update('suspensionRimWidth', v)}
                          unit="cm" displayUnit={displayUnit}
                        />
                        <DualInput
                          label="Thickness"
                          value={params.suspensionThickness}
                          min={0.2} max={1} step={0.05}
                          onChange={(v) => update('suspensionThickness', v)}
                          unit="cm" displayUnit={displayUnit}
                        />
                        <DualInput
                          label="Spoke Count"
                          value={params.suspensionRibCount}
                          min={2} max={8} step={1}
                          onChange={(v) => update('suspensionRibCount', v)}
                        />
                        <DualInput
                          label="Spoke Width"
                          value={params.suspensionRibWidth}
                          min={5} max={80} step={1}
                          onChange={(v) => update('suspensionRibWidth', v)}
                          unit="mm"
                        />
                        <DualInput
                          label="Wall Attach Width"
                          value={params.suspensionWallWidth}
                          min={3} max={120} step={1}
                          onChange={(v) => update('suspensionWallWidth', v)}
                          unit="mm"
                        />
                        {params.suspensionWallWidth > params.suspensionRibWidth * 2 && (
                          <p className="text-[10px] text-gray-500 mt-1">
                            Wide tip + spoke cutout creates petal shapes
                          </p>
                        )}
                        <DualInput
                          label="Spoke Angle"
                          value={params.suspensionAngle}
                          min={45} max={80} step={1}
                          onChange={(v) => update('suspensionAngle', v)}
                          unit="deg"
                        />
                        {(() => {
                          // Show where hub ring ends up (computed from wall attach + spoke angle)
                          const holeR = params.suspensionHoleSize / 2;
                          const hubOuterR = holeR + params.suspensionRimWidth;
                          const avgWallR = ((params.radiusTop + params.radiusBottom) / 2) - params.thickness;
                          const radialTravel = Math.max(0, avgWallR - hubOuterR);
                          const tanA = Math.tan(Math.max(45, params.suspensionAngle) * Math.PI / 180);
                          const wallY = params.height * params.suspensionHeight;
                          const sSign = params.suspensionFlipped ? 1 : -1;
                          const hubY = wallY - sSign * radialTravel * tanA;
                          const hubPct = Math.max(0, Math.min(100, (hubY / params.height) * 100));
                          return (
                            <p className="text-[10px] text-gray-500 mt-1">
                              Hub ring at ~{hubPct.toFixed(0)}% height ({hubY.toFixed(1)}{displayUnit === 'mm' ? '0mm' : 'cm'})
                            </p>
                          );
                        })()}
                        <DualInput
                          label="Arch Depth"
                          value={params.suspensionArchPower * 100}
                          min={0} max={100} step={5}
                          onChange={(v) => update('suspensionArchPower', v / 100)}
                          unit="%"
                        />
                        <DualInput
                          label="Spoke Cutout"
                          value={params.spokeHollow * 100}
                          min={0} max={90} step={5}
                          onChange={(v) => update('spokeHollow', v / 100)}
                          unit="%"
                        />
                        {params.spokeHollow > 0 && (
                          <p className="text-[10px] text-gray-500 mt-1">
                            Elliptical opening in spoke center for light pass-through
                          </p>
                        )}
                        <div className="flex items-center justify-between py-1">
                          <span className="text-xs text-gray-400">Flip Direction</span>
                          <button
                            onClick={() => {
                              // Mirror height so the geometry inverts properly
                              setParams(prev => ({
                                ...prev,
                                suspensionFlipped: !prev.suspensionFlipped,
                                suspensionHeight: Math.max(0.05, Math.min(0.95, 1 - prev.suspensionHeight)),
                              }));
                            }}
                            className={`px-2 py-0.5 text-xs rounded ${
                              params.suspensionFlipped
                                ? 'bg-blue-500/30 text-blue-300'
                                : 'bg-gray-700 text-gray-400'
                            }`}
                          >
                            {params.suspensionFlipped ? 'Top → Down' : 'Bottom → Up'}
                          </button>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1">
                          {params.suspensionFlipped
                            ? 'Spokes go DOWN from hub (print upside-down)'
                            : 'Spokes go UP to hub (normal printing)'}
                        </p>
                        <button
                          onClick={() => {
                            // Force recalculation by toggling a tiny change
                            const current = params.suspensionThickness;
                            update('suspensionThickness', current + 0.001);
                            setTimeout(() => update('suspensionThickness', current), 50);
                          }}
                          className="mt-2 w-full px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
                        >
                          ⟳ Recalculate Hub
                        </button>
                      </>
                    )}
                 </AccordionSection>
              )}
           </div>
        )}

        {/* --- TAB: FINISH --- */}
        {activeTab === 'finish' && (
            <div className="space-y-1 animate-in fade-in slide-in-from-right-4 duration-300">
               <div className="p-4 bg-gray-900 rounded-lg border border-gray-800 mb-4">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                      <Palette className="w-4 h-4 text-purple-400" /> Aesthetics
                  </h3>
                  
                  <div className="mb-4">
                     <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">Preview Color</label>
                     <div className="flex gap-2 flex-wrap">
                        {['#d2b48c', '#e2e8f0', '#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#ec4899', '#6366f1'].map(c => (
                            <button 
                                key={c}
                                onClick={() => update('color', c)}
                                className={`w-6 h-6 rounded-full border border-gray-600 ${params.color === c ? 'ring-2 ring-white scale-110' : 'hover:scale-110'}`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                        <input type="color" value={params.color} onChange={e => update('color', e.target.value)} className="w-6 h-6 opacity-0 absolute" />
                     </div>
                  </div>

                  <DualInput label="Mesh Resolution" value={params.radialSegments} min={32} max={360} step={16} onChange={(v) => update('radialSegments', v)} />
               </div>
               
               <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                     <Camera className="w-4 h-4 text-cyan-400" /> Product Image
                  </h3>
                  <button
                     onClick={onScreenshot}
                     className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg border border-gray-700 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  >
                     <Camera className="w-4 h-4" />
                     Save Image (PNG)
                  </button>
                  <p className="text-[10px] text-gray-500 mt-2">Captures the current 3D view as displayed</p>
               </div>

               <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                     <FileJson className="w-4 h-4 text-amber-400" /> Design Recipe
                  </h3>
                  <div className="flex gap-2">
                     <button
                        onClick={handleDownloadRecipe}
                        className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg border border-gray-700 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                     >
                        <Download className="w-4 h-4" />
                        Save
                     </button>
                     <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg border border-gray-700 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                     >
                        <Upload className="w-4 h-4" />
                        Load
                     </button>
                  </div>
                  <input
                     ref={fileInputRef}
                     type="file"
                     accept=".json"
                     onChange={handleUploadRecipe}
                     className="hidden"
                  />
                  <p className="text-[10px] text-gray-500 mt-2">Save or load all design parameters as a JSON recipe</p>
               </div>
            </div>
        )}

      </div>

      {/* 3. Footer Action Area */}
      <div className="p-4 border-t border-gray-800 bg-gray-950 z-30 flex-shrink-0">
         {activeTab === 'finish' || activeTab === 'form' ? (
             <div className="space-y-3">
                 <button
                    onClick={() => onExport(params.mode === 'pot' ? 'all' : 'body')}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                >
                    <Package className="w-5 h-5" />
                    {params.mode === 'pot' ? 'Export Full Set (STL)' : 'Export Shade (STL)'}
                </button>
                {params.mode === 'pot' && (
                    <div className="flex gap-2">
                        <button onClick={() => onExport('body')} className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-xs font-bold text-gray-300 rounded border border-gray-700">Only Pot</button>
                        <button onClick={() => onExport('saucer')} className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-xs font-bold text-gray-300 rounded border border-gray-700">Only Saucer</button>
                    </div>
                )}
             </div>
         ) : (
            <div className="text-center">
                 <button 
                   onClick={() => setActiveTab('finish')}
                   className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                 >
                    Next: Export <ChevronRight className="w-4 h-4" />
                 </button>
            </div>
         )}
      </div>
    </div>
  );
};