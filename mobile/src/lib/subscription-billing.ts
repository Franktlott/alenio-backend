/**
 * Secure billing WebView URL allowlist (Stripe checkout/portal + return URLs).
 */

export function isStripePortalEmbedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    if (h === "stripe.com" || h.endsWith(".stripe.com")) return true;
    if (h === "stripe.network" || h.endsWith(".stripe.network")) return true;
    if (h === "billing.stripe.com" || h.endsWith(".billing.stripe.com")) return true;
    return false;
  } catch {
    return false;
  }
}

/** Stripe checkout/portal plus Alenio web billing return pages. */
export function isBillingWebViewUrl(url: string): boolean {
  if (isStripePortalEmbedUrl(url)) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    if (h === "alenio.app" && (u.pathname === "/billing" || u.pathname.startsWith("/billing/"))) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function billingFlowCompleteFromUrl(url: string): "success" | "cancel" | null {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    if (h !== "alenio.app") return null;
    if (!u.pathname.startsWith("/billing")) return null;
    const flash = u.searchParams.get("billing");
    if (flash === "success") return "success";
    if (flash === "cancel") return "cancel";
    return null;
  } catch {
    return null;
  }
}
