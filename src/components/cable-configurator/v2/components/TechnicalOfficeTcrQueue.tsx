import React, { useState, useEffect } from 'react';
import {
  TechnicalCableRequest,
  TechnicalRequestStatus,
  AuditTrailEntry,
} from '../types';
import {
  getTechnicalCableRequests,
  updateTechnicalRequestStatus,
  approveAndPublishNewCableToMaster,
} from '../services/technicalOfficeServiceV2';
import { useAuth } from '../../../../context/AuthContext';
import {
  FileText,
  Clock,
  User,
  Building2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  Cpu,
  Layers,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  Search,
  Filter,
  History,
  Tag,
} from 'lucide-react';

export const TechnicalOfficeTcrQueue: React.FC = () => {
  const { jwtToken } = useAuth();
  const [requests, setRequests] = useState<TechnicalCableRequest[]>(getTechnicalCableRequests());
  const [selectedRequest, setSelectedRequest] = useState<TechnicalCableRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Workflow action modals / inputs
  const [showStatusModal, setShowStatusModal] = useState<boolean>(false);
  const [targetStatus, setTargetStatus] = useState<TechnicalRequestStatus>('Under Technical Review');
  const [assignedEngineer, setAssignedEngineer] = useState<string>('Eng. Ahmed Al-Ghamdi');
  const [statusComment, setStatusComment] = useState<string>('');

  // Approval modal state
  const [showApproveModal, setShowApproveModal] = useState<boolean>(false);
  const [newMaterialNumber, setNewMaterialNumber] = useState<string>('10010999');
  const [newItemCode, setNewItemCode] = useState<string>('ICO-2026-N2X');
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    const handleUpdate = () => {
      const all = getTechnicalCableRequests();
      setRequests(all);
      if (selectedRequest) {
        const found = all.find((r) => r.id === selectedRequest.id);
        if (found) setSelectedRequest(found);
      }
    };
    window.addEventListener('tcrRequestsUpdated', handleUpdate);
    return () => window.removeEventListener('tcrRequestsUpdated', handleUpdate);
  }, [selectedRequest]);

  useEffect(() => {
    if (requests.length > 0 && !selectedRequest) {
      setSelectedRequest(requests[0]);
    }
  }, [requests, selectedRequest]);

  const filteredRequests = requests.filter((r) => {
    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
    const matchesSearch =
      !searchTerm ||
      r.requestNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.temporaryTechnicalId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.requesterName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.generatedDescription.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleUpdateStatus = () => {
    if (!selectedRequest) return;
    updateTechnicalRequestStatus(
      selectedRequest.id,
      targetStatus,
      'Lead Technical Engineer',
      statusComment,
      { assignedEngineer: targetStatus === 'Under Technical Review' ? assignedEngineer : selectedRequest.assignedEngineer }
    );
    setShowStatusModal(false);
    setStatusComment('');
  };

  const handleApproveAndPublish = async () => {
    if (!selectedRequest) return;
    if (!jwtToken) {
      setPublishError('Sign in is required to publish Cable Master to PostgreSQL.');
      return;
    }
    setPublishError(null);
    const result = await approveAndPublishNewCableToMaster(
      selectedRequest,
      newMaterialNumber,
      newItemCode,
      'Eng. Ahmed Al-Ghamdi (Lead Technical Office)',
      jwtToken
    );
    if (result.ok === false) {
      setPublishError(result.error);
      return;
    }
    setShowApproveModal(false);
  };

  const getStatusBadgeClass = (status: TechnicalRequestStatus) => {
    switch (status) {
      case 'Submitted':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      case 'Under Technical Review':
      case 'Technical Design':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-800';
      case 'Approved':
      case 'Released':
      case 'Cable Created':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
      case 'Need More Information':
      case 'Returned':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-800';
      case 'Rejected':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800';
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center space-x-2 flex-1 max-w-md">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by TCR #, Temp ID, Company, or Cable Description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-slate-400" />
          {['ALL', 'Submitted', 'Under Technical Review', 'Technical Design', 'Released', 'Need More Information'].map(
            (st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-bold rounded-xl border transition-all ${
                  statusFilter === st
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                {st === 'ALL' ? `All Requests (${requests.length})` : st}
              </button>
            )
          )}
        </div>
      </div>

      {/* Main Grid: Left Request List, Right Request Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Request List */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black text-slate-500 uppercase tracking-wider">
              Incoming TCR Queue ({filteredRequests.length})
            </span>
          </div>

          <div className="space-y-2.5 max-h-[700px] overflow-y-auto pr-1">
            {filteredRequests.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <FileText className="h-8 w-8 text-slate-400 mx-auto mb-2 opacity-50" />
                <p className="text-xs font-bold text-slate-500">No requests found matching criteria</p>
              </div>
            ) : (
              filteredRequests.map((req) => {
                const isSelected = selectedRequest?.id === req.id;
                return (
                  <div
                    key={req.id}
                    onClick={() => setSelectedRequest(req)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-500 dark:border-blue-600 shadow-md ring-1 ring-blue-500'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-black text-blue-600 dark:text-blue-400 font-mono">
                        {req.requestNumber}
                      </span>
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${getStatusBadgeClass(
                          req.status
                        )}`}
                      >
                        {req.status}
                      </span>
                    </div>

                    <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1 font-mono">
                      {req.generatedDescription}
                    </p>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="truncate max-w-[160px] font-medium">{req.companyName}</span>
                      <span className="font-mono text-[10px]">{req.requestDate}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Request Detail & Engineering Actions */}
        <div className="lg:col-span-7">
          {selectedRequest ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl p-6 space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-slate-900 dark:text-white font-mono">
                      {selectedRequest.requestNumber}
                    </span>
                    <span
                      className={`text-xs font-black px-2.5 py-0.5 rounded-full border ${getStatusBadgeClass(
                        selectedRequest.status
                      )}`}
                    >
                      {selectedRequest.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-3">
                    <span>Submitted: {selectedRequest.requestDate}</span>
                    <span>•</span>
                    <span>
                      Temp ID: <strong className="font-mono text-slate-700 dark:text-slate-200">{selectedRequest.temporaryTechnicalId}</strong>
                    </span>
                  </p>
                </div>

                {/* Status Transition Action Buttons */}
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => {
                      setTargetStatus('Under Technical Review');
                      setShowStatusModal(true);
                    }}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300"
                  >
                    Change Status
                  </button>
                  <button
                    onClick={() => setShowApproveModal(true)}
                    className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black shadow-md shadow-emerald-600/20 flex items-center space-x-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Approve & Release Cable</span>
                  </button>
                </div>
              </div>

              {/* Requester Profile Card */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Requester</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200">{selectedRequest.requesterName}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Company / Client</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-200">{selectedRequest.companyName}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Assigned Engineer</span>
                  <span className="font-extrabold text-blue-600 dark:text-blue-400">{selectedRequest.assignedEngineer || 'Unassigned'}</span>
                </div>
              </div>

              {/* Technical Specifications */}
              <div className="space-y-3">
                <span className="text-xs font-black uppercase text-slate-500 tracking-wider">
                  Technical Construction Breakdown
                </span>
                <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <p className="text-xs font-mono font-black text-slate-900 dark:text-white">
                    {selectedRequest.generatedDescription}
                  </p>
                  <div className="flex items-center gap-4 text-xs font-bold text-slate-600 dark:text-slate-400 pt-1">
                    <span>Estimated Diameter: <strong>{selectedRequest.estimatedDiameterMm} mm</strong></span>
                    <span>•</span>
                    <span>Estimated Weight: <strong>{selectedRequest.estimatedWeightKgKm} kg/km</strong></span>
                  </div>
                </div>

                {/* Parameter details pills */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Conductor</span>
                    <span className="font-bold">{selectedRequest.selections.conductorMaterial} {selectedRequest.selections.conductorSize}</span>
                  </div>
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Voltage</span>
                    <span className="font-bold">{selectedRequest.selections.voltage}</span>
                  </div>
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Screen & Armour</span>
                    <span className="font-bold">{selectedRequest.selections.screenType || 'None'} / {selectedRequest.selections.armour || 'None'}</span>
                  </div>
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    <span className="text-[10px] text-slate-400 block">Outer Sheath</span>
                    <span className="font-bold">{selectedRequest.selections.sheathing}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedRequest.technicalNotes && (
                <div className="p-3.5 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl space-y-1">
                  <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300">Requester Project Notes:</span>
                  <p className="text-xs text-amber-900 dark:text-amber-200">{selectedRequest.technicalNotes}</p>
                </div>
              )}

              {/* Audit Trail (Section 11) */}
              <div className="space-y-3 pt-2">
                <span className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                  <History className="h-4 w-4 text-blue-500" />
                  Chronological Audit Trail ({selectedRequest.auditTrail?.length || 0})
                </span>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedRequest.auditTrail?.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-black text-slate-800 dark:text-slate-200">{entry.author}</span>
                        <span className="font-mono text-slate-400">{entry.timestamp}</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300">{entry.action}</p>
                      {entry.comments && (
                        <p className="text-[11px] italic text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-200/80 dark:border-slate-800">
                          "{entry.comments}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500">Select a Technical Cable Request from the queue</p>
            </div>
          )}
        </div>
      </div>

      {/* Change Status Modal */}
      {showStatusModal && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Update Request Status — {selectedRequest.requestNumber}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  New Status
                </label>
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                >
                  <option value="Under Technical Review">Under Technical Review</option>
                  <option value="Technical Design">Technical Design</option>
                  <option value="Need More Information">Need More Information</option>
                  <option value="Pending Approval">Pending Approval</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Returned">Returned</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Assigned Engineer
                </label>
                <input
                  type="text"
                  value={assignedEngineer}
                  onChange={(e) => setAssignedEngineer(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Engineering Comments
                </label>
                <textarea
                  rows={3}
                  value={statusComment}
                  onChange={(e) => setStatusComment(e.target.value)}
                  placeholder="Provide technical feedback or reasons for status transition..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setShowStatusModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 rounded-xl border border-slate-300 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateStatus}
                className="px-5 py-2 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md"
              >
                Apply Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve & Release Modal */}
      {showApproveModal && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 w-full max-w-lg space-y-5 shadow-2xl">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-emerald-500 text-white rounded-2xl">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Approve & Release to Cable Master
                </h3>
                <p className="text-xs text-slate-500">
                  Assign official SAP/ERP Material Number and Item Code to publish permanently.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Cable Description</span>
                <p className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">{selectedRequest.generatedDescription}</p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Official ERP / SAP Material Number *
                </label>
                <input
                  type="text"
                  required
                  value={newMaterialNumber}
                  onChange={(e) => setNewMaterialNumber(e.target.value)}
                  placeholder="e.g. 10010999"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-blue-600 dark:text-blue-400"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Energya Item Code *
                </label>
                <input
                  type="text"
                  required
                  value={newItemCode}
                  onChange={(e) => setNewItemCode(e.target.value)}
                  placeholder="e.g. ICO171X201C0UY8"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            {publishError ? (
              <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{publishError}</p>
            ) : null}

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setShowApproveModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 rounded-xl border border-slate-300 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleApproveAndPublish()}
                className="px-5 py-2 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-600/30"
              >
                Publish to Cable Master
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
