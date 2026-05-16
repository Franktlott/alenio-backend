export const APP_DOCUMENT_NAME = "Alenio";

/** Browser tab title: "Page · Alenio" or "Alenio" when page is omitted. */
export function setDocumentTitle(page?: string | null): void {
  const label = page?.trim();
  document.title = label ? `${label} · ${APP_DOCUMENT_NAME}` : APP_DOCUMENT_NAME;
}
