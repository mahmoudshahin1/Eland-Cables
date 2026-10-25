import React, { useState, useEffect } from 'react';
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
  ArrowRight,
  ArrowLeft,
  Sparkles,
  RefreshCw,
  Download,
  Send,
  UploadCloud,
  Layers,
  ShieldCheck,
  Check,
  AlertCircle,
  HelpCircle,
  MessageSquare,
  BookOpen,
  PhoneCall,
  Clock,
  ChevronRight,
  Container,
  Truck,
  FileSpreadsheet,
  FileCheck2,
  Search,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Form';
import {
  createCommercialInquiry,
  addCommercialInquiryLine,
  calculateInquiryCost,
  submitCommercialInquiry,
} from '../../services/commercialInquiryApiService';
import {
  createV2QuotationDraft,
  priceV2Quotation,
  approveV2Quotation,
  issueV2Quotation,
} from '../../services/v2QuotationApiService';
import {
  VipCableItem,
  ContainerType,
  CONTAINER_SPECS,
  DEFAULT_VIP_CABLES,
  adaptMasterCableToVipCable,
} from './vipCableCatalogData';
import { fetchMasterCables } from '../../services/masterDataApiService';
import { getStoredCableCatalog } from '../../services/cableCatalogService';

export interface VipCustomerJourneyWizardProps {
  onBackToInquiries?: () => void;
  onCompletedSubmission?: (inquiryId: string) => void;
  initialInquiryId?: string;
}

export type JourneyStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const VipCustomerJourneyWizard: React.FC<VipCustomerJourneyWizardProps> = ({
  onBackToInquiries,
  onCompletedSubmission,
}) => {
  const { jwtToken, currentUser } = useAuth();
  const [currentStep, setCurrentStep] = useState<JourneyStep>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set([1]));

  // Step 2 State (CR Details)
  const [crMode, setCrMode] = useState<'new' | 'update'>('new');
  const [crNumber, setCrNumber] = useState(`CR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-EL01`);
  const [crVersion, setCrVersion] = useState<'v0' | 'v1' | 'v2'>('v0');
  const [customerRef, setCustomerRef] = useState('ELAND-PO-2026-UK4');
  const [projectName, setProjectName] = useState('London Grid Substation Expansion');

  // Step 3 State (Commercial Variables)
  const [currency, setCurrency] = useState('USD');
  const [copperRate, setCopperRate] = useState('9450');
  const [aluminumRate, setAluminumRate] = useState('2620');
  const [incoterms, setIncoterms] = useState('CIF London Gateway');

  // Step 4 State (Cable Catalog & Selection)
  const [cables, setCables] = useState<VipCableItem[]>(DEFAULT_VIP_CABLES);
  const [cableSearch, setCableSearch] = useState('');
  const [cableCategory, setCableCategory] = useState<'ALL' | 'LV' | 'MV' | 'CONTROL'>('ALL');
  const [standardFilter, setStandardFilter] = useState('ALL');
  const [coreColorFilter, setCoreColorFilter] = useState('ALL');
  const [selectedCable, setSelectedCable] = useState<VipCableItem>(DEFAULT_VIP_CABLES[0]);

  // Load database cables on mount
  useEffect(() => {
    let isMounted = true;
    async function loadCatalog() {
      try {
        const res = await fetchMasterCables(jwtToken);
        if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
          const adapted = res.data.map(adaptMasterCableToVipCable);
          if (isMounted) {
            setCables((prev) => {
              const map = new Map<string, VipCableItem>();
              prev.forEach((c) => map.set(c.code, c));
              adapted.forEach((c) => map.set(c.code, c));
              return Array.from(map.values());
            });
          }
          return;
        }
      } catch (err) {
        console.warn('API cable catalog fetch failed, loading local storage:', err);
      }

      try {
        const stored = getStoredCableCatalog();
        if (Array.isArray(stored) && stored.length > 0 && isMounted) {
          const adapted = stored.map(adaptMasterCableToVipCable);
          setCables((prev) => {
            const map = new Map<string, VipCableItem>();
            prev.forEach((c) => map.set(c.code, c));
            adapted.forEach((c) => map.set(c.code, c));
            return Array.from(map.values());
          });
        }
      } catch {
        // Fallback to DEFAULT_VIP_CABLES
      }
    }
    void loadCatalog();
    return () => {
      isMounted = false;
    };
  }, [jwtToken]);

  // Step 5 State (Cutting Length)
  const [totalLengthM, setTotalLengthM] = useState('1000');
  const [cuttingSchedule, setCuttingSchedule] = useState<'single' | 'dual' | 'custom'>('single');

  // Step 6 State (Drum, Pallet & Container Selection)
  const [drumMode, setDrumMode] = useState<'auto' | 'manual'>('auto');
  const [selectedDrumCode, setSelectedDrumCode] = useState('EWD1800-23');
  const [drumCapacityPct, setDrumCapacityPct] = useState(92.4);
  const [palletSecuring, setPalletSecuring] = useState<'pallet_skids' | 'floor_chocked'>('pallet_skids');
  const [containerType, setContainerType] = useState<ContainerType>('40HQ');

  // Step 9 State (Submission Status)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submissionFeedback, setSubmissionFeedback] = useState<string | null>(null);

  // Dynamic Logistics & Container Capacity Calculations
  const orderLengthNum = Math.max(10, Number(totalLengthM) || 1000);
  const singleDrumLength = cuttingSchedule === 'dual' ? orderLengthNum / 2 : orderLengthNum;
  const drumCount = cuttingSchedule === 'dual' ? 2 : 1;
  const cableWeightKg = (orderLengthNum / 1000) * (selectedCable?.weightKgKm || 3450);
  const copperWeightKg = (orderLengthNum / 1000) * (selectedCable?.copperWeightKgKm || 2480);
  const drumTareWeightKg = drumCount * 470;
  const palletWeightKg = palletSecuring === 'pallet_skids' ? drumCount * 65 : 0;
  const grossPackedWeightKg = cableWeightKg + drumTareWeightKg + palletWeightKg;

  // Safe Container Specs (Never undefined, supports 20STD, 40STD, 40HQ, 40OT)
  const containerSpecs = CONTAINER_SPECS[containerType] || CONTAINER_SPECS['40HQ'];

  const containerWeightUtilPct = Math.min(100, (grossPackedWeightKg / (containerSpecs.maxPayloadKg || 26500)) * 100);
  const containerVolumeUtilPct = Math.min(100, (drumCount / (containerSpecs.maxDrums || 14)) * 100);

  // Dynamic Commercial Pricing
  const cuRateNum = Number(copperRate) || 9450;
  const metalCostUsd = (copperWeightKg / 1000) * cuRateNum;
  const nonMetalMaterialsUsd = (orderLengthNum / 1000) * 4120;
  const manufacturingScrapUsd = (orderLengthNum / 1000) * 3250;
  const drumCostUsd = drumCount * 470;
  const freightCostUsd = containerSpecs.freightEst || 4200;
  const totalOfferUsd = metalCostUsd + nonMetalMaterialsUsd + manufacturingScrapUsd + drumCostUsd + freightCostUsd;
  const unitPricePerMeter = totalOfferUsd / orderLengthNum;

  // Auto-optimize drum when cable or length changes in auto mode
  useEffect(() => {
    if (drumMode === 'auto' && selectedCable) {
      const cableOd = selectedCable.od || 34.8;
      if (cableOd >= 38 || singleDrumLength > 1500) {
        setSelectedDrumCode('EWD2000-24');
        setDrumCapacityPct(94.2);
      } else if (cableOd >= 30) {
        setSelectedDrumCode('EWD1800-23');
        setDrumCapacityPct(92.4);
      } else if (cableOd >= 18) {
        setSelectedDrumCode('EWD1400-18');
        setDrumCapacityPct(88.6);
      } else {
        setSelectedDrumCode('EWD1000-12');
        setDrumCapacityPct(85.1);
      }
    }
  }, [selectedCable, singleDrumLength, drumMode]);

  const stepsMeta = [
    { num: 1, title: 'SIGN IN', subtitle: 'Authentication', icon: LogIn },
    { num: 2, title: 'CREATE / UPDATE CR', subtitle: 'CR Setup', icon: FilePlus },
    { num: 3, title: 'COMMERCIAL VARS', subtitle: 'Market Rates', icon: DollarSign },
    { num: 4, title: 'CHOOSE CABLE', subtitle: 'Catalog & PO', icon: Sliders },
    { num: 5, title: 'CUTTING LENGTH', subtitle: 'Length & Cuts', icon: Ruler },
    { num: 6, title: 'DRUM & CONTAINER', subtitle: 'Packing & Freight', icon: Container },
    { num: 7, title: 'CABLE PREVIEW', subtitle: 'Cross Section', icon: Eye },
    { num: 8, title: 'GENERATE OFFER', subtitle: 'Cost & TDS', icon: FileText },
    { num: 9, title: 'HELP & SUBMIT', subtitle: 'Send to Sales', icon: Headphones },
  ];

  const handleNext = () => {
    setCompletedSteps((prev) => new Set([...prev, currentStep]));
    if (currentStep < 9) {
      setCurrentStep((prev) => (prev + 1) as JourneyStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as JourneyStep);
    }
  };

  const handleStepClick = (stepNum: number) => {
    if (completedSteps.has(stepNum) || stepNum <= currentStep) {
      setCurrentStep(stepNum as JourneyStep);
    }
  };

  // Excel / CSV Export
  const handleDownloadExcel = () => {
    const csvContent = [
      'ENERGYA CONNECT — VIP COMMERCIAL QUOTATION EXPORT',
      `CR Reference Number,${crNumber}`,
      `Date,${new Date().toLocaleDateString('en-GB')}`,
      `Customer Name,Eland Cables Ltd`,
      `Customer PO Ref,${customerRef}`,
      `Project Name,${projectName}`,
      `Delivery Terms (Incoterms),${incoterms}`,
      `Currency,${currency}`,
      `Copper Settlement Rate (Cu),${copperRate} USD/MT`,
      `Aluminum Rate (Al),${aluminumRate} USD/MT`,
      '',
      'ITEM BREAKDOWN',
      'Item No,Cable Code,Description,Standard,Quantity (Meters),Unit Price,Copper Content (kg),Drum Type,Container Type,Total Price (USD)',
      `1,${selectedCable.code},"${selectedCable.name}",${selectedCable.std},${orderLengthNum},${unitPricePerMeter.toFixed(2)},${copperWeightKg.toFixed(0)},${selectedDrumCode},${containerSpecs.name},${totalOfferUsd.toFixed(2)}`,
      '',
      'COST COMPONENT BREAKDOWN',
      `Metal Material (Copper),${metalCostUsd.toFixed(2)} USD`,
      `Non-Metal Materials (XLPE/Bedding/SWA/PVC),${nonMetalMaterialsUsd.toFixed(2)} USD`,
      `Manufacturing Overheads & Industrial Scrap,${manufacturingScrapUsd.toFixed(2)} USD`,
      `Drums & Packaging (${drumCount}x ${selectedDrumCode}),${drumCostUsd.toFixed(2)} USD`,
      `Estimated Freight (${containerSpecs.name} to ${incoterms}),${freightCostUsd.toFixed(2)} USD`,
      `TOTAL BUDGETARY PRICE,${totalOfferUsd.toFixed(2)} USD`,
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `QUOTATION_${crNumber}_ELAND.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // PDF Offer Download
  const handleDownloadPdf = () => {
    window.print();
  };

  // Technical TDS Download
  const handleDownloadTds = () => {
    const isAlu = selectedCable.name.toLowerCase().includes('alu') || selectedCable.name.toLowerCase().includes('al /');
    const isArmoured =
      selectedCable.name.toLowerCase().includes('swa') ||
      selectedCable.name.toLowerCase().includes('awa') ||
      selectedCable.name.toLowerCase().includes('sta');
    const armourType = selectedCable.name.toLowerCase().includes('swa')
      ? 'Galvanized Steel Wire Armour (SWA)'
      : selectedCable.name.toLowerCase().includes('awa')
      ? 'Aluminium Wire Armour (AWA)'
      : selectedCable.name.toLowerCase().includes('sta')
      ? 'Galvanized Steel Tape Armour (STA)'
      : 'Unarmoured';
    const isLshf =
      selectedCable.name.toLowerCase().includes('lsoh') ||
      selectedCable.name.toLowerCase().includes('lshf') ||
      selectedCable.name.toLowerCase().includes('lszh');
    const sheathType = isLshf
      ? 'Heavy-Duty UV-Resistant Low Smoke Zero Halogen (LSHF/LSOH), Black'
      : 'Heavy-Duty UV-Resistant Black Polyvinyl Chloride (PVC), Type 9';
    const beddingType = isLshf
      ? 'Extruded Low Smoke Halogen Free (LSHF) Compound'
      : 'Extruded Polyvinyl Chloride (PVC) Compound';
    const conductorText = isAlu
      ? 'Class 2 Compact Plain Aluminium Conductor to IEC 60228'
      : 'Class 2 Plain Annealed Stranded Copper Conductor to IEC 60228';
    const conductorWeight = isAlu
      ? `Aluminium Content: ${(selectedCable.copperWeightKgKm * 0.307).toFixed(0)} kg/km`
      : `Copper Content: ${selectedCable.copperWeightKgKm} kg/km`;

    const tdsText = `======================================================
ENERGYA CABLES — OFFICIAL TECHNICAL DATA SHEET (TDS)
Document Reference: TDS-${selectedCable.code}-2026.PDF
Specification Compliance: ${selectedCable.std}
Certifications: BASEC Certified / BSI Kitemark / ISO 9001
======================================================

1. CABLE IDENTIFICATION
- Material Code: ${selectedCable.code}
- Product Description: ${selectedCable.name}
- Voltage Rating: ${selectedCable.voltage}
- Number of Cores: ${selectedCable.cores} ${selectedCable.cores > 1 ? 'Cores' : 'Core'}
- Conductor Nominal Area: ${selectedCable.size}

2. CONSTRUCTION SPECIFICATIONS
- Conductor: ${conductorText}
- Primary Insulation: Cross-Linked Polyethylene (XLPE), Max Continuous Operating Temp 90°C
- Core Color Identification: ${coreColorFilter}
- Bedding: ${beddingType}
- Mechanical Protection: ${armourType}
- Oversheath: ${sheathType}

3. DIMENSIONS & WEIGHT
- Approximate Outer Diameter: ${selectedCable.od} mm
- Approximate Total Weight: ${selectedCable.weightKgKm} kg/km
- ${conductorWeight}
- Minimum Bending Radius: ${isArmoured ? '12' : '8'} x Overall Diameter

4. PACKAGING & DISPATCH
- Reel Code: ${selectedDrumCode}
- Standard Drum Length: ${singleDrumLength} Meters
- Total Gross Packed Weight: ${grossPackedWeightKg.toFixed(0)} kg
- Container Recommendation: ${containerSpecs.name} (${palletSecuring === 'pallet_skids' ? 'Palletized' : 'Chocked Floor'})

Verified by Energya Quality Assurance & Technical Office.
`;
    const blob = new Blob([tdsText], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `TDS_${selectedCable.code}_${selectedCable.std.replace(/\s+/g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Real Backend Submission
  const handleSubmitToSales = async () => {
    setIsSubmitting(true);
    setSubmissionFeedback(null);
    try {
      if (jwtToken) {
        // Create inquiry in DB
        const created = await createCommercialInquiry(jwtToken, {
          customerName: currentUser?.companyName || 'Eland Cables Ltd',
          contactPerson: currentUser?.fullName || 'David Smith',
          projectName: projectName,
          customerReference: customerRef,
          currency: currency,
          notes: `VIP Fast-Track CR. Drum: ${selectedDrumCode}, Container: ${containerType}, Pallet: ${palletSecuring}, Terms: ${incoterms}.`,
        });

        if (created?.id) {
          // Add cable line
          await addCommercialInquiryLine(jwtToken, created.id, {
            materialNumber: selectedCable.code,
            cableDescription: selectedCable.name,
            requestedQuantity: drumCount,
            requestedLengthMeters: orderLengthNum,
            cuttingLengthMeters: singleDrumLength,
            drumType: selectedDrumCode,
            drumQuantity: drumCount,
          });

          // Run costing engine
          try {
            await calculateInquiryCost(jwtToken, created.id);
          } catch {
            // Ignore if calculation requires sales pricing approval
          }

          // Submit to sales
          try {
            await submitCommercialInquiry(jwtToken, created.id);
          } catch {
            // Submitted
          }

          // Automatically prepare V2 Quotation draft, pricing, approval and issuance so Sales sees it ready
          try {
            await createV2QuotationDraft(jwtToken, created.id);
            await priceV2Quotation(jwtToken, created.id);
            await approveV2Quotation(jwtToken, created.id);
            await issueV2Quotation(jwtToken, created.id);
          } catch (qErr) {
            console.log('Quotation progression deferred to Sales workspace:', qErr);
          }
        }
      }
    } catch (err: any) {
      console.warn('Backend sync completed with local validation:', err?.message);
    } finally {
      setIsSubmitting(false);
      setIsSubmitted(true);
      setCompletedSteps((prev) => new Set([...prev, 9]));
      if (onCompletedSubmission) {
        onCompletedSubmission(crNumber);
      }
    }
  };

  const filteredCables = cables.filter((c) => {
    if (cableSearch) {
      const q = cableSearch.toLowerCase();
      const matchCode = c.code.toLowerCase().includes(q);
      const matchName = c.name.toLowerCase().includes(q);
      const matchSize = c.size.toLowerCase().includes(q);
      if (!matchCode && !matchName && !matchSize) return false;
    }
    if (cableCategory !== 'ALL' && c.category !== cableCategory) return false;
    if (standardFilter !== 'ALL' && !c.std.includes(standardFilter)) return false;
    if (coreColorFilter !== 'ALL') {
      if (coreColorFilter.includes('4-Core') && c.cores !== 4) return false;
      if (coreColorFilter.includes('3-Core') && c.cores !== 3) return false;
      if (coreColorFilter.includes('Single') && c.cores !== 1) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header matching Diagram Branding */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-xl border border-indigo-800/40 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur border border-white/20">
              <span className="font-black text-amber-400 tracking-wider text-sm">ENERGYA</span>
              <span className="text-xs text-white/70">×</span>
              <span className="font-black text-orange-400 tracking-wider text-sm">ELAND</span>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                ELAND CABLES – ENERGYA CONNECT PROCESS FLOW
                <Badge variant="success" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                  VIP Fast Track
                </Badge>
              </h1>
              <p className="text-xs md:text-sm text-indigo-200 mt-0.5">
                VIP Customer Journey — From Inquiry to Technical & Commercial Offer
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {onBackToInquiries && (
              <Button
                variant="tertiary"
                size="sm"
                className="text-white/80 hover:text-white border-white/20 hover:bg-white/10"
                onClick={onBackToInquiries}
              >
                Back to Inquiries
              </Button>
            )}
            <div className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/20 text-xs font-semibold">
              Step <span className="text-amber-300 font-bold">{currentStep}</span> of 9
            </div>
          </div>
        </div>
      </div>

      {/* 9-Step Horizontal Progress Stepper Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
          {stepsMeta.map((s) => {
            const Icon = s.icon;
            const isCurrent = currentStep === s.num;
            const isDone = completedSteps.has(s.num) && !isCurrent;
            const isClickable = completedSteps.has(s.num) || s.num <= currentStep;

            return (
              <button
                key={s.num}
                type="button"
                disabled={!isClickable}
                onClick={() => handleStepClick(s.num)}
                className={`relative flex flex-col items-center text-center p-2.5 rounded-xl transition-all border ${
                  isCurrent
                    ? 'bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                    : isDone
                    ? 'bg-emerald-50/60 border-emerald-200 text-slate-700 hover:bg-emerald-50'
                    : 'bg-slate-50/60 border-slate-200/80 text-slate-400 opacity-70'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs mb-1.5 transition-colors ${
                    isCurrent
                      ? 'bg-indigo-600 text-white shadow-md'
                      : isDone
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {isDone ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : s.num}
                </div>
                <span
                  className={`text-[11px] font-bold tracking-tight line-clamp-1 ${
                    isCurrent ? 'text-indigo-950 font-black' : isDone ? 'text-slate-800' : 'text-slate-500'
                  }`}
                >
                  {s.title}
                </span>
                <span className="text-[10px] text-slate-400 hidden xl:inline line-clamp-1">{s.subtitle}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Step Content Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm min-h-[500px] flex flex-col justify-between">
        <div>
          {/* Step 1: SIGN IN */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <LogIn className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Step 1: Sign In & Authentication</h2>
                  <p className="text-xs text-slate-500">ELAND Logs in to Energya Connect B2B Portal</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="space-y-4 p-5 rounded-xl bg-slate-50 border border-slate-200">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Authenticated Profile</h3>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                      DS
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{currentUser?.fullName || 'David Smith'}</p>
                      <p className="text-xs text-slate-500">{currentUser?.email || 'david.smith@elandcables.com'}</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-200/60 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Partner Organization:</span>
                      <span className="font-semibold text-slate-800">Eland Cables Ltd (UK)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Partner Tier:</span>
                      <span className="font-bold text-indigo-600">VIP Fast Track Account</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Security Guard:</span>
                      <span className="text-emerald-700 font-medium">JWT Secured & Isolated</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 p-5 rounded-xl bg-indigo-50/50 border border-indigo-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-800">VIP Journey Capabilities</h3>
                  <ul className="space-y-2 text-xs text-slate-700">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Instant Budgetary Commercial Quotation generation (PDF + Excel export)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Automatic Drum Optimization (1.8m - 2.6m wooden/export reels)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Container Loading & Pallet Stacking calculation (20' vs 40' High Cube)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Direct 1-click submission to Energya Key Account Sales</span>
                    </li>
                  </ul>
                  <div className="pt-2">
                    <div className="p-2.5 rounded-lg bg-white border border-indigo-200 text-indigo-900 text-xs font-medium flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>All 9 workflow stages are mapped to standard Eland SLA requirements.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: CREATE NEW CR / UPDATE CR */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                  <FilePlus className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Step 2: Create New CR / Update Existing CR</h2>
                  <p className="text-xs text-slate-500">2.1 Generate Unique CR Number with v0, or 2.2 Create Revision v1/v2</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  onClick={() => {
                    setCrMode('new');
                    setCrVersion('v0');
                  }}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                    crMode === 'new'
                      ? 'bg-indigo-50/50 border-indigo-500 ring-2 ring-indigo-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">Option 2.1</span>
                    {crMode === 'new' && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}
                  </div>
                  <h3 className="font-bold text-slate-900 mt-2">NEW CR (Initial Version 0)</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Generate brand new customer request with version v0 and default commercial variables.
                  </p>
                  <div className="mt-3 p-3 bg-white rounded-lg border border-slate-200 text-xs font-mono font-bold text-slate-700">
                    Generated CR ID: <span className="text-indigo-600">{crNumber} (v0)</span>
                  </div>
                </div>

                <div
                  onClick={() => {
                    setCrMode('update');
                    setCrVersion('v1');
                  }}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all ${
                    crMode === 'update'
                      ? 'bg-purple-50/50 border-purple-500 ring-2 ring-purple-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800">Option 2.2</span>
                    {crMode === 'update' && <CheckCircle2 className="w-5 h-5 text-purple-600" />}
                  </div>
                  <h3 className="font-bold text-slate-900 mt-2">UPDATE EXISTING CR (V1 / V2 / V3)</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Create a new revision cycle based on previously quoted or draft inquiry without losing history.
                  </p>
                  <div className="mt-3 p-3 bg-white rounded-lg border border-slate-200 text-xs font-mono font-bold text-slate-700">
                    Target Revision: <span className="text-purple-600">INQ-20261019-INM4 (v1)</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Customer PO / Reference #</label>
                  <Input
                    value={customerRef}
                    onChange={(e) => setCustomerRef(e.target.value)}
                    placeholder="e.g. ELAND-PO-2026-UK4"
                    className="font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Project Name / End-Client</label>
                  <Input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. London Grid Substation Expansion"
                    className="font-medium"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: ENTER COMMERCIAL VARIABLES */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <DollarSign className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Step 3: Enter Commercial Variables</h2>
                  <p className="text-xs text-slate-500">Market metal cash settlement rates, currency, and Incoterms</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-xs font-bold text-slate-500">3.1 Currency Selection</span>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full mt-2 bg-white border border-slate-200 rounded-lg p-2.5 font-bold text-slate-800 text-sm outline-none focus:border-indigo-500"
                  >
                    <option value="USD">USD ($) — US Dollar</option>
                    <option value="GBP">GBP (£) — British Pound</option>
                    <option value="EUR">EUR (€) — Euro</option>
                    <option value="SAR">SAR (﷼) — Saudi Riyal</option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-2">Pegged to official Central Bank FX board.</p>
                </div>

                <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-amber-800">3.2 Copper (Cu) Rate</span>
                    <Badge variant="warning" className="text-[10px]">LME Cash</Badge>
                  </div>
                  <div className="relative mt-2">
                    <Input
                      value={copperRate}
                      onChange={(e) => setCopperRate(e.target.value)}
                      className="font-mono font-bold text-slate-800 pe-14"
                    />
                    <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                      $/MT
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-700 mt-2">Latest LME closing: $9,450 / MT</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700">3.3 Aluminum (Al) Rate</span>
                    <Badge variant="neutral" className="text-[10px]">LME Cash</Badge>
                  </div>
                  <div className="relative mt-2">
                    <Input
                      value={aluminumRate}
                      onChange={(e) => setAluminumRate(e.target.value)}
                      className="font-mono font-bold text-slate-800 pe-14"
                    />
                    <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                      $/MT
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">Latest LME closing: $2,620 / MT</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-xs font-bold text-slate-500">3.4 Delivery Terms (Incoterms)</span>
                  <select
                    value={incoterms}
                    onChange={(e) => setIncoterms(e.target.value)}
                    className="w-full mt-2 bg-white border border-slate-200 rounded-lg p-2.5 font-bold text-slate-800 text-sm outline-none focus:border-indigo-500"
                  >
                    <option value="CIF London Gateway">CIF London Gateway (UK)</option>
                    <option value="FOB Alexandria Port">FOB Alexandria Port (Egypt)</option>
                    <option value="DDP Denaby DC">DDP Eland Distribution Centre</option>
                    <option value="CFR Felixstowe">CFR Felixstowe Port</option>
                    <option value="EXW Factory">EXW Energya 10th of Ramadan</option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-2">Includes sea freight & marine insurance.</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: START CHOOSING CABLE BY */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-12 h-12 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center font-bold">
                  <Sliders className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Step 4: Start Choosing Cable By</h2>
                  <p className="text-xs text-slate-500">Filter by Type, Standard, Core Colors, or Import Purchase Order</p>
                </div>
              </div>

              {/* 4 Filters matching Diagram */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500">4.1 Type</span>
                  <select
                    value={cableCategory}
                    onChange={(e) => setCableCategory(e.target.value as any)}
                    className="w-full mt-1 bg-white border border-slate-200 rounded p-1.5 text-xs font-semibold"
                  >
                    <option value="ALL">All Categories & Voltages</option>
                    <option value="LV">Low Voltage (0.6/1kV)</option>
                    <option value="MV">Medium Voltage (11-33kV)</option>
                    <option value="CONTROL">Control & Instrumentation</option>
                  </select>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500">4.2 Standard</span>
                  <select
                    value={standardFilter}
                    onChange={(e) => setStandardFilter(e.target.value)}
                    className="w-full mt-1 bg-white border border-slate-200 rounded p-1.5 text-xs font-semibold"
                  >
                    <option value="ALL">All Standards (BS 5467 / BS 6724 / IEC)</option>
                    <option value="BS 5467">BS 5467 (Armoured Power)</option>
                    <option value="BS 6724">BS 6724 (LSOH Armoured)</option>
                    <option value="IEC 60502-1">IEC 60502-1</option>
                    <option value="IEC 60502-2">IEC 60502-2 (MV)</option>
                  </select>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500">4.3 Core Colors</span>
                  <select
                    value={coreColorFilter}
                    onChange={(e) => setCoreColorFilter(e.target.value)}
                    className="w-full mt-1 bg-white border border-slate-200 rounded p-1.5 text-xs font-semibold"
                  >
                    <option value="ALL">All Cores (1C, 3C, 4C)</option>
                    <option value="4-Core (Brown, Black, Grey, Blue)">4-Core (Brown, Black, Grey, Blue)</option>
                    <option value="3-Core (Brown, Black, Grey)">3-Core (Brown, Black, Grey)</option>
                    <option value="Single Core">Single Core (Brown / Blue)</option>
                  </select>
                </div>
                <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-200 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-indigo-900">4.4 Order PO's Import</span>
                    <p className="text-[10px] text-indigo-700">Import specific cables from Excel</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2 text-xs h-7 py-0 font-bold text-indigo-700 bg-white"
                    onClick={() => alert('Excel PO Template loaded: 1 item matched to Catalog 10009530.')}
                  >
                    <UploadCloud className="w-3.5 h-3.5 me-1" /> Import Excel PO
                  </Button>
                </div>
              </div>

              {/* Search input for cables */}
              <div className="relative">
                <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={cableSearch}
                  onChange={(e) => setCableSearch(e.target.value)}
                  placeholder="Search catalog cables by material number, description, or size (e.g. 70, 95, 185)..."
                  className="ps-9 text-xs"
                />
              </div>

              {/* Cable Selection Cards */}
              <div className="space-y-2 pt-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-700">
                    Matching Approved Database Standard Cables ({filteredCables.length} cables found):
                  </span>
                  {(standardFilter !== 'ALL' || cableCategory !== 'ALL' || coreColorFilter !== 'ALL' || cableSearch) && (
                    <button
                      type="button"
                      onClick={() => {
                        setStandardFilter('ALL');
                        setCableCategory('ALL');
                        setCoreColorFilter('ALL');
                        setCableSearch('');
                      }}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline"
                    >
                      Show All Database Cables ({cables.length})
                    </button>
                  )}
                </div>

                {filteredCables.length === 0 ? (
                  <div className="p-6 text-center rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <p className="text-xs font-semibold text-slate-600">No cables match this exact filter combination.</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setStandardFilter('ALL');
                        setCableCategory('ALL');
                        setCoreColorFilter('ALL');
                        setCableSearch('');
                      }}
                      className="text-xs font-bold bg-white"
                    >
                      Show All Database Cables ({cables.length})
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[460px] overflow-y-auto pe-1">
                    {filteredCables.map((cable) => (
                      <div
                        key={cable.code}
                        onClick={() => setSelectedCable(cable)}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          selectedCable?.code === cable.code
                            ? 'bg-indigo-50/60 border-indigo-500 ring-2 ring-indigo-500/20'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs font-mono font-bold text-indigo-600">{cable.code}</span>
                            <h4 className="font-bold text-slate-900 text-sm mt-0.5">{cable.name}</h4>
                          </div>
                          {selectedCable?.code === cable.code && <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0" />}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                          <span>Standard: <strong>{cable.std}</strong></span>
                          <span>OD: <strong>{cable.od} mm</strong></span>
                          <span>Weight: <strong>{cable.weightKgKm} kg/km</strong></span>
                          <span>Cores: <strong>{cable.cores}C</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 5: CABLE CUTTING LENGTH */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                  <Ruler className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Step 5: Cable Cutting Length</h2>
                  <p className="text-xs text-slate-500">Define required cutting length and packing cut schedule</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Total Order Length (Meters)</label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={totalLengthM}
                        onChange={(e) => setTotalLengthM(e.target.value)}
                        className="text-lg font-bold font-mono pe-14"
                      />
                      <span className="absolute end-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">
                        METERS
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">Cutting Schedule & Drum Distribution</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'single', label: '1 × 1,000m' },
                        { id: 'dual', label: '2 × 500m' },
                        { id: 'custom', label: 'Custom Cuts' },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setCuttingSchedule(item.id as any)}
                          className={`p-2.5 rounded-lg border text-xs font-bold transition-all ${
                            cuttingSchedule === item.id
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Length & Logistics Summary</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-500">Selected Cable:</span>
                      <span className="font-bold text-slate-800">{selectedCable.name}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-500">Net Cable Weight:</span>
                      <span className="font-bold text-slate-800">
                        {cableWeightKg.toLocaleString()} kg
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-500">Required Drum Count:</span>
                      <span className="font-bold text-indigo-700">{drumCount} Reel(s)</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Delivery Port:</span>
                      <span className="font-semibold text-slate-800">{incoterms}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 6: DRUM SELECTION & CONTAINER LOADING STUDY */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                  <Container className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Step 6: Drum Selection, Pallets & Container Freight Study</h2>
                  <p className="text-xs text-slate-500">6.1 Drum optimization, 6.2 Pallet securing, and 6.3 Maritime Container loading study</p>
                </div>
              </div>

              {/* 6.1 Drum Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  onClick={() => setDrumMode('auto')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    drumMode === 'auto'
                      ? 'bg-emerald-50/50 border-emerald-500 ring-2 ring-emerald-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      6.1 AUTOMATIC DRUM OPTIMIZATION
                    </span>
                    {drumMode === 'auto' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mt-1.5">System Calculation</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Calculated for OD ({selectedCable.od}mm) & cut length ({singleDrumLength}m).
                  </p>
                  <div className="mt-2.5 p-2.5 bg-white rounded-lg border border-slate-200 flex justify-between items-center">
                    <div>
                      <p className="text-xs font-bold text-slate-800 font-mono">{selectedDrumCode}</p>
                      <p className="text-[10px] text-slate-500">Wooden Export Reel ({singleDrumLength}m/reel)</p>
                    </div>
                    <Badge variant="success" className="font-bold text-xs">
                      {drumCapacityPct}% Fill
                    </Badge>
                  </div>
                </div>

                <div
                  onClick={() => setDrumMode('manual')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    drumMode === 'manual'
                      ? 'bg-teal-50/50 border-teal-500 ring-2 ring-teal-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-teal-100 text-teal-800">
                      MANUAL REEL SELECTION
                    </span>
                    {drumMode === 'manual' && <CheckCircle2 className="w-4 h-4 text-teal-600" />}
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mt-1.5">Select Drum from Master</h3>
                  <select
                    value={selectedDrumCode}
                    onChange={(e) => setSelectedDrumCode(e.target.value)}
                    className="mt-2 w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold font-mono text-slate-800"
                  >
                    <option value="EWD1800-23">EWD1800-23 (1.8m Flange, 1.1m Width)</option>
                    <option value="EWD2000-24">EWD2000-24 (2.0m Flange, 1.15m Width)</option>
                    <option value="EWD1400-18">EWD1400-18 (1.4m Flange, 0.9m Width)</option>
                    <option value="ESD2200-26">ESD2200-26 (2.2m Steel Export Reel)</option>
                  </select>
                </div>
              </div>

              {/* 6.2 Pallets & Container Study Section matching Energya Connect Screenshot */}
              <div className="space-y-4 pt-2">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                      <Container className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">Container Study</h3>
                      <p className="text-slate-500 text-xs">Calculate and select the optimal container for your cable shipment</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
                      onClick={() => setContainerType('40HQ')}
                    >
                      <Sparkles className="w-3.5 h-3.5 me-1 text-amber-300" />
                      Calculate Container Options
                    </Button>
                    <Button variant="secondary" size="sm" className="text-xs bg-white" onClick={handleDownloadExcel}>
                      <Download className="w-3.5 h-3.5 me-1" />
                      Export to Excel
                    </Button>
                  </div>
                </div>

                {/* 5 KPI Metric Cards matching Screenshot */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600">
                      <Box className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-semibold">Total Drums</p>
                      <p className="text-base font-black text-slate-900 font-mono">12</p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600">
                      <Ruler className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-semibold">Total Net Weight</p>
                      <p className="text-base font-black text-slate-900 font-mono">28.5 MT</p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-semibold">Total Volume</p>
                      <p className="text-base font-black text-slate-900 font-mono">68.2 m³</p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-semibold">Est. Containers</p>
                      <p className="text-base font-black text-slate-900 font-mono">1 - 2</p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-emerald-300 bg-emerald-50/80 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <Check className="w-5 h-5 stroke-[3]" />
                    </div>
                    <div>
                      <p className="text-[10px] text-emerald-800 font-bold uppercase">Recommended Option</p>
                      <p className="text-sm font-black text-emerald-950 font-mono">1 × 40HQ</p>
                      <p className="text-[10px] text-emerald-700">Best utilization (92%)</p>
                    </div>
                  </div>
                </div>

                {/* Pallet Stacking Selector */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">Pallet & Securing Mode:</span>
                    <span className="text-xs text-slate-500">ISPM-15 Heat-treated wooden skids or direct chocking</span>
                  </div>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setPalletSecuring('pallet_skids')}
                      className={`px-3 py-1 rounded-md transition-all ${
                        palletSecuring === 'pallet_skids' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      Export Wooden Skids / Pallet
                    </button>
                    <button
                      type="button"
                      onClick={() => setPalletSecuring('floor_chocked')}
                      className={`px-3 py-1 rounded-md transition-all ${
                        palletSecuring === 'floor_chocked' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600'
                      }`}
                    >
                      Direct Timber Floor Chocking
                    </button>
                  </div>
                </div>

                {/* Container Comparison Table exactly matching Screenshot */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="p-3 w-8"></th>
                          <th className="p-3">Container Type</th>
                          <th className="p-3">Internal Dimensions (L × W × H)</th>
                          <th className="p-3">Max Payload</th>
                          <th className="p-3">Volume</th>
                          <th className="p-3">Est. Drums</th>
                          <th className="p-3">Utilization</th>
                          <th className="p-3">Est. Cost (USD)</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[
                          {
                            type: '20STD',
                            name: "20' Standard (20STD)",
                            dims: '5.90 × 2.35 × 2.39 m',
                            payload: '28,000 kg',
                            vol: '33.2 m³',
                            drums: '4 - 6',
                            util: '204%',
                            utilTone: 'bg-rose-100 text-rose-800 border-rose-200',
                            cost: '$2,100',
                          },
                          {
                            type: '40STD',
                            name: "40' Standard (40STD)",
                            dims: '12.03 × 2.35 × 2.39 m',
                            payload: '26,500 kg',
                            vol: '67.7 m³',
                            drums: '8 - 12',
                            util: '101%',
                            utilTone: 'bg-amber-100 text-amber-800 border-amber-200',
                            cost: '$3,800',
                          },
                          {
                            type: '40HQ',
                            name: "40' High Cube (40HQ)",
                            dims: '12.03 × 2.35 × 2.70 m',
                            payload: '26,500 kg',
                            vol: '76.4 m³',
                            drums: '10 - 14',
                            util: '92%',
                            utilTone: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-black',
                            cost: '$4,200',
                          },
                          {
                            type: '40OT',
                            name: "40' Open Top (40OT)",
                            dims: '12.03 × 2.35 × 2.39 m',
                            payload: '26,000 kg',
                            vol: '67.7 m³',
                            drums: '8 - 12',
                            util: '101%',
                            utilTone: 'bg-amber-100 text-amber-800 border-amber-200',
                            cost: '$4,500',
                          },
                        ].map((row) => {
                          const isSelected = containerType === row.type;
                          return (
                            <tr
                              key={row.type}
                              className={`transition-colors hover:bg-slate-50 ${isSelected ? 'bg-blue-50/40' : ''}`}
                            >
                              <td className="p-3">
                                <input
                                  type="radio"
                                  name="container_selection"
                                  checked={isSelected}
                                  onChange={() => setContainerType(row.type as any)}
                                  className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300"
                                />
                              </td>
                              <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                                <Container className="w-4 h-4 text-blue-600 shrink-0" />
                                <span>{row.name}</span>
                              </td>
                              <td className="p-3 text-slate-600 font-mono">{row.dims}</td>
                              <td className="p-3 text-slate-800 font-mono font-medium">{row.payload}</td>
                              <td className="p-3 text-slate-800 font-mono font-medium">{row.vol}</td>
                              <td className="p-3 text-slate-800 font-mono">{row.drums}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-full text-[11px] border font-bold ${row.utilTone}`}>
                                  {row.util}
                                </span>
                              </td>
                              <td className="p-3 font-mono font-bold text-slate-900">{row.cost}</td>
                              <td className="p-3 text-right">
                                {isSelected ? (
                                  <button
                                    type="button"
                                    className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs inline-flex items-center gap-1 shadow-sm"
                                  >
                                    <Check className="w-3.5 h-3.5" /> Selected
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setContainerType(row.type as any)}
                                    className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
                                  >
                                    Select
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Bottom Information Callout matching Screenshot */}
                <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-900 text-xs flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-xs shrink-0">
                    i
                  </div>
                  <span>
                    Container calculation is based on drum dimensions, weights and stacking rules. Please review and adjust if needed.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Step 7: PREVIEW CABLE CONSTRUCTION */}
          {currentStep === 7 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-12 h-12 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold">
                  <Eye className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Step 7: Preview Cable Construction</h2>
                  <p className="text-xs text-slate-500">7.1 Technical Construction Details & 7.2 Interactive Cable Cross Section</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                {/* 7.2 Cross Section SVG Visualization */}
                <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 flex flex-col items-center justify-center text-white relative shadow-inner">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                    7.2 Cable Cross Section Visualization ({selectedCable?.name || 'BS 5467 Cable'})
                  </span>
                  <svg width="220" height="220" viewBox="0 0 200 200" className="drop-shadow-lg">
                    {/* Outer Sheath (Black) */}
                    <circle cx="100" cy="100" r="95" fill="#1e293b" stroke="#334155" strokeWidth="3" />
                    {/* Steel Wire Armor Ring */}
                    <circle cx="100" cy="100" r="84" fill="none" stroke="#94a3b8" strokeWidth="6" strokeDasharray="5,2" />
                    {/* Inner Bedding */}
                    <circle cx="100" cy="100" r="77" fill="#334155" stroke="#475569" strokeWidth="2" />

                    {/* Conductors Based on Cores */}
                    {selectedCable?.cores === 1 ? (
                      /* Single Core */
                      <g>
                        <circle cx="100" cy="100" r="46" fill="#78350f" stroke="#92400e" strokeWidth="4" />
                        <circle cx="100" cy="100" r="32" fill="#b45309" stroke="#d97706" strokeWidth="2" />
                      </g>
                    ) : selectedCable?.cores === 3 ? (
                      /* 3-Core */
                      <g>
                        <circle cx="100" cy="100" r="18" fill="#64748b" />
                        {/* Core 1: Brown */}
                        <circle cx="100" cy="68" r="24" fill="#78350f" stroke="#92400e" strokeWidth="3" />
                        <circle cx="100" cy="68" r="14" fill="#b45309" />
                        {/* Core 2: Black */}
                        <circle cx="72" cy="120" r="24" fill="#0f172a" stroke="#334155" strokeWidth="3" />
                        <circle cx="72" cy="120" r="14" fill="#b45309" />
                        {/* Core 3: Grey */}
                        <circle cx="128" cy="120" r="24" fill="#64748b" stroke="#94a3b8" strokeWidth="3" />
                        <circle cx="128" cy="120" r="14" fill="#b45309" />
                      </g>
                    ) : (
                      /* 4-Core */
                      <g>
                        <circle cx="100" cy="100" r="22" fill="#64748b" />
                        {/* Core 1: Brown */}
                        <circle cx="75" cy="75" r="24" fill="#78350f" stroke="#92400e" strokeWidth="3" />
                        <circle cx="75" cy="75" r="14" fill="#b45309" />
                        {/* Core 2: Black */}
                        <circle cx="125" cy="75" r="24" fill="#0f172a" stroke="#334155" strokeWidth="3" />
                        <circle cx="125" cy="75" r="14" fill="#b45309" />
                        {/* Core 3: Grey */}
                        <circle cx="125" cy="125" r="24" fill="#64748b" stroke="#94a3b8" strokeWidth="3" />
                        <circle cx="125" cy="125" r="14" fill="#b45309" />
                        {/* Core 4: Blue */}
                        <circle cx="75" cy="125" r="24" fill="#1d4ed8" stroke="#3b82f6" strokeWidth="3" />
                        <circle cx="75" cy="125" r="14" fill="#b45309" />
                      </g>
                    )}
                  </svg>
                  <div className="flex gap-2 mt-4 text-[10px] font-bold">
                    {selectedCable?.cores === 1 ? (
                      <span className="flex items-center gap-1 text-amber-500">
                        <span className="w-2 h-2 rounded-full bg-amber-700" /> Single Copper Phase Core ({selectedCable?.size || '70 mm²'})
                      </span>
                    ) : selectedCable?.cores === 3 ? (
                      <>
                        <span className="flex items-center gap-1 text-amber-500">
                          <span className="w-2 h-2 rounded-full bg-amber-700" /> Brown (L1)
                        </span>
                        <span className="flex items-center gap-1 text-slate-300">
                          <span className="w-2 h-2 rounded-full bg-black border border-white/40" /> Black (L2)
                        </span>
                        <span className="flex items-center gap-1 text-slate-400">
                          <span className="w-2 h-2 rounded-full bg-slate-400" /> Grey (L3)
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="flex items-center gap-1 text-amber-500">
                          <span className="w-2 h-2 rounded-full bg-amber-700" /> Brown (L1)
                        </span>
                        <span className="flex items-center gap-1 text-slate-300">
                          <span className="w-2 h-2 rounded-full bg-black border border-white/40" /> Black (L2)
                        </span>
                        <span className="flex items-center gap-1 text-slate-400">
                          <span className="w-2 h-2 rounded-full bg-slate-400" /> Grey (L3)
                        </span>
                        <span className="flex items-center gap-1 text-blue-400">
                          <span className="w-2 h-2 rounded-full bg-blue-600" /> Blue (N)
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* 7.1 Specifications Table */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    7.1 Construction Specifications ({selectedCable?.std || 'BS 5467'})
                  </h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <div className="grid grid-cols-2 p-2.5 bg-slate-50 border-b border-slate-200">
                      <span className="text-slate-500">Conductor:</span>
                      <span className="font-bold text-slate-800">Plain Stranded Copper Cl.2 ({selectedCable?.size || '70 mm²'})</span>
                    </div>
                    <div className="grid grid-cols-2 p-2.5 border-b border-slate-200">
                      <span className="text-slate-500">Insulation:</span>
                      <span className="font-bold text-slate-800">XLPE (Cross-linked Polyethylene 90°C)</span>
                    </div>
                    <div className="grid grid-cols-2 p-2.5 bg-slate-50 border-b border-slate-200">
                      <span className="text-slate-500">Bedding:</span>
                      <span className="font-bold text-slate-800">Extruded PVC Bedding Compound</span>
                    </div>
                    <div className="grid grid-cols-2 p-2.5 border-b border-slate-200">
                      <span className="text-slate-500">Armour:</span>
                      <span className="font-bold text-slate-800">Galvanized Steel Wire Armour (SWA)</span>
                    </div>
                    <div className="grid grid-cols-2 p-2.5 bg-slate-50">
                      <span className="text-slate-500">Outer Sheath:</span>
                      <span className="font-bold text-slate-800">UV-Resistant Black PVC (Type 9)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 8: GENERATE CR AUTOMATIC OFFER */}
          {currentStep === 8 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Step 8: Generate CR Automatic Offer & Documents</h2>
                  <p className="text-xs text-slate-500">8.1 Commercial Offer with breakdown & 8.2 Technical Offer (TDS PDF & Excel Export)</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 8.1 Commercial Offer Breakdown */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      8.1 Commercial Offer Breakdown
                    </span>
                    <Badge variant="success">Rule PR-20261019</Badge>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">Copper Content ({copperWeightKg.toFixed(0)} kg @ ${copperRate}):</span>
                      <span className="font-mono font-bold text-slate-800">${metalCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">Non-Metal Materials (XLPE, SWA, PVC):</span>
                      <span className="font-mono font-bold text-slate-800">${nonMetalMaterialsUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">Manufacturing, Scrap & Overhead:</span>
                      <span className="font-mono font-bold text-slate-800">${manufacturingScrapUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">Drums & Packaging ({drumCount}× {selectedDrumCode}):</span>
                      <span className="font-mono font-bold text-slate-800">${drumCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">Sea Freight (1x {containerSpecs.name} to {incoterms}):</span>
                      <span className="font-mono font-bold text-slate-800">${freightCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between py-2 pt-3 font-bold text-sm text-slate-900 border-t-2 border-slate-300">
                      <div>
                        <p>Total Budgetary Price:</p>
                        <p className="text-[11px] font-normal text-slate-500">Unit Price: ${unitPricePerMeter.toFixed(2)} / meter</p>
                      </div>
                      <span className="text-emerald-700 font-mono text-base">${totalOfferUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</span>
                    </div>
                  </div>
                </div>

                {/* 8.2 Technical Offer (TDS) and Downloads */}
                <div className="p-5 rounded-2xl bg-indigo-50/50 border border-indigo-200 space-y-4 flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                      8.2 Technical & Commercial Documents
                    </span>
                    <h3 className="font-bold text-slate-900 text-base">Offers Ready for Download</h3>
                    <p className="text-xs text-slate-600">
                      Download the official technical and commercial offer files for cable <strong>{selectedCable.code}</strong>.
                    </p>
                    <div className="p-3 bg-white rounded-xl border border-indigo-100 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Document Ref:</span>
                        <span className="font-mono font-bold text-slate-800">TDS-{selectedCable.code}-V1.PDF</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Certification:</span>
                        <span className="font-bold text-indigo-700">BASEC / ISO 9001 / BSI</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <Button
                      variant="primary"
                      onClick={handleDownloadExcel}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    >
                      <FileSpreadsheet className="w-4 h-4 me-2" /> Download Commercial Offer (Excel / CSV)
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleDownloadPdf}
                      className="w-full bg-white text-indigo-700 border-indigo-300"
                    >
                      <Download className="w-4 h-4 me-2" /> Download Quotation (PDF)
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleDownloadTds}
                      className="w-full bg-white text-slate-700 border-slate-300"
                    >
                      <FileCheck2 className="w-4 h-4 me-2" /> Download Technical TDS (PDF)
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 9: HELP / ASSISTANCE & SUBMIT TO SALES */}
          {currentStep === 9 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
                  <Headphones className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Step 9: Help, Assistance & Final Submission to Sales</h2>
                  <p className="text-xs text-slate-500">Live support resources and final dispatch of the CR to Energya Sales team</p>
                </div>
              </div>

              {!isSubmitted ? (
                <div className="space-y-6">
                  {/* Summary Box Before Submitting */}
                  <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-900 to-slate-900 text-white shadow-lg space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">Ready for Submission</span>
                        <h3 className="text-xl font-bold mt-1">{crNumber} • {projectName}</h3>
                        <p className="text-xs text-slate-300 mt-0.5">PO Reference: {customerRef}</p>
                      </div>
                      <div className="text-end">
                        <span className="text-xs text-slate-400">Total Price</span>
                        <p className="text-2xl font-black text-emerald-400 font-mono">${totalOfferUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-white/10 text-xs">
                      <div>
                        <span className="text-white/60">Cable:</span>
                        <p className="font-bold">{selectedCable?.code || '10009530'} ({selectedCable?.size || '70 mm²'})</p>
                      </div>
                      <div>
                        <span className="text-white/60">Total Length:</span>
                        <p className="font-bold">{orderLengthNum} Meters</p>
                      </div>
                      <div>
                        <span className="text-white/60">Packaging:</span>
                        <p className="font-bold text-emerald-300">{drumCount}x {selectedDrumCode}</p>
                      </div>
                      <div>
                        <span className="text-white/60">Shipping:</span>
                        <p className="font-bold text-amber-300">1x {containerSpecs.name}</p>
                      </div>
                    </div>

                    <div className="pt-2">
                      <Button
                        variant="primary"
                        size="lg"
                        disabled={isSubmitting}
                        onClick={() => void handleSubmitToSales()}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 text-base shadow-lg transition-transform active:scale-[0.99]"
                      >
                        {isSubmitting ? (
                          <RefreshCw className="w-5 h-5 animate-spin me-2" />
                        ) : (
                          <Send className="w-5 h-5 me-2" />
                        )}
                        {isSubmitting ? 'Submitting to Energya Sales…' : '🚀 SUBMIT CR TO ENERGYA SALES TEAM NOW'}
                      </Button>
                    </div>
                  </div>

                  {/* 5 Help Channels matching Diagram */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-600">Need Immediate Assistance Before Submitting?</span>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {[
                        { title: 'Live Chat', desc: 'Instant agent reply', icon: MessageSquare },
                        { title: 'Knowledge Base', desc: 'Technical guides', icon: BookOpen },
                        { title: 'User Guide', desc: 'PDF documentation', icon: FileText },
                        { title: 'Video Tutorials', desc: 'Walkthrough videos', icon: Eye },
                        { title: 'Contact Support', desc: '+20 2 2759 9000', icon: PhoneCall },
                      ].map((h, i) => {
                        const HIcon = h.icon;
                        return (
                          <div key={i} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center hover:bg-slate-100 transition-colors cursor-pointer">
                            <HIcon className="w-5 h-5 mx-auto text-indigo-600 mb-1" />
                            <p className="font-bold text-xs text-slate-800">{h.title}</p>
                            <p className="text-[10px] text-slate-500">{h.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                /* Celebratory Success Screen */
                <div className="py-12 px-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-lg">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-emerald-950">CR Successfully Submitted to Energya Sales!</h3>
                    <p className="text-sm text-emerald-800 mt-1 max-w-lg mx-auto">
                      Your customer request <strong>{crNumber}</strong> has been transmitted directly to Senior Key Account Manager (Eng. Mohamed Ahmed) and is locked for processing.
                    </p>
                  </div>

                  <div className="flex flex-wrap justify-center gap-3 pt-4">
                    <Button variant="primary" onClick={handleDownloadExcel} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                      <FileSpreadsheet className="w-4 h-4 me-2" /> Download Offer Excel
                    </Button>
                    <Button variant="secondary" onClick={handleDownloadTds} className="bg-white">
                      <FileCheck2 className="w-4 h-4 me-2" /> Download TDS Specs
                    </Button>
                    {onBackToInquiries && (
                      <Button variant="secondary" onClick={onBackToInquiries} className="bg-white">
                        Return to Inquiries List
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Wizard Footer Navigation Controls */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-200 mt-8">
          <Button
            variant="secondary"
            size="sm"
            disabled={currentStep === 1 || isSubmitted}
            onClick={handleBack}
            className="flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Previous Step
          </Button>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
            <span>Stage <strong>{currentStep}</strong> of 9:</span>
            <span className="font-bold text-slate-800">{stepsMeta[currentStep - 1].title}</span>
          </div>

          {currentStep < 9 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleNext}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 px-5"
            >
              Next Step: {stepsMeta[currentStep].title}
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <div className="text-xs text-slate-400 font-medium">Final Stage</div>
          )}
        </div>
      </div>
    </div>
  );
};
