/**
 * Transactional email through Resend.
 *
 * Kept behind this one module so swapping provider — Postmark, SES, the
 * school's own SMTP relay — is a change here and nowhere else.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail(message: EmailMessage): Promise<{ id: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('NOTIFICATION_FROM_EMAIL');

  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY and NOTIFICATION_FROM_EMAIL must both be set');
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text ?? stripTags(message.html),
      reply_to: message.replyTo,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Email provider rejected the message (${response.status}): ${detail}`);
  }

  return (await response.json()) as { id: string };
}

function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** House template. Matches the Supabase auth templates in supabase/templates/. */
export function renderEmail(options: {
  heading: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
  footer?: string;
}): string {
  const action =
    options.actionLabel && options.actionUrl
      ? `<a href="${escapeHtml(options.actionUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:14.5px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">${escapeHtml(options.actionLabel)}</a>`
      : '';

  return `<div style="font-family:'Plus Jakarta Sans',Segoe UI,system-ui,sans-serif;background:#f6f7f9;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e7ee;border-radius:16px;padding:32px">
    <div style="font-size:18px;font-weight:800;letter-spacing:-0.2px;color:#101828">GNASchools</div>
    <div style="font-size:11px;font-weight:600;letter-spacing:0.4px;color:#8a93a6;margin-top:2px">LEARNING MANAGEMENT SYSTEM</div>
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#101828;margin:26px 0 10px">${escapeHtml(options.heading)}</h1>
    <div style="font-size:14.5px;line-height:1.6;color:#576177;margin:0 0 24px">${options.body}</div>
    ${action}
    <hr style="border:0;border-top:1px solid #e4e7ee;margin:26px 0" />
    <p style="font-size:12px;line-height:1.6;color:#8a93a6;margin:0">${escapeHtml(options.footer ?? 'You are receiving this because of your GNASchools LMS notification preferences.')}</p>
  </div>
</div>`;
}

/**
 * Exported because `renderEmail`'s `body` is passed through unescaped — it is
 * markup by design. Anything interpolated *into* that markup is not, and has to
 * come through here first.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
