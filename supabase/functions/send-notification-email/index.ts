import { error, handlePreflight, json, withCors } from '../_shared/cors.ts';
import { renderEmail, sendEmail } from '../_shared/email.ts';
import { adminClient, currentUser, userClient } from '../_shared/supabase.ts';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  send-notification-email
 * ═══════════════════════════════════════════════════════════════════════════
 *  Why this is an Edge Function and not a trigger:
 *
 *  Postgres can already write the in-app notification — and it does, in
 *  `app.notify_users()`. What it cannot do is make an outbound HTTPS call to
 *  an email provider without `pg_net`, hold the provider's API key somewhere
 *  the database role cannot read it, or retry a 503 without holding a
 *  transaction open. That is the whole justification for this function, and
 *  it is the only reason to reach for one.
 *
 *  Authorisation, in order:
 *    1. The caller must present a valid JWT (`verify_jwt = true`).
 *    2. The *notification* is fetched with the caller's own client, so RLS
 *       decides whether they may see it at all. A student cannot email a
 *       notification belonging to someone else, because the read returns
 *       nothing.
 *    3. Only then does the service-role client come out — solely to look up
 *       the recipient's address and stamp the delivery.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface Payload {
  notificationId: string;
}

Deno.serve(
  withCors(async (request: Request) => {
    const preflight = handlePreflight(request);
    if (preflight) return preflight;

    if (request.method !== 'POST') {
      return error(request, 'Method not allowed', 405);
    }

    const user = await currentUser(request);
    if (!user) {
      return error(request, 'Not authenticated', 401);
    }

    let payload: Payload;
    try {
      payload = (await request.json()) as Payload;
    } catch {
      return error(request, 'Body must be JSON', 400);
    }

    if (!payload.notificationId) {
      return error(request, 'notificationId is required', 422);
    }

    // ── 1. Read as the caller. RLS is the authorisation check. ──────────────
    const asCaller = userClient(request);
    const { data: notification, error: readError } = await asCaller
      .from('notifications')
      .select('id, user_id, school_id, title, body, action_url, delivered, type')
      .eq('id', payload.notificationId)
      .maybeSingle();

    if (readError) {
      return error(request, readError.message, 400);
    }
    if (!notification) {
      // Indistinguishable from "does not exist" on purpose.
      return error(request, 'Notification not found', 404);
    }

    // ── 2. Elevate only for what the caller genuinely cannot do. ────────────
    const admin = adminClient();

    const { data: recipient } = await admin
      .from('users')
      .select('email, full_name, notification_preferences')
      .eq('id', notification.user_id)
      .single();

    if (!recipient?.email) {
      return error(request, 'Recipient has no email address on file', 422);
    }

    const preferences = (recipient.notification_preferences ?? {}) as { email?: boolean };
    if (preferences.email === false) {
      return json(request, { skipped: true, reason: 'Recipient has email notifications off' });
    }

    const delivered = (notification.delivered ?? {}) as Record<string, string>;
    if (delivered.email) {
      // Idempotent: a retried invocation must not send a second copy.
      return json(request, { skipped: true, reason: 'Already delivered', at: delivered.email });
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173';

    try {
      const result = await sendEmail({
        to: recipient.email,
        subject: notification.title,
        html: renderEmail({
          heading: notification.title,
          body: `<p>${notification.body ?? ''}</p>`,
          actionLabel: notification.action_url ? 'Open in GNASchools LMS' : undefined,
          actionUrl: notification.action_url ? `${appUrl}${notification.action_url}` : undefined,
        }),
      });

      await admin
        .from('notifications')
        .update({ delivered: { ...delivered, email: new Date().toISOString() } })
        .eq('id', notification.id);

      return json(request, { sent: true, providerId: result.id });
    } catch (cause) {
      console.error('[send-notification-email]', cause);
      return error(request, cause instanceof Error ? cause.message : 'Send failed', 502);
    }
  }),
);
