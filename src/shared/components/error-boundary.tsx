import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { env } from '@/shared/lib/env';
import { toAppError } from '@/shared/lib/errors';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors so one broken panel does not blank the app.
 *
 * Must be a class: React has no hook equivalent of `componentDidCatch`.
 *
 * In production the message is generic — a stack trace tells a user nothing
 * and can leak table and column names. In development it is shown in full.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Where an error reporter (Sentry et al.) would be wired in.
    console.error('[error-boundary]', error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    const appError = toAppError(error);

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
          <TriangleAlert className="size-6" aria-hidden />
        </span>

        <div className="space-y-1.5">
          <h1 className="text-lg font-extrabold tracking-tight text-ink">Something went wrong</h1>
          <p className="mx-auto max-w-md text-sm text-ink-2">
            {env.isProduction
              ? 'The page could not be displayed. Try again, and let your administrator know if it keeps happening.'
              : appError.message}
          </p>
        </div>

        {!env.isProduction && error.stack ? (
          <pre className="max-h-52 max-w-2xl overflow-auto rounded-lg bg-surface-2 p-4 text-left text-[11px] leading-relaxed text-ink-3">
            {error.stack}
          </pre>
        ) : null}

        <div className="flex gap-2">
          <Button onClick={this.reset} variant="secondary">
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </Button>
          <Button
            onClick={() => {
              window.location.href = '/';
            }}
          >
            Back to the dashboard
          </Button>
        </div>
      </div>
    );
  }
}
