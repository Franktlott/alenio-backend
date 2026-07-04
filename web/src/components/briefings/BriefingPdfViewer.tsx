import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { getAccessToken } from "../../lib/auth-client";
import { getWebApiBase } from "../../lib/api-base";

GlobalWorkerOptions.workerSrc = pdfWorker;

type Props = {
  fetchPath: string;
  fallbackUrl: string;
  title: string;
  useAuth?: boolean;
  alenioLoading?: boolean;
  onLoadingChange?: (loading: boolean) => void;
};

function friendlyPdfError(err: unknown): string {
  const message = err instanceof Error ? err.message : "Could not load this PDF.";
  if (message === "Load failed" || message === "Failed to fetch" || message.startsWith("NetworkError")) {
    return "Could not load this document. Check your connection and try again.";
  }
  return message;
}

export function BriefingPdfViewer({
  fetchPath,
  fallbackUrl,
  title,
  useAuth,
  alenioLoading,
  onLoadingChange,
}: Props) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let pdf: PDFDocumentProxy | null = null;

    async function renderPages() {
      setLoading(true);
      setError(null);
      setPageCount(0);
      onLoadingChange?.(true);

      const container = pagesRef.current;
      if (!container) return;
      container.replaceChildren();

      try {
        const headers: Record<string, string> = {};
        if (useAuth) {
          const token = getAccessToken();
          if (token) headers.Authorization = `Bearer ${token}`;
        }

        pdf = await getDocument({
          url: `${getWebApiBase()}${fetchPath}`,
          httpHeaders: headers,
        }).promise;
        if (cancelled) return;

        const totalPages = pdf.numPages;
        setPageCount(totalPages);

        const containerWidth = container.clientWidth || 640;
        const maxScale = 2;

        for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
          if (cancelled) return;

          const page = await pdf.getPage(pageNum);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(maxScale, Math.max(1, (containerWidth - 24) / baseViewport.width));
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.className = "briefing-doc-pdf-page";
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `${title} — page ${pageNum} of ${totalPages}`);

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          if (cancelled) return;

          const wrap = document.createElement("div");
          wrap.className = "briefing-doc-pdf-page-wrap";

          if (totalPages > 1) {
            const label = document.createElement("p");
            label.className = "briefing-doc-pdf-page-label";
            label.textContent = `Page ${pageNum} of ${totalPages}`;
            wrap.appendChild(label);
          }

          wrap.appendChild(canvas);
          container.appendChild(wrap);
        }
      } catch (err) {
        if (!cancelled) {
          setError(friendlyPdfError(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          onLoadingChange?.(false);
        }
      }
    }

    void renderPages();

    return () => {
      cancelled = true;
      void pdf?.destroy();
    };
  }, [fetchPath, title, useAuth, onLoadingChange]);

  return (
    <div className="briefing-doc-pdf">
      {!alenioLoading && loading ? <p className="briefing-doc-pdf-status">Loading document…</p> : null}
      {error ? (
        <div className="briefing-doc-fallback">
          <p className="enterprise-muted">{error}</p>
          <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="enterprise-alenio-go-link-btn">
            Open PDF in new tab
          </a>
        </div>
      ) : null}
      <div
        ref={pagesRef}
        className={`briefing-doc-pdf-pages${loading && alenioLoading ? " briefing-doc-pdf-pages--preload" : ""}`}
        aria-busy={loading}
        aria-label={title}
      />
      {!loading && !error && pageCount > 1 ? (
        <p className="briefing-doc-pdf-hint">Scroll to read all {pageCount} pages before completing.</p>
      ) : null}
    </div>
  );
}
