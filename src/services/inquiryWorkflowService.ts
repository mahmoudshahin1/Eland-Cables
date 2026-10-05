import { ErpRequestHeader, ErpStatusLog, InquiryVersionSnapshot, UserAccount } from '../types';

export function isInquirySubmitted(header: ErpRequestHeader): boolean {
  const status = (header.status || '').toLowerCase();
  const quotationStatus = (header.quotationStatus || '').toLowerCase();
  return (
    status === 'submitted' ||
    quotationStatus.includes('sent to technical') ||
    quotationStatus === 'submitted'
  );
}

export function canSubmitInquiry(header: ErpRequestHeader): boolean {
  return !isInquirySubmitted(header) && header.status !== 'Closed';
}

function nowStamp(): string {
  return new Date().toLocaleString();
}

function appendLog(
  header: ErpRequestHeader,
  log: Omit<ErpStatusLog, 'id'>
): ErpStatusLog[] {
  return [{ id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...log }, ...(header.statusLogs || [])];
}

export function buildVersionSnapshot(header: ErpRequestHeader): InquiryVersionSnapshot {
  return {
    versionNo: header.versionNo || 1,
    status: header.status,
    quotationStatus: header.quotationStatus,
    modifiedDate: header.modifiedDate || header.trxDate,
    modifiedBy: header.modifiedBy || header.quotationOwner,
    items: JSON.parse(JSON.stringify(header.items || [])),
    remarks: header.remarks,
    projectName: header.projectName,
    deliveryDate: header.deliveryDate,
    salesComments: header.salesComments,
    technicalComments: header.technicalComments,
    submittedAt: isInquirySubmitted(header) ? nowStamp() : undefined,
  };
}

/** Submit inquiry: Open → Submitted. */
export function applyInquirySubmit(header: ErpRequestHeader, user?: UserAccount | null): ErpRequestHeader {
  const actor = user?.fullName || user?.email || 'Customer Portal';
  const previous = header.status;
  return {
    ...header,
    status: 'Submitted',
    quotationStatus: 'Sent To Technical',
    modifiedDate: nowStamp(),
    modifiedBy: actor,
    statusLogs: appendLog(header, {
      date: nowStamp(),
      previousStatus: previous,
      newStatus: 'Submitted',
      changedBy: actor,
      notes: `Version V${header.versionNo || 1} submitted for technical review.`,
    }),
  };
}

/** After submit, Update creates a new open revision and archives the submitted one. */
export function applyInquiryRevision(header: ErpRequestHeader, user?: UserAccount | null): ErpRequestHeader {
  const actor = user?.fullName || user?.email || 'Customer Portal';
  const snapshot = buildVersionSnapshot(header);
  const nextVersion = (header.versionNo || 1) + 1;

  return {
    ...header,
    versionNo: nextVersion,
    status: 'Opened',
    quotationStatus: 'Draft',
    modifiedDate: nowStamp(),
    modifiedBy: actor,
    versionHistory: [snapshot, ...(header.versionHistory || [])],
    statusLogs: appendLog(header, {
      date: nowStamp(),
      previousStatus: `V${snapshot.versionNo} Submitted`,
      newStatus: `V${nextVersion} Open`,
      changedBy: actor,
      notes: `Opened revision V${nextVersion}. Prior version V${snapshot.versionNo} preserved in version history.`,
    }),
  };
}

export function listAllVersions(header: ErpRequestHeader): InquiryVersionSnapshot[] {
  const current: InquiryVersionSnapshot = {
    ...buildVersionSnapshot(header),
    versionNo: header.versionNo || 1,
    status: header.status,
    quotationStatus: header.quotationStatus,
  };
  const history = header.versionHistory || [];
  return [...history, current].sort((a, b) => a.versionNo - b.versionNo);
}

export function updateRequestById(
  requests: ErpRequestHeader[],
  id: string,
  updater: (header: ErpRequestHeader) => ErpRequestHeader
): ErpRequestHeader[] {
  return requests.map((row) => (row.id === id ? updater(row) : row));
}
