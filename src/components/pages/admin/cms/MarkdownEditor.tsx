"use client";

import { useRef, useState } from "react";
import {
  Bold,
  Code,
  Eye,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Pencil,
  Quote,
  Redo,
  Undo,
} from "lucide-react";

/**
 * Rich-text editor for blog content.
 *
 * The production console runs TipTap but stores Markdown, because the public
 * site renders Markdown. So the stored format — not the editing widget — is
 * what actually has to match, and a toolbar over a textarea hits the same
 * contract with no editor dependency and no ProseMirror schema to keep in
 * sync. Toolbar actions wrap or prefix the selection the way the TipTap
 * buttons do, and a preview tab covers the "what will this look like" need.
 */

type Props = { value: string; onChange: (v: string) => void };

/** One undo stack entry. Coalescing is by toolbar action, not keystroke —
    plain typing is left to the textarea's own native undo. */
type Snapshot = { text: string; selStart: number; selEnd: number };

export default function MarkdownEditor({ value, onChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const undo = useRef<Snapshot[]>([]);
  const redo = useRef<Snapshot[]>([]);

  const apply = (next: string, selStart: number, selEnd: number) => {
    const el = ref.current;
    if (el) undo.current.push({ text: value, selStart: el.selectionStart, selEnd: el.selectionEnd });
    redo.current = [];
    onChange(next);
    requestAnimationFrame(() => {
      const t = ref.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(selStart, selEnd);
    });
  };

  /** Wrap the selection in `token` (bold, italic, inline code). */
  const wrap = (token: string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const selected = value.slice(a, b) || "text";
    const next = `${value.slice(0, a)}${token}${selected}${token}${value.slice(b)}`;
    apply(next, a + token.length, a + token.length + selected.length);
  };

  /** Prefix every line of the selection (headings, lists, quote). */
  const prefix = (token: string, numbered = false) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const start = value.lastIndexOf("\n", a - 1) + 1;
    const end = value.indexOf("\n", b) === -1 ? value.length : value.indexOf("\n", b);
    const block = value.slice(start, end) || "text";
    const lines = block.split("\n").map((line, i) => {
      const bare = line.replace(/^(\s*)([-*]\s|\d+\.\s|#{1,6}\s|>\s)/, "$1");
      return `${numbered ? `${i + 1}. ` : token}${bare}`;
    });
    const replaced = lines.join("\n");
    apply(`${value.slice(0, start)}${replaced}${value.slice(end)}`, start, start + replaced.length);
  };

  const insertLink = () => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const label = value.slice(a, b) || "link text";
    const snippet = `[${label}](https://)`;
    apply(`${value.slice(0, a)}${snippet}${value.slice(b)}`, a + snippet.length - 9, a + snippet.length - 1);
  };

  const doUndo = () => {
    const prev = undo.current.pop();
    if (!prev) return;
    const el = ref.current;
    if (el) redo.current.push({ text: value, selStart: el.selectionStart, selEnd: el.selectionEnd });
    onChange(prev.text);
  };

  const doRedo = () => {
    const next = redo.current.pop();
    if (!next) return;
    const el = ref.current;
    if (el) undo.current.push({ text: value, selStart: el.selectionStart, selEnd: el.selectionEnd });
    onChange(next.text);
  };

  const Tool = ({
    icon: Icon,
    label,
    onClick,
  }: {
    icon: typeof Bold;
    label: string;
    onClick: () => void;
  }) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="cursor-pointer rounded-[5px] p-1.5 text-[#6b6259] transition-colors hover:bg-[#741a14]/10 hover:text-[#741a14]"
    >
      <Icon size={14} />
    </button>
  );

  return (
    <div className="overflow-hidden rounded-[8px] border border-[#d8c3a5]/70 bg-white/70">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[#d8c3a5]/60 bg-[#f3e8d5]/50 px-2 py-1.5">
        <Tool icon={Bold} label="Bold" onClick={() => wrap("**")} />
        <Tool icon={Italic} label="Italic" onClick={() => wrap("_")} />
        <Tool icon={LinkIcon} label="Link" onClick={insertLink} />
        <span className="mx-1 h-4 w-px bg-[#d8c3a5]" />
        <Tool icon={Heading2} label="Heading 2" onClick={() => prefix("## ")} />
        <Tool icon={Heading3} label="Heading 3" onClick={() => prefix("### ")} />
        <span className="mx-1 h-4 w-px bg-[#d8c3a5]" />
        <Tool icon={List} label="Bullet list" onClick={() => prefix("- ")} />
        <Tool icon={ListOrdered} label="Numbered list" onClick={() => prefix("", true)} />
        <Tool icon={Quote} label="Quote" onClick={() => prefix("> ")} />
        <Tool icon={Code} label="Code" onClick={() => wrap("`")} />
        <span className="mx-1 h-4 w-px bg-[#d8c3a5]" />
        <Tool icon={Undo} label="Undo" onClick={doUndo} />
        <Tool icon={Redo} label="Redo" onClick={doRedo} />

        <div className="ml-auto flex items-center gap-0.5">
          <Tool
            icon={tab === "write" ? Eye : Pencil}
            label={tab === "write" ? "Preview" : "Write"}
            onClick={() => setTab(tab === "write" ? "preview" : "write")}
          />
        </div>
      </div>

      {tab === "write" ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={16}
          spellCheck
          className="w-full resize-y bg-transparent px-3.5 py-3 font-sans-luxury text-[13.5px] leading-[1.7] text-[#11100e] outline-none placeholder:text-[#b3a897]"
          placeholder="Open with the strongest sentence in the post."
        />
      ) : (
        <div
          className="markdown-preview min-h-[300px] px-4 py-4 font-sans-luxury text-[13.5px] leading-[1.75] text-[#11100e]"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
        />
      )}
    </div>
  );
}

/** Escape first, then apply a small Markdown subset — the preview must never
    be able to inject markup, since the draft text is operator-supplied. */
function renderMarkdown(src: string): string {
  const esc = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const blocks = esc.split(/\n{2,}/).map((block) => {
    const lines = block.split("\n");

    if (/^###\s/.test(block))
      return `<h3 style="font-size:17px;margin:1.1em 0 .4em;font-weight:600">${block.replace(/^###\s/, "")}</h3>`;
    if (/^##\s/.test(block))
      return `<h2 style="font-size:20px;margin:1.2em 0 .4em;font-weight:600">${block.replace(/^##\s/, "")}</h2>`;
    if (lines.every((l) => /^&gt;\s?/.test(l)))
      return `<blockquote style="border-left:3px solid #d8c3a5;padding-left:12px;margin:1em 0;color:#6b6259">${lines
        .map((l) => l.replace(/^&gt;\s?/, ""))
        .join(" ")}</blockquote>`;
    if (lines.every((l) => /^[-*]\s/.test(l)))
      return `<ul style="margin:.8em 0;padding-left:20px;list-style:disc">${lines
        .map((l) => `<li>${inline(l.replace(/^[-*]\s/, ""))}</li>`)
        .join("")}</ul>`;
    if (lines.every((l) => /^\d+\.\s/.test(l)))
      return `<ol style="margin:.8em 0;padding-left:22px;list-style:decimal">${lines
        .map((l) => `<li>${inline(l.replace(/^\d+\.\s/, ""))}</li>`)
        .join("")}</ol>`;

    return `<p style="margin:.8em 0">${inline(block.replace(/\n/g, "<br/>"))}</p>`;
  });

  return blocks.join("") || `<p style="color:#a2988b">Nothing to preview yet.</p>`;
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code style="background:#f3e8d5;padding:1px 5px;border-radius:4px">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" style="color:#741a14;text-decoration:underline" target="_blank" rel="noreferrer">$1</a>'
    );
}
