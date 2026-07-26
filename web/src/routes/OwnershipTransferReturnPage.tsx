import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { completeOwnershipTransferPayment } from "../lib/api";

/**
 * Stripe Checkout setup return URL for ownership transfer REPLACE billing path.
 * Completes the transfer only when a new payment method was actually added.
 */
export function OwnershipTransferReturnPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);
  const [status, setStatus] = useState<"working" | "done" | "needs_card" | "canceled" | "error">("working");
  const [message, setMessage] = useState("Finishing ownership transfer…");
  const [setupUrl, setSetupUrl] = useState<string | null>(null);

  const teamId = (params.get("teamId") ?? "").trim();
  const transferId = (params.get("transferId") ?? "").trim();
  const billing = (params.get("billing") ?? "").trim();
  const sessionId = (params.get("session_id") ?? "").trim();

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!teamId || !transferId) {
      setStatus("error");
      setMessage("Missing transfer details. Open notifications and try again.");
      return;
    }

    if (billing === "cancel") {
      setStatus("canceled");
      setMessage("Card setup was canceled. Ownership has not transferred yet.");
      return;
    }

    void (async () => {
      try {
        const res = await completeOwnershipTransferPayment(teamId, transferId, {
          sessionId: sessionId || undefined,
        });
        if (res.data.completed) {
          setStatus("done");
          setMessage("You’re now the workspace owner. Billing is on your new card.");
          window.setTimeout(() => navigate("/team", { replace: true }), 1600);
          return;
        }
        setStatus("needs_card");
        setMessage(
          "We still need a new payment method that isn’t already on this workspace. Add your card to finish.",
        );
        setSetupUrl(res.data.paymentSetupUrl);
      } catch (e) {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Could not finish the transfer.");
      }
    })();
  }, [billing, navigate, sessionId, teamId, transferId]);

  return (
    <div className="enterprise-page enterprise-ownership-return">
      <div className="enterprise-card" style={{ maxWidth: 480, margin: "48px auto", padding: 24 }}>
        <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Ownership transfer</h1>
        <p className="enterprise-muted" role={status === "error" ? "alert" : undefined}>
          {message}
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          {setupUrl ? (
            <a className="enterprise-modal-primary-btn" href={setupUrl}>
              Add payment method
            </a>
          ) : null}
          <Link className="enterprise-team-pending-btn enterprise-team-pending-btn-ghost" to="/team">
            Back to Team
          </Link>
          <Link className="enterprise-team-pending-btn enterprise-team-pending-btn-ghost" to="/dashboard">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
