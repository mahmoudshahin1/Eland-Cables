/**
 * Notification service — SMTP when configured, console fallback otherwise.
 * Env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, NOTIFY_SALES_EMAIL
 *
 * nodemailer is optional — install separately for real SMTP delivery.
 */

export interface InquirySubmittedNotification {
  inquiryNumber: string;
  customerName: string;
  lineCount: number;
  submittedBy: string;
}

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

async function sendSmtp(to: string, subject: string, text: string): Promise<boolean> {
  if (!smtpConfigured()) return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodemailer = (await import('nodemailer' as string)) as any;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
    });
    return true;
  } catch (err) {
    console.warn('[notification] SMTP send failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function notifyInquirySubmitted(payload: InquirySubmittedNotification): Promise<void> {
  const subject = `Inquiry submitted: ${payload.inquiryNumber}`;
  const text = [
    `Commercial inquiry ${payload.inquiryNumber} has been submitted.`,
    `Customer: ${payload.customerName}`,
    `Lines: ${payload.lineCount}`,
    `Submitted by: ${payload.submittedBy}`,
    '',
    'Review the locked costing figures in Energya Connect.',
  ].join('\n');

  const recipients = (process.env.NOTIFY_SALES_EMAIL || process.env.SMTP_FROM || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    console.info('[notification] Inquiry submitted (no SMTP recipients configured):', subject);
    console.info(text);
    return;
  }

  for (const to of recipients) {
    const sent = await sendSmtp(to, subject, text);
    if (!sent) {
      console.info('[notification] Queued (SMTP unavailable):', { to, subject });
      console.info(text);
    }
  }
}
