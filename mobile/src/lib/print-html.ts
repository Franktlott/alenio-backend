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

/** Generates a PDF file and opens the system share sheet (Save to Files, etc.). */
export async function sharePdfFromHtml(html: string, dialogTitle = "Save PDF"): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle,
  });
}
