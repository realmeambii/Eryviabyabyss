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

/**
 * Wraps a handler so an unhandled throw still comes back with CORS headers.
 *
 * Without this the Deno runtime answers with its own bare 500, which carries
 * none of the headers above. The browser then refuses to expose the response
 * to the page at all: the caller sees a request with no status code, no body
 * and nothing in the console beyond an opaque CORS complaint, while the actual
 * message — a missing environment variable, a failed lookup — is discarded in
 * transit. Every distinct fault presents identically, which is worse than any
 * one of them.
 *
 * The message is returned rather than hidden behind "internal error". These
 * endpoints already hand back provisioning failures verbatim, and an operator
 * who cannot see why an account would not create has no way forward.
 */
export function withCors(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      return await handler(request);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error(
        '[unhandled]',
        request.method,
        new URL(request.url).pathname,
        message,
        cause instanceof Error ? cause.stack : '',
      );
      return error(request, message, 500);
    }
  };
}
