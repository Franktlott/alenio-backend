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

function waitForImages(root: ParentNode): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  if (images.length === 0) return Promise.resolve();
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        }),
    ),
  ).then(() => undefined);
}

function loadHtmlInHiddenFrame(html: string): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText =
      "position:fixed;left:0;top:0;width:816px;height:1100px;border:0;opacity:0;pointer-events:none;z-index:-1";
    document.body.appendChild(frame);

    const frameWin = frame.contentWindow;
    if (!frameWin) {
      removePrintFrame(frame);
      reject(new Error("Could not prepare PDF view."));
      return;
    }

    const doc = frameWin.document;
    doc.open();
    doc.write(html);
    doc.close();

    const ready = () => {
      void waitForImages(doc).then(() => resolve(frame));
    };

    frame.addEventListener("load", () => setTimeout(ready, 100), { once: true });
    setTimeout(ready, 250);
  });
}

/** Copy rendered print HTML into the main document so html2canvas can capture it. */
function mountCaptureHost(frame: HTMLIFrameElement): { host: HTMLDivElement; cleanup: () => void } {
  const frameDoc = frame.contentDocument;
  if (!frameDoc?.body) {
    throw new Error("Could not prepare PDF view.");
  }

  const styleText = `${Array.from(frameDoc.querySelectorAll("style"))
    .map((node) => node.textContent ?? "")
    .join("\n")}
.pdf-capture-host {
  font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
  color: #0f172a;
  font-size: 8.5pt;
  line-height: 1.32;
  margin: 0;
  padding: 0;
  -webkit-font-smoothing: antialiased;
}`;

  const host = document.createElement("div");
  host.className = "pdf-capture-host";
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:0;top:0;width:816px;background:#fff;z-index:-1;opacity:0.01;pointer-events:none;overflow:visible";

  const styleEl = document.createElement("style");
  styleEl.textContent = styleText;
  host.appendChild(styleEl);

  const content = document.createElement("div");
  content.innerHTML = frameDoc.body.innerHTML;
  host.appendChild(content);

  document.body.appendChild(host);

  return {
    host,
    cleanup: () => host.parentNode?.removeChild(host),
  };
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

/** Generates and downloads a PDF file from HTML (no print dialog). */
export async function downloadHtmlAsPdf(html: string, filename: string): Promise<void> {
  const pdfName = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  const frame = await loadHtmlInHiddenFrame(html);
  const { host, cleanup: cleanupHost } = mountCaptureHost(frame);

  try {
    await waitForImages(host);

    const html2pdf = (await import("html2pdf.js")).default;
    const captureTarget = host.querySelector(".doc") ?? host.lastElementChild ?? host;

    await html2pdf()
      .set({
        margin: [0.45, 0.5, 0.45, 0.5],
        filename: pdfName,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          logging: false,
          scrollX: 0,
          scrollY: -window.scrollY,
          backgroundColor: "#ffffff",
        },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(captureTarget as HTMLElement)
      .save();
  } catch {
    throw new Error("Could not download PDF.");
  } finally {
    cleanupHost();
    removePrintFrame(frame);
  }
}
