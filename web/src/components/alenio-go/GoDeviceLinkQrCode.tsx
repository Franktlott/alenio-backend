import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Props = {
  url: string;
  label?: string;
};

export function GoDeviceLinkQrCode({ url, label = "Scan to open linking page on this tablet" }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(url, {
      width: 220,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((value) => {
        if (!cancelled) {
          setDataUrl(value);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not generate QR code.");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return <p className="go-backend-setup-qr-error">{error}</p>;
  }

  if (!dataUrl) {
    return <p className="go-backend-setup-qr-loading">Generating QR code…</p>;
  }

  return (
    <div className="go-backend-setup-qr">
      <img src={dataUrl} width={220} height={220} alt={label} className="go-backend-setup-qr-image" />
      <p className="go-backend-setup-qr-label">{label}</p>
      <p className="go-backend-setup-qr-url">{url.replace(/^https?:\/\//, "")}</p>
    </div>
  );
}

export function buildGoDeviceLinkUrl(inviteCode?: string | null): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://alenio.com";
  const base = `${origin}/aleniogo`;
  if (!inviteCode?.trim()) return base;
  return `${base}?code=${encodeURIComponent(inviteCode.trim().toUpperCase())}`;
}
