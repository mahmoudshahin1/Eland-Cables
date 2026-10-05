import {
  InquiryLineAttachmentSummary,
  LINE_ATTACHMENT_KIND_TECHNICAL_OFFER,
} from '../domain/inquiryLineAttachments';

export type CableMasterAttachmentDto = InquiryLineAttachmentSummary;

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function parseJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    const payload = data as { error?: string };
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return data as T;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function listCableMasterAttachments(
  token: string,
  materialNumber: string
): Promise<CableMasterAttachmentDto[]> {
  const res = await fetch(
    `/api/master/cables/${encodeURIComponent(materialNumber)}/attachments`,
    { headers: authHeaders(token) }
  );
  const data = await parseJson<{ attachments: CableMasterAttachmentDto[] }>(res);
  return data.attachments || [];
}

export async function uploadCableMasterAttachment(
  token: string,
  materialNumber: string,
  file: File,
  kind = LINE_ATTACHMENT_KIND_TECHNICAL_OFFER
): Promise<CableMasterAttachmentDto> {
  const contentBase64 = await fileToBase64(file);
  const res = await fetch(
    `/api/master/cables/${encodeURIComponent(materialNumber)}/attachments`,
    {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        kind,
        fileName: file.name,
        mimeType: file.type,
        contentBase64,
      }),
    }
  );
  const data = await parseJson<{ attachment: CableMasterAttachmentDto }>(res);
  return data.attachment;
}

export async function deleteCableMasterAttachment(
  token: string,
  materialNumber: string,
  attachmentId: string
): Promise<void> {
  const res = await fetch(
    `/api/master/cables/${encodeURIComponent(materialNumber)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: 'DELETE', headers: authHeaders(token) }
  );
  await parseJson(res);
}

export async function downloadCableMasterAttachment(
  token: string,
  materialNumber: string,
  attachment: CableMasterAttachmentDto
): Promise<void> {
  const res = await fetch(
    `/api/master/cables/${encodeURIComponent(materialNumber)}/attachments/${encodeURIComponent(attachment.id)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = attachment.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
