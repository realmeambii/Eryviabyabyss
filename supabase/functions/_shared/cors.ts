/**
 * CORS for the Edge Functions.
 *
 * The allow-list is read from `ALLOWED_ORIGINS` rather than hard-coded to `*`:
 * these endpoints act on a caller's JWT, and a wildcard origin on a
 * credentialed endpoint is how a phishing page ends up able to call them.
 */

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];

function allowedOrigins(): string[] {
  const configured = Deno.env.get('ALLOWED_ORIGINS');
  if (!configured) return DEFAULT_ORIGINS;
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  const permitted = allowedOrigins();
  const allow = permitted.includes(origin) ? origin : (permitted[0] ?? '');

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function handlePreflight(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });
}

export function error(request: Request, message: string, status = 400): Response {
  return json(request, { error: message }, status);
}
