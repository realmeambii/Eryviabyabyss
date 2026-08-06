import DOMPurify from 'dompurify';

/**
 * The gate between authored HTML and the DOM.
 *
 * TipTap stores its output as an HTML string, which means lesson content
 * written by one user is later injected into another user's page. A teacher is
 * trusted to write a lesson; a *compromised teacher account* is not, and
 * `dangerouslySetInnerHTML` on unsanitised content would turn one stolen
 * password into stored XSS against every pupil in the class.
 *
 * So every render path goes through here. The allow-list is the set of tags
 * the editor can actually produce — anything else is an attempt at something
 * the toolbar cannot express.
 *
 * `ALLOWED_URI_REGEXP` is the part worth reading twice: DOMPurify's default
 * permits `javascript:` in some historical configurations, and a link is the
 * one place a teacher legitimately supplies a URL. Only the four schemes a
 * school link could sensibly use are allowed through.
 */

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'code',
  'pre',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'a',
  'hr',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

const ALLOWED_URI_REGEXP = /^(?:https?:|mailto:|tel:|#)/i;

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
    // `<a target="_blank">` without `rel="noopener"` hands the opened page a
    // reference to ours through `window.opener`. The hook below adds it; this
    // keeps DOMPurify from stripping the attribute before the hook runs.
    ADD_ATTR: ['target', 'rel'],
  });
}

/**
 * Force every link to open safely, once, at module load.
 *
 * A hook rather than a post-processing pass: it runs inside the sanitiser on
 * every node, so a link that arrives through any call site is covered, not
 * just the ones a developer remembered to fix up afterwards.
 */
let hookInstalled = false;

if (!hookInstalled && typeof window !== 'undefined') {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
  hookInstalled = true;
}

/**
 * Plain text from authored HTML, for previews and search snippets.
 *
 * Sanitises first rather than stripping tags with a regular expression: a
 * regex over `<img src=x onerror=…>` produces a string that still contains the
 * payload, and someone eventually renders one of these back into the DOM.
 */
export function htmlToText(html: string | null | undefined): string {
  const clean = sanitizeHtml(html);
  if (!clean) return '';

  const element = document.createElement('div');
  element.innerHTML = clean;
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}
