import { useEffect, useRef, useState } from "react";
import type { BriefingRow } from "../../lib/api";
import { getWebApiBase } from "../../lib/api-base";
import { formatBriefingDate, isImageBriefing, isPdfBriefing } from "../../lib/briefings-display";
import { BriefingPdfViewer } from "./BriefingPdfViewer";

type Props = {
  briefing: BriefingRow;
  documentFetchPath: string;
  useAuth?: boolean;
  alenioLoading?: boolean;
  onLoadingChange?: (loading: boolean) => void;
};

export function BriefingDocumentViewer({
  briefing,
  documentFetchPath,
  useAuth,
  alenioLoading,
  onLoadingChange,
}: Props) {
  const { documentUrl, contentType, documentFilename } = briefing;
  const title = documentFilename || "Briefing document";
  const isPdf = isPdfBriefing(contentType, documentUrl);
  const isImage = isImageBriefing(contentType, documentUrl);

  useEffect(() => {
    if (!alenioLoading || isPdf || isImage) return;
    onLoadingChange?.(false);
  }, [alenioLoading, isPdf, isImage, onLoadingChange]);

  if (isPdf) {
    return (
      <BriefingPdfViewer
        fetchPath={documentFetchPath}
        fallbackUrl={documentUrl}
        title={title}
        useAuth={useAuth}
        alenioLoading={alenioLoading}
        onLoadingChange={onLoadingChange}
      />
    );
  }

  if (isImage) {
    return (
      <BriefingImageViewer
        src={useAuth ? documentUrl : `${getWebApiBase()}${documentFetchPath}`}
        title={title}
        alenioLoading={alenioLoading}
        onLoadingChange={onLoadingChange}
      />
    );
  }

  return (
    <div className="briefing-doc-fallback">
      <p className="enterprise-muted">Open the briefing document to review before completing.</p>
      <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="enterprise-alenio-go-link-btn">
        Open document
      </a>
      <p className="briefing-doc-meta">{documentFilename ?? formatBriefingDate(briefing.publishedAt)}</p>
    </div>
  );
}

function BriefingImageViewer({
  src,
  title,
  alenioLoading,
  onLoadingChange,
}: {
  src: string;
  title: string;
  alenioLoading?: boolean;
  onLoadingChange?: (loading: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    onLoadingChange?.(true);
  }, [src, onLoadingChange]);

  function finishLoading() {
    setLoading(false);
    onLoadingChange?.(false);
  }

  return (
    <div className="briefing-doc-image-wrap" aria-busy={loading}>
      {error ? (
        <p className="enterprise-muted" role="alert">
          Could not load this image. Check your connection and try again.
        </p>
      ) : null}
      {!alenioLoading && loading ? <p className="briefing-doc-pdf-status">Loading document…</p> : null}
      <img
        className={`briefing-doc-image${loading && !error ? " briefing-doc-image--loading" : ""}`}
        src={src}
        alt={title}
        onLoad={finishLoading}
        onError={() => {
          setLoading(false);
          setError(true);
          onLoadingChange?.(false);
        }}
      />
    </div>
  );
}
