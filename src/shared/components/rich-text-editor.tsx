import { useCallback, useEffect } from 'react';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/shared/utils/cn';

/**
 * The lesson and assignment editor.
 *
 * TipTap over a textarea because teachers write structured material —
 * objectives as a list, worked examples as code, a quotation from a set text —
 * and markdown syntax is a barrier for staff who have never seen it.
 *
 * It emits an HTML string, which is stored as-is and rendered through
 * `<RichText>`. Nothing here sanitises: the editor's own schema decides what
 * *can* be typed, but the value can also arrive from the database, so the gate
 * belongs at the render boundary where every path passes through it.
 *
 * Link handling is deliberately restrictive. `window.prompt` is unfashionable
 * but it is the one input a keyboard user can always reach, and the scheme is
 * forced to https unless the teacher typed a mailto: — a bare `example.com`
 * pasted into a href would otherwise resolve as a relative path inside the app.
 */

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Rows of visible space before scrolling. */
  minHeight?: number;
  disabled?: boolean;
  'aria-label'?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write the lesson…',
  minHeight = 220,
  disabled = false,
  'aria-label': ariaLabel,
}: RichTextEditorProps) {
  const editor = useEditor({
    editable: !disabled,
    extensions: [
      // Link and Underline ship inside StarterKit v3 — adding them separately
      // registers the extension twice and TipTap warns about it.
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ['http', 'https', 'mailto'],
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'focus:outline-none',
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
      },
    },
    onUpdate: ({ editor: instance }) => {
      // TipTap represents "empty" as `<p></p>`; the caller means null by that,
      // and an assignment that looks blank should not count as having content.
      const html = instance.getHTML();
      onChange(instance.isEmpty ? '' : html);
    },
  });

  // Adopt a value that changed underneath us — a draft loaded after mount, or
  // a different lesson opened in the same editor. Guarded on inequality so
  // every keystroke does not reset the document and drop the cursor.
  useEffect(() => {
    if (!editor) return;
    if (value === editor.getHTML()) return;
    if (value === '' && editor.isEmpty) return;

    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const setLink = useCallback(() => {
    if (!editor) return;

    const existing = editor.getAttributes('link').href as string | undefined;
    const input = window.prompt('Link address', existing ?? 'https://');

    if (input === null) return;

    const trimmed = input.trim();
    if (trimmed === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    // A bare "example.com" would be stored as a relative path and resolve
    // inside the app. Anything without a scheme gets https.
    const href = /^(https?:|mailto:)/i.test(trimmed) ? trimmed : `https://${trimmed}`;

    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  }, [editor]);

  if (!editor) {
    return (
      <div
        className="animate-pulse rounded-xl border border-input bg-surface-2"
        style={{ minHeight }}
      />
    );
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-input bg-surface-2 transition-colors',
        'focus-within:border-ring focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-ring/40',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <Toolbar editor={editor} onLink={setLink} />

      <EditorContent
        editor={editor}
        style={{ minHeight }}
        className={cn(
          'cursor-text px-4 py-3 text-[14.5px] leading-relaxed text-ink',
          // The document styling mirrors <RichText> so what a teacher types
          // looks like what a pupil will read.
          '[&_.ProseMirror]:min-h-[inherit] [&_.ProseMirror]:outline-none',
          '[&_p]:my-2.5 [&_p:first-child]:mt-0',
          '[&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-[17px] [&_h2]:font-extrabold [&_h2]:text-ink',
          '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-[15px] [&_h3]:font-bold [&_h3]:text-ink',
          '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
          '[&_li]:my-0.5 [&_li]:marker:text-ink-3',
          '[&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-brand-border [&_blockquote]:pl-3 [&_blockquote]:text-ink-3 [&_blockquote]:italic',
          '[&_code]:rounded [&_code]:bg-surface-3 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]',
          '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface-3 [&_pre]:p-3',
          '[&_hr]:my-4 [&_hr]:border-border',
          // The placeholder, which Tiptap exposes as a data attribute.
          '[&_p.is-editor-empty:first-child::before]:pointer-events-none',
          '[&_p.is-editor-empty:first-child::before]:float-left',
          '[&_p.is-editor-empty:first-child::before]:h-0',
          '[&_p.is-editor-empty:first-child::before]:text-ink-3',
          '[&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
        )}
      />
    </div>
  );
}

// ── Toolbar ─────────────────────────────────────────────────────────────────

function Toolbar({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface px-2 py-1.5">
      <ToolButton
        icon={Bold}
        label="Bold"
        isActive={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolButton
        icon={Italic}
        label="Italic"
        isActive={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolButton
        icon={UnderlineIcon}
        label="Underline"
        isActive={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolButton
        icon={Strikethrough}
        label="Strikethrough"
        isActive={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />

      <Divider />

      <ToolButton
        icon={Heading2}
        label="Heading"
        isActive={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolButton
        icon={Heading3}
        label="Subheading"
        isActive={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />

      <Divider />

      <ToolButton
        icon={List}
        label="Bullet list"
        isActive={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolButton
        icon={ListOrdered}
        label="Numbered list"
        isActive={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolButton
        icon={Quote}
        label="Quote"
        isActive={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolButton
        icon={Code}
        label="Code"
        isActive={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <ToolButton
        icon={Minus}
        label="Divider"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      />

      <Divider />

      <ToolButton
        icon={Link2}
        label="Add link"
        isActive={editor.isActive('link')}
        onClick={onLink}
      />
      <ToolButton
        icon={Link2Off}
        label="Remove link"
        disabled={!editor.isActive('link')}
        onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
      />

      <Divider />

      <ToolButton
        icon={Undo2}
        label="Undo"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <ToolButton
        icon={Redo2}
        label="Redo"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      />
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
}

function ToolButton({
  icon: Icon,
  label,
  isActive = false,
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  isActive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      // Without this the button steals focus on mousedown and the selection
      // collapses before the command runs — the classic "bold does nothing"
      // toolbar bug.
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      className={cn(
        'grid size-7 cursor-pointer place-items-center rounded-md transition-colors',
        'hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        'disabled:pointer-events-none disabled:opacity-40',
        isActive ? 'bg-brand-soft text-brand' : 'text-ink-3',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
    </button>
  );
}
