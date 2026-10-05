import React, { useCallback, useEffect, useState } from 'react';
import { Download, Paperclip, Trash2, X } from 'lucide-react';
import {
  ATTACHMENT_SOURCE_CABLE_MASTER,
  ATTACHMENT_SOURCE_MANUAL,
  ATTACHMENT_SOURCE_REPORT_TAILOR,
  LINE_ATTACHMENT_KIND_LABELS,
  lineHasRequiredTechnicalOffer,
} from '../../domain/inquiryLineAttachments';
import {
  CableMasterAttachmentDto,
  deleteCableMasterAttachment,
  downloadCableMasterAttachment,
  listCableMasterAttachments,
  uploadCableMasterAttachment,
} from '../../services/cableMasterAttachmentApiService';

function sourceLabel(source: string): string {
  if (source === ATTACHMENT_SOURCE_CABLE_MASTER) return 'Cable master default';
  if (source === ATTACHMENT_SOURCE_REPORT_TAILOR) return 'Report Tailor';
  if (source === ATTACHMENT_SOURCE_MANUAL) return 'Manual upload';
  return source;
}

interface CableMasterAttachmentsPanelProps {
  materialNumber: string;
  jwtToken?: string | null;
  canEdit: boolean;
  onClose: () => void;
}

export const CableMasterAttachmentsPanel: React.FC<CableMasterAttachmentsPanelProps> = ({
  materialNumber,
  jwtToken,
  canEdit,
  onClose,
}) => {
  const [attachments, setAttachments] = useState<CableMasterAttachmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!jwtToken) return;
    setLoading(true);
    setError(null);
    try {
      setAttachments(await listCableMasterAttachments(jwtToken, materialNumber));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attachments');
    } finally {
      setLoading(false);
    }
  }, [jwtToken, materialNumber]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleUpload = async (file: File) => {
    if (!jwtToken || !canEdit) return;
    setLoading(true);
    setError(null);
    try {
      await uploadCableMasterAttachment(jwtToken, materialNumber, file);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (!jwtToken || !canEdit) return;
    setLoading(true);
    setError(null);
    try {
      await deleteCableMasterAttachment(jwtToken, materialNumber, attachmentId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const hasOffer = lineHasRequiredTechnicalOffer(attachments);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Cable {materialNumber} — default attachments
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Defaults copy to inquiry lines when this cable is selected. Technical team only.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

        {canEdit && jwtToken && (
          <div className="mb-3">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
              Upload Technical Offer default
            </label>
            <input
              type="file"
              disabled={loading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void handleUpload(file);
              }}
            />
            <p className="text-[10px] text-slate-400 mt-1">Max 8 MB per file.</p>
          </div>
        )}

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {loading && attachments.length === 0 && <p className="text-xs text-slate-500">Loading…</p>}
          {!loading && attachments.length === 0 && (
            <p className="text-xs text-slate-500">No default attachments configured.</p>
          )}
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 p-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{att.fileName}</p>
                <p className="text-[10px] text-slate-400">
                  {LINE_ATTACHMENT_KIND_LABELS[att.kind] || att.kind} · {sourceLabel(att.source)} · {att.byteSize} bytes
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                {jwtToken && (
                  <button
                    type="button"
                    className="p-1 rounded text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                    onClick={() => void downloadCableMasterAttachment(jwtToken, materialNumber, att)}
                  >
                    <Download className="h-4 w-4" />
                  </button>
                )}
                {canEdit && jwtToken && (
                  <button
                    type="button"
                    className="p-1 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={() => void handleDelete(att.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {!hasOffer && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300 font-semibold">
            Recommended: attach a Technical Offer default for inquiry auto-copy.
          </p>
        )}
      </div>
    </div>
  );
};

interface CableMasterAttachmentsButtonProps {
  materialNumber: string;
  jwtToken?: string | null;
  canEdit: boolean;
}

export const CableMasterAttachmentsButton: React.FC<CableMasterAttachmentsButtonProps> = ({
  materialNumber,
  jwtToken,
  canEdit,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
        title="Cable master attachments"
      >
        <Paperclip className="h-3 w-3" />
        Files
      </button>
      {open && (
        <CableMasterAttachmentsPanel
          materialNumber={materialNumber}
          jwtToken={jwtToken}
          canEdit={canEdit}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};
