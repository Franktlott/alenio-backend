export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
