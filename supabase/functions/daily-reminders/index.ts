import { error, handlePreflight, json, withCors } from '../_shared/cors.ts';
import { renderEmail, sendEmail } from '../_shared/email.ts';
import { adminClient, isAuthorisedCron } from '../_shared/supabase.ts';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  daily-reminders  ·  scheduled, no signed-in caller
 * ═══════════════════════════════════════════════════════════════════════════
 *  Runs once a morning and does two things:
 *
 *    1. Warns every student with work due in the next 24 hours that they have
 *       not handed in.
 *    2. Expires any quiz attempt left open past its deadline, so an abandoned
 *       paper cannot be resumed a week later.
 *
 *  Why an Edge Function rather than a trigger: neither job has an event to
 *  hang off. "Nothing has happened and the deadline is tomorrow" is not a row
 *  change — it is the *absence* of one, and only a schedule can notice that.
 *
 *  Authorisation: `verify_jwt = false` in config.toml, because a scheduler has
 *  no user. A shared secret in `x-cron-secret` takes its place. This function
 *  uses the service role — it deliberately acts across every school — so that
 *  header is the only thing standing in front of it.
 *
 *  Schedule with pg_cron:
 *
 *      select cron.schedule(
 *        'daily-reminders', '0 6 * * 1-5',
 *        $$ select net.http_post(
 *             url     := 'https://<ref>.supabase.co/functions/v1/daily-reminders',
 *             headers := jsonb_build_object('x-cron-secret', '<FUNCTION_CRON_SECRET>')
 *           ) $$
 *      );
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface DueAssignment {
  id: string;
  school_id: string;
  class_id: string;
  academic_session_id: string;
  title: string;
  due_at: string;
}

/**
 * A row of `enrollments` with its student embedded.
 *
 * `students` is a single object, not an array: `enrollments` holds the foreign
 * key, so `students!inner(user_id)` is a many-to-one embed and PostgREST
 * returns one object per row.
 *
 * The cast onto this shape has to launder through `unknown`. `adminClient()` is
 * deliberately untyped — no `Database` generic — so supabase-js has no
 * relationship metadata to infer cardinality from and falls back to typing every
 * embed as an array. The array is the type system guessing, not the wire.
 */
interface EnrolledStudent {
  student_id: string;
  students: { user_id: string };
}

Deno.serve(
  withCors(async (request: Request) => {
    const preflight = handlePreflight(request);
    if (preflight) return preflight;

    if (!isAuthorisedCron(request)) {
      return error(request, 'Not authorised', 401);
    }

    const admin = adminClient();
    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // ── 1. Expire abandoned attempts ────────────────────────────────────────
    const { count: expired } = await admin
      .from('quiz_attempts')
      .update({ status: 'expired', submitted_at: now.toISOString() }, { count: 'exact' })
      .eq('status', 'in_progress')
      .lt('expires_at', now.toISOString());

    // ── 2. Assignments falling due inside the next 24 hours ─────────────────
    const { data: assignments, error: assignmentError } = await admin
      .from('assignments')
      .select('id, school_id, class_id, academic_session_id, title, due_at')
      .eq('status', 'published')
      .gte('due_at', now.toISOString())
      .lte('due_at', horizon.toISOString());

    if (assignmentError) {
      return error(request, assignmentError.message, 500);
    }

    let remindersCreated = 0;
    let emailsSent = 0;
    const sendEmails = Deno.env.get('RESEND_API_KEY') !== undefined;

    for (const assignment of (assignments ?? []) as DueAssignment[]) {
      // Everyone enrolled in the class…
      const { data: enrolled } = await admin
        .from('enrollments')
        .select('student_id, students!inner(user_id)')
        .eq('class_id', assignment.class_id)
        .eq('academic_session_id', assignment.academic_session_id)
        .eq('status', 'active');

      if (!enrolled || enrolled.length === 0) continue;

      // …minus everyone who has already handed something in.
      const { data: submitted } = await admin
        .from('assignment_submissions')
        .select('student_id')
        .eq('assignment_id', assignment.id)
        .neq('status', 'draft');

      const submittedIds = new Set((submitted ?? []).map((row) => row.student_id as string));

      const outstanding = enrolled.filter(
        (row) => !submittedIds.has(row.student_id as string),
      ) as unknown as EnrolledStudent[];

      if (outstanding.length === 0) continue;

      // Skip anyone already reminded about this assignment — the function must
      // be safe to run twice in a morning.
      const userIds = outstanding.map((row) => row.students.user_id);

      const { data: alreadyWarned } = await admin
        .from('notifications')
        .select('user_id')
        .eq('type', 'assignment_due_soon')
        .eq('entity_id', assignment.id)
        .in('user_id', userIds);

      const warnedIds = new Set((alreadyWarned ?? []).map((row) => row.user_id as string));
      const targets = userIds.filter((id) => !warnedIds.has(id));

      if (targets.length === 0) continue;

      const dueLabel = new Date(assignment.due_at).toLocaleString('en-NG', {
        weekday: 'long',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Africa/Lagos',
      });

      const { error: insertError } = await admin.from('notifications').insert(
        targets.map((userId) => ({
          school_id: assignment.school_id,
          user_id: userId,
          type: 'assignment_due_soon' as const,
          title: `Due ${dueLabel}: ${assignment.title}`,
          body: 'You have not handed this in yet.',
          action_url: `/student/assignments/${assignment.id}`,
          entity_type: 'assignments',
          entity_id: assignment.id,
        })),
      );

      if (insertError) {
        console.error('[daily-reminders] notification insert failed', insertError.message);
        continue;
      }

      remindersCreated += targets.length;

      // ── Email digest, best effort ─────────────────────────────────────────
      if (!sendEmails) continue;

      const { data: recipients } = await admin
        .from('users')
        .select('email, first_name, notification_preferences')
        .in('id', targets);

      for (const recipient of recipients ?? []) {
        const preferences = (recipient.notification_preferences ?? {}) as { email?: boolean };
        if (preferences.email === false || !recipient.email) continue;

        try {
          await sendEmail({
            to: recipient.email as string,
            subject: `Reminder: ${assignment.title} is due ${dueLabel}`,
            html: renderEmail({
              heading: 'An assignment is due soon',
              body: `<p>Hello ${recipient.first_name as string},</p>
                   <p><strong>${assignment.title}</strong> is due <strong>${dueLabel}</strong> and we have not received your submission.</p>`,
              actionLabel: 'Open the assignment',
              actionUrl: `${Deno.env.get('APP_URL') ?? ''}/student/assignments/${assignment.id}`,
            }),
          });
          emailsSent += 1;
        } catch (cause) {
          // One bad address must not abort the whole sweep.
          console.error('[daily-reminders] email failed', cause);
        }
      }
    }

    return json(request, {
      ranAt: now.toISOString(),
      assignmentsChecked: assignments?.length ?? 0,
      remindersCreated,
      emailsSent,
      attemptsExpired: expired ?? 0,
    });
  }),
);
