import React from 'react';
import { Download, Printer } from 'lucide-react';
import { fetchV2QuotationDocument } from '../../services/v2QuotationApiService';
import { commercialOfferDocumentActions } from '../../domain/commercialOfferTemplate';

interface CommercialOfferDocumentsPanelProps {
  inquiryId: string;
  jwtToken: string | null;
  issued: boolean;
  isCustomer: boolean;
  quotationNumber?: string | null;
  versionNo?: number | null;
}

async function openOffer(
  token: string,
  inquiryId: string,
  draft: boolean,
  mode: 'print' | 'download',
  fileName: string
) {
  const blob = await fetchV2QuotationDocument(token, inquiryId, { draft });
  const objectUrl = URL.createObjectURL(blob);
  if (mode === 'download') {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return;
  }
  window.open(objectUrl, '_blank', 'noopener');
}

export const CommercialOfferDocumentsPanel: React.FC<CommercialOfferDocumentsPanelProps> = ({
  inquiryId,
  jwtToken,
  issued,
  isCustomer,
  quotationNumber,
  versionNo,
}) => {
  const actions = commercialOfferDocumentActions({ issued, isCustomer });
  if (!actions.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-800">Commercial Offer</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          The official commercial offer PDF is available after Energya issues the quotation.
        </p>
      </div>
    );
  }

  const prefix = issued ? '' : 'DRAFT-';
  const fileName = `${prefix}${quotationNumber || 'commercial-offer'}-REV${versionNo ?? 0}.pdf`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div>
        <h3 className="font-bold text-slate-800">Commercial Offer</h3>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Energya technical and commercial quotation. Generated from the server-side document engine.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const mode = action.id.startsWith('print') ? 'print' : 'download';
          const Icon = mode === 'print' ? Printer : Download;
          return (
            <button
              key={action.id}
              type="button"
              disabled={!jwtToken}
              onClick={() => jwtToken && void openOffer(jwtToken, inquiryId, action.draft, mode, fileName)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              <Icon className="h-3.5 w-3.5" />
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
