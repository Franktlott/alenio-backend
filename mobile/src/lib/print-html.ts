import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export const ALENIO_LOGO_URL = "https://alenio---prod.web.app/alenio-logo.png";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function safePdfFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^\w\s-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "document";
}

/** Opens the native print dialog for HTML content. */
export async function printHtml(html: string): Promise<void> {
  await Print.printAsync({ html });
}

/** Generates a PDF file and opens the share sheet so the user can save it. */
export async function downloadHtmlAsPdf(html: string, filename: string): Promise<void> {
  const pdfName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("PDF download is not available on this device.");
  }
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: pdfName,
  });
}
