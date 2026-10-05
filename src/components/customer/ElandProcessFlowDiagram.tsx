import React, { useState } from 'react';
import {
  LogIn,
  FilePlus,
  DollarSign,
  Sliders,
  Ruler,
  Box,
  Eye,
  FileText,
  Headphones,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Clock,
  Target,
  Layers,
  ShieldCheck,
  Zap,
  HelpCircle,
  MessageSquare,
  BookOpen,
  Video,
  FileSpreadsheet,
  Cpu,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { CUSTOMER_HOME_PATH } from '../../app/shellRoutes';
import { CustomerPageHero } from './CustomerPageHero';

interface ElandProcessFlowDiagramProps {
  onSelectStep?: (stepNumber: number) => void;
  activeStep?: number;
}

export const ElandProcessFlowDiagram: React.FC<ElandProcessFlowDiagramProps> = ({
  onSelectStep,
  activeStep = 1,
}) => {
  const [selectedStepModal, setSelectedStepModal] = useState<number | null>(null);

  const steps = [
    {
      num: 1,
      title: 'SIGN IN',
      icon: LogIn,
      bgAccent: 'from-blue-600 to-indigo-700',
      description: 'ELAND logs in to Energya Connect',
      options: ['Secure JWT B2B Auth', 'Role-Based Dashboard', 'Customer Account Isolation'],
      systemOutput: {
        title: 'CR Summary',
        details: 'CR #, Version, Date, Customer, Status',
        badgeColor: 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border-blue-300',
      },
    },
    {
      num: 2,
      title: 'CREATE NEW CR / UPDATE CR',
      icon: FilePlus,
      bgAccent: 'from-indigo-600 to-purple-700',
      description: 'Generate or update Customer Requests',
      options: [
        '2.1 NEW CR: Generate Unique CR Number with version 0',
        '2.2 UPDATE EXISTING CR: Create new CR version # (V1 / V2 / V3)',
      ],
      systemOutput: {
        title: 'Commercial Variables Saved',
        details: 'Validated & Locked for Version Audit',
        badgeColor: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300',
      },
    },
    {
      num: 3,
      title: 'ENTER COMMERCIAL VARIABLES',
      icon: DollarSign,
      bgAccent: 'from-amber-500 to-accent-600',
      description: 'Set market rates & delivery terms',
      options: [
        '3.1 Currency Selection (USD, EUR, GBP, EGP, SAR)',
        '3.2 Copper (Cu) Rate ($/MT)',
        '3.3 Aluminum (Al) Rate ($/MT)',
        '3.4 Delivery Terms (Incoterms: FOB, CIF, EXW, DDP)',
      ],
      systemOutput: {
        title: 'Selected Cable Details',
        details: 'Type, Standard, Colors, PO Reference',
        badgeColor: 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300',
      },
    },
    {
      num: 4,
      title: 'START CHOOSING CABLE BY',
      icon: Sliders,
      bgAccent: 'from-purple-600 to-pink-600',
      description: 'Filter or import cable specifications',
      options: [
        '4.1 Type (LV, MV, HV, Control)',
        '4.2 Standard (BS, IEC, EN, BASEC)',
        '4.3 Core Colors (Standard / Custom)',
        '4.4 Order PO’s importing specific cables',
      ],
      systemOutput: {
        title: 'Cutting Length Details',
        details: 'Requested Length, Tolerances & Packaging',
        badgeColor: 'bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border-purple-300',
      },
    },
    {
      num: 5,
      title: 'CABLE CUTTING LENGTH',
      icon: Ruler,
      bgAccent: 'from-pink-600 to-rose-600',
      description: 'Define precise lengths per drum',
      options: ['Define required cutting length for the cable', 'Set total quantity in KM/M', 'Min/Max reel constraints'],
      systemOutput: {
        title: 'Drum Plan',
        details: 'No. of Drums, Capacity %, Packing Plan',
        badgeColor: 'bg-pink-100 dark:bg-pink-950 text-pink-800 dark:text-pink-300 border-pink-300',
      },
    },
    {
      num: 6,
      title: 'MANUAL OR AUTO DRUM SELECTION',
      icon: Box,
      bgAccent: 'from-cyan-600 to-teal-600',
      description: 'Optimize reel dimensions & weights',
      options: [
        '6.1 MANUAL SELECTION: System popup with drum capacity % (e.g. 75%)',
        '6.2 AUTOMATIC OPTIMIZATION: System calculates best drum based on length',
      ],
      systemOutput: {
        title: 'Cable Construction Preview',
        details: 'Layers, Materials, Reel Gross/Net Weight',
        badgeColor: 'bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 border-cyan-300',
      },
    },
    {
      num: 7,
      title: 'PREVIEW CABLE CONSTRUCTION',
      icon: Eye,
      bgAccent: 'from-blue-500 to-cyan-600',
      description: 'Visual cross-section inspection',
      options: [
        '7.1 Popup window per cable showing construction + colors',
        '7.2 Cable Cross Section Visualization (2D Core layout)',
      ],
      systemOutput: {
        title: 'Cross Section Visualization',
        details: 'Core Layout, Dimensions, Insulation Layers',
        badgeColor: 'bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border-teal-300',
      },
    },
    {
      num: 8,
      title: 'GENERATE CR AUTOMATIC OFFER',
      icon: FileText,
      bgAccent: 'from-emerald-600 to-green-700',
      description: 'Instant commercial & technical quote',
      options: [
        '8.1 Commercial Offer Generation (PDF Budgetary Price)',
        '8.2 Technical Offer (TDS PDF) Generation',
        'Internal Cost Formula Engine include scrap',
        'Pricing Rules Engine',
      ],
      systemOutput: {
        title: 'Commercial & Technical Offer (PDF)',
        details: 'Budgetary Price, TDS PDF, Cost Breakdown (Material, Labor, Overheads, Scrap, Margin)',
        badgeColor: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300',
      },
    },
    {
      num: 9,
      title: 'HELP / ASSISTANCE',
      icon: Headphones,
      bgAccent: 'from-amber-600 to-accent-700',
      description: '24/7 Dedicated Energya support',
      options: ['Live Chat', 'Knowledge Base', 'User Guide', 'Video Tutorials', 'Contact Support'],
      systemOutput: {
        title: 'Supported',
        details: 'Energya team is always available',
        badgeColor: 'bg-accent-100 dark:bg-brand-900 text-accent-700 dark:text-accent-300 border-accent-300',
      },
    },
  ];

  const benefits = [
    {
      icon: Zap,
      title: 'Fast & Efficient',
      desc: 'Quick request creation and instant results',
      color: 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900',
    },
    {
      icon: Target,
      title: 'Accurate',
      desc: 'System calculations ensure accuracy',
      color: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
    },
    {
      icon: Cpu,
      title: 'Optimized',
      desc: 'Best drum & cutting plan with minimal waste',
      color: 'bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900',
    },
    {
      icon: DollarSign,
      title: 'Transparent',
      desc: 'Clear technical & commercial offers',
      color: 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900',
    },
    {
      icon: ShieldCheck,
      title: 'Traceable',
      desc: 'All offers are linked to unique CR #',
      color: 'bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-900',
    },
    {
      icon: Headphones,
      title: 'Supported',
      desc: 'Energya team is always available',
      color: 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900',
    },
  ];

  return (
    <div className="space-y-6">
      <CustomerPageHero
        breadcrumbs={[{ label: 'Home', to: CUSTOMER_HOME_PATH }, { label: 'Process' }]}
        title="Process"
        subtitle="From inquiry to technical and commercial offer."
      />
    <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-2xl border border-slate-800 space-y-6 overflow-hidden">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-r from-red-600 to-blue-700 p-2.5 rounded-2xl shadow-lg border border-white/20 flex items-center space-x-2">
            <span className="font-extrabold text-sm tracking-tight text-white">energya</span>
            <span className="text-[10px] bg-red-600 px-1.5 py-0.5 rounded font-bold uppercase text-white">Cables</span>
          </div>
          <span className="text-slate-500 font-bold text-xl">×</span>
          <div className="bg-accent-600 text-white font-extrabold px-3 py-1.5 rounded-xl text-xs uppercase tracking-wider shadow-lg">
            ELAND CABLES
          </div>
        </div>

        <div className="text-center md:text-left flex-1 md:ml-4">
          <h2 className="text-xl md:text-2xl font-black text-white tracking-tight uppercase flex items-center justify-center md:justify-start gap-2">
            <span>ELAND CABLES – ENERGYA CONNECT PROCESS FLOW</span>
            <Sparkles className="h-5 w-5 text-amber-400 animate-pulse" />
          </h2>
          <p className="text-xs md:text-sm font-semibold text-amber-400 mt-0.5 tracking-wide">
            VIP Customer Journey – From Inquiry to Technical & Commercial Offer
          </p>
        </div>

        <div className="flex items-center space-x-2 bg-slate-800/90 border border-slate-700 px-3 py-1.5 rounded-full text-xs font-bold text-emerald-400">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          <span>Live Digital Engine</span>
        </div>
      </div>

      {/* PROCESS FLOW 9-STEP HORIZONTAL SCROLL GRID */}
      <div className="overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-700">
        <div className="min-w-[1300px] grid grid-cols-9 gap-3">
          {steps.map((step) => {
            const Icon = step.icon;
            const isSelected = activeStep === step.num;

            return (
              <div key={step.num} className="flex flex-col space-y-3">
                {/* STEP CARD */}
                <button
                  onClick={() => {
                    setSelectedStepModal(step.num);
                    if (onSelectStep) onSelectStep(step.num);
                  }}
                  className={`relative text-left bg-slate-800/90 hover:bg-slate-800 rounded-2xl p-3 border transition-all flex flex-col justify-between h-[230px] shadow-lg group cursor-pointer ${
                    isSelected
                      ? 'border-brand-300 ring-2 ring-brand-300/40 shadow-brand-500/10'
                      : 'border-slate-700/80 hover:border-slate-500'
                  }`}
                >
                  {/* STEP NUMBER BADGE */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="w-7 h-7 rounded-full bg-slate-950 border border-slate-700 text-amber-400 font-black text-xs flex items-center justify-center shadow-inner">
                      {step.num}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-amber-300 transition-colors">
                      Step {step.num}
                    </span>
                  </div>

                  {/* STEP ICON & TITLE */}
                  <div>
                    <div
                      className={`w-9 h-9 rounded-xl bg-gradient-to-br ${step.bgAccent} text-white flex items-center justify-center shadow-md mb-2 group-hover:scale-110 transition-transform`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <h3 className="text-[11px] font-extrabold text-white leading-tight mb-1.5 uppercase tracking-wide group-hover:text-amber-300">
                      {step.title}
                    </h3>
                  </div>

                  {/* OPTIONS / BULLETS */}
                  <div className="space-y-1 text-[9.5px] text-slate-300 font-medium overflow-hidden line-clamp-4">
                    {step.options.map((opt, i) => (
                      <div key={i} className="flex items-start space-x-1">
                        <span className="text-amber-400 font-bold shrink-0">•</span>
                        <span className="leading-tight">{opt}</span>
                      </div>
                    ))}
                  </div>

                  {/* CLICK TO VIEW FOOTER */}
                  <div className="pt-1.5 border-t border-slate-700/60 flex items-center justify-between text-[9px] font-bold text-slate-400 group-hover:text-white">
                    <span>Inspect Step</span>
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform text-amber-400" />
                  </div>
                </button>

                {/* CONNECTING ARROW DOWN */}
                <div className="flex justify-center text-slate-600">
                  <span className="text-xs font-mono font-bold animate-bounce">↓</span>
                </div>

                {/* SYSTEM OUTPUT CARD */}
                <div className="bg-slate-950/90 rounded-2xl p-2.5 border border-slate-800 h-[105px] flex flex-col justify-between">
                  <div className="flex items-center space-x-1 mb-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                      SYSTEM OUTPUT
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold text-amber-300 block leading-tight">
                      {step.systemOutput.title}
                    </span>
                    <p className="text-[9px] text-slate-400 mt-0.5 leading-snug">
                      {step.systemOutput.details}
                    </p>
                  </div>
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 self-start">
                    Verified Output
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* BENEFITS FOR ELAND BANNER */}
      <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 space-y-3">
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
          <div className="bg-amber-500/20 p-1.5 rounded-lg border border-amber-500/30">
            <Sparkles className="h-4 w-4 text-amber-400" />
          </div>
          <h3 className="text-sm font-black text-amber-400 uppercase tracking-wider">
            BENEFITS FOR ELAND CABLES
          </h3>
          <span className="text-xs text-slate-400 font-medium">
            (Custom Tailored B2B Engine Features)
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {benefits.map((b, idx) => {
            const BIcon = b.icon;
            return (
              <div
                key={idx}
                className="bg-slate-900/90 hover:bg-slate-800 p-2.5 rounded-xl border border-slate-800 hover:border-brand-500/50 transition-all flex flex-col justify-between"
              >
                <div className="flex items-center space-x-2 mb-1">
                  <div className={`p-1 rounded-lg border ${b.color}`}>
                    <BIcon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs font-bold text-white leading-tight">{b.title}</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">{b.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* FOOTER BAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 font-semibold pt-2 border-t border-slate-800 gap-2">
        <span className="text-amber-400 font-bold">
          ELAND CABLES – Your Success is Our Priority
        </span>
        <span className="text-slate-500 font-mono">
          Energya Connect – Powered by Innovation
        </span>
      </div>

      {/* STEP INSPECTOR MODAL */}
      {selectedStepModal !== null && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 text-white shadow-2xl relative space-y-4">
            <button
              onClick={() => setSelectedStepModal(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-1.5 rounded-full"
            >
              ✕
            </button>

            {(() => {
              const modalStep = steps.find((s) => s.num === selectedStepModal)!;
              const MIcon = modalStep.icon;

              return (
                <>
                  <div className="flex items-center space-x-3 border-b border-slate-800 pb-3">
                    <div className={`p-3 rounded-2xl bg-gradient-to-br ${modalStep.bgAccent} text-white`}>
                      <MIcon className="h-6 w-6" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                        STEP {modalStep.num} OF 9
                      </span>
                      <h3 className="text-lg font-black uppercase text-white leading-tight">
                        {modalStep.title}
                      </h3>
                      <p className="text-xs text-slate-400">{modalStep.description}</p>
                    </div>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="font-bold text-slate-300 uppercase tracking-wider block mb-1">
                        Key Features & Workflow Sub-Steps:
                      </span>
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5">
                        {modalStep.options.map((opt, idx) => (
                          <div key={idx} className="flex items-start space-x-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span className="text-slate-200 font-medium">{opt}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="font-bold text-slate-300 uppercase tracking-wider block mb-1">
                        System Output & Artifact:
                      </span>
                      <div className="bg-amber-950/40 border border-amber-500/40 p-3 rounded-xl space-y-1">
                        <span className="font-bold text-amber-300 text-sm block">
                          {modalStep.systemOutput.title}
                        </span>
                        <p className="text-slate-300 text-xs">
                          {modalStep.systemOutput.details}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end space-x-2">
                    <button
                      onClick={() => setSelectedStepModal(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold"
                    >
                      Close
                    </button>
                    {onSelectStep && (
                      <button
                        onClick={() => {
                          onSelectStep(modalStep.num);
                          setSelectedStepModal(null);
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-amber-500 to-accent-600 text-slate-950 font-black rounded-xl text-xs hover:brightness-110 flex items-center space-x-1"
                      >
                        <span>Jump to Step in Workspace</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
    </div>
  );
};
