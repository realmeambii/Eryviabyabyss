import { Moon, Sun } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { useTheme } from '@/shared/hooks/use-theme';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const nextLabel = resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={toggleTheme}
      title={nextLabel}
      aria-label={nextLabel}
      className={className}
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="size-[17px]" aria-hidden />
      ) : (
        <Moon className="size-[17px]" aria-hidden />
      )}
    </Button>
  );
}
