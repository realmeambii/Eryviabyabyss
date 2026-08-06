import { sanitizeHtml } from '@/shared/lib/sanitize-html';
import { cn } from '@/shared/utils/cn';

/**
 * Authored HTML, rendered.
 *
 * The only sanctioned way to put lesson or assignment content on screen.
 * `dangerouslySetInnerHTML` appears here and nowhere else in the app, which is
 * what makes "is every render path sanitised?" a question with a one-line
 * answer instead of a grep.
 *
 * The prose styling is written out rather than pulled from a typography plugin
 * so the tokens match the rest of the design system in both themes.
 */
export function RichText({
  html,
  className,
}: {
  html: string | null | undefined;
  className?: string;
}) {
  const clean = sanitizeHtml(html);

  if (!clean) return null;

  return (
    <div
      className={cn(
        'text-[14.5px] leading-relaxed text-ink-2',
        '[&_p]:my-3 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
        '[&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:text-[19px] [&_h1]:font-extrabold [&_h1]:tracking-tight [&_h1]:text-ink',
        '[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-[17px] [&_h2]:font-extrabold [&_h2]:tracking-tight [&_h2]:text-ink',
        '[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-[15px] [&_h3]:font-bold [&_h3]:text-ink',
        '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:my-1 [&_li]:marker:text-ink-3',
        '[&_strong]:font-bold [&_strong]:text-ink',
        '[&_a]:font-medium [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2',
        '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-brand-border [&_blockquote]:pl-4 [&_blockquote]:text-ink-3 [&_blockquote]:italic',
        '[&_code]:rounded [&_code]:bg-surface-3 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]',
        '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-surface-3 [&_pre]:p-4',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_hr]:my-5 [&_hr]:border-border',
        className,
      )}
      // Safe: `clean` is the output of sanitizeHtml, which is the only
      // sanctioned producer of HTML for this prop.
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
