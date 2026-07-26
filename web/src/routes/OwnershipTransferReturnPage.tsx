import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { completeOwnershipTransferPayment } from "../lib/api";

type Status = "working" | "done" | "needs_card" | "canceled" | "error";

function StatusIcon({ status }: { status: Status }) {
  if (status === "working") {
    return (
      <span className="ownership-return-icon ownership-return-icon--working" aria-hidden>
        <span className="ownership-return-spinner" />
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="ownership-return-icon ownership-return-icon--done" aria-hidden>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12.5 9.5 17 19 7.5"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (status === "needs_card" || status === "canceled") {
    return (
      <span className="ownership-return-icon ownership-return-icon--paused" aria-hidden>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <rect x="2.5" y="6" width="19" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
          <path d="M2.5 10.5h19" stroke="currentColor" strokeWidth="1.75" />
          <path d="M6.5 14.5h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="ownership-return-icon ownership-return-icon--error" aria-hidden>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
        <path d="M12 8v5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <circle cx="12" cy="16" r="1" fill="currentColor" />
      </svg>
    </span>
  );
}

function copyFor(status: Status, message: string): { eyebrow: string; title: string; body: string } {
  if (status === "working") {
    return {
      eyebrow: "Ownership transfer",
      title: "Confirming your payment method",
      body: "Hang tight — we’re verifying the new card with Stripe before finishing the transfer.",
    };
  }
  if (status === "done") {
    return {
      eyebrow: "You’re all set",
      title: "You’re the new workspace owner",
      body: "Billing is now on your card. Taking you to Team…",
    };
  }
  if (status === "canceled") {
    return {
      eyebrow: "Setup paused",
      title: "Card setup was canceled",
      body: "Ownership hasn’t transferred yet. Add your card whenever you’re ready — the request stays open.",
    };
  }
  if (status === "needs_card") {
    return {
      eyebrow: "One more step",
      title: "Add a new payment method",
      body: message,
    };
  }
  return {
    eyebrow: "Something went wrong",
    title: "Couldn’t finish the transfer",
    body: message,
  };
}

/**
 * Stripe Checkout return surface for ownership REPLACE billing.
 * Full-screen status moment — not a sparse utility card.
 */
export function OwnershipTransferReturnPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);
  const [status, setStatus] = useState<Status>("working");
  const [message, setMessage] = useState("");
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
      setMessage("Missing transfer details. Open notifications and try again from there.");
      return;
    }

    if (billing === "cancel") {
      setStatus("canceled");
      // Offer resume checkout so cancel isn’t a dead end.
      void (async () => {
        try {
          const res = await completeOwnershipTransferPayment(teamId, transferId);
          if (res.data.completed) {
            setStatus("done");
            window.setTimeout(() => navigate("/team", { replace: true }), 1400);
            return;
          }
          if (res.data.paymentSetupUrl) setSetupUrl(res.data.paymentSetupUrl);
        } catch {
          /* keep canceled state; Team is still available */
        }
      })();
      return;
    }

    void (async () => {
      try {
        const res = await completeOwnershipTransferPayment(teamId, transferId, {
          sessionId: sessionId || undefined,
        });
        if (res.data.completed) {
          setStatus("done");
          window.setTimeout(() => navigate("/team", { replace: true }), 1600);
          return;
        }
        setStatus("needs_card");
        setMessage(
          "We need a card that isn’t already on this workspace. Add yours to finish becoming owner.",
        );
        setSetupUrl(res.data.paymentSetupUrl);
      } catch (e) {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Could not finish the transfer.");
      }
    })();
  }, [billing, navigate, sessionId, teamId, transferId]);

  const copy = copyFor(status, message);
  const primaryHref = setupUrl;
  const showPrimary = Boolean(primaryHref) && (status === "canceled" || status === "needs_card");

  return (
    <div className="ownership-return" data-testid="ownership-transfer-return" data-status={status}>
      <div className="ownership-return-glow" aria-hidden />
      <div className="ownership-return-panel">
        <div className="ownership-return-brand">
          <img src="/icon.png" alt="" width={36} height={36} />
          <span>Alenio</span>
        </div>

        <StatusIcon status={status} />

        <p className="ownership-return-eyebrow">{copy.eyebrow}</p>
        <h1 className="ownership-return-title">{copy.title}</h1>
        <p
          className="ownership-return-body"
          role={status === "error" ? "alert" : undefined}
        >
          {copy.body}
        </p>

        <div className="ownership-return-actions">
          {showPrimary && primaryHref ? (
            <a className="ownership-return-primary" href={primaryHref}>
              {status === "canceled" ? "Continue card setup" : "Add payment method"}
            </a>
          ) : null}
          {status === "working" || status === "done" ? null : (
            <Link className="ownership-return-secondary" to="/team">
              Return to Team
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
