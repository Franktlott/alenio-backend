import { useCallback, useEffect, useRef, type TextareaHTMLAttributes } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minRows?: number;
  maxRows?: number;
};

function verticalPadding(el: HTMLTextAreaElement): number {
  const style = getComputedStyle(el);
  return parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
}

export function AutoResizeTextarea({
  minRows = 2,
  maxRows,
  value,
  onChange,
  className,
  ...rest
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const padding = verticalPadding(el);
    const minHeight = lineHeight * minRows + padding;
    let next = Math.max(el.scrollHeight, minHeight);
    if (maxRows) {
      const maxHeight = lineHeight * maxRows + padding;
      if (el.scrollHeight > maxHeight) {
        el.style.overflowY = "auto";
        next = maxHeight;
      } else {
        el.style.overflowY = "hidden";
      }
    } else {
      el.style.overflowY = "hidden";
    }
    el.style.height = `${next}px`;
  }, [minRows, maxRows]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      onChange={(e) => {
        onChange?.(e);
        requestAnimationFrame(resize);
      }}
      rows={minRows}
      {...rest}
    />
  );
}
