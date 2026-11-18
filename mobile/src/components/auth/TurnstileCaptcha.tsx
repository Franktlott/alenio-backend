import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { getBackendUrl } from "@/lib/backend-url";

type SignupProtection = {
  captchaRequired: boolean;
  provider: "cloudflare-turnstile" | null;
  siteKey: string | null;
};

export async function fetchSignupProtection(): Promise<SignupProtection> {
  try {
    const res = await fetch(`${getBackendUrl()}/api/signup-protection`);
    if (!res.ok) return { captchaRequired: false, provider: null, siteKey: null };
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

function turnstileHtml(siteKey: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"></script>
    <style>
      html, body { margin: 0; padding: 0; background: transparent; }
      #wrap { display: flex; justify-content: center; padding: 4px 0; }
    </style>
  </head>
  <body>
    <div id="wrap"><div id="cf-turnstile"></div></div>
    <script>
      function post(type, token) {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, token: token || null }));
      }
      window.addEventListener('load', function () {
        if (!window.turnstile) {
          post('error');
          return;
        }
        window.turnstile.render('#cf-turnstile', {
          sitekey: ${JSON.stringify(siteKey)},
          callback: function (token) { post('token', token); },
          'error-callback': function () { post('error'); },
          'expired-callback': function () { post('expired'); },
          theme: 'light'
        });
      });
    </script>
  </body>
</html>`;
}

export function TurnstileCaptcha({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string | null) => void;
  resetKey?: number;
}) {
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    onToken(null);
    void fetchSignupProtection().then((protection) => {
      if (cancelled) return;
      if (!protection.captchaRequired || !protection.siteKey) {
        setSiteKey(null);
        setLoading(false);
        return;
      }
      setSiteKey(protection.siteKey);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // Intentionally ignore onToken identity; resetKey drives reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const html = useMemo(() => (siteKey ? turnstileHtml(siteKey) : null), [siteKey, resetKey]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data) as { type?: string; token?: string | null };
        if (payload.type === "token" && payload.token) {
          onToken(payload.token);
          setError(null);
          return;
        }
        onToken(null);
        if (payload.type === "error") setError("Security check failed. Please try again.");
      } catch {
        onToken(null);
      }
    },
    [onToken],
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!html) return null;

  return (
    <View style={styles.wrap}>
      <WebView
        key={`turnstile-${resetKey}-${siteKey}`}
        originWhitelist={["*"]}
        source={{ html }}
        onMessage={onMessage}
        style={styles.web}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 72,
    marginBottom: 12,
  },
  web: {
    width: "100%",
    height: 72,
    backgroundColor: "transparent",
  },
  loading: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  error: {
    color: "#B42318",
    fontSize: 13,
    marginTop: 6,
  },
});
