export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function sanitizePdfFilename(name: string, fallback = "document"): string {
  const cleaned = name
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${cleaned || fallback}.pdf`;
}

function removeFrame(frame: HTMLIFrameElement): void {
  frame.parentNode?.removeChild(frame);
}

async function waitForRender(doc: Document): Promise<void> {
  await new Promise<void>((resolve) => {
    const view = doc.defaultView;
    if (!view) {
      resolve();
      return;
    }
    if (doc.readyState === "complete") resolve();
    else view.addEventListener("load", () => resolve(), { once: true });
  });

  await Promise.all(
    Array.from(doc.images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) resolve();
          else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }
        }),
    ),
  );

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/** Renders HTML in a hidden frame and downloads a PDF without opening the print dialog. */
export async function downloadHtmlAsPdf(html: string, filename: string): Promise<void> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.title = "PDF export";
  frame.style.cssText =
    "position:fixed;left:-10000px;top:0;width:816px;height:1056px;border:0;visibility:hidden;pointer-events:none";
  document.body.appendChild(frame);

  const frameWin = frame.contentWindow;
  if (!frameWin) {
    removeFrame(frame);
    throw new Error("Could not save PDF.");
  }

  const doc = frameWin.document;
  doc.open();
  doc.write(html);
  doc.close();

  try {
    await waitForRender(doc);
    const html2pdf = (await import("html2pdf.js")).default;
    await html2pdf()
      .set({
        margin: [0.38, 0.42, 0.38, 0.42],
        filename: sanitizePdfFilename(filename.replace(/\.pdf$/i, "")),
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: 816,
        },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(doc.body)
      .save();
  } catch {
    throw new Error("Could not save PDF.");
  } finally {
    removeFrame(frame);
  }
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
