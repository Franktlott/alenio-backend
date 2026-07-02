import type { BriefingRow } from "../../lib/api";
import { formatBriefingDate, isImageBriefing, isPdfBriefing } from "../../lib/briefings-display";

type Props = {
  briefing: BriefingRow;
};

export function BriefingDocumentViewer({ briefing }: Props) {
  const { documentUrl, contentType, documentFilename } = briefing;
  const title = documentFilename || "Briefing document";

  if (isPdfBriefing(contentType, documentUrl)) {
    return (
      <iframe
        className="briefing-doc-frame"
        src={documentUrl}
        title={title}
        aria-label={title}
      />
    );
  }

  if (isImageBriefing(contentType, documentUrl)) {
    return <img className="briefing-doc-image" src={documentUrl} alt={title} />;
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
