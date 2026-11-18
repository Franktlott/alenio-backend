import { useEffect, useId, useRef, useState } from "react";
import { getWebApiBase } from "../lib/api-base";

type SignupProtection = {
  captchaRequired: boolean;
  provider: "cloudflare-turnstile" | null;
  siteKey: string | null;
};

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;
  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-alenio-turnstile="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Turnstile failed to load")));
      if (window.turnstile) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.alenioTurnstile = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.appendChild(script);
  });
  return turnstileScriptPromise;
}

export async function fetchSignupProtection(): Promise<SignupProtection> {
  try {
    const res = await fetch(`${getWebApiBase()}/api/signup-protection`, {
      method: "GET",
      credentials: "omit",
    });
    if (!res.ok) {
      return { captchaRequired: false, provider: null, siteKey: null };
    }
    const data = (await res.json()) as SignupProtection;
    return {
      captchaRequired: Boolean(data.captchaRequired && data.siteKey),
      provider: data.provider ?? null,
      siteKey: data.siteKey ?? null,
    };
  } catch {
    return { captchaRequired: false, provider: null, siteKey: null };
  }
}

export function TurnstileCaptcha({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string | null) => void;
  resetKey?: number;
}) {
  const hostId = useId();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [required, setRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const protection = await fetchSignupProtection();
      if (cancelled) return;
      if (!protection.captchaRequired || !protection.siteKey) {
        setRequired(false);
        onToken(null);
        return;
      }
      setRequired(true);
      try {
        await loadTurnstileScript();
        if (cancelled || !hostRef.current || !window.turnstile) return;
        if (widgetIdRef.current) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
        hostRef.current.innerHTML = "";
        widgetIdRef.current = window.turnstile.render(hostRef.current, {
          sitekey: protection.siteKey,
          callback: (token) => onToken(token),
          "error-callback": () => {
            onToken(null);
            setError("Security check failed. Please try again.");
          },
          "expired-callback": () => onToken(null),
          theme: "light",
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Security check failed to load.");
        onToken(null);
      }
    })();
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!required && !error) return null;

  return (
    <div className="auth-turnstile" data-testid="turnstile-captcha">
      <div id={hostId} ref={hostRef} />
      {error ? <p className="auth-error" style={{ marginTop: 8 }}>{error}</p> : null}
    </div>
  );
}
