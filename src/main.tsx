import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/globals.css';

/**
 * Entry point.
 *
 * `App` is imported dynamically so that a *configuration* failure has somewhere
 * to be reported. `shared/lib/env.ts` validates the environment at module load
 * and throws — which happens before React mounts, so an uncaught throw here
 * renders an empty <div id="root">: a blank page, styled dark or light by the
 * theme bootstrap in index.html, with the real error buried in the console.
 *
 * Catching it lets a missing .env.local say so on screen instead.
 */

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element #root is missing from index.html');
}

const root = createRoot(container);

try {
  const { default: App } = await import('./App');

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} catch (cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  console.error('[startup]', cause);
  root.render(<StartupError message={message} />);
}

/**
 * Deliberately dependency-free — no imports from `shared/`, because the most
 * likely reason we are here is that something in `shared/` failed to load.
 * Inline styles for the same reason.
 */
function StartupError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        background: '#f6f7f9',
        color: '#101828',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 560 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#b42318',
            margin: 0,
          }}
        >
          Startup failed
        </p>

        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.5px',
            margin: '10px 0 12px',
          }}
        >
          The app could not start
        </h1>

        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: '#ffffff',
            border: '1px solid #e4e7ee',
            borderRadius: 12,
            padding: '14px 16px',
            fontSize: 13,
            lineHeight: 1.6,
            margin: '0 0 16px',
          }}
        >
          {message}
        </pre>

        <p style={{ fontSize: 13.5, lineHeight: 1.7, color: '#576177', margin: 0 }}>
          If this mentions the environment, copy <code>.env.example</code> to{' '}
          <code>.env.local</code>, fill in <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>, then restart the dev server — Vite only reads{' '}
          <code>.env</code> files at startup.
        </p>
      </div>
    </div>
  );
}
