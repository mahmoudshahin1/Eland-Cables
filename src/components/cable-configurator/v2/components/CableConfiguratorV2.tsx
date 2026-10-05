import React, { useState, useMemo, useEffect } from 'react';
import { CustomerPortalTab } from '../../../../types';
import { SelectionStateV2, CableRecordV2, TechnicalValidationResultV2 } from '../types';
import {
  filterCableRecordsV2,
  getAvailableOptionsV2,
  parseMasterCableRecordV2,
} from '../services/cableSelectionEngineV2';
import { describeCableEvaluateError, evaluateCableViaApi } from '../../../../api/cableAuthorityApi';
import { selectionsToConfig } from '../../../../api/cableAuthorityMapping';
import {
  presentCableAuthorityDecision,
  presentPendingCableValidation,
} from '../services/technicalValidationPresentationV2';
import { sanitizeSelectionsAfterChange } from '../services/parameterCascadingRulesV2';
import { DEFAULT_FAMILY_SUBTYPES } from '../services/masterDataServiceV2';
import { CascadingParameterGridV2 } from './CascadingParameterGridV2';
import { CableResultPanelV2 } from './CableResultPanelV2';
import { CuttingLengthSectionV2 } from './CuttingLengthSectionV2';
import { DrumSelectionSectionV2 } from './DrumSelectionSectionV2';
import { CostingSectionV2 } from './CostingSectionV2';
import { QuotationSectionV2 } from './QuotationSectionV2';
import { Badge, StatusBadge } from '../../../ui/Badge';
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Check,
  ChevronRight,
} from 'lucide-react';
import { loadAuthoritativeCableCatalog } from '../../../../services/masterDataApiService';
import { useAuth } from '../../../../context/AuthContext';
import {
  buildConfigurationSnapshot,
  canProceedToDownstream,
} from '../services/v2CableConfigurationService';
import {
  addV2InquiryLine,
  createV2Inquiry,
  persistV2ConfigurationSnapshot,
} from '../../../../services/v2InquiryConfigurationApiService';
import type { DrumSelectionHandoffDto } from '../../../../services/v2CuttingLengthApiService';
import { V2InquiryConfigurationPanel } from '../../../inquiry-quotation/V2InquiryConfigurationPanel';

interface CableConfiguratorV2Props {
  onNavigateTab?: (tab: CustomerPortalTab) => void;
  onSetGeneratedCableCode?: (code: string) => void;
  onSelectResolvedCable?: (cable: CableRecordV2) => void;
  v2InquiryId?: string;
  v2LineId?: string;
  customerMode?: boolean;
  onConfigurationSaved?: () => void;
}

export const CableConfiguratorV2: React.FC<CableConfiguratorV2Props> = ({
  onNavigateTab,
  onSetGeneratedCableCode,
  onSelectResolvedCable,
  v2InquiryId,
  v2LineId,
  customerMode = false,
  onConfigurationSaved,
}) => {
  const { jwtToken, currentUser } = useAuth();
  const isCustomerActor = customerMode || currentUser?.userType === 'customer';
  // -------------------------------------------------------------
  // Master Catalog Records (PostgreSQL-primary; LS mirror non-authoritative)
  // -------------------------------------------------------------
  const [catalogItems, setCatalogItems] = useState<CableRecordV2[]>([]);
  const [catalogSource, setCatalogSource] = useState<'POSTGRESQL' | 'LOCALSTORAGE_FALLBACK'>('LOCALSTORAGE_FALLBACK');
  const [serverDecision, setServerDecision] = useState<TechnicalValidationResultV2 | null>(null);
  const [evaluateLoading, setEvaluateLoading] = useState(false);
  const [evaluateError, setEvaluateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadAuthoritativeCableCatalog(jwtToken).then((resolved) => {
      if (cancelled) return;
      setCatalogItems(resolved.data.map(parseMasterCableRecordV2));
      setCatalogSource(resolved.source);
    });
    return () => {
      cancelled = true;
    };
  }, [jwtToken]);

  useEffect(() => {
    const handleUpdate = () => {
      // Event may carry mirrored PG payload; still re-load preferring API when signed in.
      void loadAuthoritativeCableCatalog(jwtToken).then((resolved) => {
        setCatalogItems(resolved.data.map(parseMasterCableRecordV2));
        setCatalogSource(resolved.source);
      });
    };
    window.addEventListener('cableCatalogUpdated', handleUpdate);
    return () => window.removeEventListener('cableCatalogUpdated', handleUpdate);
  }, [jwtToken]);

  const totalMasterCount = catalogItems.length;
  const catalogAuthorityLabel =
    catalogSource === 'POSTGRESQL' ? 'PostgreSQL' : 'localStorage (non-authoritative)';


  // -------------------------------------------------------------
  // V2 Selection State
  // -------------------------------------------------------------
  const [selections, setSelections] = useState<SelectionStateV2>({
    selectionMode: 'TECHNICAL',
    family: 'UGC',
    voltageClass: 'MV',
    voltage: '6/10 kV (6.35/11 kV)',
    conductorMaterial: 'CU',
    conductorClass: 'Class 2 — Stranded',
    conductorSize: '120 mm²',
    cores: '1 Core',
    coresCount: 1,
    coreColors: { 1: 'Black' },
    insulation: 'XLPE',
    outerSemiConductor: 'Strippable',
    screenType: 'Copper Wire',
    screenCSA: '16 mm²',
    armour: 'No Armour',
    sheathing: 'MDPE',
    sheathingColor: 'Black',
    specialAdditives: ['UV Resistant'],
    cpr: 'No',
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setEvaluateLoading(true);
      setEvaluateError(null);
      // Existing evaluate API: /api/cables/evaluate
      evaluateCableViaApi(
        { config: selectionsToConfig(selections) },
        { token: jwtToken }
      )
        .then((payload) => {
          if (!payload?.decision) return;
          setServerDecision(presentCableAuthorityDecision(selections, payload.decision, catalogItems));
        })
        .catch((err: unknown) => {
          const described = describeCableEvaluateError(err);
          setEvaluateError(described.message);
        })
        .finally(() => {
          setEvaluateLoading(false);
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [selections, catalogItems, jwtToken]);

  const [manuallySelectedCable, setManuallySelectedCable] = useState<CableRecordV2 | null>(null);
  const [activeInquiryId, setActiveInquiryId] = useState<string | undefined>(v2InquiryId);
  const [activeLineId, setActiveLineId] = useState<string | undefined>(v2LineId);
  const [persistedSnapshotId, setPersistedSnapshotId] = useState<string | undefined>();
  const [panelRefreshKey, setPanelRefreshKey] = useState(0);
  const [cuttingHandoff, setCuttingHandoff] = useState<DrumSelectionHandoffDto | null>(null);
  const [drumPlanConfirmed, setDrumPlanConfirmed] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // -------------------------------------------------------------
  // Filtered Master Records (for Mode 1 and suggestions)
  // -------------------------------------------------------------
  const filteredRecords = useMemo(() => {
    return filterCableRecordsV2(catalogItems, selections);
  }, [catalogItems, selections]);

  // -------------------------------------------------------------
  // Available Dynamic Options
  // -------------------------------------------------------------
  const availableOptions = useMemo(() => {
    return getAvailableOptionsV2(filteredRecords);
  }, [filteredRecords]);

  // -------------------------------------------------------------
  // True Technical Validation & Multi-State Resolution
  // -------------------------------------------------------------
  const validationResult: TechnicalValidationResultV2 = serverDecision || presentPendingCableValidation(selections);

  const catalogAuthoritative = catalogSource === 'POSTGRESQL';
  const configurationSnapshot = buildConfigurationSnapshot({
    selections,
    validation: validationResult,
    catalogSource,
    catalogAuthoritative,
    actorContext: {
      userId: currentUser?.id,
      email: currentUser?.email,
      role: currentUser?.role,
      customerCode: currentUser?.customerCode,
    },
  });
  const canProceedToCutting = canProceedToDownstream(configurationSnapshot, 'cuttingLength');
  const canProceedToDrum = canProceedToDownstream(configurationSnapshot, 'drumSelection');

  // Broadcast resolved cable code to parent if available
  useEffect(() => {
    if (validationResult.matchingCable && onSetGeneratedCableCode) {
      onSetGeneratedCableCode(
        validationResult.matchingCable.materialNumber || validationResult.matchingCable.itemCode
      );
    }
  }, [validationResult.matchingCable, onSetGeneratedCableCode]);

  // -------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------
  const handleUpdateParam = (field: keyof SelectionStateV2, value: any) => {
    setManuallySelectedCable(null);
    setSelections((prev) => {
      let next: SelectionStateV2 = { ...prev, [field]: value };

      if (field === 'family' && value && DEFAULT_FAMILY_SUBTYPES[value as string]) {
        next.familySubType = DEFAULT_FAMILY_SUBTYPES[value as string][0];
      }

      // Synchronize coresCount when cores changes
      if (field === 'cores') {
        const cNum = parseInt(value ? value.toString() : '1', 10) || 1;
        next.coresCount = cNum;
        const updatedColors: Record<number, string> = { ...(prev.coreColors || {}) };
        for (let i = 1; i <= cNum; i++) {
          if (!updatedColors[i]) {
            updatedColors[i] = i === 1 ? 'Black' : i === 2 ? 'Brown' : i === 3 ? 'Grey' : 'Blue';
          }
        }
        next.coreColors = updatedColors;
      }

      // Synchronize voltageClass when voltage changes
      if (field === 'voltage' && value) {
        const v = value.toString();
        if (v.includes('0.6/1') || v.includes('300/500') || v.includes('450/750') || v.includes('600/1000')) {
          next.voltageClass = 'LV';
          next.outerSemiConductor = 'N/A';
          next.screenType = 'No Screen';
        } else if (
          v.includes('6/10') ||
          v.includes('12/20') ||
          v.includes('18/30') ||
          v.includes('3.6/6') ||
          v.includes('8.7/15') ||
          v.includes('11 kV') ||
          v.includes('6.35/11') ||
          v.includes('12.7/22') ||
          v.includes('19/33')
        ) {
          next.voltageClass = 'MV';
          next.familySubType = 'MV';
          if (!next.outerSemiConductor || next.outerSemiConductor === 'N/A') next.outerSemiConductor = 'Strippable';
          if (!next.screenType || next.screenType === 'No Screen') next.screenType = 'Copper Wire';
        } else if (v.includes('66 kV') || v.includes('110 kV') || v.includes('132 kV')) {
          next.voltageClass = 'HV';
          next.familySubType = 'HV';
          if (!next.outerSemiConductor || next.outerSemiConductor === 'N/A') next.outerSemiConductor = 'Non-Strippable';
          if (!next.screenType || next.screenType === 'No Screen') next.screenType = 'Metallic Screen';
        }
      }

      if (field === 'voltageClass' && value) {
        next.familySubType = value.toString();
      }

      next = sanitizeSelectionsAfterChange(next, field);
      return next;
    });
  };

  const handleUpdateCoreColor = (coreIndex: number, color: string) => {
    setSelections((prev) => ({
      ...prev,
      coreColors: {
        ...(prev.coreColors || {}),
        [coreIndex]: color,
      },
    }));
  };

  const handleScrollToParameters = () => {
    const el = document.getElementById('v2-parameter-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleScrollToCutting = () => {
    const el = document.getElementById('v2-cutting-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSaveConfiguration = async () => {
    if (!jwtToken) {
      setSaveError('Sign in is required to persist configuration on the server.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      let inquiryId = activeInquiryId;
      let lineId = activeLineId;
      if (!inquiryId) {
        const inquiry = await createV2Inquiry(jwtToken, {
          projectName: validationResult.summaryDescription || 'V2 Cable Configuration',
        });
        inquiryId = inquiry.id;
        setActiveInquiryId(inquiryId);
      }
      if (!lineId) {
        const { line } = await addV2InquiryLine(jwtToken, inquiryId, {
          cableDescription: validationResult.summaryDescription,
        });
        lineId = line.id;
        setActiveLineId(lineId);
      }
      const result = await persistV2ConfigurationSnapshot(jwtToken, inquiryId, lineId, {
        selections,
        catalogSource,
        catalogAuthoritative,
        cableDescription: validationResult.summaryDescription,
      });
      setPersistedSnapshotId(result.line.v2CurrentSnapshotId || undefined);
      setPanelRefreshKey((k) => k + 1);
      setSaveMessage(
        `Saved snapshot ${result.snapshot.snapshotId} on inquiry ${result.inquiry.inquiryNumber}.`
      );
      onConfigurationSaved?.();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    { num: 1, label: 'Family & Voltage', done: Boolean(selections.family && selections.voltage) },
    { num: 2, label: 'Conductor', done: Boolean(selections.conductorMaterial && selections.conductorSize) },
    { num: 3, label: 'Cores & Colors', done: Boolean(selections.cores) },
    { num: 4, label: 'Insulation', done: Boolean(selections.insulation) },
    { num: 5, label: 'Screen & Armour', done: Boolean(selections.screenType || selections.armour) },
    { num: 6, label: 'Sheathing', done: Boolean(selections.sheathing) },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ----------------------------------------------------------- */}
      {/* PROGRESS STEPPER (7 Sections)                               */}
      {/* ----------------------------------------------------------- */}
      {!catalogAuthoritative && (
        <div className="p-3 rounded-xl border border-warning-200 dark:border-amber-800 bg-warning-50 dark:bg-amber-950/30 text-xs text-warning-900 dark:text-amber-200">
          Cable catalog is loading from <strong>localStorage (non-authoritative)</strong>. Downstream
          cutting length, drum selection, and costing are blocked until PostgreSQL Cable Master is available.
        </div>
      )}

      {configurationSnapshot.bomGovernanceBlocked && (
        <div className="p-3 rounded-xl border border-error-200 dark:border-red-900 bg-error-50 dark:bg-red-950/30 text-xs text-error-900 dark:text-red-200">
          <strong>ENGINEERING DATA BLOCKED</strong> — {configurationSnapshot.unresolvedBomConflictCount}{' '}
          unresolved Cable BOM governance conflicts. Costing and quotation paths remain blocked (Task
          04B-13). Configuration matching may proceed; no silent BOM fallback.
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Server persistence (V2)</p>
            <button
              type="button"
              onClick={() => void handleSaveConfiguration()}
              disabled={saving}
              className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save configuration snapshot'}
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Persists immutable snapshot to PostgreSQL. Submitted inquiries do not rely on localStorage.
          </p>
          {saveMessage && <p className="text-xs text-emerald-700">{saveMessage}</p>}
          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
        </div>
        <V2InquiryConfigurationPanel inquiryId={activeInquiryId} refreshKey={panelRefreshKey} internalView={!isCustomerActor} />
      </div>

      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-x-auto">
        <div className="flex items-center justify-between min-w-[720px] text-xs font-semibold">
          {steps.map((s, idx) => (
            <React.Fragment key={s.num}>
              <div className="flex items-center gap-1.5 font-display">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    s.done
                      ? 'bg-brand-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {s.done ? '✓' : s.num}
                </span>
                <span className={s.done ? 'text-slate-900 dark:text-white font-bold' : 'text-slate-500 dark:text-slate-400'}>
                  {s.label}
                </span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
            </React.Fragment>
          ))}
          <div
            className={`flex items-center gap-1.5 font-display font-bold ${
              validationResult.status === 'EXISTING_APPROVED'
                ? 'text-success-600'
                : validationResult.status === 'VALID_NEW_CABLE'
                ? 'text-brand-600'
                : 'text-error-600'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full text-white flex items-center justify-center text-[10px] font-bold ${
                validationResult.status === 'EXISTING_APPROVED'
                  ? 'bg-success-500'
                  : validationResult.status === 'VALID_NEW_CABLE'
                  ? 'bg-brand-500'
                  : 'bg-error-500'
              }`}
            >
              7
            </span>
            <span>Validation Result</span>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------- */}
      {/* PARAMETER GRID                                              */}
      {/* ----------------------------------------------------------- */}
      <div
        id="v2-parameter-section"
        className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
              Cable Technical Parameter Configurator
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              27-parameter cascading technical selection engine with catalog auto-resolution · {totalMasterCount}{' '}
              masters from {catalogAuthorityLabel}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {evaluateLoading && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Evaluating…</span>
            )}
            {evaluateError && (
              <span className="text-[11px] text-error-600 dark:text-red-400 max-w-xs truncate" title={evaluateError}>
                {evaluateError}
              </span>
            )}
            {validationResult.status === 'EXISTING_APPROVED' ? (
              <Badge tone="success" className="font-bold gap-1 py-1 px-2.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Existing Approved Cable Found</span>
              </Badge>
            ) : validationResult.status === 'VALID_NEW_CABLE' ? (
              <Badge tone="brand" className="font-bold gap-1 py-1 px-2.5">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Valid Design (New Cable Required)</span>
              </Badge>
            ) : (
              <Badge tone="error" className="font-bold gap-1 py-1 px-2.5">
                <XCircle className="h-3.5 w-3.5" />
                <span>{validationResult.errors.length} Conflict(s) Detected</span>
              </Badge>
            )}
          </div>
        </div>

        <CascadingParameterGridV2
          selections={selections}
          availableOptions={availableOptions}
          filteredRecords={filteredRecords}
          totalMasterCount={totalMasterCount}
          onUpdateParam={handleUpdateParam}
          onUpdateCoreColor={handleUpdateCoreColor}
        />
      </div>

      {/* ----------------------------------------------------------- */}
      {/* RESOLUTION RESULT PANEL (after parameters)                  */}
      {/* ----------------------------------------------------------- */}
      <CableResultPanelV2
        selections={selections}
        validationResult={validationResult}
        onProceedToCuttingLength={handleScrollToCutting}
        onResetOrModify={handleScrollToParameters}
        onSelectCable={onSelectResolvedCable}
      />

      {/* ----------------------------------------------------------- */}
      {/* CUTTING LENGTH & PRODUCTION DRUM ASSIGNMENT                 */}
      {/* ----------------------------------------------------------- */}
      {validationResult.matchingCable && canProceedToCutting && (
        <div id="v2-cutting-section">
          <CuttingLengthSectionV2
            resolvedCable={validationResult.matchingCable}
            onNavigateTab={onNavigateTab}
            configurationSnapshotId={persistedSnapshotId}
            inquiryId={activeInquiryId}
            lineId={activeLineId}
            jwtToken={jwtToken}
            onPlanSaved={() => setPanelRefreshKey((k) => k + 1)}
            onHandoffReady={setCuttingHandoff}
          />
        </div>
      )}
      {validationResult.matchingCable && canProceedToDrum && cuttingHandoff?.drumHandoffReady && (
        <div id="v2-drum-section" className="mt-4">
          <DrumSelectionSectionV2
            resolvedCable={validationResult.matchingCable}
            handoff={cuttingHandoff}
            inquiryId={activeInquiryId}
            lineId={activeLineId}
            jwtToken={jwtToken}
            onPlanSaved={() => setPanelRefreshKey((k) => k + 1)}
            onDrumPlanConfirmed={setDrumPlanConfirmed}
          />
        </div>
      )}
      {validationResult.matchingCable && drumPlanConfirmed && !isCustomerActor && (
        <CostingSectionV2
          inquiryId={activeInquiryId}
          lineId={activeLineId}
          jwtToken={jwtToken}
          drumPlanConfirmed={drumPlanConfirmed}
          bomGovernanceBlocked={configurationSnapshot.bomGovernanceBlocked}
          unresolvedBomConflictCount={configurationSnapshot.unresolvedBomConflictCount}
          onCostingUpdated={() => setPanelRefreshKey((k) => k + 1)}
        />
      )}
      {activeInquiryId && validationResult.matchingCable && drumPlanConfirmed && !isCustomerActor && (
        <QuotationSectionV2 inquiryId={activeInquiryId} />
      )}
      {validationResult.matchingCable && !canProceedToCutting && (
        <div
          id="v2-cutting-section"
          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-xs text-slate-600 dark:text-slate-400"
        >
          Cutting Length is blocked — flow state <strong>{configurationSnapshot.flowState}</strong>.
          Resolve validation or restore authoritative PostgreSQL catalog before proceeding.
        </div>
      )}
    </div>
  );
};
