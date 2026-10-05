import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  Download,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  History,
  Layers,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Ruler,
  Save,
  Scale,
  Search,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Upload,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  buildHeaderFormFromInquiry,
  buildUpdatePayloadFromForm,
  canShowInquiryCalculate,
  canShowInquirySubmit,
  collectInquirySubmitMissingItems,
  InquiryHeaderFormState,
  InquirySubmitMissingItem,
} from '../../services/inquiryHeaderFormService';
import { suggestDrumPlan, validateCuttingLength } from '../../domain/drumPlanService';
import { canEditLineTechnicalAttachments } from '../../domain/inquiryLineAttachments';
import { SystemNotification } from '../../types';
import { useDrumMasterList } from '../common/DrumMasterSelect';
import { InquiryDrumsTable } from './InquiryDrumsTable';
import {
  findAllDrumMastersForInquiryLine,
  resolveDrumDescription,
} from '../../services/drumMasterService';
import { InquiryHeaderForm } from './InquiryHeaderForm';
import { InquiryFieldVisibilityPanel } from './InquiryFieldVisibilityPanel';
import { InquirySummaryBar } from './InquirySummaryBar';
import { WorkflowStatusIndicator } from './WorkflowStatusIndicator';
import { InquiryColumnVisibilityModal } from './InquiryColumnVisibilityModal';
import { InquiryCuttingDrumSelectionModal } from './InquiryCuttingDrumSelectionModal';
import { InquiryLineEditorModal } from './InquiryLineEditorModal';
import { InquiryV2TabBridge } from './InquiryV2TabBridge';
import { InquiryContainerStudyPanel } from './InquiryContainerStudyPanel';
import { CustomerContainerStudyStatus } from '../customer/CustomerContainerStudyStatus';
import {
  normalizeInquiryTab,
  resolveInquiryWorkspaceTabs,
  type InquiryWorkspaceTab,
} from './inquiryWorkspaceTabs';
import { isV2InquiryMetadata } from '../../domain/v2InquiryWorkflow';
import { canCalculateInquiry, canSubmitInquiry } from '../../domain/inquiryProcessCommands';
import { fetchV2Quotation, type V2QuotationDto } from '../../services/v2QuotationApiService';
import { CustomerQuotationView } from '../customer/CustomerQuotationView';
import { InquiryAutomaticProcessingPanel } from './InquiryAutomaticProcessingPanel';
import { QuotationSectionV2 } from '../cable-configurator/v2/components/QuotationSectionV2';
import { CommercialOfferDocumentsPanel } from './CommercialOfferDocumentsPanel';
import { computeCableOrderLengthRange, parseInquiryDrumSchedule } from '../../domain/inquiryDrumSchedule';
import { AddInquiryLineInput } from '../../domain/commercialDomain';
import {
  addCommercialInquiryLine,
  calculateInquiryCost,
  calculateInquiryLineCost,
  cancelCommercialInquiry,
  CommercialInquiryDto,
  CommercialInquiryLineDto,
  createCommercialInquiryVersion,
  deleteCommercialInquiryLine,
  duplicateCommercialInquiryLine,
  fetchCommercialInquiry,
  fetchCommercialInquiryBundle,
  fetchCommercialInquiryVersions,
  fetchInquiryActivity,
  fetchInquiryFieldDefinitions,
  fetchInquiryLineCosting,
  formatInquiryLineValue,
  formatInquiryStatus,
  generateQuotationFromInquiry,
  inquiryDisplayRef,
  inquiryEstimatedValue,
  inquirySummary,
  resolveInquiryLineCurrency,
  InquiryActivityEvent,
  InquiryLineCalculateOutcome,
  LineCostingResult,
  reorderCommercialInquiryLines,
  resolveInquiryLineTotalLengthMeters,
  submitCommercialInquiry,
  updateCommercialInquiry,
  updateCommercialInquiryLine,
  uploadInquiryAttachment,
  deleteInquiryAttachment,
  downloadInquiryAttachment,
  exportInquiryExcel,
} from '../../services/commercialInquiryApiService';
import {
  calculateVipInquiry,
  type VipCalculateGateDto,
  type VipCalculateResultDto,
} from '../../services/v2InquiryConfigurationApiService';
import { CableSearchSelectModal } from '../common/CableSearchSelectModal';
import { autoConfirmPersistedCommercialDrumSchedule } from '../../services/confirmInquiryDrumPlanFromSchedule';
import { InquiryLineAttachmentsCell, inquiryLinesMissingTechnicalOffer } from './InquiryLineAttachmentsCell';
import { CommercialFulfillmentPanel } from './CommercialFulfillmentPanel';
import {
  INQUIRY_HEADER_FIELDS,
  INQUIRY_LINE_COLUMNS,
  applyPlatformFieldOverrides,
  loadHeaderFieldPreference,
  columnEligibleForActor,
  isColumnSelected,
  loadLineColumnPreference,
  saveHeaderFieldPreference,
  saveLineColumnPreference,
  visibleFieldsForUser,
} from '../../services/inquiryFieldManifest';
import { formatCommercialPriceAmount } from '../../domain/commercialLinePricingDisplay';
import { StatusBadge } from '../ui/Badge';
import { WoodenDrumIcon } from '../ui/icons';
import {
  CustomerInquiryDetailHero,
  CustomerInquiryFooterKpis,
  CustomerInquiryPrimaryActions,
} from '../customer/CustomerInquiryDetailChrome';
import {
  customerInquiryPresentationTabs,
  inquiryCuttingDrumsWorkspace,
  presentationTabFromWorkspace,
  shouldMountInquiryV2BridgeInCutting,
  shouldMountInquiryV2BridgeInPacking,
  workspaceTabForPresentation,
} from '../customer/customerInquiryDetailPresentation';

interface CommercialInquiryDetailProps {
  inquiryId: string;
  onBack: () => void;
  onInquiryChanged?: (inquiry: CommercialInquiryDto) => void;
  onAddNotification?: (notif: SystemNotification) => void;
  portalMode?: 'internal' | 'customer';
}

type DetailTab = InquiryWorkspaceTab;

function techStatusBadgeClass(status: string): string {
  const s = (status || '').toUpperCase();
  if (s === 'EXISTING_CABLE' || s.includes('VALID')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (s === 'CONFIGURATION_REQUIRED' || s.includes('TECHNIC')) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (s.includes('INVALID')) {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function costingStatusBadgeClass(status: string): string {
  const s = (status || '').toUpperCase();
  if (s === 'READY' || s === 'READY_FOR_COSTING' || s.includes('AVAILABLE') || s === 'CALCULATED') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (s.includes('WARNING')) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (s === 'NOT_READY' || s.includes('PENDING') || s.includes('NOT AVAILABLE')) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function formatTechStatus(status: string): string {
  const s = (status || '').toUpperCase();
  if (s === 'EXISTING_CABLE') return 'Mapped';
  if (s === 'CONFIGURATION_REQUIRED') return 'Config Required';
  if (s.includes('VALID')) return 'Valid';
  if (s.includes('INVALID')) return 'Invalid';
  return status || '—';
}

function formatCostingStatus(status: string): string {
  const s = (status || '').toUpperCase();
  if (s === 'READY' || s === 'READY_FOR_COSTING') return 'Ready';
  if (s === 'CALCULATED_WITH_WARNINGS' || s === 'CALCULATED WITH WARNINGS') return 'Calculated with warnings';
  if (s === 'NOT_READY') return 'Not Ready';
  if (s === 'NOT AVAILABLE') return 'Not available';
  return status || '—';
}

function positiveNumber(value: number | string | null | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseLineSpecs(line: CommercialInquiryLineDto): {
  voltage: string;
  conductor: string;
  conductorSize: string;
} {
  const payload = line.configurationPayload;
  if (payload) {
    return {
      voltage: String(payload.voltage ?? '—'),
      conductor: String(payload.conductor ?? '—'),
      conductorSize: String(payload.conductorSize ?? '—'),
    };
  }
  const desc = line.cableDescription || '';
  const voltMatch = desc.match(/\d+(?:\.\d+)?\/\d+(?:\.\d+)?\s*k?v/i);
  const sizeMatch = desc.match(/(\d+(?:\.\d+)?)\s*mm[²2]/i) || desc.match(/\d+\s*x\s*(\d+(?:\.\d+)?)/i);
  let conductor = '—';
  if (/alumin/i.test(desc)) conductor = 'Aluminium';
  else if (/copper|\bcu\b/i.test(desc)) conductor = 'Copper';
  return {
    voltage: voltMatch ? voltMatch[0] : '—',
    conductor,
    conductorSize: sizeMatch ? `${sizeMatch[1]} mm²` : '—',
  };
}

export const CommercialInquiryDetail: React.FC<CommercialInquiryDetailProps> = ({
  inquiryId,
  onBack,
  onInquiryChanged,
  onAddNotification,
  portalMode = 'internal',
}) => {
  const { jwtToken, currentUser, hasPermission } = useAuth();
  const isCustomer = portalMode === 'customer';
  const drumMaster = useDrumMasterList(true);
  const canQuote = hasPermission('salesQuotations') && !isCustomer;
  const canViewCosting =
    !isCustomer &&
    (hasPermission('costingPricing') ||
      hasPermission('salesQuotations') ||
      hasPermission('technicalOffice'));
  const canViewExtendedInternal = !isCustomer && hasPermission('salesQuotations');
  const canEditLineAttachments = canEditLineTechnicalAttachments({
    userType: currentUser?.userType,
    permissions: currentUser?.permissions,
  });

  const [inquiry, setInquiry] = useState<CommercialInquiryDto | null>(null);
  const [versions, setVersions] = useState<CommercialInquiryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>('lines');
  const [headerForm, setHeaderForm] = useState<InquiryHeaderFormState | null>(null);
  const [savingHeader, setSavingHeader] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [showFieldPanel, setShowFieldPanel] = useState(false);
  const [showLineColumns, setShowLineColumns] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [scheduleLine, setScheduleLine] = useState<CommercialInquiryLineDto | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [lineSearch, setLineSearch] = useState('');
  const prefUserId = currentUser?.id;
  const [headerPref, setHeaderPref] = useState(() => loadHeaderFieldPreference(prefUserId));
  const [linePref, setLinePref] = useState(() => loadLineColumnPreference(prefUserId));
  const [platformHeaderFields, setPlatformHeaderFields] = useState(INQUIRY_HEADER_FIELDS);
  const [platformLineFields, setPlatformLineFields] = useState(INQUIRY_LINE_COLUMNS);

  useEffect(() => {
    setHeaderPref(loadHeaderFieldPreference(prefUserId));
    setLinePref(loadLineColumnPreference(prefUserId));
  }, [prefUserId]);

  const [showCableModal, setShowCableModal] = useState(false);
  const [cableSearchTargetLineId, setCableSearchTargetLineId] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState<CommercialInquiryLineDto | null>(null);
  const [lineEditForm, setLineEditForm] = useState({
    requestedQuantity: '1',
    requestedLengthMeters: '1000',
    cuttingLengthMeters: '',
    drumType: '',
    cableDescription: '',
  });
  const [costingLineId, setCostingLineId] = useState<string | null>(null);
  const [costingBreakdown, setCostingBreakdown] = useState<LineCostingResult | null>(null);
  const [costingLoading, setCostingLoading] = useState(false);
  const [costingError, setCostingError] = useState<string | null>(null);
  const [activityEvents, setActivityEvents] = useState<InquiryActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [submitMissingItems, setSubmitMissingItems] = useState<InquirySubmitMissingItem[]>([]);
  const [inquiryCalcResults, setInquiryCalcResults] = useState<InquiryLineCalculateOutcome[] | null>(null);
  const [vipCalcResult, setVipCalcResult] = useState<VipCalculateResultDto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [compareVersionA, setCompareVersionA] = useState<string>('');
  const [compareVersionB, setCompareVersionB] = useState<string>('');
  const [cuttingError, setCuttingError] = useState<string | null>(null);
  const [v2Quotation, setV2Quotation] = useState<V2QuotationDto | null>(null);
  const [deliveryFocusSignal, setDeliveryFocusSignal] = useState(0);
  const [shipmentMasters, setShipmentMasters] = useState<{
    destinationPorts: Array<{ code: string; name: string }>;
    incoterms: Array<{ code: string; name: string }>;
    combinations?: Array<{
      countryCode: string;
      countryLabel: string;
      incotermCode: string;
      destinationPortCode: string;
      destinationPortName: string;
    }>;
  }>({ destinationPorts: [], incoterms: [], combinations: [] });
  const [containerStudyRefreshKey, setContainerStudyRefreshKey] = useState(0);
  const [headerExpandSignal, setHeaderExpandSignal] = useState(0);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  };

  const onInquiryChangedRef = useRef(onInquiryChanged);
  useEffect(() => {
    onInquiryChangedRef.current = onInquiryChanged;
  }, [onInquiryChanged]);

  const load = useCallback(async () => {
    if (!jwtToken) {
      setError('Sign in required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const bundle = await fetchCommercialInquiryBundle(jwtToken, inquiryId);
      setInquiry(bundle.inquiry);
      setHeaderForm(buildHeaderFormFromInquiry(bundle.inquiry));
      setShipmentMasters(bundle.shipmentMasters);
      try {
        const defs = await fetchInquiryFieldDefinitions(jwtToken);
        setPlatformHeaderFields(applyPlatformFieldOverrides(INQUIRY_HEADER_FIELDS, defs.fields || []));
        setPlatformLineFields(applyPlatformFieldOverrides(INQUIRY_LINE_COLUMNS, defs.fields || []));
      } catch {
        setPlatformHeaderFields(INQUIRY_HEADER_FIELDS);
        setPlatformLineFields(INQUIRY_LINE_COLUMNS);
      }

      try {
        const versionRows = await fetchCommercialInquiryVersions(jwtToken, inquiryId);
        setVersions(versionRows);
      } catch {
        setVersions([bundle.inquiry]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inquiry');
    } finally {
      setLoading(false);
    }
  }, [jwtToken, inquiryId]);

  const notifyInquiryChanged = (next: CommercialInquiryDto) => {
    onInquiryChangedRef.current?.(next);
  };

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (inquiry?.status === 'DRAFT' || inquiry?.status === 'UNDER_REVIEW') {
      setIsEditing(true);
    } else {
      setIsEditing(false);
    }
  }, [inquiry?.id, inquiry?.status]);

  useEffect(() => {
    if ((tab === 'activity' || tab === 'audit') && jwtToken && inquiry) {
      setActivityLoading(true);
      fetchInquiryActivity(jwtToken, inquiry.id)
        .then(setActivityEvents)
        .catch(() => setActivityEvents([]))
        .finally(() => setActivityLoading(false));
    }
  }, [tab, jwtToken, inquiry?.id]);

  useEffect(() => {
    if (isCustomer || tab !== 'costing' || !jwtToken || !inquiry || !costingLineId) return;
    fetchInquiryLineCosting(jwtToken, inquiry.id, costingLineId)
      .then((data) => setCostingBreakdown((data.breakdown as LineCostingResult) || null))
      .catch(() => setCostingBreakdown(null));
  }, [isCustomer, tab, jwtToken, inquiry?.id, costingLineId]);

  useEffect(() => {
    const lines = inquiry?.lines || [];
    if (lines.length && !costingLineId) {
      setCostingLineId(lines[0].id);
    }
  }, [inquiry?.lines, costingLineId]);

  const visibleHeaderFields = useMemo(
    () => visibleFieldsForUser(platformHeaderFields, headerPref, isCustomer),
    [platformHeaderFields, headerPref, isCustomer]
  );
  const visibleLineColumns = useMemo(
    () => visibleFieldsForUser(platformLineFields, linePref, isCustomer),
    [platformLineFields, linePref, isCustomer]
  );

  const summary = useMemo(() => (inquiry ? inquirySummary(inquiry) : null), [inquiry]);
  const isV2Inquiry = useMemo(
    () => Boolean(inquiry && isV2InquiryMetadata(inquiry.commercialMetadata)),
    [inquiry?.commercialMetadata]
  );
  const cuttingDrumsWorkspace = useMemo(
    () => inquiryCuttingDrumsWorkspace({ isCustomer, tab }),
    [isCustomer, tab]
  );
  const v2CuttingDrumsBridgeTab = isV2Inquiry
    ? cuttingDrumsWorkspace.v2BridgeTabs[0] ?? null
    : null;

  const tabsList = useMemo(
    () =>
      resolveInquiryWorkspaceTabs({
        isCustomer,
        canViewCosting,
        canViewExtendedInternal,
        counts: {
          lineCount: inquiry?.lines?.length || 0,
          documentCount: inquiry?.attachments?.length || 0,
          quotationCount: inquiry?.quotations?.length || 0,
          technicalOfferCount:
            inquiry?.lines?.filter((l) => (l.attachments || []).some((a) => a.kind === 'TECHNICAL_OFFER')).length || 0,
          notesCount: inquiry?.notes || inquiry?.commercialMetadata?.salesComments ? 1 : 0,
          historyCount: versions.length,
          activityCount: activityEvents.length || undefined,
        },
      }),
    [isCustomer, canViewCosting, canViewExtendedInternal, inquiry, versions.length, activityEvents.length]
  );

  const allowedTabIds = useMemo(() => tabsList.map((t) => t.id), [tabsList]);

  useEffect(() => {
    setTab((current) => normalizeInquiryTab(current, allowedTabIds));
  }, [allowedTabIds.join('|')]);

  useEffect(() => {
    if (!jwtToken || !inquiry || !isV2Inquiry || (tab !== 'quotation' && tab !== 'documents')) {
      if (tab !== 'quotation' && tab !== 'documents') setV2Quotation(null);
      return;
    }
    void fetchV2Quotation(jwtToken, inquiry.id)
      .then((result) => setV2Quotation(result.quotation))
      .catch(() => setV2Quotation(null));
  }, [jwtToken, inquiry?.id, tab, isV2Inquiry]);

  const submitSummaryLines = useMemo(() => {
    if (!inquiry?.lines) return [];
    return inquiry.lines.map((line) => ({
      lineNumber: line.lineNumber,
      description: line.cableDescription,
      cost: line.materialCost != null ? Number(line.materialCost) : null,
      currency: inquiry.currency,
      calculated: Boolean(line.costingCalculated || line.costingCalculationId || line.materialCost != null),
      hasMaterial: Boolean(line.materialNumber),
    }));
  }, [inquiry]);

  const mappedLinesNeedingCalc = submitSummaryLines.filter((l) => l.hasMaterial && !l.calculated);

  const submitMissingItemsFromForm = useMemo(() => {
    const meta = inquiry?.commercialMetadata || {};
    return collectInquirySubmitMissingItems({
      copperPriceRate: headerForm?.copperPriceRate || meta.copperPriceRate,
      aluminiumPriceRate: headerForm?.aluminiumPriceRate || meta.aluminiumPriceRate,
      deliveryDestination: headerForm?.deliveryDestination || meta.deliveryDestination,
      incoterms: headerForm?.incoterms || inquiry?.incoterms,
      lineCount: inquiry?.lines?.length || 0,
      mappedLinesNeedingCalc,
      linesMissingTechnicalOffer: inquiryLinesMissingTechnicalOffer(inquiry?.lines || []),
    });
  }, [headerForm, inquiry, mappedLinesNeedingCalc]);

  const logisticsStatusLabel = useMemo(() => {
    const status =
      costingBreakdown?.incotermChargeStatus ||
      costingBreakdown?.extensionLayers?.logistics?.status ||
      null;
    return status || 'not calculated';
  }, [costingBreakdown]);

  const versionCompare = useMemo(() => {
    const a = versions.find((v) => v.id === compareVersionA);
    const b = versions.find((v) => v.id === compareVersionB);
    if (!a || !b) return null;
    const valueA = inquiryEstimatedValue(a);
    const valueB = inquiryEstimatedValue(b);
    const diff = valueA != null && valueB != null ? valueB - valueA : null;
    return { a, b, valueA, valueB, diff };
  }, [versions, compareVersionA, compareVersionB]);

  const isEditable = inquiry?.status === 'DRAFT' || inquiry?.status === 'UNDER_REVIEW';
  const canSubmit =
    canShowInquirySubmit(inquiry?.status) && (inquiry ? canSubmitInquiry(inquiry) : false);
  const canCalculate =
    canShowInquiryCalculate(inquiry?.status, inquiry?.lines?.length || 0) &&
    (inquiry ? canCalculateInquiry(inquiry) : false);
  const isVipV2Inquiry =
    Boolean(inquiry && canCalculateInquiry(inquiry) && isV2InquiryMetadata(inquiry.commercialMetadata));
  const canNewVersion = inquiry?.status === 'SUBMITTED' && inquiry.isCurrent !== false;
  const canCancel = inquiry && inquiry.status !== 'CANCELLED' && inquiry.status !== 'CLOSED';

  const filteredLines = useMemo(() => {
    const lines = [...(inquiry?.lines || [])].sort((a, b) => a.lineNumber - b.lineNumber);
    const q = lineSearch.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((line) => {
      const specs = parseLineSpecs(line);
      return (
        line.cableDescription.toLowerCase().includes(q) ||
        (line.materialNumber || '').toLowerCase().includes(q) ||
        specs.voltage.toLowerCase().includes(q) ||
        specs.conductor.toLowerCase().includes(q) ||
        specs.conductorSize.toLowerCase().includes(q)
      );
    });
  }, [inquiry?.lines, lineSearch]);

  const selectedLineId = selectedLineIds.size === 1 ? [...selectedLineIds][0] : null;

  const saveHeader = async () => {
    if (!jwtToken || !inquiry || !headerForm) return false;
    setSavingHeader(true);
    try {
      const payload = buildUpdatePayloadFromForm(headerForm);
      payload.commercialMetadata = {
        ...(inquiry.commercialMetadata || {}),
        ...(payload.commercialMetadata || {}),
      };
      const updated = await updateCommercialInquiry(jwtToken, inquiry.id, payload);
      setInquiry(updated);
      setHeaderForm(buildHeaderFormFromInquiry(updated));
      notify('Inquiry header saved.');
      notifyInquiryChanged(updated);
      if (deliveryFocusSignal > 0) {
        setTab('container_study');
        setContainerStudyRefreshKey((n) => n + 1);
      }
      return true;
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Save failed');
      return false;
    } finally {
      setSavingHeader(false);
    }
  };

  const handleDiscardHeader = () => {
    if (!inquiry) return;
    setHeaderForm(buildHeaderFormFromInquiry(inquiry));
    notify('Changes discarded.');
  };

  const handleSubmit = async () => {
    if (!jwtToken || !inquiry) return;
    if (submitMissingItemsFromForm.length > 0) {
      setSubmitMissingItems(submitMissingItemsFromForm);
      setShowMissingModal(true);
      return;
    }
    if (isEditable) {
      const saved = await saveHeader();
      if (!saved) return;
    }
    setShowSubmitModal(true);
  };

  const confirmSubmit = async () => {
    if (!jwtToken || !inquiry) return;
    if (submitMissingItemsFromForm.length > 0) {
      setShowSubmitModal(false);
      setSubmitMissingItems(submitMissingItemsFromForm);
      setShowMissingModal(true);
      return;
    }
    setSubmitting(true);
    try {
      const updated = await submitCommercialInquiry(jwtToken, inquiry.id);
      setInquiry(updated);
      setShowSubmitModal(false);
      notify('Inquiry submitted.');
      notifyInquiryChanged(updated);
      onAddNotification?.({
        id: `notif-${Date.now()}`,
        title: 'Inquiry submitted',
        message: `${inquiryDisplayRef(updated)} has been submitted and is awaiting review.`,
        timestamp: new Date().toLocaleString(),
        read: false,
        type: 'system',
      });
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewVersion = async () => {
    if (!jwtToken || !inquiry) return;
    try {
      const updated = await createCommercialInquiryVersion(jwtToken, inquiry.id);
      setInquiry(updated);
      notify(`Opened version V${updated.versionNo}.`);
      notifyInquiryChanged(updated);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'New version failed');
    }
  };

  const handleCancel = async () => {
    if (!jwtToken || !inquiry) return;
    try {
      const updated = await cancelCommercialInquiry(jwtToken, inquiry.id);
      setInquiry(updated);
      setIsEditing(false);
      notify('Inquiry cancelled.');
      notifyInquiryChanged(updated);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Cancel failed');
    }
  };

  const handleGenerateQuotation = async () => {
    if (!jwtToken || !inquiry) return;
    try {
      await generateQuotationFromInquiry(jwtToken, inquiry.id);
      notify('Quotation generated.');
      setTab('quotation');
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Generate quotation failed');
    }
  };

  const printInquiryReport = (kind: 'summary' | 'costing' | 'offer') => {
    if (!inquiry) return;
    const lines = inquiry.lines || [];
    const title =
      kind === 'summary' ? 'Inquiry Summary' : kind === 'costing' ? 'Costing Breakdown' : 'Technical Offer';
    const rows = lines
      .map((line) => {
        const cutting = line.cuttingLengthMeters != null ? `${line.cuttingLengthMeters} m` : '—';
        const cost =
          !isCustomer && line.materialCost != null
            ? `${line.materialCost} ${inquiry.currency}`
            : isCustomer
              ? '—'
              : line.costingReadinessStatus || 'NOT_READY';
        return `<tr><td>${line.lineNumber}</td><td>${line.materialNumber || ''}</td><td>${line.cableDescription}</td><td>${line.requestedQuantity}</td><td>${resolveInquiryLineTotalLengthMeters(line)}</td><td>${cutting}</td><td>${line.drumType || 'DRUM_CONFIGURATION_REQUIRED'}</td><td>${cost}</td><td>${line.costingCalculationId || '—'}</td></tr>`;
      })
      .join('');
    const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
    if (!win) {
      notify('Pop-up blocked — allow pop-ups to print.');
      return;
    }
    win.document.write(`<!doctype html><html><head><title>${title} ${inquiry.inquiryNumber}</title>
      <style>body{font-family:sans-serif;padding:24px;color:#0f172a}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #cbd5e1;padding:6px;text-align:left}h1{font-size:18px}</style>
      </head><body>
      <h1>${title}</h1>
      <p>${inquiry.inquiryNumber} v${inquiry.versionNo} · ${inquiry.customerName} · ${inquiry.status} · ${inquiry.incoterms || ''} · ${inquiry.currency}</p>
      <p>Source: PostgreSQL inquiry + costing snapshot. Totals are shown only when Calculate returned READY. Missing configuration is never printed as zero.</p>
      <table><thead><tr><th>Line</th><th>Cable</th><th>Description</th><th>Drums</th><th>Length m</th><th>Cutting</th><th>Drum</th><th>Cost</th><th>costingCalculationId</th></tr></thead>
      <tbody>${rows}</tbody></table>
      ${kind === 'costing' && costingBreakdown ? `<pre>${JSON.stringify({ status: costingBreakdown.status, errorCode: costingBreakdown.errorCode, blockingReasons: costingBreakdown.blockingReasons, totals: costingBreakdown.totals }, null, 2)}</pre>` : ''}
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  const addLine = async () => {
    if (!jwtToken || !inquiry) return;
    setCableSearchTargetLineId(null);
    setShowCableModal(true);
  };

  const openCableSearchForLine = (lineId: string | null) => {
    setCableSearchTargetLineId(lineId);
    setShowCableModal(true);
  };

  const clearLineCable = async (lineId: string) => {
    if (!jwtToken || !inquiry) return;
    try {
      await updateCommercialInquiryLine(jwtToken, inquiry.id, lineId, {
        materialNumber: null,
        cableDescription: 'Cable line',
      });
      await load();
      setEditingLine(null);
      notify('Selected cable cleared from this inquiry line. Cable Master was not deleted.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Clear cable failed');
    }
  };

  const addLineFromCable = async (payload: {
    cableCode?: string;
    description?: string;
    quantity?: number;
    uom?: string;
    cuttingLengthMeters?: number;
    drumType?: string;
    cableTolerancePercent?: number;
    drumSchedule?: import('../../domain/inquiryDrumSchedule').InquiryDrumSchedule;
    requestedLengthMeters?: number;
  }) => {
    if (!jwtToken || !inquiry) return;
    const input: AddInquiryLineInput = {
      materialNumber: payload.cableCode,
      cableDescription: payload.description || 'Cable line',
      requestedQuantity: payload.quantity || 1,
      requestedLengthMeters: payload.requestedLengthMeters,
      quantityUom: payload.uom || 'M',
      cuttingLengthMeters: payload.cuttingLengthMeters,
      drumType: payload.drumType,
      cableTolerancePercent: payload.cableTolerancePercent,
      drumSchedule: payload.drumSchedule,
    };
    try {
      if (cableSearchTargetLineId) {
        await updateCommercialInquiryLine(jwtToken, inquiry.id, cableSearchTargetLineId, {
          materialNumber: payload.cableCode || null,
          cableDescription: payload.description || 'Cable line',
          requestedQuantity: payload.quantity,
          requestedLengthMeters: payload.requestedLengthMeters,
          quantityUom: payload.uom,
          cuttingLengthMeters: payload.cuttingLengthMeters,
          drumType: payload.drumType,
          cableTolerancePercent: payload.cableTolerancePercent,
          drumSchedule: payload.drumSchedule,
        });
        if (payload.drumSchedule) {
          try {
            await autoConfirmPersistedCommercialDrumSchedule({
              token: jwtToken,
              inquiryId: inquiry.id,
              lineId: cableSearchTargetLineId,
              schedule: payload.drumSchedule,
            });
          } catch {
            /* persist succeeded; confirm stays NOT CONFIRMED until the plan is valid */
          }
        }
        await load();
        setShowCableModal(false);
        setCableSearchTargetLineId(null);
        notify('Cable replaced on this inquiry line.');
        return;
      }
      const previousIds = new Set((inquiry.lines || []).map((line) => line.id));
      const updated = await addCommercialInquiryLine(jwtToken, inquiry.id, input);
      const created = (updated.lines || []).find((line) => !previousIds.has(line.id));
      if (created && payload.drumSchedule) {
        try {
          await autoConfirmPersistedCommercialDrumSchedule({
            token: jwtToken,
            inquiryId: inquiry.id,
            lineId: created.id,
            schedule: payload.drumSchedule,
          });
        } catch {
          /* persist succeeded; confirm stays NOT CONFIRMED until the plan is valid */
        }
        await load();
      } else {
        setInquiry(updated);
      }
      setShowCableModal(false);
      setCableSearchTargetLineId(null);
      notify('Line added.');
    } catch (err) {
      notify(err instanceof Error ? err.message : cableSearchTargetLineId ? 'Replace cable failed' : 'Add line failed');
    }
  };

  const openLineEditor = (line: CommercialInquiryLineDto) => {
    setEditingLine(line);
    setCuttingError(null);
    setLineEditForm({
      requestedQuantity: String(line.requestedQuantity ?? 1),
      requestedLengthMeters: String(line.requestedLengthMeters ?? 1000),
      cuttingLengthMeters: line.cuttingLengthMeters != null ? String(line.cuttingLengthMeters) : '',
      drumType: line.drumType || '',
      cableDescription: line.cableDescription,
    });
  };

  const saveLineEdit = async () => {
    if (!jwtToken || !inquiry || !editingLine) return;
    const requestedQuantity = positiveNumber(lineEditForm.requestedQuantity) ?? 1;
    const cuttingM = positiveNumber(lineEditForm.cuttingLengthMeters);
    const lengthM = resolveInquiryLineTotalLengthMeters({
      requestedQuantity,
      requestedLengthMeters: lineEditForm.requestedLengthMeters || editingLine.requestedLengthMeters,
      cuttingLengthMeters: cuttingM,
    });
    if (lengthM <= 0) {
      setCuttingError('Total length must be greater than zero.');
      return;
    }
    const cuttingCheck = validateCuttingLength(lengthM, cuttingM);
    if (!cuttingCheck.valid) {
      setCuttingError(cuttingCheck.message || 'Invalid cutting length');
      return;
    }
    setCuttingError(null);
    try {
      await updateCommercialInquiryLine(jwtToken, inquiry.id, editingLine.id, {
        cableDescription: lineEditForm.cableDescription,
        requestedQuantity,
        requestedLengthMeters: lengthM,
        cuttingLengthMeters: cuttingM,
        drumType: lineEditForm.drumType,
      });
      await load();
      setEditingLine(null);
      notify('Line updated.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Line update failed');
    }
  };

  const runCalculateInquiry = async () => {
    if (!jwtToken || !inquiry) return;
    if (isEditable) {
      const saved = await saveHeader();
      if (!saved) return;
    }
    setCostingLoading(true);
    setCostingError(null);
    setInquiryCalcResults(null);
    setVipCalcResult(null);
    try {
      if (isVipV2Inquiry) {
        const result = await calculateVipInquiry(jwtToken, inquiry.id);
        setVipCalcResult(result);
        if (result.status === 'COMPLETED' && result.financialOffer && result.quotation) {
          const refreshed = await fetchCommercialInquiry(jwtToken, inquiry.id);
          setInquiry(refreshed);
          notifyInquiryChanged(refreshed);
          notify(
            result.quotation.created
              ? `Quotation ${result.quotation.quotationNumber} created. Approval and issue remain governed.`
              : 'Automatic processing complete — quotation draft updated.'
          );
        } else {
          setCostingError(result.blockingReasons.join(' '));
          notify(
            result.status === 'QUOTATION_BLOCKED'
              ? 'Financial offer was not created — quotation is not ready.'
              : 'Automatic processing blocked — see processing status below.'
          );
        }
        return;
      }

      const { inquiry: updated, lines } = await calculateInquiryCost(jwtToken, inquiry.id);
      setInquiryCalcResults(lines);
      if (updated) {
        setInquiry(updated);
        notifyInquiryChanged(updated);
      }
      const selected = lines.find((row) => row.lineId === costingLineId);
      if (selected?.result) {
        setCostingBreakdown(selected.result);
      }
      const ready = lines.filter((row) => row.status === 'READY').length;
      const failed = lines.length - ready;
      notify(
        failed > 0
          ? `Calculated ${ready} of ${lines.length} line(s). See costing tab for per-line codes.`
          : `Calculated ${lines.length} line(s).`
      );
    } catch (err) {
      setCostingError(err instanceof Error ? err.message : 'Calculate failed');
      notify(err instanceof Error ? err.message : 'Calculate failed');
    } finally {
      setCostingLoading(false);
    }
  };

  const runCalculateCost = async (lineId: string) => {
    if (!jwtToken || !inquiry) return;
    setCostingLoading(true);
    setCostingError(null);
    try {
      const { result, inquiry: updated } = await calculateInquiryLineCost(jwtToken, inquiry.id, lineId);
      setCostingBreakdown(result);
      if (updated) {
        setInquiry(updated);
        notifyInquiryChanged(updated);
      }
      notify(result.status === 'READY' ? 'Cost calculated.' : 'Costing not ready.');
    } catch (err) {
      setCostingError(err instanceof Error ? err.message : 'Calculate failed');
      notify(err instanceof Error ? err.message : 'Calculate failed');
    } finally {
      setCostingLoading(false);
    }
  };

  const duplicateLine = async (lineId?: string) => {
    const id = lineId || selectedLineId;
    if (!jwtToken || !inquiry || !id) return;
    try {
      const updated = await duplicateCommercialInquiryLine(jwtToken, inquiry.id, id);
      setInquiry(updated);
      notify('Line duplicated.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Duplicate failed');
    }
  };

  const deleteLine = async (lineId?: string) => {
    const id = lineId || selectedLineId;
    if (!jwtToken || !inquiry || !id) return;
    try {
      await deleteCommercialInquiryLine(jwtToken, inquiry.id, id);
      await load();
      setSelectedLineIds(new Set());
      notify('Line deleted.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Delete line failed');
    }
  };

  const moveLine = async (direction: 'up' | 'down') => {
    if (!jwtToken || !inquiry || !selectedLineId) return;
    const lines = [...(inquiry.lines || [])].sort((a, b) => a.lineNumber - b.lineNumber);
    const index = lines.findIndex((l) => l.id === selectedLineId);
    if (index < 0) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= lines.length) return;
    const swapped = [...lines];
    [swapped[index], swapped[target]] = [swapped[target], swapped[index]];
    try {
      const updated = await reorderCommercialInquiryLines(
        jwtToken,
        inquiry.id,
        swapped.map((l) => l.id)
      );
      setInquiry(updated);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Reorder failed');
    }
  };

  const toggleLineSelection = (lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const toggleAllLines = () => {
    if (selectedLineIds.size === filteredLines.length) {
      setSelectedLineIds(new Set());
    } else {
      setSelectedLineIds(new Set(filteredLines.map((l) => l.id)));
    }
  };

  const lineCell = (line: CommercialInquiryLineDto, fieldId: string) => {
    const specs = parseLineSpecs(line);
    switch (fieldId) {
      case 'lineNumber':
        return line.lineNumber;
      case 'materialNumber':
        return <span className="font-mono font-bold text-slate-800">{line.materialNumber || '—'}</span>;
      case 'cableDescription':
        return <span className="font-medium text-slate-900">{line.cableDescription}</span>;
      case 'voltage':
        return specs.voltage;
      case 'conductor':
        return specs.conductor;
      case 'conductorSize':
        return specs.conductorSize;
      case 'requestedQuantity':
        return Number(line.requestedQuantity);
      case 'requestedLengthMeters':
        return resolveInquiryLineTotalLengthMeters(line).toLocaleString();
      case 'cuttingLengthMeters':
        return line.cuttingLengthMeters != null && Number.isFinite(Number(line.cuttingLengthMeters))
          ? Number(line.cuttingLengthMeters).toLocaleString()
          : '—';
      case 'cableTolerancePercent':
        return line.cableTolerancePercent != null && Number.isFinite(Number(line.cableTolerancePercent))
          ? `${Number(line.cableTolerancePercent)}%`
          : '—';
      case 'quantityUom':
        return line.quantityUom || 'M';
      case 'drumType': {
        const drums = findAllDrumMastersForInquiryLine(line.drumType, drumMaster);
        if (!drums.length) return line.drumType || '—';
        return drums
          .map((drum) => `${drum.drumCode} · ${resolveDrumDescription(drum)}`)
          .join(' + ');
      }
      case 'cableAuthorityStatus':
        return (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${techStatusBadgeClass(line.cableAuthorityStatus || '')}`}>
            {formatTechStatus(line.cableAuthorityStatus || '')}
          </span>
        );
      case 'costingReadinessStatus':
        return (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${costingStatusBadgeClass(line.costingReadinessStatus || '')}`}>
            {formatCostingStatus(line.costingReadinessStatus || '')}
          </span>
        );
      case 'value':
      case 'materialCost':
        return formatInquiryLineValue(line);
      case 'currency':
        return resolveInquiryLineCurrency(line, inquiry?.currency);
      case 'unitPrice':
      case 'totalValue': {
        const amount = fieldId === 'unitPrice' ? line.commercialUnitPrice : line.commercialLineTotal;
        return (
          <span>
            {formatCommercialPriceAmount(line.commercialPricingState, amount)}
            {line.commercialPricingState === 'RECALCULATION_REQUIRED' ? (
              <span className="block text-[10px] font-semibold text-amber-700">Recalculation Required</span>
            ) : null}
          </span>
        );
      }
      default:
        return '—';
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-slate-400">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-600 mx-auto mb-2" />
        <p className="text-sm font-medium">Loading commercial inquiry…</p>
      </div>
    );
  }

  if (error || !inquiry) {
    return (
      <div className="p-6 space-y-4">
        <button onClick={onBack} className="text-xs font-bold text-blue-600 flex items-center gap-1.5 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to inquiries
        </button>
        <div className="p-4 rounded-2xl border border-red-200 bg-red-50 text-red-800 text-sm flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <span>{error || 'Inquiry not found'}</span>
        </div>
      </div>
    );
  }

  const tabsListResolved = tabsList;

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl animate-in fade-in slide-in-from-top-2">
          {toast}
        </div>
      )}

      {isCustomer && (
        <div className="space-y-3">
          <CustomerInquiryDetailHero
            inquiry={inquiry}
            actions={
              <CustomerInquiryPrimaryActions
                isEditable={isEditable}
                canCalculate={canShowInquiryCalculate(inquiry.status, inquiry.lines?.length || 0)}
                canSubmit={canShowInquirySubmit(inquiry.status)}
                savingHeader={savingHeader}
                costingLoading={costingLoading}
                hasLines={(inquiry.lines || []).length > 0}
                onSave={() => void saveHeader()}
                onCalculate={() => void runCalculateInquiry()}
                onSubmit={() => void handleSubmit()}
                extra={
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowMoreMenu((v) => !v)}
                      className="inline-flex items-center h-9 px-3 rounded-lg text-[13px] font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50"
                      aria-label="More actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {showMoreMenu && (
                      <div className="absolute right-0 mt-1.5 w-52 rounded-2xl border border-slate-200 bg-white shadow-xl z-30 py-1.5 text-xs">
                        {isEditable && (
                          <button type="button" onClick={() => { handleDiscardHeader(); setShowMoreMenu(false); }} className="w-full px-4 py-2.5 text-left hover:bg-slate-50">
                            Discard
                          </button>
                        )}
                        <button type="button" onClick={() => { setShowFieldPanel((v) => !v); setShowMoreMenu(false); }} className="w-full px-4 py-2.5 text-left hover:bg-slate-50">
                          Field Visibility
                        </button>
                        {canNewVersion && (
                          <button type="button" onClick={() => { void handleNewVersion(); setShowMoreMenu(false); }} className="w-full px-4 py-2.5 text-left hover:bg-slate-50">
                            New Version
                          </button>
                        )}
                        {canCancel && (
                          <button type="button" onClick={() => { void handleCancel(); setShowMoreMenu(false); }} className="w-full px-4 py-2.5 text-left text-red-600 hover:bg-red-50">
                            Cancel Inquiry
                          </button>
                        )}
                        <button type="button" onClick={() => { setTab('overview'); setShowMoreMenu(false); }} className="w-full px-4 py-2.5 text-left hover:bg-slate-50">
                          Overview
                        </button>
                        <button type="button" onClick={() => { setTab('quotation'); setShowMoreMenu(false); }} className="w-full px-4 py-2.5 text-left hover:bg-slate-50">
                          Quotation
                        </button>
                        <button type="button" onClick={() => { printInquiryReport('summary'); setShowMoreMenu(false); }} className="w-full px-4 py-2.5 text-left hover:bg-slate-50">
                          Print inquiry summary
                        </button>
                        <button type="button" onClick={() => { printInquiryReport('offer'); setShowMoreMenu(false); }} className="w-full px-4 py-2.5 text-left hover:bg-slate-50">
                          Print technical offer
                        </button>
                        <button type="button" onClick={() => { notify('Export generated.'); setShowMoreMenu(false); }} className="w-full px-4 py-2.5 text-left hover:bg-slate-50">
                          Export Data
                        </button>
                      </div>
                    )}
                  </div>
                }
              />
            }
          />
        </div>
      )}

      {/* Top Workspace Header Bar */}
      {!isCustomer && (
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to inquiries</span>
        </button>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-1">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black text-brand-800 tracking-tight font-display">
                Commercial Inquiry / {inquiryDisplayRef(inquiry)} - V{inquiry.versionNo || 1}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
              <span className="font-mono">{inquiry.inquiryNumber}</span>
              <span>•</span>
              <StatusBadge status={inquiry.status} label={formatInquiryStatus(inquiry.status)} />
              <span>•</span>
              <span className="font-semibold text-slate-700">{inquiry.customerName}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {isEditable && (
              <>
                <button
                  type="button"
                  onClick={() => void saveHeader()}
                  disabled={savingHeader}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-blue-600 text-blue-700 bg-blue-50/50 hover:bg-blue-50 disabled:opacity-50 transition-colors"
                >
                  <Save className="h-3.5 w-3.5 text-blue-600" />
                  <span>{savingHeader ? 'Saving…' : 'Save'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDiscardHeader}
                  disabled={savingHeader}
                  className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  Discard
                </button>
              </>
            )}

            {isEditable && canCalculate && (
              <button
                type="button"
                onClick={() => void runCalculateInquiry()}
                disabled={costingLoading || (inquiry.lines || []).length === 0}
                title={
                  (inquiry.lines || []).length === 0
                    ? 'Add cable lines before submitting'
                    : isVipV2Inquiry
                      ? isCustomer
                        ? 'Submit for automatic engineering, pricing, and quotation'
                        : 'Automatic engineering validation, costing, pricing, financial offer, and quotation draft'
                      : 'Calculate all cable lines'
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {costingLoading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Calculator className="h-3.5 w-3.5" />
                )}
                <span>
                  {costingLoading
                    ? 'Processing…'
                    : isCustomer && isVipV2Inquiry
                      ? 'Submit for quotation'
                      : isVipV2Inquiry
                        ? 'Calculate'
                        : 'Calculate'}
                </span>
              </button>
            )}

            {(costingLoading && isVipV2Inquiry) || vipCalcResult ? (
              <div className="w-full mt-2">
                <InquiryAutomaticProcessingPanel
                  result={vipCalcResult}
                  loading={costingLoading && isVipV2Inquiry}
                  customerSafe={isCustomer}
                  onViewQuotation={() => setTab('quotation')}
                />
              </div>
            ) : null}

            {!isCustomer && vipCalcResult && vipCalcResult.status === 'COMPLETED' && vipCalcResult.optionalWarnings.length > 0 && (
              <div className="w-full mt-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950">
                <div className="flex items-center gap-1.5 font-bold mb-2">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  VIP Calculate complete — optional costs defaulted to zero
                </div>
                <ul className="space-y-1 mb-2">
                  {vipCalcResult.optionalComponents
                    .filter((c) => c.hasWarning)
                    .map((component) => (
                      <li key={component.code}>
                        <span className="font-semibold">{component.label}</span>:{' '}
                        {component.value === 0 ? '0 (not configured)' : component.value}
                        {component.warningMessage ? ` — ${component.warningMessage}` : ''}
                      </li>
                    ))}
                </ul>
                <p className="text-amber-800/90">
                  Zero values indicate costs that are not yet configured, not waived charges.
                </p>
              </div>
            )}

            {!isCustomer && vipCalcResult && vipCalcResult.status !== 'COMPLETED' && (
              <div className="w-full mt-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950">
                <div className="flex items-center gap-1.5 font-bold mb-2">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  VIP Calculate blocked — readiness gates
                </div>
                <ul className="space-y-1">
                  {vipCalcResult.gates
                    .filter((g: VipCalculateGateDto) => g.status === 'BLOCK' || g.status === 'WARN')
                    .map((gate: VipCalculateGateDto, idx: number) => (
                      <li key={`${gate.gate}-${gate.lineNumber ?? 'h'}-${idx}`}>
                        <span className="font-semibold">{gate.gate}</span>
                        {gate.lineNumber != null ? ` (L${gate.lineNumber})` : ''}: {gate.message}
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {canSubmit && (
              <button
                type="button"
                onClick={() => void handleSubmit()}
                title="Submit inquiry"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Submit</span>
              </button>
            )}

            {canNewVersion && (
              <button
                type="button"
                onClick={() => void handleNewVersion()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Version</span>
              </button>
            )}

            {canQuote && (
              <button
                type="button"
                onClick={() => void handleGenerateQuotation()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-brand-300 text-brand-700 bg-brand-50/40 hover:bg-brand-50 transition-colors"
              >
                <FileCheck2 className="h-3.5 w-3.5" />
                <span>Generate Quotation</span>
              </button>
            )}

            {canCancel && (
              <button
                type="button"
                onClick={() => void handleCancel()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-red-200 text-red-600 bg-red-50/30 hover:bg-red-50 transition-colors"
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>Cancel Inquiry</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowFieldPanel((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                showFieldPanel
                  ? 'border-blue-500 text-blue-700 bg-blue-50'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Field Visibility</span>
            </button>

            {/* More Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMoreMenu((v) => !v)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <MoreHorizontal className="h-4 w-4" />
                <span>More</span>
              </button>
              {showMoreMenu && (
                <div className="absolute right-0 mt-1.5 w-48 rounded-2xl border border-slate-200 bg-white shadow-xl z-30 py-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      printInquiryReport('summary');
                      setShowMoreMenu(false);
                    }}
                    className="w-full px-4 py-2.5 text-left flex items-center gap-2 hover:bg-slate-50 text-slate-700 font-medium"
                  >
                    <Printer className="h-3.5 w-3.5 text-slate-400" />
                    <span>Print inquiry summary</span>
                  </button>
                  {!isCustomer && (
                    <button
                      type="button"
                      onClick={() => {
                        printInquiryReport('costing');
                        setShowMoreMenu(false);
                      }}
                      className="w-full px-4 py-2.5 text-left flex items-center gap-2 hover:bg-slate-50 text-slate-700 font-medium"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-slate-400" />
                      <span>Print costing breakdown</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      printInquiryReport('offer');
                      setShowMoreMenu(false);
                    }}
                    className="w-full px-4 py-2.5 text-left flex items-center gap-2 hover:bg-slate-50 text-slate-700 font-medium"
                  >
                    <FileText className="h-3.5 w-3.5 text-slate-400" />
                    <span>Print technical offer</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      notify('Export generated.');
                      setShowMoreMenu(false);
                    }}
                    className="w-full px-4 py-2.5 text-left flex items-center gap-2 hover:bg-slate-50 text-slate-700 font-medium border-t border-slate-100 mt-1"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-400" />
                    <span>Export Data</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {isCustomer && ((costingLoading && isVipV2Inquiry) || vipCalcResult) ? (
        <InquiryAutomaticProcessingPanel
          result={vipCalcResult}
          loading={costingLoading && isVipV2Inquiry}
          customerSafe={isCustomer}
          onViewQuotation={() => setTab('quotation')}
        />
      ) : null}

      {/* Field Visibility Panel */}
      {showFieldPanel && (
        <InquiryFieldVisibilityPanel
          headerPref={headerPref}
          isCustomer={isCustomer}
          userId={prefUserId}
          onPrefChange={(pref) => setHeaderPref(pref)}
          onSaved={() => notify('Field visibility preferences saved.')}
        />
      )}

      <div className={isCustomer ? 'min-w-0 space-y-3' : 'contents'}>

      {/* 4-Section Inquiry Header Form */}
      {headerForm && (
        <InquiryHeaderForm
          form={headerForm}
          inquiry={inquiry}
          visibleFields={visibleHeaderFields}
          isEditable={isEditable}
          isCustomer={isCustomer}
          canNewVersion={canNewVersion}
          expandSignal={deliveryFocusSignal + headerExpandSignal}
          destinationPorts={shipmentMasters.destinationPorts}
          incotermMasters={shipmentMasters.incoterms}
          deliveryCombinations={shipmentMasters.combinations || []}
          showReturnToContainerStudy={deliveryFocusSignal > 0}
          customerProfile={
            isCustomer
              ? {
                  customerCode: currentUser?.customerCode,
                  companyName: currentUser?.companyName || currentUser?.companyLegalName,
                  email: currentUser?.email,
                  phone: currentUser?.mobile,
                }
              : undefined
          }
          onReturnToContainerStudy={() => {
            void (async () => {
              if (isEditable) {
                const saved = await saveHeader();
                if (!saved) return;
              } else {
                setTab('container_study');
                setContainerStudyRefreshKey((n) => n + 1);
              }
              window.setTimeout(() => {
                document.getElementById('inquiry-container-study')?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                });
              }, 80);
            })();
          }}
          onChange={(patch) => setHeaderForm((prev) => (prev ? { ...prev, ...patch } : prev))}
          onNewVersion={() => void handleNewVersion()}
        />
      )}

      <WorkflowStatusIndicator inquiryId={inquiryId} className="mt-1" />

      {/* Workspace Tabs Navigation Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-1 px-4 border-b border-slate-200 overflow-x-auto no-scrollbar scroll-smooth">
          {(isCustomer ? customerInquiryPresentationTabs(tabsListResolved).filter((t) => !t.overflow) : tabsListResolved).map((t) => {
            const active = isCustomer
              ? presentationTabFromWorkspace(tab) === t.id
              : tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  setTab(
                    isCustomer
                      ? workspaceTabForPresentation(t.id as Parameters<typeof workspaceTabForPresentation>[0])
                      : (t.id as typeof tab)
                  )
                }
                className={`inline-flex items-center gap-2 px-3.5 py-3 text-[13px] font-semibold border-b-2 whitespace-nowrap transition-colors ${
                  isCustomer
                    ? active
                      ? 'border-[#2F6BFF] text-[#2F6BFF]'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                    : active
                      ? 'border-blue-600 text-blue-600 bg-blue-50/20'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <span>{t.label}</span>
                {!isCustomer && t.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {t.count}
                  </span>
                )}
                {isCustomer && t.count !== undefined && <span>({t.count})</span>}
              </button>
            );
          })}
          {isCustomer && (
            <button
              type="button"
              onClick={() => setHeaderExpandSignal((n) => n + 1)}
              className="ms-auto shrink-0 text-[12px] font-semibold text-[#2F6BFF] hover:underline py-3"
            >
              Expand All
            </button>
          )}
        </div>

        {/* Tab 0: Overview */}
        {tab === 'overview' && (
          <div className="p-4 sm:p-5 space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">Inquiry Status</p>
                <div className="mt-1.5">
                  <StatusBadge status={inquiry.status} label={formatInquiryStatus(inquiry.status)} />
                </div>
                <p className="text-slate-400 text-[11px] mt-2 font-mono">Version V{inquiry.versionNo || 1}</p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">Commercial Terms</p>
                <p className="font-bold text-sm text-slate-900 mt-1">{inquiry.incoterms || '—'}</p>
                <p className="text-slate-500 text-[11px] truncate mt-0.5">
                  {inquiry.commercialMetadata?.deliveryDestination ? String(inquiry.commercialMetadata.deliveryDestination) : 'Destination not set'}
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">Metal Pricing Baseline</p>
                <p className="font-bold text-sm text-slate-900 mt-1">
                  Cu: ${inquiry.commercialMetadata?.copperPriceRate ? Number(inquiry.commercialMetadata.copperPriceRate).toLocaleString() : '—'} / MT
                </p>
                <p className="text-slate-500 text-[11px]">
                  Al: ${inquiry.commercialMetadata?.aluminiumPriceRate ? Number(inquiry.commercialMetadata.aluminiumPriceRate).toLocaleString() : '—'} / MT
                </p>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">Requirements Summary</p>
                <p className="font-bold text-sm text-brand-800 mt-1">
                  {inquiry.lines?.length || 0} line(s) · {summary?.totalLength.toLocaleString() || 0} m
                </p>
                <p className="text-slate-500 text-[11px] font-mono">{summary?.totalQty || 0} drums scheduled</p>
              </div>
            </div>

            {/* Quick Navigation Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setTab('lines')}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-blue-50/50 hover:border-blue-200 text-left transition-colors"
              >
                <p className="font-bold text-slate-800">Cables ({inquiry.lines?.length || 0})</p>
                <p className="text-slate-500 text-[10px] mt-0.5">Manage line items</p>
              </button>
              <button
                type="button"
                onClick={() => setTab('cutting')}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-blue-50/50 hover:border-blue-200 text-left transition-colors"
              >
                <p className="font-bold text-slate-800">Cutting Schedule</p>
                <p className="text-slate-500 text-[10px] mt-0.5">Multi-drum lengths</p>
              </button>
              <button
                type="button"
                onClick={() => setTab('drum_plan')}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-blue-50/50 hover:border-blue-200 text-left transition-colors"
              >
                <p className="font-bold text-slate-800">Drums</p>
                <p className="text-slate-500 text-[10px] mt-0.5">Packing specs</p>
              </button>
              <button
                type="button"
                onClick={() => setTab('container_study')}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-blue-50/50 hover:border-blue-200 text-left transition-colors"
              >
                <p className="font-bold text-slate-800">Container Study</p>
                <p className="text-slate-500 text-[10px] mt-0.5">Physical drum packing</p>
              </button>
              <button
                type="button"
                onClick={() => setTab('technical_offer')}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-blue-50/50 hover:border-blue-200 text-left transition-colors"
              >
                <p className="font-bold text-slate-800">Technical Offer</p>
                <p className="text-slate-500 text-[10px] mt-0.5">Line datasheets</p>
              </button>
              <button
                type="button"
                onClick={() => setTab('documents')}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-blue-50/50 hover:border-blue-200 text-left transition-colors"
              >
                <p className="font-bold text-slate-800">Documents ({inquiry.attachments?.length || 0})</p>
                <p className="text-slate-500 text-[10px] mt-0.5">Commercial files</p>
              </button>
              <button
                type="button"
                onClick={() => setTab('quotation')}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-blue-50/50 hover:border-blue-200 text-left transition-colors"
              >
                <p className="font-bold text-slate-800">Quotations ({inquiry.quotations?.length || 0})</p>
                <p className="text-slate-500 text-[10px] mt-0.5">View revisions</p>
              </button>
            </div>
          </div>
        )}

        {/* Tab 1: Cables & Requirements */}
        {tab === 'lines' && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Cables Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className={`font-bold text-brand-800 ${isCustomer ? 'text-[13px] flex items-center gap-1.5' : 'text-xs uppercase tracking-wider'}`}>
                  {isCustomer && <ClipboardList className="h-4 w-4 text-[#2F6BFF]" />}
                  Cables & Requirements
                </h3>
                {isEditable && (
                  <button
                    type="button"
                    onClick={() => void addLine()}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors ml-1 ${
                      isCustomer ? 'bg-[#2F6BFF] hover:bg-[#2563eb] text-white' : 'rounded-xl bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{isCustomer ? 'Add Cable Line' : 'Add Line'}</span>
                  </button>
                )}
                {isCustomer && isEditable && (
                  <button
                    type="button"
                    onClick={() => void addLine()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold text-xs hover:bg-slate-50"
                  >
                    Add from Template
                  </button>
                )}
                {isCustomer && (
                  <button
                    type="button"
                    onClick={() => notify('Excel line import is not available on this inquiry yet. Use Add Cable Line or Export Excel.')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold text-xs hover:bg-slate-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Import from Excel
                  </button>
                )}
                {jwtToken && inquiry ? (
                  <button
                    type="button"
                    onClick={() =>
                      void exportInquiryExcel(jwtToken, inquiry.id).catch((err) =>
                        notify(err instanceof Error ? err.message : 'Export failed')
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold text-xs hover:bg-slate-50"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    <span>Export Excel</span>
                  </button>
                ) : null}
                {selectedLineId && isEditable && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const line = filteredLines.find((l) => l.id === selectedLineId);
                        if (line) openLineEditor(line);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5 text-slate-500" />
                      <span>Edit Line</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openCableSearchForLine(selectedLineId)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50/50 text-blue-700 font-bold text-xs hover:bg-blue-50 transition-colors"
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span>
                        {filteredLines.find((l) => l.id === selectedLineId)?.materialNumber
                          ? 'Replace cable'
                          : 'Open Cable Search'}
                      </span>
                    </button>
                    {filteredLines.find((l) => l.id === selectedLineId)?.materialNumber && (
                      <button
                        type="button"
                        onClick={() => void clearLineCable(selectedLineId)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50/70 text-amber-800 font-bold text-xs hover:bg-amber-50 transition-colors"
                      >
                        <span>Clear selected cable</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const line = filteredLines.find((l) => l.id === selectedLineId);
                        if (line) setScheduleLine(line);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50/50 text-blue-700 font-bold text-xs hover:bg-blue-50 transition-colors"
                    >
                      <Ruler className="h-3.5 w-3.5 text-blue-600" />
                      <span>Cutting Plan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void duplicateLine()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5 text-slate-500" />
                      <span>Duplicate</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveLine('up')}
                      className="p-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                      title="Move Up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveLine('down')}
                      className="p-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                      title="Move Down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                {selectedLineIds.size > 0 && isEditable && (
                  <button
                    type="button"
                    onClick={() => void deleteLine()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 bg-red-50/50 text-red-600 font-semibold text-xs hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete ({selectedLineIds.size})</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-60">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={lineSearch}
                    onChange={(e) => setLineSearch(e.target.value)}
                    placeholder="Search in lines…"
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:border-blue-500 bg-white"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowLineColumns((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                    showLineColumns
                      ? 'border-blue-500 text-blue-600 bg-blue-50'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  title="Customize Columns"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Columns</span>
                </button>
              </div>
            </div>

            {/* Inline Column Visibility Checkbox Row */}
            {showLineColumns && (
              <div className="p-3 bg-slate-50/80 border border-slate-200 rounded-xl space-y-2 text-xs animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5 text-[11px]">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600" />
                    <span>Visible Columns ({visibleLineColumns.length} of {platformLineFields.filter((col) => columnEligibleForActor(col, isCustomer)).length})</span>
                  </span>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setShowColumnModal(true)}
                      className="text-blue-600 font-semibold hover:underline"
                    >
                      Advanced
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => {
                        const defaultIds = platformLineFields.filter((f) => f.defaultVisible).map((f) => f.id);
                        const nextPref = { visibleFieldIds: defaultIds };
                        setLinePref(nextPref);
                        saveLineColumnPreference(nextPref, prefUserId);
                        notify('Reset columns to default.');
                      }}
                      className="text-slate-500 hover:text-slate-800"
                    >
                      Reset Default
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 pt-1">
                  {platformLineFields
                    .filter((col) => columnEligibleForActor(col, isCustomer))
                    .map((col) => {
                      const isLocked = col.required || col.id === 'lineNumber';
                      const isChecked = isColumnSelected(col, linePref);
                      return (
                        <label key={col.id} className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isLocked}
                            onChange={() => {
                              if (isLocked) return;
                              const visibleFieldIds = isChecked
                                ? linePref.visibleFieldIds.filter((id) => id !== col.id)
                                : [...linePref.visibleFieldIds, col.id];
                              const nextPref = { visibleFieldIds };
                              setLinePref(nextPref);
                              saveLineColumnPreference(nextPref, prefUserId);
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 h-3.5 w-3.5"
                          />
                          <span className={`text-[11px] ${isChecked ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>
                            {col.label}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Line Selection Action Toolbar */}
            {selectedLineIds.size > 0 && isEditable && (
              <div className="flex items-center gap-2 p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs">
                <span className="font-bold text-blue-800 px-2">
                  {selectedLineIds.size} selected
                </span>
                {selectedLineId && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const line = filteredLines.find((l) => l.id === selectedLineId);
                        if (line) openLineEditor(line);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-blue-200 font-bold text-blue-700 hover:bg-blue-50"
                    >
                      Edit Line
                    </button>
                    <button
                      type="button"
                      onClick={() => void duplicateLine()}
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-blue-200 font-bold text-blue-700 hover:bg-blue-50"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveLine('up')}
                      className="p-1.5 rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-50"
                      title="Move Up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveLine('down')}
                      className="p-1.5 rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-50"
                      title="Move Down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => void deleteLine()}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-red-200 font-bold text-red-600 hover:bg-red-50 ml-auto"
                >
                  Delete Selected
                </button>
              </div>
            )}

            {/* Cable Lines Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[980px]">
                  <thead className="bg-slate-50/75 text-slate-600 font-bold border-b border-slate-200 uppercase text-[11px] tracking-wider">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={filteredLines.length > 0 && selectedLineIds.size === filteredLines.length}
                          onChange={toggleAllLines}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      {visibleLineColumns
                        .filter((col) => col.id !== 'attachments')
                        .map((col) => (
                          <th key={col.id} className="p-3 whitespace-nowrap">
                            {col.label}
                          </th>
                        ))}
                      {visibleLineColumns.some((col) => col.id === 'attachments') && (
                        <th className="p-3 text-center w-36">Attachments</th>
                      )}
                      <th className="p-3 text-right w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLines.length === 0 ? (
                      <tr>
                        <td colSpan={visibleLineColumns.length + 3} className="py-14 text-center">
                          <div className="flex flex-col items-center justify-center space-y-3">
                            <div className="w-14 h-14 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
                              <WoodenDrumIcon className="h-7 w-7" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-800 text-sm">No cables added yet</p>
                              <p className="text-slate-400 text-xs mt-0.5">
                                Add your first cable to get started
                              </p>
                            </div>
                            {isEditable && (
                              <button
                                type="button"
                                onClick={() => void addLine()}
                                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-colors"
                              >
                                Add Cable
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredLines.map((line) => (
                        <tr
                          key={line.id}
                          className={`transition-colors hover:bg-blue-50/40 ${
                            selectedLineIds.has(line.id) ? 'bg-blue-50/60' : ''
                          }`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={selectedLineIds.has(line.id)}
                              onChange={() => toggleLineSelection(line.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          {visibleLineColumns
                            .filter((col) => col.id !== 'attachments')
                            .map((col) => (
                              <td key={col.id} className="p-3 whitespace-nowrap">
                                {lineCell(line, col.id)}
                              </td>
                            ))}
                          {visibleLineColumns.some((col) => col.id === 'attachments') && (
                            <td className="p-3 text-center">
                              <InquiryLineAttachmentsCell
                                inquiryId={inquiry.id}
                                line={line}
                                jwtToken={jwtToken}
                                canEdit={canEditLineAttachments && isEditable}
                                onChanged={() => void load()}
                              />
                            </td>
                          )}
                          <td className="p-3 text-right whitespace-nowrap">
                            {isEditable ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => openLineEditor(line)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                                  title="Edit Line"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setScheduleLine(line)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                                  title="Cutting"
                                >
                                  <Ruler className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteLine(line.id)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 transition-colors"
                                  title="Delete Line"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Documents */}
        {tab === 'documents' && (
          <div className="p-4 sm:p-5 space-y-4 text-xs">
            <CommercialOfferDocumentsPanel
              inquiryId={inquiry.id}
              jwtToken={jwtToken}
              issued={Boolean(v2Quotation?.issuedAt)}
              isCustomer={isCustomer}
              quotationNumber={v2Quotation?.quotationNumber}
              versionNo={v2Quotation?.versionNo}
            />
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800">Inquiry Documents & Attachments</h3>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Files stored securely in PostgreSQL. Max 8 MB per file.
                </p>
              </div>

              {isEditable && jwtToken && (
                <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer shadow-sm transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload File</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file || !inquiry) return;
                      void uploadInquiryAttachment(jwtToken, inquiry.id, file)
                        .then(() => {
                          notify('Attachment saved.');
                          return load();
                        })
                        .catch((err) => notify(err instanceof Error ? err.message : 'Upload failed'));
                    }}
                  />
                </label>
              )}
            </div>

            {(inquiry.attachments || []).length === 0 ? (
              <p className="text-slate-400 py-8 text-center">No attachments uploaded yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(inquiry.attachments || []).map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 bg-white"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 truncate">{att.fileName}</p>
                      <p className="text-slate-400 text-[11px]">
                        {att.byteSize} bytes · {att.uploadedBy || '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-blue-600 font-bold hover:bg-slate-50"
                        onClick={() => jwtToken && inquiry && void downloadInquiryAttachment(jwtToken, inquiry.id, att)}
                      >
                        Download
                      </button>
                      {isEditable && (
                        <button
                          type="button"
                          className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() =>
                            jwtToken &&
                            inquiry &&
                            void deleteInquiryAttachment(jwtToken, inquiry.id, att.id)
                              .then(() => {
                                notify('Attachment deleted.');
                                return load();
                              })
                              .catch((err) => notify(err instanceof Error ? err.message : 'Delete failed'))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Technical Offer */}
        {tab === 'technical_offer' && (
          <div className="p-4 sm:p-5 space-y-4 text-xs">
            <div>
              <h3 className="font-bold text-slate-800">Technical Offer Documentation</h3>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Cable spec sheets and technical compliance attachments per line.
              </p>
            </div>

            <div className="space-y-3">
              {(inquiry.lines || []).map((line) => {
                const offerAtts = (line.attachments || []).filter((a) => a.kind === 'TECHNICAL_OFFER');
                return (
                  <div key={line.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-slate-800">
                        Line {line.lineNumber}: {line.cableDescription}
                      </p>
                      <InquiryLineAttachmentsCell
                        inquiryId={inquiry.id}
                        line={line}
                        jwtToken={jwtToken}
                        canEdit={canEditLineAttachments && isEditable}
                        onChanged={() => void load()}
                      />
                    </div>
                    {offerAtts.length > 0 ? (
                      <div className="space-y-1">
                        {offerAtts.map((att) => (
                          <div key={att.id} className="flex items-center gap-2 text-[11px] text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>{att.fileName} ({att.source})</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-amber-700 text-[11px]">No technical offer datasheet attached.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 4: Quotations */}
        {tab === 'quotation' && (
          <div className="p-4 sm:p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800">Generated Quotations</h3>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Official quotation snapshots linked to this commercial inquiry.
                </p>
              </div>
              {canQuote && isEditable && (
                <button
                  type="button"
                  onClick={() => void handleGenerateQuotation()}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm"
                >
                  Generate Quotation
                </button>
              )}
            </div>

            {!isCustomer && <QuotationSectionV2 inquiryId={inquiry.id} />}

            {(inquiry.quotations || []).length === 0 && !v2Quotation ? (
              <p className="text-slate-400 py-8 text-center">No quotations generated yet.</p>
            ) : (
              <div className="space-y-2.5">
                {isCustomer && v2Quotation && (
                  <CustomerQuotationView
                    inquiryId={inquiry.id}
                    quotation={v2Quotation}
                    onUpdated={() => void load()}
                  />
                )}
                {(inquiry.quotations || []).map((q, i) => (
                  <div
                    key={q.id || `${q.quotationNumber}-${i}`}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-brand-800 font-mono">
                          {q.quotationNumber} · V{q.versionNo}
                        </p>
                        <p className="text-slate-400 text-[11px] mt-0.5">Status: {q.status}</p>
                      </div>
                      <StatusBadge status={q.status} />
                    </div>
                    {!isCustomer && (
                      <CommercialFulfillmentPanel
                        token={jwtToken}
                        quotationId={q.id}
                        quotationNumber={q.quotationNumber}
                        canManage={canQuote}
                        canApprove={canQuote}
                        onMessage={(msg) => notify(msg)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Notes & Remarks */}
        {tab === 'notes' && (
          <div className="p-4 sm:p-5 space-y-4 text-xs">
            <h3 className="font-bold text-slate-800">Inquiry Notes & Remarks</h3>
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                <p className="font-bold text-slate-700 mb-1">Customer Remarks</p>
                <p className="text-slate-600">{inquiry.notes || 'No customer remarks entered.'}</p>
              </div>
              {!isCustomer && (
                <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/50">
                  <p className="font-bold text-blue-900 mb-1">Internal Sales Comments</p>
                  <p className="text-blue-800">
                    {inquiry.commercialMetadata?.salesComments || 'No internal sales comments.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 6: History & Versions */}
        {tab === 'history' && (
          <div className="p-4 sm:p-5 space-y-4 text-xs">
            <h3 className="font-bold text-slate-800">Revision History</h3>
            <div className="space-y-2.5">
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 font-mono">
                        V{version.versionNo}
                      </span>
                      <StatusBadge status={version.status} label={formatInquiryStatus(version.status)} />
                      {version.isCurrent && (
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-slate-500 font-mono text-[11px] mt-0.5">{version.inquiryNumber}</p>
                    <p className="text-slate-600 mt-1">
                      Est. Value:{' '}
                      <span className="font-bold">
                        {inquiryEstimatedValue(version) != null
                          ? `${inquiryEstimatedValue(version)?.toLocaleString()} ${version.currency}`
                          : '—'}
                      </span>
                    </p>
                  </div>
                  <div className="sm:text-right text-slate-400 text-[11px]">
                    <p>{version.modifiedBy || version.createdBy}</p>
                    <p>{version.updatedAt ? new Date(version.updatedAt).toLocaleString() : '—'}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Version Diff Tool */}
            {versions.length >= 2 && (
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-3 mt-4">
                <p className="font-bold text-blue-900">Compare versions (price diff)</p>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={compareVersionA}
                    onChange={(e) => setCompareVersionA(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 bg-white text-xs"
                  >
                    <option value="">Version A</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        V{v.versionNo} — {formatInquiryStatus(v.status)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={compareVersionB}
                    onChange={(e) => setCompareVersionB(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 bg-white text-xs"
                  >
                    <option value="">Version B</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        V{v.versionNo} — {formatInquiryStatus(v.status)}
                      </option>
                    ))}
                  </select>
                </div>
                {versionCompare && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-white border border-slate-200">
                      <p className="text-slate-500">V{versionCompare.a.versionNo}</p>
                      <p className="font-bold text-lg text-slate-900">
                        {versionCompare.valueA != null
                          ? `${versionCompare.valueA.toLocaleString()} ${versionCompare.a.currency}`
                          : '—'}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-white border border-slate-200">
                      <p className="text-slate-500">V{versionCompare.b.versionNo}</p>
                      <p className="font-bold text-lg text-slate-900">
                        {versionCompare.valueB != null
                          ? `${versionCompare.valueB.toLocaleString()} ${versionCompare.b.currency}`
                          : '—'}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-white border border-slate-200">
                      <p className="text-slate-500">Difference (B − A)</p>
                      <p
                        className={`font-bold text-lg ${
                          versionCompare.diff != null && versionCompare.diff > 0
                            ? 'text-red-600'
                            : versionCompare.diff != null && versionCompare.diff < 0
                              ? 'text-emerald-600'
                              : 'text-slate-900'
                        }`}
                      >
                        {versionCompare.diff != null
                          ? `${versionCompare.diff >= 0 ? '+' : ''}${versionCompare.diff.toLocaleString()} ${versionCompare.b.currency}`
                          : '—'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 7 & 8: Audit Trail & Activity */}
        {(tab === 'audit' || tab === 'activity') && (
          <div className="p-4 sm:p-5 space-y-3 text-xs">
            <h3 className="font-bold text-slate-800">Activity & Audit Trail</h3>
            {activityLoading ? (
              <p className="text-slate-400 py-6 text-center">Loading audit events…</p>
            ) : activityEvents.length === 0 ? (
              <p className="text-slate-400 py-6 text-center">No activity recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {activityEvents.map((event) => (
                  <div
                    key={event.id}
                    className="p-3 rounded-xl border border-slate-200 bg-white flex justify-between gap-3"
                  >
                    <div>
                      <p className="font-bold text-slate-800">
                        {event.action} · {event.entity}
                      </p>
                      <p className="text-slate-600">{event.message || event.entityId}</p>
                      <p className="text-slate-400 text-[11px] mt-0.5">{event.actorName || 'System'}</p>
                    </div>
                    <div className="text-right text-slate-400 whitespace-nowrap text-[11px]">
                      {new Date(event.at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Preserved Tab: Costing (Option B / Decision 5 Frozen) */}
        {tab === 'costing' && (
          <div className="p-4 sm:p-5 space-y-4 text-xs">
            {isCustomer ? (
              <>
                <div>
                  <h3 className="font-bold text-slate-800">Costing Status</h3>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Commercial pricing readiness for your inquiry. Detailed cost breakdowns are prepared by Energya and
                    shared through quotations when ready.
                  </p>
                </div>
                {(inquiry.lines || []).length === 0 ? (
                  <p className="text-slate-400 py-6 text-center">Add cable lines to track costing readiness.</p>
                ) : (
                  <div className="space-y-2">
                    {(inquiry.lines || []).map((line) => {
                      const label = line.customerCostingStatus || (line.costingCalculated ? 'READY' : 'NOT AVAILABLE');
                      return (
                        <div
                          key={line.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
                        >
                          <div>
                            <p className="font-bold text-slate-900">
                              Line {line.lineNumber} · {line.materialNumber || 'Unmapped'}
                            </p>
                            <p className="text-slate-500">{line.cableDescription}</p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${costingStatusBadgeClass(label === 'READY' ? 'READY' : 'NOT_READY')}`}
                          >
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {(inquiry.commercialMetadata?.copperPriceRate != null ||
                  inquiry.commercialMetadata?.aluminiumPriceRate != null) && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-[11px] text-slate-600">
                    <p className="font-bold text-slate-700 mb-1">Reference metal rates (commercial inputs)</p>
                    <p>
                      Cu:{' '}
                      {inquiry.commercialMetadata?.copperPriceRate
                        ? `${Number(inquiry.commercialMetadata.copperPriceRate).toLocaleString()} / ${inquiry.commercialMetadata.copperPriceUom || 'MT'}`
                        : '—'}
                    </p>
                    <p>
                      Al:{' '}
                      {inquiry.commercialMetadata?.aluminiumPriceRate
                        ? `${Number(inquiry.commercialMetadata.aluminiumPriceRate).toLocaleString()} / ${inquiry.commercialMetadata.aluminiumPriceUom || 'MT'}`
                        : '—'}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                {isV2Inquiry && inquiry && (
                  <InquiryV2TabBridge
                    inquiryId={inquiry.id}
                    tab="costing"
                    lineId={costingLineId}
                    onChanged={() => void load()}
                  />
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-800">Costing Engine Workbench</h3>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Direct Raw Material and multi-layer manufacturing calculation.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={costingLineId || ''}
                      onChange={(e) => setCostingLineId(e.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"
                    >
                      {(inquiry.lines || []).map((line) => (
                        <option key={line.id} value={line.id}>
                          #{line.lineNumber} — {line.cableDescription.slice(0, 35)}
                        </option>
                      ))}
                    </select>
                    {isEditable && costingLineId && (
                      <button
                        type="button"
                        disabled={costingLoading}
                        onClick={() => void runCalculateCost(costingLineId)}
                        className="px-3 py-2 rounded-xl bg-blue-600 text-white font-bold flex items-center gap-1.5 hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Calculator className="h-3.5 w-3.5" />
                        <span>{costingLoading ? 'Calculating…' : 'Recalculate Line'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {costingBreakdown && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl border border-slate-200 bg-white">
                        <p className="text-slate-400 text-[11px]">Status</p>
                        <p className="font-bold text-base text-slate-800">{costingBreakdown.status}</p>
                      </div>
                      <div className="p-3 rounded-xl border border-slate-200 bg-white">
                        <p className="text-slate-400 text-[11px]">Material Cost</p>
                        <p className="font-bold text-base text-brand-800">
                          {costingBreakdown.totals?.materialCost || '—'}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl border border-slate-200 bg-white">
                        <p className="text-slate-400 text-[11px]">Scrap Adjustment</p>
                        <p className="font-bold text-base text-slate-800">
                          {costingBreakdown.totals?.scrapAdjustmentCost || '0'}
                        </p>
                      </div>
                      <div className="p-3 rounded-xl border border-slate-200 bg-white">
                        <p className="text-slate-400 text-[11px]">Manufacturing Total</p>
                        <p className="font-bold text-base text-brand-800">
                          {costingBreakdown.totals?.manufacturingTotal || costingBreakdown.totals?.materialCost || '—'}
                        </p>
                      </div>
                    </div>

                    {Array.isArray(costingBreakdown.materialBreakdown) && costingBreakdown.materialBreakdown.length > 0 && (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                            <tr>
                              <th className="p-2.5">RM Code</th>
                              <th className="p-2.5">Description</th>
                              <th className="p-2.5 text-right">Net / km</th>
                              <th className="p-2.5 text-right">Unit Price</th>
                              <th className="p-2.5 text-right">Line Cost</th>
                              <th className="p-2.5">Scrap</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {costingBreakdown.materialBreakdown.map((row: Record<string, unknown>, i: number) => (
                              <tr key={i}>
                                <td className="p-2.5 font-mono font-bold text-slate-800">{String(row.rawMaterialCode || '')}</td>
                                <td className="p-2.5 text-slate-700">{String(row.rawMaterialDesc || '')}</td>
                                <td className="p-2.5 text-right font-mono">{row.baseConsumptionPerKm != null ? String(row.baseConsumptionPerKm) : '—'}</td>
                                <td className="p-2.5 text-right">{row.unitPrice != null ? String(row.unitPrice) : '—'}</td>
                                <td className="p-2.5 text-right font-bold text-brand-800">{String(row.lineCost || '')}</td>
                                <td className="p-2.5">{row.scrapRate != null ? `${(Number(row.scrapRate) * 100).toFixed(2)}%` : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Preserved Tab: Drum Plan (customer Cutting & Drums includes packing + one V2 bridge) */}
        {cuttingDrumsWorkspace.showPackingTable && (
          <div className="p-4 sm:p-5 space-y-4 text-xs">
            {shouldMountInquiryV2BridgeInPacking(cuttingDrumsWorkspace) &&
              v2CuttingDrumsBridgeTab &&
              inquiry && (
              <InquiryV2TabBridge
                inquiryId={inquiry.id}
                tab={v2CuttingDrumsBridgeTab}
                lineId={selectedLineId}
                onChanged={() => void load()}
              />
            )}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Drum Packing & Selection Schedules</h3>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Drum packing summary per cable line — code, quantity, and total length.
                </p>
              </div>
              <div className="px-3.5 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 font-bold text-xs">
                Total Drums: {summary?.totalQty || 0} drums
              </div>
            </div>

            <InquiryDrumsTable
              lines={inquiry.lines || []}
              drumMaster={drumMaster}
              isEditable={isEditable}
              onConfigureDrums={(line) => setScheduleLine(line)}
            />
          </div>
        )}

        {/* Tab 5: Cutting Schedule Workbench (internal Cutting tab, or customer combined workspace) */}
        {cuttingDrumsWorkspace.showCuttingWorkbench && (
          <div className="p-4 sm:p-5 space-y-4 text-xs">
            {shouldMountInquiryV2BridgeInCutting(cuttingDrumsWorkspace) &&
              v2CuttingDrumsBridgeTab &&
              inquiry && (
              <InquiryV2TabBridge
                inquiryId={inquiry.id}
                tab={v2CuttingDrumsBridgeTab}
                lineId={selectedLineId}
                onChanged={() => void load()}
              />
            )}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Cutting & Multi-Drum Schedule Workbench</h3>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Configure drum cutting lengths, multi-drum allocations, and manufacturing tolerances per cable line.
                </p>
              </div>
              <div className="px-3.5 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 font-bold text-xs">
                Total Inquiry Length: {summary?.totalLength.toLocaleString() || 0} m ({summary?.totalQty || 0} drums)
              </div>
            </div>

            {(inquiry.lines || []).length === 0 ? (
              <p className="text-slate-400 py-10 text-center">Add cable lines to configure cutting schedules.</p>
            ) : (
              <div className="space-y-3">
                {(inquiry.lines || []).map((line) => {
                  const schedule = parseInquiryDrumSchedule(line.drumSchedule);
                  const totalLineM = resolveInquiryLineTotalLengthMeters(line);
                  const tol = line.cableTolerancePercent != null ? Number(line.cableTolerancePercent) : 1;
                  const range = computeCableOrderLengthRange(totalLineM, tol);

                  return (
                    <div key={line.id} className="rounded-xl border border-slate-200 p-4 bg-white space-y-3 shadow-2xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-brand-800">
                              Line #{line.lineNumber}
                            </span>
                            {line.materialNumber && (
                              <span className="font-mono text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                {line.materialNumber}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-700 font-medium mt-0.5">{line.cableDescription}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right sm:mr-2">
                            <p className="font-bold text-slate-900 font-mono text-sm">
                              {totalLineM.toLocaleString()} m
                            </p>
                            <p className="text-[10px] text-slate-500">
                              [{range.minM.toLocaleString()} m – {range.maxM.toLocaleString()} m] (±{tol}%)
                            </p>
                          </div>
                          {isEditable && (
                            <button
                              type="button"
                              onClick={() => setScheduleLine(line)}
                              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs transition-colors flex items-center gap-1.5 shrink-0"
                            >
                              <Ruler className="h-3.5 w-3.5" />
                              <span>Configure Schedule</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {schedule && schedule.rows.length > 0 ? (
                        <div className="border border-slate-100 rounded-lg overflow-hidden bg-slate-50/50">
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200">
                              <tr>
                                <th className="p-2">#</th>
                                <th className="p-2">Drum Code</th>
                                <th className="p-2 text-center">Drums</th>
                                <th className="p-2 text-right">Cut Length (m)</th>
                                <th className="p-2 text-right">Nominal Subtotal (m)</th>
                                <th className="p-2 text-center">Drum Tol.</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {schedule.rows.map((r, ri) => (
                                <tr key={ri}>
                                  <td className="p-2 font-mono text-slate-400">{ri + 1}</td>
                                  <td className="p-2 font-mono font-bold text-slate-800">{r.drumCode}</td>
                                  <td className="p-2 text-center font-bold">{r.noOfDrums}</td>
                                  <td className="p-2 text-right font-mono">{r.cuttingLengthM.toLocaleString()} m</td>
                                  <td className="p-2 text-right font-mono font-bold text-blue-700">
                                    {(r.noOfDrums * r.cuttingLengthM).toLocaleString()} m
                                  </td>
                                  <td className="p-2 text-center">±{r.drumTolerancePercent}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-lg bg-slate-50 text-slate-600 text-xs flex items-center justify-between">
                          <span>Single cut length: <strong className="font-bold">{Number(line.cuttingLengthMeters || line.requestedLengthMeters).toLocaleString()} m</strong> &times; <strong className="font-bold">{line.requestedQuantity} drums</strong></span>
                          <span className="text-[11px] text-slate-400">Drum: {line.drumType || 'Standard'}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'container_study' && (
          <div id="inquiry-container-study" className="p-4 sm:p-5">
            {inquiry ? (
              isCustomer ? (
                <CustomerContainerStudyStatus inquiryId={inquiry.id} />
              ) : (
                <InquiryContainerStudyPanel
                  key={containerStudyRefreshKey}
                  inquiryId={inquiry.id}
                  isV2Inquiry={isV2Inquiry}
                  onOpenDeliveryInformation={() => {
                    setDeliveryFocusSignal((n) => n + 1);
                    window.setTimeout(() => {
                      document.getElementById('inquiry-delivery-information')?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      });
                    }, 120);
                  }}
                />
              )
            ) : (
              <p className="text-slate-400 py-10 text-center">Open an inquiry to run Container Study.</p>
            )}
          </div>
        )}
      </div>

      {isCustomer && summary && (
        <CustomerInquiryFooterKpis
          totalLines={summary.totalLines}
          totalDrums={summary.totalQty}
          totalLength={summary.totalLength}
          estimatedValueLabel={
            inquiry.commercialValueState === 'RECALCULATION_REQUIRED'
              ? '— Recalculation Required'
              : inquiry.commercialProductsTotal == null
                ? null
                : `${Number(inquiry.commercialProductsTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${inquiry.currency}`
          }
        />
      )}
      </div>

      {/* Summary KPI Bar */}
      {!isCustomer && summary && (
        <InquirySummaryBar
          summary={summary}
          commercialValue={inquiry.commercialProductsTotal ?? null}
          recalculationRequired={inquiry.commercialValueState === 'RECALCULATION_REQUIRED'}
        />
      )}

      {/* Cable Search Modal */}
      <CableSearchSelectModal
        isOpen={showCableModal}
        onClose={() => setShowCableModal(false)}
        onSelectItem={(item) => {
          const drums = Number(item.qty) || 1;
          const totalFromSchedule =
            item.drumDetails?.totalLengthKm != null ? item.drumDetails.totalLengthKm * 1000 : undefined;
          const cuttingLengthMeters = item.drumDetails?.cuttingLengthMeters;
          const totalLength =
            totalFromSchedule && totalFromSchedule > 0
              ? totalFromSchedule
              : cuttingLengthMeters && cuttingLengthMeters > 0
                ? drums * cuttingLengthMeters
                : undefined;
          void addLineFromCable({
            cableCode: item.cableCode,
            description: item.itemDescription,
            quantity: drums,
            uom: item.uom,
            cuttingLengthMeters,
            drumType: item.drumDetails?.drumType,
            cableTolerancePercent: item.drumDetails?.cableTolerancePercent,
            drumSchedule:
              item.drumDetails?.scheduleRows && item.drumDetails.cableTolerancePercent != null
                ? {
                    cableTolerancePercent: item.drumDetails.cableTolerancePercent,
                    rows: item.drumDetails.scheduleRows,
                  }
                : undefined,
            requestedLengthMeters: totalLength,
          });
        }}
        title="Select cable for inquiry line"
      />

      {/* Line Edit Modal */}
      {editingLine && inquiry && (
        <InquiryLineEditorModal
          line={editingLine}
          inquiry={inquiry}
          form={lineEditForm}
          isEditable={isEditable}
          isV2Inquiry={isV2Inquiry}
          cuttingError={cuttingError}
          onChange={(patch) => setLineEditForm((prev) => ({ ...prev, ...patch }))}
          onClose={() => setEditingLine(null)}
          onSave={() => void saveLineEdit()}
          onOpenSchedule={() => {
            const l = editingLine;
            setEditingLine(null);
            setScheduleLine(l);
          }}
          onOpenCableSearch={() => {
            const lineId = editingLine.id;
            setEditingLine(null);
            openCableSearchForLine(lineId);
          }}
          onClearCable={() => void clearLineCable(editingLine.id)}
          onV2ConfigurationSaved={() => void load()}
        />
      )}

      {/* Missing Items Submission Blocker Modal */}
      {showMissingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2.5 text-amber-600 pb-2 border-b border-slate-100">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-bold text-base text-slate-900">Missing Information</h3>
            </div>
            <p className="text-xs text-slate-600">
              Please resolve the following required items before submitting this inquiry:
            </p>
            <ul className="space-y-1.5 text-xs text-slate-700">
              {submitMissingItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2 bg-amber-50 p-2 rounded-lg border border-amber-100">
                  <span className="text-amber-600 font-bold">•</span>
                  <span>
                    {item.label}
                    {item.detail ? ` — ${item.detail}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowMissingModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-white font-bold text-xs"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2.5 text-emerald-600 pb-2 border-b border-slate-100">
              <Send className="h-5 w-5" />
              <h3 className="font-bold text-base text-slate-900">Submit Commercial Inquiry</h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to submit inquiry <span className="font-bold text-slate-900 font-mono">{inquiryDisplayRef(inquiry)}</span>?
              Submitting will lock the configuration and send it for technical and commercial evaluation.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmSubmit()}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
              >
                {submitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>{submitting ? 'Submitting…' : 'Confirm Submit'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Column Visibility Modal */}
      {showColumnModal && (
        <InquiryColumnVisibilityModal
          isOpen={showColumnModal}
          onClose={() => setShowColumnModal(false)}
          linePref={linePref}
          columns={platformLineFields}
          isCustomer={isCustomer}
          userId={prefUserId}
          onPrefChange={(pref) => setLinePref(pref)}
          onSaved={() => notify('Column visibility preferences saved.')}
        />
      )}

      {scheduleLine && inquiry && (
        <InquiryCuttingDrumSelectionModal
          isOpen={Boolean(scheduleLine)}
          onClose={() => setScheduleLine(null)}
          inquiryId={inquiry.id}
          line={scheduleLine}
          drums={drumMaster}
          jwtToken={jwtToken}
          onConfirmed={() => {
            notify('Drum plan confirmed.');
            void load();
          }}
        />
      )}
    </div>
  );
};
