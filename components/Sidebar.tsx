"use client";

import React, { useState } from 'react';
import { DesignParams, DEFAULT_PARAMS, ShapeProfile } from '../types';
import { 
  Download, Box, Layers, Palette, Cylinder, Package, Spline, 
  Waves, Tornado, Wand2, Eye, EyeOff, RotateCcw, 
  ChevronsUp, ChevronsDown, Settings2, Sliders, ChevronDown, ChevronRight, Lightbulb
} from 'lucide-react';

interface SidebarProps {
  params: DesignParams;
  setParams: React.Dispatch<React.SetStateAction<DesignParams>>;
  onExport: (type: 'body' | 'saucer' | 'all') => void;
}

// --- SUB-COMPONENTS ---

const DualInput: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  unit?: string;
}> = ({ label, value, min, max, step = 0.1, onChange, unit }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = parseFloat(e.target.value);
    if (isNaN(val)) return;
    // Clamp only for slider consistency, but allow typing slightly outside if really needed? 
    // Better to clamp to prevent breaking geometry
    val = Math.max(min, Math.min(max, val));
    onChange(val);
  };

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex justify-between items-center mb-1.5">
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</label>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-colors"
        />
        <div className="relative">
          <input 
            type="number" 
            value={Number(value).toFixed(step < 0.1 ? 2 : 1)} 
            onChange={handleChange}
            step={step}
            className="w-16 bg-gray-800 border border-gray-700 text-white text-xs font-mono py-1 px-1.5 rounded text-right focus:border-blue-500 focus:outline-none transition-colors"
          />
          {unit && <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 pointer-events-none opacity-0">{unit}</span>}
        </div>
      </div>
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

export const Sidebar: React.FC<SidebarProps> = ({ params, setParams, onExport }) => {
  const [activeTab, setActiveTab] = useState<Tab>('form');
  
  // Manage accordion states
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'dimensions': true,
    'shape': true,
    'surface': false,
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
            <div className="flex gap-1">
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
                  <div className="grid grid-cols-4 gap-1">
                      {(['standard', 'elliptic', 'bell', 'tulip'] as ShapeProfile[]).map((p) => (
                          <button
                              key={p}
                              onClick={() => update('profile', p)}
                              className={`py-1.5 text-[10px] font-bold uppercase rounded border transition-all ${
                                  params.profile === p
                                      ? 'bg-gray-700 border-gray-600 text-white'
                                      : 'bg-gray-900 border-gray-800 text-gray-600 hover:text-gray-400'
                              }`}
                          >
                              {p.slice(0,4)}
                          </button>
                      ))}
                  </div>
                </div>

                <DualInput label="Height" value={params.height} min={5} max={60} onChange={(v) => update('height', v)} unit="cm" />
                <DualInput label="Top Radius" value={params.radiusTop} min={2} max={30} onChange={(v) => update('radiusTop', v)} unit="cm" />
                <DualInput label="Bottom Radius" value={params.radiusBottom} min={2} max={30} onChange={(v) => update('radiusBottom', v)} unit="cm" />
             </AccordionSection>

             <AccordionSection
                title="Construction"
                icon={<Spline className="w-4 h-4 text-purple-400" />}
                isOpen={openSections['shape']}
                onToggle={() => toggleSection('shape')}
             >
                <DualInput label="Wall Thickness" value={params.thickness} min={0.2} max={2.0} step={0.05} onChange={(v) => update('thickness', v)} unit="cm" />
                <DualInput label="Top Rim Bevel" value={params.rimAngle} min={-45} max={45} step={1} onChange={(v) => update('rimAngle', v)} unit="deg" />
                
                {params.mode === 'pot' && (
                  <>
                    <div className="h-px bg-gray-800 my-4" />
                    <DualInput label="Floor Thickness" value={params.potFloorThickness} min={0.2} max={2.0} step={0.1} onChange={(v) => update('potFloorThickness', v)} unit="cm" />
                    <DualInput label="Drain Hole" value={params.drainageHoleSize} min={0} max={6} step={0.1} onChange={(v) => update('drainageHoleSize', v)} unit="cm" />
                    <DualInput label="Bottom Lift" value={params.bottomLift} min={0} max={3} step={0.1} onChange={(v) => update('bottomLift', v)} unit="cm" />
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
                isOpen={true}
                onToggle={() => {}} 
              >
                  <DualInput label="Curvature (Bulge)" value={params.curvature} min={-6} max={6} step={0.1} onChange={(v) => update('curvature', v)} />
                  <DualInput label="Curve Height (Waist)" value={params.curveBias} min={0.1} max={0.9} step={0.05} onChange={(v) => update('curveBias', v)} />
                  <DualInput label="Twist" value={params.twist} min={-180} max={180} step={5} onChange={(v) => update('twist', v)} unit="deg" />
                  
                  <div className="mt-4 pt-4 border-t border-gray-800">
                    <DualInput label="Base Flare Width" value={params.baseFlareWidth} min={0} max={8} step={0.1} onChange={(v) => update('baseFlareWidth', v)} unit="cm" />
                    <DualInput label="Base Flare Height" value={params.baseFlareHeight} min={0} max={params.height * 0.5} step={0.1} onChange={(v) => update('baseFlareHeight', v)} unit="cm" />
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
                     <DualInput label="Depth" value={params.ribAmplitude} min={0} max={2.0} step={0.1} onChange={(v) => update('ribAmplitude', v)} />
                  </div>
                  <div className="pt-2 border-t border-gray-800">
                     <p className="text-[10px] uppercase text-gray-500 font-bold mb-2 mt-2">Horizontal Ripples</p>
                     <DualInput label="Amplitude" value={params.rippleAmplitude} min={0} max={1.0} step={0.05} onChange={(v) => update('rippleAmplitude', v)} />
                     <DualInput label="Frequency" value={params.rippleFrequency} min={1} max={40} step={1} onChange={(v) => update('rippleFrequency', v)} />
                     <DualInput label="Steps (Terrace)" value={params.stepCount} min={0} max={30} step={1} onChange={(v) => update('stepCount', v)} />
                  </div>
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
                    <DualInput label="Saucer Height" value={params.saucerHeight} min={1} max={8} onChange={(v) => update('saucerHeight', v)} unit="cm" />
                    <DualInput label="Gap (Tolerance)" value={params.saucerGap} min={0.1} max={1.5} step={0.05} onChange={(v) => update('saucerGap', v)} unit="cm" />
                    <DualInput label="Flare Angle" value={params.saucerSlope} min={0} max={45} step={1} onChange={(v) => update('saucerSlope', v)} unit="deg" />
                 </AccordionSection>
              )}

              {params.mode === 'shade' && (
                 <AccordionSection
                    title="Suspension Hub"
                    icon={<Settings2 className="w-4 h-4 text-yellow-400" />}
                    isOpen={openSections['suspension']}
                    onToggle={() => toggleSection('suspension')}
                 >
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-semibold text-gray-400 uppercase">Enable Hardware</span>
                        <button
                            onClick={() => update('enableSuspension', !params.enableSuspension)}
                            className={`w-9 h-5 rounded-full transition-colors relative ${
                            params.enableSuspension ? 'bg-yellow-600' : 'bg-gray-700'
                            }`}
                        >
                            <span className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-transform ${
                            params.enableSuspension ? 'left-5' : 'left-1'
                            }`} />
                        </button>
                    </div>

                    {params.enableSuspension && (
                        <div className="space-y-4">
                            <DualInput label="Height Position" value={params.suspensionHeight * 100} min={5} max={95} step={1} onChange={(v) => update('suspensionHeight', v / 100)} unit="%" />
                            <DualInput label="Hole Diameter" value={params.suspensionHoleSize} min={2.5} max={5.0} step={0.1} onChange={(v) => update('suspensionHoleSize', v)} unit="cm" />
                            <div className="h-px bg-gray-800" />
                            <DualInput label="Spoke Count" value={params.suspensionRibCount} min={2} max={8} step={1} onChange={(v) => update('suspensionRibCount', v)} />
                            <DualInput label="Spoke Width" value={params.suspensionRibWidth} min={10} max={90} step={5} onChange={(v) => update('suspensionRibWidth', v)} unit="deg" />
                        </div>
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
               
               {params.mode === 'pot' && (
                 <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
                     <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-orange-400" /> Assembly View
                     </h3>
                     <DualInput label="Explode Distance" value={params.saucerSeparation} min={0} max={10} step={0.5} onChange={(v) => update('saucerSeparation', v)} unit="cm" />
                 </div>
               )}
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