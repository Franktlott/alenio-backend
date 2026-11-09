import { Crosshair, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const RATIO = 16 / 9;
const COVER_WIDTH = 1200;
const COVER_HEIGHT = 675;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const FRAME_INSET = 44;
const PREVIEW_WIDTH = 236;

type Pan = { x: number; y: number };

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

/**
 * Every Discover cover is saved as the same 16:9 image, so the phone cards
 * share one frame instead of cropping each upload differently. The frame stays
 * fixed and the photo moves and zooms underneath it.
 */
export function DiscoverCoverCrop({
  src,
  crossOrigin = false,
  note,
  title,
  category,
  minutes,
  onCancel,
  onApply,
}: {
  src: string;
  /** Remote covers must load with CORS, or the canvas cannot export them. */
  crossOrigin?: boolean;
  note?: string | null;
  title: string;
  category: string | null;
  minutes: number;
  onCancel: () => void;
  onApply: (file: File) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number; pan: Pan } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const measure = () => setStage({ w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const frameW = Math.max(0, Math.min(stage.w - FRAME_INSET * 2, (stage.h - FRAME_INSET * 2) * RATIO));
  const frameH = frameW / RATIO;
  const baseScale = natural.w > 0 && frameW > 0 ? Math.max(frameW / natural.w, frameH / natural.h) : 1;
  const scale = baseScale * zoom;
  const drawW = natural.w * scale;
  const drawH = natural.h * scale;
  const maxX = Math.max(0, (drawW - frameW) / 2);
  const maxY = Math.max(0, (drawH - frameH) / 2);
  const clampPan = useCallback(
    (next: Pan): Pan => ({
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    }),
    [maxX, maxY],
  );
  const panX = Math.min(maxX, Math.max(-maxX, pan.x));
  const panY = Math.min(maxY, Math.max(-maxY, pan.y));
  /** Photo's top-left corner relative to the frame's top-left corner. */
  const offsetX = (frameW - drawW) / 2 + panX;
  const offsetY = (frameH - drawH) / 2 + panY;
  const frameLeft = (stage.w - frameW) / 2;
  const frameTop = (stage.h - frameH) / 2;
  const ready = natural.w > 0 && frameW > 0;

  const zoomTo = useCallback(
    (next: number) => {
      const value = clampZoom(next);
      // Keep the point under the frame's centre fixed while zooming.
      setPan((current) => ({ x: (current.x * value) / zoom, y: (current.y * value) / zoom }));
      setZoom(value);
    },
    [zoom],
  );

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomTo(zoom * Math.exp(-event.deltaY * 0.0015));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [zoom, zoomTo]);

  const apply = useCallback(async () => {
    const image = imageRef.current;
    if (!image || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = COVER_WIDTH;
      canvas.height = COVER_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not prepare this image.");
      context.imageSmoothingQuality = "high";
      context.drawImage(image, -offsetX / scale, -offsetY / scale, frameW / scale, frameH / scale, 0, 0, COVER_WIDTH, COVER_HEIGHT);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Your browser could not prepare this image.");
      onApply(new File([blob], "discover-cover.jpg", { type: "image/jpeg" }));
    } catch {
      setError("This cover can't be re-cropped here. Upload the original photo with Replace instead.");
      setBusy(false);
    }
  }, [frameH, frameW, offsetX, offsetY, onApply, ready, scale]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key === "Enter" && !busy) {
        event.preventDefault();
        void apply();
        return;
      }
      const step = event.shiftKey ? 40 : 10;
      const moves: Record<string, Pan> = {
        ArrowLeft: { x: step, y: 0 },
        ArrowRight: { x: -step, y: 0 },
        ArrowUp: { x: 0, y: step },
        ArrowDown: { x: 0, y: -step },
      };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      setPan((current) => clampPan({ x: current.x + move.x, y: current.y + move.y }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [apply, busy, clampPan, onCancel]);

  const endPointer = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      setDragging(false);
    }
  };

  const previewScale = PREVIEW_WIDTH / (frameW || 1);

  return createPortal(
    <div className="dcb-crop-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="dcb-crop" role="dialog" aria-modal="true" aria-labelledby="dcb-crop-title">
        <header className="dcb-crop-head">
          <div>
            <h2 id="dcb-crop-title">Crop cover image</h2>
            <p>Drag to position, zoom to fit. Saved as 16:9 at 1200×675.</p>
          </div>
          <button type="button" className="dcb-icon-btn" aria-label="Close" onClick={onCancel}>
            <X size={18} />
          </button>
        </header>

        <div className="dcb-crop-body">
          <div className="dcb-crop-work">
            <div
              ref={stageRef}
              className={`dcb-crop-stage${dragging ? " is-dragging" : ""}`}
              data-testid="dcb-crop-stage"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                if (pointers.current.size === 2) {
                  const [a, b] = [...pointers.current.values()];
                  pinch.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom };
                  drag.current = null;
                  return;
                }
                drag.current = { x: event.clientX, y: event.clientY, pan: { x: panX, y: panY } };
                setDragging(true);
              }}
              onPointerMove={(event) => {
                if (!pointers.current.has(event.pointerId)) return;
                pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                if (pinch.current && pointers.current.size === 2) {
                  const [a, b] = [...pointers.current.values()];
                  const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
                  zoomTo(pinch.current.zoom * (distance / pinch.current.distance));
                  return;
                }
                if (!drag.current) return;
                setPan(
                  clampPan({
                    x: drag.current.pan.x + (event.clientX - drag.current.x),
                    y: drag.current.pan.y + (event.clientY - drag.current.y),
                  }),
                );
              }}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
            >
              <img
                ref={imageRef}
                src={src}
                alt=""
                draggable={false}
                crossOrigin={crossOrigin ? "anonymous" : undefined}
                onLoad={(event) => setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
                onError={() => setError("This image could not be loaded. Try Replace with the original photo.")}
                style={
                  ready
                    ? { left: frameLeft + offsetX, top: frameTop + offsetY, width: drawW, height: drawH }
                    : { visibility: "hidden" }
                }
              />
              {frameW > 0 ? (
                <div className="dcb-crop-frame" style={{ left: frameLeft, top: frameTop, width: frameW, height: frameH }} aria-hidden>
                  <span className="dcb-crop-grid" />
                  <i className="tl" />
                  <i className="tr" />
                  <i className="bl" />
                  <i className="br" />
                </div>
              ) : null}
              {!ready && !error ? <p className="dcb-crop-loading">Loading photo…</p> : null}
            </div>

            <div className="dcb-crop-tools">
              <button type="button" className="dcb-icon-btn" aria-label="Zoom out" onClick={() => zoomTo(zoom - 0.2)} disabled={zoom <= MIN_ZOOM}>
                <ZoomOut size={17} />
              </button>
              <input
                type="range"
                className="dcb-range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                aria-label="Zoom"
                onChange={(event) => zoomTo(Number(event.target.value))}
                style={{ "--dcb-range-fill": `${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` } as React.CSSProperties}
              />
              <button type="button" className="dcb-icon-btn" aria-label="Zoom in" onClick={() => zoomTo(zoom + 0.2)} disabled={zoom >= MAX_ZOOM}>
                <ZoomIn size={17} />
              </button>
              <span className="dcb-crop-zoom">{zoom.toFixed(1)}×</span>
              <span className="dcb-crop-sep" />
              <button type="button" className="dcb-btn dcb-btn--ghost" onClick={() => setPan({ x: 0, y: 0 })}>
                <Crosshair size={15} />
                Center
              </button>
              <button
                type="button"
                className="dcb-btn dcb-btn--ghost"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
              >
                <RotateCcw size={15} />
                Reset
              </button>
            </div>
            {note ? <p className="dcb-crop-note">{note}</p> : null}
            {error ? <p className="dcb-error">{error}</p> : null}
          </div>

          <aside className="dcb-crop-side">
            <span className="dcb-eyebrow">Card preview</span>
            <div className="dcb-card-preview">
              <div className="dcb-card-preview-img" style={{ width: PREVIEW_WIDTH, height: PREVIEW_WIDTH / RATIO }}>
                {ready ? (
                  <img
                    src={src}
                    alt=""
                    crossOrigin={crossOrigin ? "anonymous" : undefined}
                    style={{
                      left: offsetX * previewScale,
                      top: offsetY * previewScale,
                      width: drawW * previewScale,
                      height: drawH * previewScale,
                    }}
                  />
                ) : null}
              </div>
              <div className="dcb-card-preview-copy">
                {category ? <span className="dcb-card-preview-kicker">{category}</span> : null}
                <strong>{title.trim() || "Untitled article"}</strong>
                <span className="dcb-card-preview-meta">{minutes > 0 ? `${minutes} min read` : "Reading time appears as you write"}</span>
              </div>
            </div>
            <p className="dcb-crop-hint">Tip: use the arrow keys to nudge the photo, and scroll or pinch to zoom.</p>
          </aside>
        </div>

        <footer className="dcb-crop-foot">
          <button type="button" className="dcb-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="dcb-btn dcb-btn--primary" onClick={() => void apply()} disabled={busy || !ready}>
            {busy ? "Preparing…" : "Apply crop"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
