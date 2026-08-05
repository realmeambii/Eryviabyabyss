import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { useTheme } from '@/shared/hooks/use-theme';

/**
 * Toast host. Mounted once, at the root.
 *
 * Colours come from the app's own CSS variables rather than Sonner's built-in
 * palette, so a toast in dark mode matches the surface it sits on.
 */
function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      position="bottom-right"
      richColors={false}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'group toast bg-card text-card-foreground border-border shadow-overlay rounded-xl border text-sm',
          description: 'text-ink-3 text-[13px]',
          actionButton: 'bg-brand text-primary-foreground rounded-md',
          cancelButton: 'bg-surface-2 text-ink-2 rounded-md',
          error: 'border-danger/30',
          success: 'border-success/30',
          warning: 'border-warning/30',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
