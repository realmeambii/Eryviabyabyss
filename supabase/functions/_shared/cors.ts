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

const DEFAULT_ALLOWED_HEADERS =
  'authorization, x-client-info, apikey, content-type, x-application-name, x-cron-secret';

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  const permitted = allowedOrigins();
  const allow = permitted.includes(origin) ? origin : (permitted[0] ?? '');

  // Echo the headers the preflight actually asked for instead of answering
  // with a fixed list.
  //
  // The origin allow-list above is the control that matters. The header list
  // is not a security boundary — it cannot grant an origin anything, it only
  // states what a permitted origin may send — but hard-coding it means any
  // header the client picks up later silently blocks every call from the
  // browser. That is exactly what happened: `api-client.ts` sends
  // `x-application-name`, this list did not name it, and so the preflight
  // answered 204 while the browser refused to send the request that followed.
  // The POST never left the machine, which is why the failure showed up as a
  // request with no status and an empty body rather than an error anyone
  // could read.
  const requested = request.headers.get('access-control-request-headers');

  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': requested ?? DEFAULT_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    // The response now depends on the requested-headers field too, so a cache
    // must key on it or it will replay an answer that omits a later header.
    Vary: 'Origin, Access-Control-Request-Headers',
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
