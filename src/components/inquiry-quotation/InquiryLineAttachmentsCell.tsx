import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  Paperclip,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  ATTACHMENT_SOURCE_CABLE_MASTER,
  ATTACHMENT_SOURCE_MANUAL,
  ATTACHMENT_SOURCE_REPORT_TAILOR,
  LINE_ATTACHMENT_KIND_LABELS,
  lineHasRequiredTechnicalOffer,
} from '../../domain/inquiryLineAttachments';
import {
  CommercialInquiryLineDto,
  downloadInquiryLineAttachment,
  InquiryLineAttachmentDto,
  listInquiryLineAttachments,
  uploadInquiryLineAttachment,
  deleteInquiryLineAttachment,
} from '../../services/commercialInquiryApiService';

function sourceLabel(source: string): string {
  if (source === ATTACHMENT_SOURCE_CABLE_MASTER) return 'Cable Master Default';
  if (source === ATTACHMENT_SOURCE_REPORT_TAILOR) return 'Report Tailor';
  if (source === ATTACHMENT_SOURCE_MANUAL) return 'Manual Upload';
  return source;
}

interface InquiryLineAttachmentsCellProps {
  inquiryId: string;
  line: CommercialInquiryLineDto;
  jwtToken?: string | null;
  canEdit: boolean;
  onChanged?: () => void;
}

export const InquiryLineAttachmentsCell: React.FC<InquiryLineAttachmentsCellProps> = ({
  inquiryId,
  line,
  jwtToken,
  canEdit,
  onChanged,
}) => {
  const [open, setOpen] = useState(false);
  const [attachments, setAttachments] = useState<InquiryLineAttachmentDto[]>(line.attachments || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasOffer = lineHasRequiredTechnicalOffer(attachments);
  const isMapped = Boolean(line.materialNumber);

  const refresh = useCallback(async () => {
    if (!jwtToken) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listInquiryLineAttachments(jwtToken, inquiryId, line.id);
      setAttachments(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attachments');
    } finally {
      setLoading(false);
    }
  }, [jwtToken, inquiryId, line.id]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    setAttachments(line.attachments || []);
  }, [line.attachments]);

  const handleUpload = async (file: File) => {
    if (!jwtToken || !canEdit) return;
    setLoading(true);
    setError(null);
    try {
      await uploadInquiryLineAttachment(jwtToken, inquiryId, line.id, file);
      await refresh();
      onChanged?.();
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
      await deleteInquiryLineAttachment(jwtToken, inquiryId, line.id, attachmentId);
      await refresh();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  const renderTrigger = () => {
    if (hasOffer) {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors shadow-2xs"
          title="Technical Offer attached · Click to view"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span>Technical Offer ✓</span>
          {attachments.length > 1 && (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-200/70 text-[10px] text-emerald-900 font-mono">
              {attachments.length}
            </span>
          )}
        </button>
      );
    }

    if (isMapped) {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors shadow-2xs"
          title="Technical Offer required · Click to attach"
        >
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <span>Missing Offer ⚠</span>
        </button>
      );
    }

    if (attachments.length > 0) {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <Paperclip className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          <span>Files ({attachments.length})</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold border border-dashed border-slate-300 text-slate-500 hover:text-slate-800 hover:border-slate-400 hover:bg-slate-50 transition-colors"
      >
        <Paperclip className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span>Attach File</span>
      </button>
    );
  };

  return (
    <>
      {renderTrigger()}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <FileCheck2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Line #{line.lineNumber} Technical Attachments
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate max-w-xs">
                    {line.cableDescription}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <div className="my-3 p-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Technical Offer Status Banner */}
            <div className="my-3">
              {hasOffer ? (
                <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <span className="font-bold">Technical Offer Attached:</span> Ready for quotation submission.
                  </div>
                </div>
              ) : isMapped ? (
                <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <span className="font-bold">Technical Offer Required:</span> Mapped cables require a technical compliance datasheet before submission.
                  </div>
                </div>
              ) : null}
            </div>

            {/* Upload Area */}
            {canEdit && jwtToken && (
              <div className="mb-3 p-3.5 rounded-xl border border-dashed border-blue-200 bg-blue-50/30 text-xs">
                <label className="font-bold text-slate-700 block mb-1.5">
                  Upload Technical Datasheet or Specification
                </label>
                <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer transition-colors shadow-2xs">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Choose File (Max 8 MB)</span>
                  <input
                    type="file"
                    disabled={loading}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void handleUpload(file);
                    }}
                  />
                </label>
                <p className="text-[10px] text-slate-400 mt-1">
                  Supported formats: PDF, DOCX, XLSX, images. Files stored securely in database.
                </p>
              </div>
            )}

            {/* Attachments List */}
            <div className="space-y-2 overflow-y-auto flex-1 pr-1">
              {loading && attachments.length === 0 && (
                <p className="text-xs text-slate-400 py-6 text-center">Loading attachments…</p>
              )}
              {!loading && attachments.length === 0 && (
                <p className="text-xs text-slate-400 py-6 text-center">No attachments uploaded yet for this line.</p>
              )}
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{att.fileName}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      <span className="font-semibold text-blue-700">{LINE_ATTACHMENT_KIND_LABELS[att.kind] || att.kind}</span>
                      {' · '}
                      <span className="text-slate-600">{sourceLabel(att.source)}</span>
                      {' · '}
                      <span className="font-mono text-slate-400">{(att.byteSize / 1024).toFixed(1)} KB</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {jwtToken && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-blue-600 font-bold text-xs hover:bg-blue-50 transition-colors shadow-2xs"
                        onClick={() => void downloadInquiryLineAttachment(jwtToken, inquiryId, line.id, att)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download</span>
                      </button>
                    )}
                    {canEdit && jwtToken && (
                      <button
                        type="button"
                        className="p-1.5 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 transition-colors shadow-2xs"
                        onClick={() => void handleDelete(att.id)}
                        title="Delete Attachment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export function inquiryLinesMissingTechnicalOffer(lines: CommercialInquiryLineDto[]): number[] {
  return lines
    .filter((line) => line.materialNumber && !lineHasRequiredTechnicalOffer(line.attachments))
    .map((line) => line.lineNumber);
}
