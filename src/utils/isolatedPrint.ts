/** Escape text before it is interpolated into a print document. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mountPrintFrame(): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = 'Print document';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  return iframe;
}

function printFrame(iframe: HTMLIFrameElement) {
  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    return;
  }
  const cleanup = () => window.setTimeout(() => iframe.remove(), 400);
  win.addEventListener('afterprint', cleanup, { once: true });
  window.setTimeout(cleanup, 1500);
  win.focus();
  win.print();
}

/** Print a standalone HTML document. Does not call print on the application page. */
export function printIsolatedHtml(html: string) {
  const iframe = mountPrintFrame();
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  printFrame(iframe);
}

/** Print one element in a hidden iframe, with the page styles copied across. */
export function printIsolatedElement(element: HTMLElement, title: string) {
  const iframe = mountPrintFrame();
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#fff"></body></html>`);
  doc.close();
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    doc.head.appendChild(node.cloneNode(true));
  });
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.maxHeight = 'none';
  clone.style.overflow = 'visible';
  doc.body.appendChild(clone);
  printFrame(iframe);
}
