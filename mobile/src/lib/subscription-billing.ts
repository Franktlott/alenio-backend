/**
 * Stripe portal URL allowlist (used only if a secure billing WebView is shown).
 * The store app does not open external checkout or billing links — see plan-access-copy.
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
