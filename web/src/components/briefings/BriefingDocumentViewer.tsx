import type { BriefingRow } from "../../lib/api";
import { formatBriefingDate, isImageBriefing, isPdfBriefing } from "../../lib/briefings-display";
import { BriefingPdfViewer } from "./BriefingPdfViewer";

type Props = {
  briefing: BriefingRow;
};

export function BriefingDocumentViewer({ briefing }: Props) {
  const { documentUrl, contentType, documentFilename } = briefing;
  const title = documentFilename || "Briefing document";

  if (isPdfBriefing(contentType, documentUrl)) {
    return <BriefingPdfViewer url={documentUrl} title={title} />;
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
