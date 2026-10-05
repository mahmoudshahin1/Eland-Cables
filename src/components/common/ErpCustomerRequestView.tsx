import React, { useState, useMemo, useEffect } from 'react';
import { ErpRequestHeader, ErpRequestItem, ErpAttachment, SystemNotification } from '../../types';
import { INITIAL_ERP_REQUESTS, MASTER_CABLE_CATALOG } from '../../data/mockData';
import { useAuth } from '../../context/AuthContext';
import { DrumDetailsModal } from './DrumDetailsModal';
import { CableConfiguratorModal } from './CableConfiguratorModal';
import { CableSearchSelectModal } from './CableSearchSelectModal';
import { ContainerAndDrumOptimizerModal } from './ContainerAndDrumOptimizerModal';
import { ElandProcessFlowDiagram } from '../customer/ElandProcessFlowDiagram';
import { CableCrossSectionViewer } from './CableCrossSectionViewer';
import {
  createCommercialInquiry,
  mapCommercialInquiryToErpHeader,
} from '../../services/commercialInquiryApiService';
import {
  applyInquiryRevision,
  applyInquirySubmit,
  canSubmitInquiry,
  isInquirySubmitted,
  listAllVersions,
} from '../../services/inquiryWorkflowService';
import {
  Star,
  Plus,
  Save,
  ChevronLeft,
  ChevronRight,
  Link as LinkIcon,
  Search,
  RotateCcw,
  Printer,
  FileText,
  Trash2,
  Paperclip,
  Mail,
  Bell,
  HelpCircle,
  MoreHorizontal,
  X,
  CheckCircle2,
  Box,
  Truck,
  Layers,
  Calendar,
  Send,
  Upload,
  User,
  Building2,
  Download,
  Sparkles,
  Eye,
  Check,
  Clock,
  Filter,
  Sliders,
  Headphones,
  MessageSquare,
  BookOpen,
  Video,
} from 'lucide-react';

interface ErpCustomerRequestViewProps {
  title?: string;
  defaultMode?: 'list' | 'detail';
  onAddNotification?: (notif: SystemNotification) => void;
  initialSelectedId?: string;
  createOnMount?: boolean;
  onBackToHome?: () => void;
  requests?: ErpRequestHeader[];
  onRequestsChange?: React.Dispatch<React.SetStateAction<ErpRequestHeader[]>>;
  onSubmitInquiry?: (id: string) => void | Promise<void>;
  onReviseInquiry?: (id: string) => void;
}

export const ErpCustomerRequestView: React.FC<ErpCustomerRequestViewProps> = ({
  title = 'Inquiries & Quotes',
  defaultMode = 'list',
  onAddNotification,
  initialSelectedId,
  createOnMount,
  onBackToHome,
  requests: controlledRequests,
  onRequestsChange,
  onSubmitInquiry,
  onReviseInquiry,
}) => {
  const { currentUser, jwtToken } = useAuth();

  // Determine if this is customer view
  const isCustomerView = useMemo(() => {
    if (currentUser?.userType === 'customer') return true;
    if (title.toLowerCase().includes('customer portal') || title.toLowerCase().includes('customer view')) return true;
    return false;
  }, [currentUser, title]);

  // Data list state
  const [internalRequests, setInternalRequests] = useState<ErpRequestHeader[]>(INITIAL_ERP_REQUESTS);
  const requests = controlledRequests ?? internalRequests;
  const setRequests = onRequestsChange ?? setInternalRequests;

  // View state: 'list' or 'detail'
  const [viewMode, setViewMode] = useState<'list' | 'detail'>(defaultMode);
  const [selectedReqId, setSelectedReqId] = useState<string>(initialSelectedId || 'req-26-002594');

  // Search/Filter state for List View
  const [filterOrg, setFilterOrg] = useState<string>('Energya Cables');
  const [filterCustomer, setFilterCustomer] = useState<string>('');
  const [filterRefNo, setFilterRefNo] = useState<string>('');
  const [filterQuotationNo, setFilterQuotationNo] = useState<string>('');
  const [filterRequestDate, setFilterRequestDate] = useState<string>('');
  const [filterQuotationStatus, setFilterQuotationStatus] = useState<string>('Sent To Technical');
  const [filterStatus, setFilterStatus] = useState<string>('-');
  const [filterHasAttachments, setFilterHasAttachments] = useState<string>('-');
  const [selectedSalesFilter, setSelectedSalesFilter] = useState<string>('all');

  // Sub-table active tab in Detail view: 'details' | 'log' | 'comments'
  const [subTab, setSubTab] = useState<'details' | 'log' | 'comments' | 'versions'>('details');
  const [expandedVersionNo, setExpandedVersionNo] = useState<number | null>(null);

  // Modals & Process Flow state
  const [showProcessFlow, setShowProcessFlow] = useState<boolean>(false);
  const [showCrossSectionModal, setShowCrossSectionModal] = useState<boolean>(false);
  const [activeCrossSectionItem, setActiveCrossSectionItem] = useState<ErpRequestItem | null>(null);
  const [showOfferCostModal, setShowOfferCostModal] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [showAttachModal, setShowAttachModal] = useState<boolean>(false);
  const [showEmailModal, setShowEmailModal] = useState<boolean>(false);
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);
  const [activeBomItem, setActiveBomItem] = useState<ErpRequestItem | null>(null);
  const [activeDrumItem, setActiveDrumItem] = useState<ErpRequestItem | null>(null);
  const [showConfiguratorModal, setShowConfiguratorModal] = useState<boolean>(false);
  const [showSearchSelectModal, setShowSearchSelectModal] = useState<boolean>(false);
  const [showContainerOptimizerModal, setShowContainerOptimizerModal] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Direct catalog add state
  const [selectedCatalogCode, setSelectedCatalogCode] = useState<string>('');

  // Email/Notification form state
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailRecipient, setEmailRecipient] = useState<string>('ahmed.zaki@madkour.com.eg');
  const [emailBody, setEmailBody] = useState<string>('');

  // Toast Helper
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Filter requests according to User Role & Permissions
  const roleFilteredRequests = useMemo(() => {
    let list = [...requests];

    if (currentUser?.userType === 'customer') {
      const company = (currentUser.companyName || currentUser.fullName || '').toLowerCase();
      const matched = list.filter((r) => {
        const cName = (r.customerName || '').toLowerCase();
        const contact = (r.contactPerson || '').toLowerCase();
        return cName.includes(company) || company.includes(cName) || contact.includes(company);
      });
      // If mock data doesn't match new customer name, show first 3 requests mapped to customer name for demo
      if (matched.length > 0) return matched;
      return list.map((r) => ({ ...r, customerName: currentUser.companyName || 'My Customer Account' })).slice(0, 3);
    }

    if (currentUser?.userType === 'internal') {
      const isManagerOrAdmin =
        currentUser.role.toLowerCase().includes('admin') ||
        currentUser.role.toLowerCase().includes('manager') ||
        currentUser.role.toLowerCase().includes('head');

      if (!isManagerOrAdmin) {
        // Sales person view only his own inquiries & quotes
        const name = (currentUser.fullName || '').toLowerCase();
        const matched = list.filter((r) => {
          const sAgent = (r.salesAgent || '').toLowerCase();
          const qOwner = (r.quotationOwner || '').toLowerCase();
          return sAgent.includes(name) || name.includes(sAgent) || qOwner.includes(name);
        });
        if (matched.length > 0) return matched;
        return list.filter((_, i) => i % 2 === 0);
      } else if (selectedSalesFilter !== 'all') {
        return list.filter((r) => r.salesAgent.toLowerCase().includes(selectedSalesFilter.toLowerCase()));
      }
    }

    return list;
  }, [requests, currentUser, selectedSalesFilter]);

  // Apply search bar filters on top of role filtering
  const filteredRequests = useMemo(() => {
    return roleFilteredRequests.filter((req) => {
      const matchCustomer =
        !filterCustomer || req.customerName.toLowerCase().includes(filterCustomer.toLowerCase());
      const matchRef = !filterRefNo || req.refNo.toLowerCase().includes(filterRefNo.toLowerCase());
      const matchQuoteNo =
        !filterQuotationNo ||
        (req.quotationRefNo || req.refNo || req.id || '').toLowerCase().includes(filterQuotationNo.toLowerCase());
      const matchReqDate =
        !filterRequestDate ||
        (req.trxDate || req.creationDate || req.deliveryDate || '').toLowerCase().includes(filterRequestDate.toLowerCase());
      const matchQuoteStatus =
        !filterQuotationStatus ||
        filterQuotationStatus === '-' ||
        req.quotationStatus.toLowerCase().includes(filterQuotationStatus.toLowerCase());
      const matchStatus =
        !filterStatus || filterStatus === '-' || req.status.toLowerCase().includes(filterStatus.toLowerCase());

      return matchCustomer && matchRef && matchQuoteNo && matchReqDate && matchQuoteStatus && matchStatus;
    });
  }, [roleFilteredRequests, filterCustomer, filterRefNo, filterQuotationNo, filterRequestDate, filterQuotationStatus, filterStatus]);

  // Total & Open Quotations Counters for Customer Portal
  const totalQuotationsCount = roleFilteredRequests.length;
  const openQuotationsCount = useMemo(() => {
    return roleFilteredRequests.filter(
      (r) => r.quotationStatus !== 'Approved' && r.status !== 'Closed'
    ).length;
  }, [roleFilteredRequests]);

  // Active Selected Request object
  const activeReq =
    filteredRequests.find((r) => r.id === selectedReqId) ||
    roleFilteredRequests.find((r) => r.id === selectedReqId) ||
    requests[0];
  const activeIndex = roleFilteredRequests.findIndex((r) => r.id === activeReq?.id);

  // Navigation handlers for < Prev / Next >
  const handlePrev = () => {
    if (activeIndex > 0) {
      setSelectedReqId(roleFilteredRequests[activeIndex - 1].id);
    }
  };

  const handleNext = () => {
    if (activeIndex < roleFilteredRequests.length - 1) {
      setSelectedReqId(roleFilteredRequests[activeIndex + 1].id);
    }
  };

  // Header field update handler
  const handleUpdateHeader = (field: keyof ErpRequestHeader, value: any) => {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === activeReq.id) {
          if (field === 'quotationStatus' && r.quotationStatus !== value) {
            const newLog = {
              id: `log-${Date.now()}`,
              date: new Date().toLocaleString(),
              previousStatus: r.quotationStatus,
              newStatus: value,
              changedBy: currentUser?.fullName || 'Sales Agent',
              notes: `Status changed to "${value}" via ERP portal.`,
            };
            return {
              ...r,
              [field]: value,
              statusLogs: [newLog, ...r.statusLogs],
            };
          }
          return { ...r, [field]: value };
        }
        return r;
      })
    );
  };

  // Line item update handler
  const handleUpdateItem = (serial: number, field: keyof ErpRequestItem, value: any) => {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === activeReq.id) {
          const updatedItems = r.items.map((item) =>
            item.serial === serial ? { ...item, [field]: value } : item
          );
          return { ...r, items: updatedItems };
        }
        return r;
      })
    );
  };

  // Save Drum details back to line item
  const handleSaveDrumDetails = (serial: number, updatedDrumDetails: any) => {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === activeReq.id) {
          const updatedItems = r.items.map((item) =>
            item.serial === serial ? { ...item, drumDetails: updatedDrumDetails } : item
          );
          return { ...r, items: updatedItems };
        }
        return r;
      })
    );
    triggerToast(`Drum schedule saved for item #${serial}`);
  };

  // Add Item via Catalog Select
  const handleAddCatalogItem = () => {
    if (!selectedCatalogCode) return;
    const catItem = MASTER_CABLE_CATALOG.find(
      (m) => m.code === selectedCatalogCode || m.cableCode === selectedCatalogCode || m.itemCode === selectedCatalogCode
    );
    if (!catItem) return;

    const newSerial = activeReq.items.length > 0 ? Math.max(...activeReq.items.map((i) => i.serial)) + 1 : 1;
    const newItem: ErpRequestItem = {
      serial: newSerial,
      itemCode: catItem.itemCode,
      cableCode: catItem.cableCode,
      customerCode: catItem.customerCode,
      itemDescription: catItem.description,
      uom: 'KM',
      qty: 1.0,
      unitPriceUsd: catItem.standardPriceUsdPerM * 1000,
      drumDetails: {
        drumType: 'Wood Reel 220',
        noOfDrums: 1,
        cuttingLengthMeters: 1000,
        totalLengthKm: 1.0,
        grossWeightPerDrumKg: catItem.approxWeightKgKm,
        netWeightPerDrumKg: Math.round(catItem.approxWeightKgKm * 0.9),
        drumsList: [
          {
            drumNo: 1,
            drumType: 'Wood Reel 220',
            lengthMeters: 1000,
            grossWeightKg: catItem.approxWeightKgKm,
          },
        ],
      },
      bomDetails: {
        copperKgKm: catItem.conductor === 'Copper' ? 1200 : 0,
        insulationType: 'XLPE 90C',
        insulationThicknessMm: 4.5,
        armourType: 'SWA / STA',
        sheathType: 'PVC Outer',
        grossWeightKgKm: catItem.approxWeightKgKm,
      },
    };

    setRequests((prev) =>
      prev.map((r) => (r.id === activeReq.id ? { ...r, items: [...r.items, newItem] } : r))
    );

    setSelectedCatalogCode('');
    triggerToast(`Added ${catItem.code} to request`);
  };

  // Add Item via Configurator Modal callback
  const handleAddConfiguredItem = (newItemData: Omit<ErpRequestItem, 'serial'>) => {
    const newSerial = activeReq.items.length > 0 ? Math.max(...activeReq.items.map((i) => i.serial)) + 1 : 1;
    const newItem: ErpRequestItem = {
      serial: newSerial,
      ...newItemData,
    };

    setRequests((prev) =>
      prev.map((r) => (r.id === activeReq.id ? { ...r, items: [...r.items, newItem] } : r))
    );

    triggerToast(`Configured cable ${newItemData.itemCode} added to request!`);
  };

  // Delete line item handler
  const handleDeleteItem = (serial: number) => {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === activeReq.id) {
          const filtered = r.items.filter((i) => i.serial !== serial);
          // Re-sequence serial numbers
          const reSequenced = filtered.map((item, idx) => ({ ...item, serial: idx + 1 }));
          return { ...r, items: reSequenced };
        }
        return r;
      })
    );
    triggerToast(`Deleted Line Item #${serial}`);
  };

  // Auto Number Generator for new Inquiries / Quotes
  const handleCreateNew = async () => {
    const autoNum = `26/00${Math.floor(2000 + Math.random() * 7999)}`;

    if (jwtToken) {
      try {
        const inquiry = await createCommercialInquiry(jwtToken, {
          customerReference: autoNum,
          customerName: currentUser?.companyName || currentUser?.fullName || undefined,
          contactPerson: currentUser?.fullName || undefined,
          projectName: 'New Power Infrastructure Project',
          currency: 'USD',
          notes: 'Customer RFQ submitted via portal with auto-generated reference number.',
        });
        const newReq = mapCommercialInquiryToErpHeader(inquiry, currentUser);
        setRequests((prev) => [newReq, ...prev]);
        setSelectedReqId(newReq.id);
        setViewMode('detail');
        triggerToast(`Created inquiry ${inquiry.inquiryNumber} (Ref. ${autoNum})`);
        return;
      } catch (err) {
        console.warn('Server inquiry create failed, saving locally:', err);
        triggerToast('Could not reach server. Inquiry saved locally only.');
      }
    }

    const newId = `req-${autoNum.replace('/', '-')}`;

    const newReq: ErpRequestHeader = {
      id: newId,
      transactionType: 'Customer Request',
      trxDate: new Date().toLocaleDateString('en-GB'),
      refNo: autoNum,
      organization: '1 - Energya Cables',
      customerName: currentUser?.companyName || currentUser?.fullName || 'Madkour for Utilities',
      contactPerson: currentUser?.fullName || 'Eng. Ahmed Zaki',
      salesAgent: currentUser?.userType === 'internal' ? currentUser.fullName : 'Osama Hassanien',
      projectName: 'New Power Infrastructure Project',
      currency: 'USD',
      exchangeRate: 1.0,
      rawMaterialCurrency: 'USD',
      rawMaterialExchangeRate: 56.0,
      copperPriceRate: 14500,
      aluminiumPriceRate: 240000,
      aluminiumAlloyPriceRate: 3600,
      deliveryDate: '30/11/2026',
      versionNo: 1,
      status: 'Opened',
      quotationOwner: currentUser?.fullName || 'Nouran Rabeei',
      quotationStatus: 'Sent To Technical',
      remarks: 'Customer RFQ submitted via portal with auto-generated reference number.',
      technicalComments: 'Awaiting cable engineering verification.',
      salesComments: 'Inquiry assigned to sales representative.',
      hasAttachments: false,
      attachments: [],
      items: [
        {
          serial: 1,
          itemCode: 'MV-33KV-CU-3C-240-XLPE-PVC-SWA-PVC',
          itemDescription: '33kV Medium Voltage Copper 3 Core 240mm² XLPE Insulated SWA Armoured Cable',
          uom: 'KM',
          qty: 2.5,
          unitPriceUsd: 18500,
          drumDetails: {
            drumType: 'Wood Reel 220',
            noOfDrums: 3,
            cuttingLengthMeters: 833,
            totalLengthKm: 2.5,
            grossWeightPerDrumKg: 2150,
            netWeightPerDrumKg: 1850,
            drumsList: [
              { drumNo: 1, drumType: 'Wood Reel 220', lengthMeters: 833, grossWeightKg: 2150 },
              { drumNo: 2, drumType: 'Wood Reel 220', lengthMeters: 833, grossWeightKg: 2150 },
              { drumNo: 3, drumType: 'Wood Reel 220', lengthMeters: 834, grossWeightKg: 2150 },
            ],
          },
          bomDetails: {
            copperKgKm: 1080,
            insulationType: 'XLPE 90C',
            insulationThicknessMm: 5.5,
            armourType: 'SWA',
            sheathType: 'PVC',
            grossWeightKgKm: 3400,
          },
        },
      ],
      statusLogs: [
        {
          id: `log-${Date.now()}`,
          date: new Date().toLocaleString(),
          previousStatus: 'Draft',
          newStatus: 'Sent To Technical',
          changedBy: currentUser?.fullName || 'Customer Portal',
          notes: 'Auto-created new inquiry request with reference number ' + autoNum,
        },
      ],
      comments: [],
    };

    setRequests((prev) => [newReq, ...prev]);
    setSelectedReqId(newId);
    setViewMode('detail');
    triggerToast(`Created New Customer Request Ref. ${autoNum}`);
  };

  const didCreateOnMount = React.useRef(false);
  useEffect(() => {
    if (createOnMount && !didCreateOnMount.current) {
      didCreateOnMount.current = true;
      handleCreateNew();
    }
  }, [createOnMount]);

  // Generate new CR version handler (V1 -> V2 -> V3)
  const handleCreateNewVersion = () => {
    if (isInquirySubmitted(activeReq)) {
      if (onReviseInquiry) {
        onReviseInquiry(activeReq.id);
      } else {
        setRequests((prev) =>
          prev.map((r) => (r.id === activeReq.id ? applyInquiryRevision(r, currentUser) : r))
        );
      }
      triggerToast(`Opened revision V${(activeReq.versionNo || 1) + 1}. Prior version preserved.`);
      return;
    }

    const currentVer = activeReq.versionNo || 1;
    const newVer = currentVer + 1;
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === activeReq.id) {
          const newLog = {
            id: `log-${Date.now()}`,
            date: new Date().toLocaleString(),
            previousStatus: `Version V${currentVer}`,
            newStatus: `Version V${newVer}`,
            changedBy: currentUser?.fullName || 'ELAND Cables',
            notes: `Generated new CR version V${newVer} with updated commercial variables & length schedules.`,
          };
          return {
            ...r,
            versionNo: newVer,
            status: 'Opened',
            statusLogs: [newLog, ...(r.statusLogs || [])],
          };
        }
        return r;
      })
    );
    triggerToast(`Generated New CR Revision Version V${newVer} for Ref #${activeReq.refNo}!`);
  };

  const handleSubmitCurrent = async () => {
    if (!canSubmitInquiry(activeReq)) {
      triggerToast('This inquiry is already submitted.');
      return;
    }
    if (onSubmitInquiry) {
      await onSubmitInquiry(activeReq.id);
    } else {
      setRequests((prev) =>
        prev.map((r) => (r.id === activeReq.id ? applyInquirySubmit(r, currentUser) : r))
      );
    }
    triggerToast(`Inquiry Ref. ${activeReq.refNo} submitted (V${activeReq.versionNo || 1}).`);
  };

  const allVersions = useMemo(() => listAllVersions(activeReq), [activeReq]);

  // Upload attachment handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const newAtt: ErpAttachment = {
        id: `att-${Date.now()}`,
        fileName: file.name,
        fileSizeKb: Math.round(file.size / 1024),
        uploadedBy: currentUser?.fullName || 'Sales Agent',
        uploadedAt: new Date().toLocaleString(),
      };

      setRequests((prev) =>
        prev.map((r) =>
          r.id === activeReq.id
            ? { ...r, hasAttachments: true, attachments: [...r.attachments, newAtt] }
            : r
        )
      );

      setShowAttachModal(false);
      triggerToast(`Attached file "${file.name}" to Ref. ${activeReq.refNo}`);
    }
  };

  // Send Email & Notification handler
  const handleSendEmailNotification = (e: React.FormEvent) => {
    e.preventDefault();
    setShowEmailModal(false);

    // Push system notification
    if (onAddNotification) {
      onAddNotification({
        id: `notif-${Date.now()}`,
        title: `Quotation Sent: ${activeReq.refNo}`,
        message: `Sales quotation version ${activeReq.versionNo} for ${activeReq.customerName} emailed to ${emailRecipient}.`,
        timestamp: 'Just now',
        read: false,
        type: 'quotation',
        refNo: activeReq.refNo,
      });
    }

    triggerToast(`Quotation Email & System Notification sent to ${emailRecipient}`);
  };

  return (
    <div className="space-y-4 font-sans text-slate-800 dark:text-slate-100 pb-12">
      {/* --- TOP TOAST NOTIFICATION BANNER --- */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl border border-slate-700 flex items-center space-x-3 animate-slide-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <span className="font-bold text-xs">{toastMessage}</span>
        </div>
      )}

      {/* --- USER CONTEXT FILTERING ALERT BANNER (Internal View Only) --- */}
      {!isCustomerView && (
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white p-3.5 rounded-2xl shadow-sm border border-blue-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600/30 rounded-xl border border-blue-500/30">
              <User className="h-4 w-4 text-blue-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-blue-200 uppercase tracking-wider text-[10px]">
                  Sales Representative ERP View
                </span>
                <span className="bg-blue-500/20 text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-500/30">
                  Filtered View Active
                </span>
              </div>
              <p className="font-medium text-slate-200 mt-0.5">
                Logged in user:{' '}
                <strong className="text-amber-300 font-bold">
                  {currentUser?.fullName} ({currentUser?.companyName || currentUser?.role})
                </strong>{' '}
                • Displaying assigned inquiries ({roleFilteredRequests.length} record(s))
              </p>
            </div>
          </div>

          {currentUser?.userType === 'internal' && (currentUser.role.includes('Admin') || currentUser.role.includes('Manager')) && (
            <div className="flex items-center space-x-2 shrink-0 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800">
              <Filter className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-[11px] font-bold text-slate-300">Sales Agent:</span>
              <select
                value={selectedSalesFilter}
                onChange={(e) => setSelectedSalesFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-white outline-none"
              >
                <option value="all">All Sales Representatives</option>
                <option value="Osama Hassanien">Osama Hassanien</option>
                <option value="Mohamed Salah">Mohamed Salah</option>
                <option value="Waleed Hafez">Waleed Hafez</option>
                <option value="Ashraf Gabr">Ashraf Gabr</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* --- CUSTOMER PORTAL HOME CARDS (Total Quotations, Open Quotations, Selected Quotation Cable List) --- */}
      {isCustomerView && viewMode === 'list' && (
        <div className="space-y-4 mb-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* CARD 1: TOTAL QUOTATIONS */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Total Quotations
                </span>
                <div className="text-3xl font-black text-slate-900 dark:text-white">
                  {totalQuotationsCount}
                </div>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center space-x-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Logged Customer Inquiries</span>
                </p>
              </div>
              <div className="p-3.5 bg-amber-500/10 text-amber-500 rounded-2xl border border-amber-500/20">
                <FileText className="h-7 w-7" />
              </div>
            </div>

            {/* CARD 2: OPEN QUOTATIONS */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Open Quotations
                </span>
                <div className="text-3xl font-black text-blue-600 dark:text-blue-400">
                  {openQuotationsCount}
                </div>
                <p className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold flex items-center space-x-1">
                  <Clock className="h-3.5 w-3.5" />
                  <span>In-Progress / Pending Offer</span>
                </p>
              </div>
              <div className="p-3.5 bg-blue-500/10 text-blue-500 rounded-2xl border border-blue-500/20">
                <Clock className="h-7 w-7" />
              </div>
            </div>

            {/* CARD 3: QUICK ACTION + NEW INQUIRY CARD */}
            <div className="bg-gradient-to-br from-amber-500 via-amber-600 to-accent-600 p-5 rounded-2xl text-slate-950 shadow-md flex flex-col justify-between space-y-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider bg-slate-950/20 text-slate-950 px-2.5 py-0.5 rounded-full inline-block mb-1">
                  Customer RFQ Portal
                </span>
                <h3 className="text-sm font-black uppercase leading-tight">Submit New Cable RFQ</h3>
                <p className="text-xs font-medium text-slate-900 mt-0.5">
                  Request custom cable specs, drum packaging & quick pricing.
                </p>
              </div>
              <button
                onClick={handleCreateNew}
                className="w-full py-2 rounded-xl bg-slate-950 hover:bg-slate-900 text-amber-400 font-black text-xs shadow transition-all flex items-center justify-center space-x-1.5"
              >
                <Plus className="h-4 w-4" />
                <span>+ New Inquiry</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ELAND PROCESS FLOW DIAGRAM (STEPS 1 TO 9) --- */}
      {showProcessFlow && (
        <div className="mb-4">
          <ElandProcessFlowDiagram
            onSelectStep={(step) => {
              if (step === 1) {
                setViewMode('list');
              } else if (step === 9) {
                setShowHelpModal(true);
              } else {
                setViewMode('detail');
              }
            }}
          />
        </div>
      )}

      {/* --- MAIN CONTAINER CARD --- */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* TOP ORANGE NAVIGATION TOOLBAR */}
        <div className="bg-[#E65100] text-white p-2.5 px-4 flex flex-wrap items-center justify-between gap-2 shadow-inner">
          {/* Left Title & Mode Switcher */}
          <div className="flex items-center space-x-3">
            <Star className="h-4 w-4 fill-amber-300 text-amber-300 cursor-pointer" />
            {onBackToHome && (
              <button
                onClick={onBackToHome}
                className="px-3 py-1 rounded bg-white text-[#E65100] font-bold text-xs"
              >
                Home
              </button>
            )}

            {/* List / Detail Toggle Buttons */}
            <div className="flex items-center bg-black/20 p-0.5 rounded-lg border border-white/20">
              <button
                onClick={() => {
                  if (onBackToHome) onBackToHome();
                  else setViewMode('list');
                }}
                className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                  viewMode === 'list' ? 'bg-white text-[#E65100] shadow' : 'text-white hover:bg-white/10'
                }`}
              >
                Register Table
              </button>
              <button
                onClick={() => setViewMode('detail')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                  viewMode === 'detail' ? 'bg-white text-[#E65100] shadow' : 'text-white hover:bg-white/10'
                }`}
              >
                Detailed Form View
              </button>
            </div>

            {/* Toggle Process Flow */}
            <button
              onClick={() => setShowProcessFlow((prev) => !prev)}
              className="px-2.5 py-1 rounded bg-accent-300 hover:bg-accent-300 text-slate-950 font-black text-xs flex items-center space-x-1 shadow transition-all"
            >
              <Sparkles className="h-3.5 w-3.5 text-red-700" />
              <span>{showProcessFlow ? 'Hide Process' : 'Process'}</span>
            </button>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center space-x-1 sm:space-x-2 text-xs">
            <button
              onClick={handleCreateNew}
              className="px-3 py-1 rounded bg-accent-500 hover:bg-accent-600 font-bold text-slate-950 flex items-center space-x-1 shadow-sm transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>+ New Inquiry</span>
            </button>

            <button
              onClick={() => triggerToast('Inquiry Changes Saved Successfully')}
              className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-semibold flex items-center space-x-1"
            >
              <Save className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Save</span>
            </button>

            <button
              onClick={() => void handleSubmitCurrent()}
              disabled={!canSubmitInquiry(activeReq)}
              className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold flex items-center space-x-1 shadow-sm"
              title="Submit inquiry for technical review"
            >
              <Send className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Submit</span>
            </button>

            {/* Email & Notification Trigger */}
            <button
              onClick={() => {
                setEmailSubject(`Quotation Ref. ${activeReq.refNo} - ${activeReq.customerName}`);
                setEmailBody(
                  `Dear ${activeReq.contactPerson},\n\nPlease find attached our technical and commercial quotation version ${activeReq.versionNo} for ${activeReq.projectName}.\n\nBest regards,\nEnergya Cables Sales Team`
                );
                setShowEmailModal(true);
              }}
              className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center space-x-1 shadow-sm"
              title="Send Quotation Email and System Notification"
            >
              <Mail className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Email & Notify</span>
            </button>

            <button
              onClick={() => setShowAttachModal(true)}
              className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-semibold flex items-center space-x-1"
            >
              <Paperclip className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Attach Files ({activeReq.attachments.length})</span>
            </button>

            {/* Container & Drum Optimizer Modal Trigger */}
            <button
              onClick={() => setShowContainerOptimizerModal(true)}
              className="px-3 py-1 rounded bg-accent-500 hover:bg-accent-300 text-slate-950 font-extrabold flex items-center space-x-1 shadow-sm transition-all"
              title="Open Container Calculation & Drum Optimizer Engine"
            >
              <Truck className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Container & Drum Optimizer</span>
            </button>

            {/* Record Navigation Arrows */}
            <div className="flex items-center space-x-1 pl-2 border-l border-white/20">
              <button
                onClick={handlePrev}
                disabled={activeIndex <= 0}
                className="p-1 hover:bg-white/20 rounded disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-mono text-[11px] font-bold">
                {activeIndex + 1}/{roleFilteredRequests.length}
              </span>
              <button
                onClick={handleNext}
                disabled={activeIndex >= roleFilteredRequests.length - 1}
                className="p-1 hover:bg-white/20 rounded disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* --- VIEW MODE 1: REGISTER LIST TABLE --- */}
        {viewMode === 'list' && (
          <div className="p-4 space-y-4">
            {/* Search Filter Panel */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Ref. No
                </label>
                <input
                  type="text"
                  placeholder="e.g. 26/001365"
                  value={filterRefNo}
                  onChange={(e) => setFilterRefNo(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-mono font-medium outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Quotation Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. QUO-2026-8841"
                  value={filterQuotationNo}
                  onChange={(e) => setFilterQuotationNo(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-mono font-medium outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Request Date
                </label>
                <input
                  type="text"
                  placeholder="e.g. 10/08/2026"
                  value={filterRequestDate}
                  onChange={(e) => setFilterRequestDate(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-medium outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-end space-x-2">
                <button
                  onClick={() => triggerToast('Search Filter Applied Successfully')}
                  className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center space-x-1.5"
                >
                  <Search className="h-4 w-4" />
                  <span>Filter Search</span>
                </button>
                <button
                  onClick={handleCreateNew}
                  className="px-3 py-2 rounded-lg bg-accent-500 hover:bg-accent-600 text-slate-950 font-black text-xs shadow-md transition-all flex items-center justify-center space-x-1 shrink-0"
                  title="Create New Customer Inquiry"
                >
                  <Plus className="h-4 w-4" />
                  <span>+ New Inquiry</span>
                </button>
              </div>
            </div>

            {/* List Records Table Bar */}
            <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Inquiries & Quotes ({filteredRequests.length} items)
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => triggerToast('Reset Filters')}
                  className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  title="Reset"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Main Records Table */}
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                    <th className="p-2.5 w-8 text-center">
                      <input type="checkbox" />
                    </th>
                    <th className="p-2.5 font-bold text-blue-700 dark:text-blue-400">Quote #</th>
                    <th className="p-2.5">Request Date</th>
                    <th className="p-2.5 text-center">Version</th>
                    <th className="p-2.5 font-bold">Ref. No</th>
                    <th className="p-2.5 min-w-[160px]">Customer</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Modified Date</th>
                    <th className="p-2.5">Modified By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredRequests.map((req) => {
                    const quoteNum = req.quoteNo || `QUO-2026-${req.refNo.split('/')[1] || req.refNo}`;
                    const modDate = req.modifiedDate || req.statusLogs?.[0]?.date || req.trxDate;
                    const modBy = req.modifiedBy || req.statusLogs?.[0]?.changedBy || req.quotationOwner || req.salesAgent;

                    return (
                      <tr
                        key={req.id}
                        className={`hover:bg-blue-50/60 dark:hover:bg-slate-800/80 transition-colors cursor-pointer ${
                          req.id === activeReq.id ? 'bg-blue-50/80 dark:bg-slate-800/90' : ''
                        }`}
                        onClick={() => {
                          setSelectedReqId(req.id);
                          setViewMode('detail');
                        }}
                      >
                        <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" />
                        </td>

                        <td className="p-2.5 font-bold text-blue-700 dark:text-blue-400 font-mono">
                          {quoteNum}
                        </td>

                        <td className="p-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {req.trxDate}
                        </td>

                        <td className="p-2.5 text-center font-bold">
                          {req.versionNo}
                        </td>

                        <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200 font-mono">
                          {req.refNo}
                        </td>

                        <td className="p-2.5 font-bold text-slate-900 dark:text-white">
                          {req.customerName}
                        </td>

                        <td className="p-2.5 font-medium">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold inline-block ${
                            req.status === 'Approved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                            req.status === 'Opened' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                            'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                          }`}>
                            {req.status}
                          </span>
                        </td>

                        <td className="p-2.5 whitespace-nowrap text-slate-600 dark:text-slate-400">
                          {modDate}
                        </td>

                        <td className="p-2.5 text-slate-700 dark:text-slate-300 font-medium">
                          {modBy}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-slate-500 pt-1">
              Showing {filteredRequests.length} of {roleFilteredRequests.length} Entries
            </div>
          </div>
        )}

        {/* --- VIEW MODE 2: DETAILED HEADER & LINES FORM VIEW --- */}
        {viewMode === 'detail' && (
          <div className="p-4 space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-slate-600 dark:text-slate-300">Current status:</span>
              <span
                className={`px-2.5 py-1 rounded-full font-bold ${
                  isInquirySubmitted(activeReq)
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                }`}
              >
                V{activeReq.versionNo || 1} · {isInquirySubmitted(activeReq) ? 'Submitted' : 'Open'}
              </span>
              {(activeReq.versionHistory?.length || 0) > 0 && (
                <span className="text-slate-500">
                  {activeReq.versionHistory!.length} prior version(s) archived
                </span>
              )}
            </div>

            {/* Header Form Grid (3 Columns) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 text-xs">
              {/* COLUMN 1 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">
                    Transaction Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={activeReq.transactionType}
                    onChange={(e) => handleUpdateHeader('transactionType', e.target.value)}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-medium outline-none"
                  >
                    <option value="Customer Request">Customer Request</option>
                    <option value="Sales Quotation">Sales Quotation</option>
                    <option value="Tender Inquiry">Tender Inquiry</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">
                    Customer <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center space-x-1 w-60">
                    <input
                      type="text"
                      value={activeReq.customerName}
                      onChange={(e) => handleUpdateHeader('customerName', e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-bold outline-none"
                    />
                    <button
                      onClick={() => triggerToast('Open Customer Creation Modal')}
                      className="p-1 bg-emerald-500 text-white rounded hover:bg-emerald-600 shrink-0"
                      title="Add New Customer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Sales Agent</label>
                  <input
                    type="text"
                    value={activeReq.salesAgent}
                    onChange={(e) => handleUpdateHeader('salesAgent', e.target.value)}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-medium outline-none"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Exchange Rate</label>
                  <input
                    type="number"
                    value={activeReq.exchangeRate}
                    onChange={(e) => handleUpdateHeader('exchangeRate', Number(e.target.value))}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-medium outline-none"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Copper Price Rate</label>
                  <input
                    type="number"
                    value={activeReq.copperPriceRate}
                    onChange={(e) => handleUpdateHeader('copperPriceRate', Number(e.target.value))}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-medium outline-none"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Delivery Date</label>
                  <input
                    type="text"
                    value={activeReq.deliveryDate}
                    onChange={(e) => handleUpdateHeader('deliveryDate', e.target.value)}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-medium outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Remarks</label>
                  <textarea
                    rows={2}
                    value={activeReq.remarks}
                    onChange={(e) => handleUpdateHeader('remarks', e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-2 text-xs outline-none"
                  />
                </div>
              </div>

              {/* COLUMN 2 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">
                    Trx Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={activeReq.trxDate}
                    onChange={(e) => handleUpdateHeader('trxDate', e.target.value)}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-medium outline-none"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">
                    Organization <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={activeReq.organization}
                    onChange={(e) => handleUpdateHeader('organization', e.target.value)}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-medium outline-none"
                  >
                    <option value="1 - Energya Cables">1 - Energya Cables</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Project Name</label>
                  <input
                    type="text"
                    value={activeReq.projectName}
                    onChange={(e) => handleUpdateHeader('projectName', e.target.value)}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-bold outline-none"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Raw Material Currency</label>
                  <select
                    value={activeReq.rawMaterialCurrency}
                    onChange={(e) => handleUpdateHeader('rawMaterialCurrency', e.target.value)}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-medium outline-none"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="EGP">EGP</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Aluminium Price Rate</label>
                  <input
                    type="number"
                    value={activeReq.aluminiumPriceRate}
                    onChange={(e) => handleUpdateHeader('aluminiumPriceRate', Number(e.target.value))}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-medium outline-none"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Version No</label>
                  <div className="flex items-center space-x-1.5 w-60">
                    <input
                      type="number"
                      value={activeReq.versionNo}
                      onChange={(e) => handleUpdateHeader('versionNo', Number(e.target.value))}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-bold outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCreateNewVersion}
                      className="px-2 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold text-[10px] shrink-0 shadow flex items-center space-x-0.5"
                      title="Step 2.2: Create New CR Version Revision (V1 / V2 / V3)"
                    >
                      <Plus className="h-3 w-3" />
                      <span>+Version</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Quotation Owner</label>
                  <input
                    type="text"
                    value={activeReq.quotationOwner}
                    onChange={(e) => handleUpdateHeader('quotationOwner', e.target.value)}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-medium outline-none"
                  />
                </div>
              </div>

              {/* COLUMN 3 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">
                    Ref. No <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={activeReq.refNo}
                    onChange={(e) => handleUpdateHeader('refNo', e.target.value)}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-mono font-bold text-blue-700 dark:text-blue-400 outline-none"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Contact Person</label>
                  <input
                    type="text"
                    value={activeReq.contactPerson}
                    onChange={(e) => handleUpdateHeader('contactPerson', e.target.value)}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-medium outline-none"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Currency</label>
                  <select
                    value={activeReq.currency}
                    onChange={(e) => handleUpdateHeader('currency', e.target.value)}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-medium outline-none"
                  >
                    <option value="LE">LE</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="SAR">SAR</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Incoterms (Delivery)</label>
                  <select
                    value={activeReq.deliveryTerms || 'FOB'}
                    onChange={(e) => handleUpdateHeader('deliveryTerms', e.target.value)}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-bold text-amber-700 dark:text-amber-400 outline-none"
                  >
                    <option value="FOB">FOB - Free on Board</option>
                    <option value="CIF">CIF - Cost, Insurance & Freight</option>
                    <option value="EXW">EXW - Ex Works</option>
                    <option value="DDP">DDP - Delivered Duty Paid</option>
                    <option value="CFR">CFR - Cost & Freight</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Raw Material Exchange Rate</label>
                  <input
                    type="number"
                    value={activeReq.rawMaterialExchangeRate}
                    onChange={(e) => handleUpdateHeader('rawMaterialExchangeRate', Number(e.target.value))}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-medium outline-none"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 dark:text-slate-300">Status</label>
                  <input
                    type="text"
                    value={activeReq.status}
                    onChange={(e) => handleUpdateHeader('status', e.target.value)}
                    className="w-60 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1.5 font-medium outline-none"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Sales Comments</label>
                  <textarea
                    rows={2}
                    value={activeReq.salesComments}
                    onChange={(e) => handleUpdateHeader('salesComments', e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-2 text-xs outline-none"
                  />
                </div>
              </div>
            </div>

            {/* --- CABLE SELECTION & CONFIGURATOR INTEGRATION BAR --- */}
            <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col lg:flex-row items-center justify-between gap-3 text-xs">
              {/* Left: Cable Quick Select Search & Search Modal Trigger */}
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto flex-1">
                <Search className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">Quick Add Item:</span>
                <select
                  value={selectedCatalogCode}
                  onChange={(e) => setSelectedCatalogCode(e.target.value)}
                  className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 font-mono font-bold text-xs outline-none flex-1 max-w-md"
                >
                  <option value="">-- Select Cable by Item Code / Cable Code / Customer Code --</option>
                  {MASTER_CABLE_CATALOG.map((item) => (
                    <option key={item.id} value={item.cableCode}>
                      {item.cableCode} | {item.itemCode} | {item.customerCode} ({item.description})
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAddCatalogItem}
                  disabled={!selectedCatalogCode}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-50 transition-all shrink-0"
                >
                  + Add Item
                </button>
                <button
                  onClick={() => setShowSearchSelectModal(true)}
                  className="px-3.5 py-2 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center space-x-1.5 transition-all shrink-0"
                >
                  <Search className="h-3.5 w-3.5 text-blue-400" />
                  <span>Search by Cable / Item / Customer Code</span>
                </button>
              </div>

              {/* Right: Cable Configurator & Container/Drum Optimizer Triggers */}
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                <button
                  onClick={() => setShowConfiguratorModal(true)}
                  className="px-3.5 py-2 bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 text-slate-950 font-extrabold rounded-xl shadow-md transition-all flex items-center justify-center space-x-1.5 shrink-0"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Via Cable Parameters</span>
                </button>

                <button
                  onClick={() => setShowContainerOptimizerModal(true)}
                  className="px-3.5 py-2 bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-indigo-900 text-white font-extrabold rounded-xl shadow-md transition-all flex items-center justify-center space-x-1.5 shrink-0"
                >
                  <Truck className="h-4 w-4 text-amber-300" />
                  <span>Container & Drum Optimizer</span>
                </button>
              </div>
            </div>

            {/* --- SUB-TABLE TABS & LINES SECTION --- */}
            <div className="space-y-3 pt-1">
              <div className="border-b border-slate-200 dark:border-slate-800 flex items-center space-x-1 text-xs font-bold">
                <button
                  onClick={() => setSubTab('details')}
                  className={`px-4 py-2 border-b-2 transition-all ${
                    subTab === 'details'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-slate-800/50'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Line Item Details ({activeReq.items.length})
                </button>

                <button
                  onClick={() => setSubTab('log')}
                  className={`px-4 py-2 border-b-2 transition-all ${
                    subTab === 'log'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-slate-800/50'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Quotation Status Log
                </button>

                <button
                  onClick={() => setSubTab('comments')}
                  className={`px-4 py-2 border-b-2 transition-all ${
                    subTab === 'comments'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-slate-800/50'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Comments ({activeReq.comments.length})
                </button>

                <button
                  onClick={() => setSubTab('versions')}
                  className={`px-4 py-2 border-b-2 transition-all ${
                    subTab === 'versions'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-slate-800/50'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Version History ({allVersions.length})
                </button>
              </div>

              {/* Sub Tab 1: Line Item Details Table */}
              {subTab === 'details' && (
                <div className="space-y-2">
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                          <th className="p-2.5 w-8 text-center">
                            <input type="checkbox" />
                          </th>
                          <th className="p-2.5 w-12 text-center">Serial</th>
                          <th className="p-2.5 min-w-[130px]">Item Code</th>
                          <th className="p-2.5 min-w-[180px]">Cable Code (Energya)</th>
                          <th className="p-2.5 min-w-[150px]">Customer Code</th>
                          <th className="p-2.5 min-w-[240px]">Cable Item Description</th>
                          <th className="p-2.5 w-20">UOM</th>
                          <th className="p-2.5 w-24">Qty</th>
                          <th className="p-2.5 min-w-[120px]">Drum Details</th>
                          <th className="p-2.5 min-w-[110px]">BOM Specs</th>
                          <th className="p-2.5 text-center w-14">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {activeReq.items.map((item) => (
                          <tr key={item.serial} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="p-2.5 text-center">
                              <input type="checkbox" />
                            </td>

                            <td className="p-2.5 text-center font-bold text-slate-600 dark:text-slate-300">
                              {item.serial}
                            </td>

                            {/* Item Code */}
                            <td className="p-2.5 font-mono">
                              <input
                                type="text"
                                value={item.itemCode || ''}
                                onChange={(e) => handleUpdateItem(item.serial, 'itemCode', e.target.value)}
                                placeholder="Item Code"
                                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1 text-xs font-bold text-slate-900 dark:text-white outline-none"
                              />
                            </td>

                            {/* Cable Code (Energya) */}
                            <td className="p-2.5 font-mono">
                              <input
                                type="text"
                                value={item.cableCode || item.itemCode || ''}
                                onChange={(e) => handleUpdateItem(item.serial, 'cableCode', e.target.value)}
                                placeholder="Energya Cable Code"
                                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1 text-xs font-bold text-blue-700 dark:text-blue-400 outline-none"
                              />
                            </td>

                            {/* Customer Code */}
                            <td className="p-2.5 font-mono">
                              <input
                                type="text"
                                value={item.customerCode || ''}
                                onChange={(e) => handleUpdateItem(item.serial, 'customerCode', e.target.value)}
                                placeholder="Customer Code"
                                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1 text-xs font-bold text-amber-700 dark:text-amber-400 outline-none"
                              />
                            </td>

                            <td className="p-2.5">
                              <input
                                type="text"
                                value={item.itemDescription}
                                onChange={(e) =>
                                  handleUpdateItem(item.serial, 'itemDescription', e.target.value)
                                }
                                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1 text-xs font-semibold outline-none"
                              />
                            </td>

                            <td className="p-2.5">
                              <select
                                value={item.uom}
                                onChange={(e) => handleUpdateItem(item.serial, 'uom', e.target.value)}
                                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1 text-xs font-semibold outline-none"
                              >
                                <option value="KM">KM</option>
                                <option value="M">M</option>
                                <option value="Reel">Reel</option>
                                <option value="PCS">PCS</option>
                              </select>
                            </td>

                            <td className="p-2.5">
                              <input
                                type="number"
                                step="0.001"
                                value={item.qty}
                                onChange={(e) =>
                                  handleUpdateItem(item.serial, 'qty', Number(e.target.value))
                                }
                                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1 text-xs font-bold outline-none"
                              />
                            </td>

                            {/* Drum Details Button */}
                            <td className="p-2.5">
                              <button
                                onClick={() => setActiveDrumItem(item)}
                                className="px-2.5 py-1 bg-accent-500 hover:bg-accent-600 text-slate-950 rounded text-xs font-bold flex items-center space-x-1 shadow-sm transition-all"
                              >
                                <Box className="h-3.5 w-3.5" />
                                <span>
                                  {item.drumDetails?.noOfDrums
                                    ? `${item.drumDetails.noOfDrums} Drum(s)`
                                    : 'Drum Schedule'}
                                </span>
                              </button>
                              {item.drumDetails?.drumsList && item.drumDetails.drumsList.length > 0 && (
                                <div className="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-bold mt-0.5">
                                  {item.drumDetails.drumsList.length} reel schedule(s)
                                </div>
                              )}
                            </td>

                            {/* BOM Specs & 2D Cross Section Button */}
                            <td className="p-2.5">
                              <div className="flex items-center space-x-1">
                                <button
                                  onClick={() => setActiveBomItem(item)}
                                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold"
                                >
                                  BOM
                                </button>
                                <button
                                  onClick={() => {
                                    const schedule = item.drumDetails?.scheduleRows || [];
                                    const hasValidDrumPlan =
                                      Boolean(item.drumDetails?.drumType) &&
                                      (schedule.length === 0 ||
                                        schedule.every(
                                          (r) =>
                                            String(r.drumCode || '').trim() &&
                                            Number(r.noOfDrums) > 0 &&
                                            Number(r.cuttingLengthM) > 0
                                        ));
                                    if (!hasValidDrumPlan) return;
                                    setActiveCrossSectionItem(item);
                                    setShowCrossSectionModal(true);
                                  }}
                                  disabled={(() => {
                                    const schedule = item.drumDetails?.scheduleRows || [];
                                    const hasValidDrumPlan =
                                      Boolean(item.drumDetails?.drumType) &&
                                      (schedule.length === 0 ||
                                        schedule.every(
                                          (r) =>
                                            String(r.drumCode || '').trim() &&
                                            Number(r.noOfDrums) > 0 &&
                                            Number(r.cuttingLengthM) > 0
                                        ));
                                    return !hasValidDrumPlan;
                                  })()}
                                  className="px-2 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded text-[11px] font-bold flex items-center space-x-1 shadow-sm shrink-0 disabled:opacity-40 disabled:pointer-events-none"
                                  title={
                                    item.drumDetails?.drumType
                                      ? 'Step 7: Preview Cable Construction & 2D Cross Section'
                                      : 'Complete STEP 6 Drum Plan before Construction Preview'
                                  }
                                >
                                  <Eye className="h-3 w-3" />
                                  <span>2D Cross Section</span>
                                </button>
                              </div>
                            </td>

                            <td className="p-2.5 text-center">
                              <button
                                onClick={() => handleDeleteItem(item.serial)}
                                className="p-1 text-slate-400 hover:text-red-600 rounded"
                                title="Delete Line Item"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sub Tab 2: Quotation Status Log */}
              {subTab === 'log' && (
                <div className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs bg-slate-50 dark:bg-slate-950">
                  <h4 className="font-bold text-slate-800 dark:text-white mb-2">
                    Audit Trail & Quotation Status Transition Log
                  </h4>
                  {activeReq.statusLogs.length > 0 ? (
                    <div className="space-y-2">
                      {activeReq.statusLogs.map((log) => (
                        <div
                          key={log.id}
                          className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div>
                            <span className="font-bold text-blue-600 dark:text-blue-400">
                              {log.previousStatus} → {log.newStatus}
                            </span>
                            <p className="text-slate-600 dark:text-slate-400 text-[11px] mt-0.5">
                              {log.notes}
                            </p>
                          </div>
                          <div className="text-right text-[11px] text-slate-400">
                            <span>{log.changedBy}</span> • <span>{log.date}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">No status transitions logged yet.</p>
                  )}
                </div>
              )}

              {/* Sub Tab 4: Version History */}
              {subTab === 'versions' && (
                <div className="space-y-3 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs bg-slate-50 dark:bg-slate-950">
                  <h4 className="font-bold text-slate-800 dark:text-white">
                    Inquiry Version History (Ref. {activeReq.refNo})
                  </h4>
                  <p className="text-slate-500 dark:text-slate-400">
                    Each submitted version is preserved when you click Update from the home register.
                  </p>
                  <div className="space-y-2">
                    {allVersions.map((version) => {
                      const isCurrent = version.versionNo === (activeReq.versionNo || 1);
                      const isExpanded = expandedVersionNo === version.versionNo;
                      return (
                        <div
                          key={`ver-${version.versionNo}`}
                          className={`rounded-xl border ${
                            isCurrent
                              ? 'border-blue-400 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/20'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedVersionNo(isExpanded ? null : version.versionNo)
                            }
                            className="w-full p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left"
                          >
                            <div>
                              <span className="font-black text-slate-900 dark:text-white">
                                Version V{version.versionNo}
                                {isCurrent && (
                                  <span className="ml-2 text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-400">
                                    Current
                                  </span>
                                )}
                              </span>
                              <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                                {version.status} · {version.quotationStatus} · {version.items.length} line(s)
                              </p>
                            </div>
                            <div className="text-[11px] text-slate-400 sm:text-right">
                              <div>{version.modifiedBy}</div>
                              <div>{version.modifiedDate}</div>
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="px-3 pb-3 border-t border-slate-200 dark:border-slate-800">
                              <p className="pt-2 font-semibold text-slate-700 dark:text-slate-300">
                                Project: {version.projectName}
                              </p>
                              <p className="text-slate-500">Delivery: {version.deliveryDate}</p>
                              {version.remarks && (
                                <p className="text-slate-500 mt-1">Remarks: {version.remarks}</p>
                              )}
                              <div className="mt-2 overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                                <table className="w-full text-left">
                                  <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-800 text-[10px] uppercase">
                                      <th className="p-2">#</th>
                                      <th className="p-2">Item</th>
                                      <th className="p-2">Description</th>
                                      <th className="p-2 text-right">Qty</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {version.items.map((item) => (
                                      <tr key={item.serial} className="border-t border-slate-100 dark:border-slate-800">
                                        <td className="p-2">{item.serial}</td>
                                        <td className="p-2 font-mono">{item.itemCode}</td>
                                        <td className="p-2">{item.itemDescription}</td>
                                        <td className="p-2 text-right">
                                          {item.qty} {item.uom}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sub Tab 3: Comments */}
              {subTab === 'comments' && (
                <div className="space-y-3 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs bg-slate-50 dark:bg-slate-950">
                  <h4 className="font-bold text-slate-800 dark:text-white">Internal & Technical Comments</h4>

                  <div className="space-y-2">
                    {activeReq.comments.map((com) => (
                      <div
                        key={com.id}
                        className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800"
                      >
                        <div className="flex justify-between items-center text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          <span>{com.author}</span>
                          <span className="text-slate-400 font-normal">{com.date}</span>
                        </div>
                        <p className="text-slate-800 dark:text-slate-200 text-xs">{com.text}</p>
                      </div>
                    ))}
                  </div>

                  {/* Add New Comment */}
                  <div className="pt-2 flex gap-2">
                    <input
                      type="text"
                      placeholder="Type a new comment..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                          const newCom = {
                            id: `com-${Date.now()}`,
                            date: new Date().toLocaleString(),
                            author: currentUser?.fullName || 'Salah Mohamed',
                            text: e.currentTarget.value.trim(),
                          };
                          setRequests((prev) =>
                            prev.map((r) =>
                              r.id === activeReq.id ? { ...r, comments: [...r.comments, newCom] } : r
                            )
                          );
                          e.currentTarget.value = '';
                          triggerToast('Comment added');
                        }
                      }}
                      className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs outline-none"
                    />
                    <button
                      onClick={() => triggerToast('Comment added')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs shadow"
                    >
                      Post Comment
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --- MODAL 1: DRUM DETAILS MODAL --- */}
      <DrumDetailsModal
        isOpen={!!activeDrumItem}
        onClose={() => setActiveDrumItem(null)}
        item={activeDrumItem}
        onSaveDrumDetails={handleSaveDrumDetails}
      />

      {/* --- MODAL 2: CABLE CONFIGURATOR MODAL --- */}
      <CableConfiguratorModal
        isOpen={showConfiguratorModal}
        onClose={() => setShowConfiguratorModal(false)}
        onAddConfiguredCable={handleAddConfiguredItem}
      />

      {/* --- MODAL 3: ATTACH FILE DIALOG --- */}
      {showAttachModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Paperclip className="h-5 w-5 text-purple-600" />
                <span>Attach Files to Ref. {activeReq.refNo}</span>
              </h3>
              <button onClick={() => setShowAttachModal(false)} className="p-1 text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center space-y-2 bg-slate-50 dark:bg-slate-800/50">
                <Upload className="h-8 w-8 text-blue-500 mx-auto" />
                <p className="font-bold text-slate-700 dark:text-slate-300">
                  Drag & drop files here or click to browse
                </p>
                <p className="text-slate-400 text-[11px]">Supports PDF, XLSX, DOCX, DWG, PNG (Max 25MB)</p>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="erp-file-upload"
                />
                <label
                  htmlFor="erp-file-upload"
                  className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold cursor-pointer"
                >
                  Select File
                </label>
              </div>

              {activeReq.attachments.length > 0 && (
                <div className="space-y-1">
                  <span className="font-bold text-slate-600 dark:text-slate-400 block">Existing Attachments:</span>
                  {activeReq.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="p-2 bg-slate-100 dark:bg-slate-800 rounded font-mono text-[11px] flex justify-between"
                    >
                      <span className="truncate">{att.fileName}</span>
                      <span className="text-slate-400">{att.fileSizeKb} KB</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowAttachModal(false)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 4: SEND EMAIL & NOTIFICATION DIALOG --- */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSendEmailNotification}
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center space-x-2 text-sm">
                <Mail className="h-5 w-5 text-blue-600" />
                <span>Send Quotation Email & System Notification</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="p-1 text-slate-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Recipient Email
                </label>
                <input
                  type="email"
                  required
                  value={emailRecipient}
                  onChange={(e) => setEmailRecipient(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-bold outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Email Subject
                </label>
                <input
                  type="text"
                  required
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-bold outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Email Message Body
                </label>
                <textarea
                  rows={4}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs outline-none"
                />
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950/50 rounded-xl space-y-1 text-blue-900 dark:text-blue-200">
                <span className="font-bold block">Included Attachments:</span>
                <p className="text-[11px] font-mono">
                  • Official_Sales_Quotation_{activeReq.refNo.replace('/', '_')}.pdf
                </p>
                {activeReq.attachments.map((att) => (
                  <p key={att.id} className="text-[11px] font-mono">
                    • {att.fileName}
                  </p>
                ))}
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center space-x-1 shadow"
              >
                <Send className="h-4 w-4" />
                <span>Send Email & Notify</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --- MODAL 5: BOM DETAILS BREAKDOWN MODAL --- */}
      {activeBomItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center space-x-2 text-sm">
                <Box className="h-5 w-5 text-sky-500" />
                <span>Bill of Materials (BOM) Specs - Line #{activeBomItem.serial}</span>
              </h3>
              <button onClick={() => setActiveBomItem(null)} className="p-1 text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl space-y-1 font-mono">
              <p className="font-bold text-blue-700 dark:text-blue-400">{activeBomItem.itemCode}</p>
              <p className="text-slate-800 dark:text-slate-200">{activeBomItem.itemDescription}</p>
              <p className="text-slate-500 text-[11px]">Quantity: {activeBomItem.qty} {activeBomItem.uom}</p>
            </div>

            {activeBomItem.bomDetails ? (
              <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Conductor Metal Weight:</span>
                  <span className="font-bold">{activeBomItem.bomDetails.copperKgKm} kg/km</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Insulation Compound:</span>
                  <span className="font-bold">{activeBomItem.bomDetails.insulationType}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Insulation Thickness:</span>
                  <span className="font-bold">{activeBomItem.bomDetails.insulationThicknessMm} mm</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Armour Layer:</span>
                  <span className="font-bold">{activeBomItem.bomDetails.armourType}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Outer Sheath:</span>
                  <span className="font-bold">{activeBomItem.bomDetails.sheathType}</span>
                </div>
                <div className="flex justify-between py-1 font-extrabold text-blue-600 dark:text-blue-400">
                  <span>Gross Cable Weight:</span>
                  <span>{activeBomItem.bomDetails.grossWeightKgKm} kg/km</span>
                </div>
              </div>
            ) : (
              <p className="text-slate-400 italic">Standard BOM parameters available upon technical release.</p>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setActiveBomItem(null)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs"
              >
                Close BOM View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 6: CABLE MASTER MULTI-CODE SEARCH & SELECT MODAL --- */}
      <CableSearchSelectModal
        isOpen={showSearchSelectModal}
        onClose={() => setShowSearchSelectModal(false)}
        onSelectItem={(item) => handleAddConfiguredItem(item)}
        onOpenConfigurator={() => setShowConfiguratorModal(true)}
      />

      {/* --- MODAL 7: CONTAINER CALCULATION & DRUM OPTIMIZER MODAL --- */}
      <ContainerAndDrumOptimizerModal
        isOpen={showContainerOptimizerModal}
        onClose={() => setShowContainerOptimizerModal(false)}
        items={activeReq?.items}
        onApplyToInquiry={(summaryStr) => {
          handleUpdateHeader('remarks', `${activeReq.remarks ? activeReq.remarks + '\n' : ''}${summaryStr}`);
          triggerToast('Container & Drum Packing Plan applied to Inquiry Remarks!');
        }}
      />

      {/* --- MODAL 8: STEP 7 2D CABLE CROSS SECTION PREVIEW MODAL --- */}
      {showCrossSectionModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 text-white shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
                  <Eye className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                    STEP 7: VISUAL INSPECTION
                  </span>
                  <h3 className="text-base font-black uppercase text-white leading-tight">
                    Cable Construction & 2D Cross Section
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setShowCrossSectionModal(false)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-full"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* LEFT: 2D CANVAS */}
              <div className="flex flex-col items-center justify-center">
                <CableCrossSectionViewer
                  defaultMode="2D"
                  cores={activeCrossSectionItem?.itemDescription?.includes('4X') ? 4 : activeCrossSectionItem?.itemDescription?.includes('3X') ? 3 : 1}
                  conductorMaterial={activeCrossSectionItem?.itemDescription?.toLowerCase().includes('al') ? 'Aluminum' : 'Copper'}
                  crossSectionMm2={
                    parseFloat(activeCrossSectionItem?.itemDescription?.match(/(\d+)\s*MM/i)?.[1] || '16') ||
                    parseFloat(activeCrossSectionItem?.itemDescription?.match(/X(\d+)/i)?.[1] || '16')
                  }
                  voltageRating="0.6/1 kV"
                  insulation="XLPE (XL08)"
                  armour={activeCrossSectionItem?.bomDetails?.armourType || 'Unarmoured'}
                  outerSheath={activeCrossSectionItem?.bomDetails?.sheathType || 'LSHF (LH02)'}
                  cableCode={activeCrossSectionItem?.cableCode}
                  itemDescription={activeCrossSectionItem?.itemDescription}
                  className="w-full"
                />
              </div>

              {/* RIGHT: SPECS BREAKDOWN */}
              <div className="space-y-3 text-xs flex flex-col justify-between">
                <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-1 font-mono">
                  <span className="text-[10px] font-bold text-amber-400 block uppercase">Selected Spec</span>
                  <p className="font-bold text-white text-sm">
                    {activeCrossSectionItem?.itemDescription || '600/1000V XLPE SWA LSOH Cable'}
                  </p>
                  <div className="flex items-center space-x-2 text-slate-400 text-[11px] mt-1">
                    <span>Cable Mat No: <strong className="text-blue-400 font-mono">{activeCrossSectionItem?.cableCode || '10009487'}</strong></span>
                    <span>•</span>
                    <span>Item Code: <strong className="text-emerald-400 font-mono">{activeCrossSectionItem?.itemCode || 'ICO117X101C0002'}</strong></span>
                  </div>
                </div>

                <div className="space-y-1.5 text-[11px] bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Voltage Rating:</span>
                    <span className="font-bold text-white">0.6/1 kV (600/1000V)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Conductor Material:</span>
                    <span className="font-bold text-amber-400">
                      {activeCrossSectionItem?.itemDescription?.toLowerCase().includes('al') ? 'Electrical Aluminum (AL01)' : 'Plain Annealed Copper (CR01)'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Standard Compliance:</span>
                    <span className="font-bold text-emerald-400">IEC 60502-1 / BASEC Certified</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Insulation:</span>
                    <span className="font-bold text-white">XLPE 90°C Compound (XL08)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800">
                    <span className="text-slate-400">Outer Sheath:</span>
                    <span className="font-bold text-white">LSHF Flame Retardant (LH02)</span>
                  </div>
                  <div className="flex justify-between py-1 font-bold text-teal-400">
                    <span>Approx Unit Weight:</span>
                    <span>
                      {activeCrossSectionItem?.bomDetails?.grossWeightKgKm
                        ? `${activeCrossSectionItem.bomDetails.grossWeightKgKm} kg/km`
                        : '268.0 kg/km'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowCrossSectionModal(false)}
                className="px-5 py-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-slate-950 font-black rounded-xl text-xs hover:brightness-110"
              >
                Close 2D Cross Section
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 9: STEP 9 HELP & ASSISTANCE MODAL --- */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-md w-full p-6 text-white shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Headphones className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                    STEP 9: 24/7 SUPPORT
                  </span>
                  <h3 className="text-base font-black uppercase text-white leading-tight">
                    Help & Assistance Desk
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-full"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
                <span className="font-bold text-amber-400 block text-sm">
                  Energya Dedicated VIP Support Team
                </span>
                <p className="text-slate-300">
                  Our senior electrical engineers and commercial account managers are available to assist ELAND Cables at every stage of the Customer Journey.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setShowHelpModal(false);
                    triggerToast('Connecting to Live Technical Support Agent...');
                  }}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-left space-y-1 transition-all"
                >
                  <MessageSquare className="h-4 w-4 text-emerald-400" />
                  <span className="font-bold text-white block">Live Chat</span>
                  <span className="text-[10px] text-slate-400 block">Instant response from sales engineers</span>
                </button>

                <button
                  onClick={() => {
                    setShowHelpModal(false);
                    triggerToast('Opening Energya Technical Standards Library...');
                  }}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-left space-y-1 transition-all"
                >
                  <BookOpen className="h-4 w-4 text-blue-400" />
                  <span className="font-bold text-white block">Knowledge Base</span>
                  <span className="text-[10px] text-slate-400 block">BASEC & BS specifications</span>
                </button>

                <button
                  onClick={() => {
                    setShowHelpModal(false);
                    triggerToast('Downloading Energya Portal User Guide PDF...');
                  }}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-left space-y-1 transition-all"
                >
                  <FileText className="h-4 w-4 text-purple-400" />
                  <span className="font-bold text-white block">User Guide</span>
                  <span className="text-[10px] text-slate-400 block">Step-by-step PDF manual</span>
                </button>

                <button
                  onClick={() => {
                    setShowHelpModal(false);
                    triggerToast('Launching Video Tutorial Walkthrough...');
                  }}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-left space-y-1 transition-all"
                >
                  <Video className="h-4 w-4 text-rose-400" />
                  <span className="font-bold text-white block">Video Tutorials</span>
                  <span className="text-[10px] text-slate-400 block">Interactive video walkthroughs</span>
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold"
              >
                Close Support
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
