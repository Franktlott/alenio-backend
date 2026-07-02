import type { BriefingRow } from "../../lib/api";
import { getWebApiBase } from "../../lib/api-base";
import { formatBriefingDate, isImageBriefing, isPdfBriefing } from "../../lib/briefings-display";
import { BriefingPdfViewer } from "./BriefingPdfViewer";

type Props = {
  briefing: BriefingRow;
  documentFetchPath: string;
  useAuth?: boolean;
};

export function BriefingDocumentViewer({ briefing, documentFetchPath, useAuth }: Props) {
  const { documentUrl, contentType, documentFilename } = briefing;
  const title = documentFilename || "Briefing document";

  if (isPdfBriefing(contentType, documentUrl)) {
    return (
      <BriefingPdfViewer
        fetchPath={documentFetchPath}
        fallbackUrl={documentUrl}
        title={title}
        useAuth={useAuth}
      />
    );
  }

  if (isImageBriefing(contentType, documentUrl)) {
    const imageSrc = useAuth ? documentUrl : `${getWebApiBase()}${documentFetchPath}`;
    return <img className="briefing-doc-image" src={imageSrc} alt={title} />;
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
