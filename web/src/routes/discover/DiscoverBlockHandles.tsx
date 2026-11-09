import type { Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { BLOCK_WIDTHS, SIZED_TYPES, widthAttrs } from "./DiscoverBlockNodes";

type Box = { top: number; left: number; width: number; height: number };
type Target = { pos: number; line: Box };
type Drag = {
  kind: "move" | "resize";
  el: HTMLElement;
  pos: number;
  node: PMNode;
  x: number;
  y: number;
  startWidth: number;
  width: string;
  active: boolean;
  target: Target | null;
  stop: () => void;
};

const DRAG_THRESHOLD = 4;
const WIDTH_TITLES: Record<string, string> = Object.fromEntries(BLOCK_WIDTHS.map((option) => [option.value, option.title]));

function relBox(el: Element, host: Element): Box {
  const r = el.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  return { top: r.top - h.top, left: r.left - h.left, width: r.width, height: r.height };
}

/** The direct child of the editor root that holds `target`, if any. */
function topLevelOf(editor: Editor, target: EventTarget | null): HTMLElement | null {
  const root = editor.view.dom;
  let el = target instanceof Element ? target : null;
  while (el && el.parentElement !== root) el = el.parentElement;
  return el instanceof HTMLElement ? el : null;
}

function blockAt(editor: Editor, el: Element): { pos: number; node: PMNode } | null {
  let found: { pos: number; node: PMNode } | null = null;
  editor.state.doc.forEach((node, offset) => {
    if (!found && editor.view.nodeDOM(offset) === el) found = { pos: offset, node };
  });
  return found;
}

function columnGap(root: Element): number {
  return Number.parseFloat(getComputedStyle(root).columnGap) || 0;
}

/**
 * Hover handles for the article editor: a grip to drag a block to a new spot, and a right-edge
 * handle to drag its width (snaps to full, ⅔, ½ or ⅓). Designed blocks can also be dragged by their preview.
 */
export function DiscoverBlockHandles({ editor, hostRef }: { editor: Editor; hostRef: RefObject<HTMLDivElement | null> }) {
  const [hoverEl, setHoverEl] = useState<HTMLElement | null>(null);
  const [dragging, setDragging] = useState<"move" | "resize" | null>(null);
  const [dropLine, setDropLine] = useState<Box | null>(null);
  const [sizing, setSizing] = useState<{ label: string; box: Box } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const leaveTimer = useRef<number | null>(null);

  const findTarget = (x: number, y: number, drag: Drag, host: Element): Target | null => {
    const root = editor.view.dom;
    const blocks = Array.from(root.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child !== drag.el,
    );
    let best: HTMLElement | null = null;
    let bestDistance = Infinity;
    for (const block of blocks) {
      const r = block.getBoundingClientRect();
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const distance = dx * dx * 4 + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = block;
      }
    }
    if (!best) return null;
    const found = blockAt(editor, best);
    if (!found) return null;
    const r = best.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    const inRow = r.width < root.clientWidth - 2;
    const before = inRow ? x < r.left + r.width / 2 : y < r.top + r.height / 2;
    const half = columnGap(root) / 2;
    const line: Box = inRow
      ? { top: r.top - h.top, left: (before ? r.left - half : r.right + half) - h.left - 1.5, width: 3, height: r.height }
      : { top: (before ? r.top - 7 : r.bottom + 5) - h.top, left: r.left - h.left, width: r.width, height: 3 };
    return { pos: before ? found.pos : found.pos + found.node.nodeSize, line };
  };

  const finishMove = (drag: Drag) => {
    const target = drag.target;
    const from = drag.pos;
    const to = from + drag.node.nodeSize;
    if (!target || (target.pos >= from && target.pos <= to)) return;
    const tr = editor.state.tr.delete(from, to);
    const at = tr.mapping.map(target.pos);
    tr.insert(at, drag.node);
    tr.setSelection(
      drag.node.isAtom ? NodeSelection.create(tr.doc, at) : TextSelection.near(tr.doc.resolve(Math.min(at + 1, tr.doc.content.size))),
    );
    editor.view.dispatch(tr);
    editor.view.focus();
  };

  const onDragMove = (event: PointerEvent) => {
    const drag = dragRef.current;
    const host = hostRef.current;
    if (!drag || !host) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.active = true;
      drag.el.classList.add("is-drag-source");
      document.body.classList.add("dcb-dragging");
      window.getSelection()?.removeAllRanges();
      setDragging("move");
    }
    event.preventDefault();
    if (drag.kind === "move") {
      drag.target = findTarget(event.clientX, event.clientY, drag, host);
      setDropLine(drag.target?.line ?? null);
      return;
    }
    const root = editor.view.dom;
    const full = root.clientWidth;
    const gap = columnGap(root);
    const options: Record<string, number> = {
      full,
      "2/3": (full * 2) / 3 - gap / 3,
      "1/2": full / 2 - gap / 2,
      "1/3": full / 3 - (gap * 2) / 3,
    };
    const want = drag.startWidth + dx;
    const pick = Object.entries(options).reduce((a, b) => (Math.abs(b[1] - want) < Math.abs(a[1] - want) ? b : a))[0];
    if (pick !== drag.width) {
      const node = editor.state.doc.nodeAt(drag.pos);
      if (node) editor.view.dispatch(editor.state.tr.setNodeMarkup(drag.pos, undefined, widthAttrs(node, pick)));
      drag.width = pick;
    }
    const el = editor.view.nodeDOM(drag.pos);
    if (el instanceof HTMLElement) {
      drag.el = el;
      setSizing({ label: WIDTH_TITLES[pick] ?? pick, box: relBox(el, host) });
    }
  };

  const onDragEnd = () => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.stop();
    dragRef.current = null;
    drag.el.classList.remove("is-drag-source");
    document.body.classList.remove("dcb-dragging", "dcb-resizing");
    if (drag.kind === "move" && drag.active) finishMove(drag);
    setDragging(null);
    setDropLine(null);
    setSizing(null);
  };

  const begin = (kind: Drag["kind"], el: HTMLElement | null, event: PointerEvent | ReactPointerEvent) => {
    if (!el || event.button !== 0 || dragRef.current) return;
    const block = blockAt(editor, el);
    if (!block) return;
    if (kind === "resize") {
      event.preventDefault();
      document.body.classList.add("dcb-resizing");
      setDragging("resize");
    }
    const move = (e: PointerEvent) => onDragMove(e);
    const end = () => onDragEnd();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    dragRef.current = {
      kind,
      el,
      pos: block.pos,
      node: block.node,
      x: event.clientX,
      y: event.clientY,
      startWidth: el.getBoundingClientRect().width,
      width: typeof block.node.attrs.width === "string" ? block.node.attrs.width : "full",
      active: kind === "resize",
      target: null,
      stop: () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
      },
    };
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onMove = (event: PointerEvent) => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
      if (dragRef.current) return;
      const el = topLevelOf(editor, event.target);
      if (el) setHoverEl(el);
    };
    const onLeave = () => {
      if (dragRef.current) return;
      leaveTimer.current = window.setTimeout(() => setHoverEl(null), 300);
    };
    const onDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".dcb-blk-preview")) return;
      begin("move", topLevelOf(editor, target), event);
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onDown);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
      dragRef.current?.stop();
    };
    // `begin` only reads refs and the editor, so binding it once is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, hostRef]);

  const host = hostRef.current;
  const box = hoverEl?.isConnected && host && !dragging ? relBox(hoverEl, host) : null;
  const hoverBlock = box && hoverEl ? blockAt(editor, hoverEl) : null;
  const canResize = Boolean(hoverBlock && SIZED_TYPES.includes(hoverBlock.node.type.name));
  const gap = columnGap(editor.view.dom);

  return (
    <div className="dcb-handles">
      {box ? (
        <>
          <button
            type="button"
            className="dcb-handle-grip"
            style={{ top: box.top + 2, left: box.left - 24 }}
            title="Drag to move"
            aria-label="Drag to move"
            tabIndex={-1}
            onPointerDown={(event) => begin("move", hoverEl, event)}
            data-testid="dcb-handle-grip"
          >
            <GripVertical size={16} />
          </button>
          {canResize ? (
            <div
              className="dcb-handle-size"
              style={{ top: box.top, left: box.left + box.width + Math.min(gap / 2, 14) - 6, height: box.height }}
              title="Drag to resize"
              onPointerDown={(event) => begin("resize", hoverEl, event)}
              data-testid="dcb-handle-size"
            >
              <span />
            </div>
          ) : null}
        </>
      ) : null}
      {dropLine ? <div className="dcb-drop-line" style={dropLine} data-testid="dcb-drop-line" /> : null}
      {sizing ? (
        <>
          <div className="dcb-size-ghost" style={sizing.box} />
          <div className="dcb-size-tip" style={{ top: sizing.box.top - 30, left: sizing.box.left + sizing.box.width - 8 }}>
            {sizing.label}
          </div>
        </>
      ) : null}
    </div>
  );
}
