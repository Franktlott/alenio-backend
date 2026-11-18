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
      size?: "normal" | "flexible" | "compact";
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
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;
  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-alenio-turnstile="1"]');
    if (existing) {
      if (window.turnstile) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Turnstile failed to load")), {
        once: true,
      });
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
  onRequiredChange,
  resetKey = 0,
}: {
  onToken: (token: string | null) => void;
  onRequiredChange?: (required: boolean) => void;
  resetKey?: number;
}) {
  const hostId = useId();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [readyToRender, setReadyToRender] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1) Discover whether captcha is required and keep the host node mounted.
  useEffect(() => {
    let cancelled = false;
    setReadyToRender(false);
    setSiteKey(null);
    onToken(null);
    void fetchSignupProtection().then((protection) => {
      if (cancelled) return;
      const required = Boolean(protection.captchaRequired && protection.siteKey);
      onRequiredChange?.(required);
      if (!required || !protection.siteKey) {
        setSiteKey(null);
        setReadyToRender(false);
        return;
      }
      setSiteKey(protection.siteKey);
      setReadyToRender(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // 2) Render Turnstile only after the host div is in the DOM.
  useEffect(() => {
    if (!readyToRender || !siteKey) return;
    let cancelled = false;

    void (async () => {
      try {
        await loadTurnstileScript();
        if (cancelled) return;

        // Wait a frame so ref is attached after required UI mounts.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (cancelled || !hostRef.current || !window.turnstile) {
          if (!cancelled) {
            setError("Security check could not start. Refresh and try again.");
          }
          return;
        }

        if (widgetIdRef.current) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
        hostRef.current.innerHTML = "";
        widgetIdRef.current = window.turnstile.render(hostRef.current, {
          sitekey: siteKey,
          callback: (token) => {
            setError(null);
            onToken(token);
          },
          "error-callback": () => {
            onToken(null);
            setError("Security check failed. Please try again.");
          },
          "expired-callback": () => onToken(null),
          theme: "light",
          size: "flexible",
        });
        setError(null);
      } catch (err) {
        if (cancelled) return;
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
  }, [readyToRender, siteKey, resetKey]);

  if (!readyToRender && !error) return null;

  return (
    <div className="auth-turnstile" data-testid="turnstile-captcha">
      <div id={hostId} ref={hostRef} />
      {error ? (
        <p className="auth-error" style={{ marginTop: 8 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
