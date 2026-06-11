import * as Print from "expo-print";

export const ALENIO_LOGO_URL = "https://alenio---prod.web.app/alenio-logo.png";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Opens the native print dialog for HTML content. */
export async function printHtml(html: string): Promise<void> {
  await Print.printAsync({ html });
}
