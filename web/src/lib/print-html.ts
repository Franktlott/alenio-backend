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

function removePrintFrame(frame: HTMLIFrameElement): void {
  frame.parentNode?.removeChild(frame);
}

/** Opens the browser print dialog for HTML content; user can choose Save as PDF. */
export function printHtmlInHiddenFrame(html: string, frameTitle = "Print preview"): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.title = frameTitle;
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;pointer-events:none";
  document.body.appendChild(frame);

  const frameWin = frame.contentWindow;
  if (!frameWin) {
    removePrintFrame(frame);
    throw new Error("Could not open print view.");
  }

  const doc = frameWin.document;
  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => removePrintFrame(frame);
  const triggerPrint = () => {
    try {
      frameWin.focus();
      frameWin.print();
    } catch {
      cleanup();
      throw new Error("Could not open print view.");
    }
  };

  if ("onafterprint" in frameWin) {
    frameWin.onafterprint = cleanup;
  } else {
    setTimeout(cleanup, 1500);
  }

  setTimeout(triggerPrint, 350);
}

export function alenioLogoUrl(): string {
  return `${window.location.origin}/alenio-logo.png`;
}

function mountHtmlForPdf(html: string): { root: HTMLDivElement; cleanup: () => void } {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.cssText =
    "position:fixed;left:-10000px;top:0;width:816px;background:#fff;pointer-events:none";

  const styleEl = document.createElement("style");
  styleEl.textContent = Array.from(parsed.querySelectorAll("style"))
    .map((node) => node.textContent ?? "")
    .join("\n");
  root.appendChild(styleEl);

  const content = document.createElement("div");
  content.innerHTML = parsed.body.innerHTML;
  root.appendChild(content);
  document.body.appendChild(root);

  return {
    root,
    cleanup: () => root.parentNode?.removeChild(root),
  };
}

/** Generates and downloads a PDF file from HTML (no print dialog). */
export async function downloadHtmlAsPdf(html: string, filename: string): Promise<void> {
  const { root, cleanup } = mountHtmlForPdf(html);
  const pdfName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;

  try {
    const html2pdf = (await import("html2pdf.js")).default;
    await html2pdf()
      .set({
        margin: [0.45, 0.5, 0.45, 0.5],
        filename: pdfName,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      })
      .from(root)
      .save();
  } catch {
    throw new Error("Could not download PDF.");
  } finally {
    cleanup();
  }
}
