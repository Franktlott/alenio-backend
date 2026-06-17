import { useEffect, useRef, type ClipboardEvent } from "react";
import { looksLikeRichHtml, sanitizeRichHtml } from "../../lib/simple-rich-text";

type FieldProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

/** Word-style typing: ⌘/Ctrl+B bold, ⌘/Ctrl+I italic. No toolbar. */
export function TaskDescriptionField({ id, value, onChange, placeholder }: FieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || value === lastEmitted.current) return;
    el.innerHTML = value || "";
    lastEmitted.current = value;
  }, [value]);

  const sync = () => {
    const el = ref.current;
    if (!el) return;
    const html = sanitizeRichHtml(el.innerHTML);
    lastEmitted.current = html;
    onChange(html);
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    sync();
  };

  return (
    <div
      ref={ref}
      id={id}
      className="create-v3-description-plain simple-rich-text"
      contentEditable
      role="textbox"
      aria-multiline="true"
      aria-label={placeholder}
      data-placeholder={placeholder}
      suppressContentEditableWarning
      onInput={sync}
      onBlur={sync}
      onPaste={handlePaste}
    />
  );
}

export function TaskDescriptionContent({ text }: { text: string }) {
  if (!text.trim()) return null;
  if (looksLikeRichHtml(text)) {
    return (
      <div
        className="task-description-rich"
        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(text) }}
      />
    );
  }
  return <>{text}</>;
}
