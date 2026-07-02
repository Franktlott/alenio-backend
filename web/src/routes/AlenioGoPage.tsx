import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlenioGoLogo } from "../components/AlenioGoLogo";
import { loadGoLinkedWorkspace } from "../lib/go-device";

/** Public entry — Alenio Go is front-end only (device linking + kiosk hub). */
export function AlenioGoPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const linked = loadGoLinkedWorkspace();
    if (linked?.hubToken) {
      navigate(`/checklist/${linked.hubToken}`, { replace: true });
      return;
    }
    navigate("/aleniogo", { replace: true });
  }, [navigate]);

  return (
    <div className="alenio-go-link-page" data-testid="alenio-go-redirect">
      <div className="alenio-go-link-card">
        <AlenioGoLogo variant="page" className="alenio-go-link-logo" />
        <p className="alenio-go-link-status">Loading Alenio Go…</p>
      </div>
    </div>
  );
}
