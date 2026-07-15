/**
 * Expo's winter fetch crashes when better-fetch passes its full context as
 * RequestInit (`method.toUpperCase` → "undefined is not a function").
 * Use XMLHttpRequest and a minimal Response-like object (no `new Response()`),
 * which Hermes can fail on in some runtimes.
 */

type HeaderMap = Record<string, string>;

function toUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof (input as Request)?.url === "string") return (input as Request).url;
  return String(input);
}

function toMethod(init?: RequestInit & Record<string, unknown>): string {
  const raw = init?.method;
  if (typeof raw === "string" && raw.trim()) return raw.trim().toUpperCase();
  return init?.body != null ? "POST" : "GET";
}

function toHeaderRecord(headers?: HeadersInit): HeaderMap {
  if (!headers) return {};
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    const out: HeaderMap = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([k, v]) => [String(k), String(v)]));
  }
  const out: HeaderMap = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value != null) out[key] = String(value);
  }
  return out;
}

function toBody(body: BodyInit | null | undefined): string | null {
  if (body == null) return null;
  if (typeof body === "string") return body;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return body.toString();
  }
  return String(body);
}

function parseResponseHeaders(raw: string): HeaderMap {
  const out: HeaderMap = {};
  for (const line of (raw || "").trim().split(/[\r\n]+/).filter(Boolean)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key) out[key] = out[key] ? `${out[key]}, ${value}` : value;
  }
  return out;
}

function makeHeaders(map: HeaderMap) {
  return {
    get(name: string) {
      return map[String(name).toLowerCase()] ?? null;
    },
    has(name: string) {
      return Object.prototype.hasOwnProperty.call(map, String(name).toLowerCase());
    },
    forEach(callback: (value: string, key: string) => void) {
      for (const [key, value] of Object.entries(map)) callback(value, key);
    },
    entries() {
      return Object.entries(map)[Symbol.iterator]();
    },
    keys() {
      return Object.keys(map)[Symbol.iterator]();
    },
    values() {
      return Object.values(map)[Symbol.iterator]();
    },
  };
}

function makeResponse(status: number, statusText: string, bodyText: string, headerMap: HeaderMap): Response {
  const headers = makeHeaders(headerMap);
  const response = {
    ok: status >= 200 && status < 300,
    status,
    statusText: statusText || "",
    headers,
    url: "",
    redirected: false,
    type: "basic" as const,
    body: null,
    bodyUsed: false,
    clone() {
      return makeResponse(status, statusText, bodyText, { ...headerMap });
    },
    async text() {
      return bodyText;
    },
    async json() {
      return bodyText ? JSON.parse(bodyText) : null;
    },
    async arrayBuffer() {
      const encoder = new TextEncoder();
      return encoder.encode(bodyText).buffer;
    },
    async blob() {
      return new Blob([bodyText]);
    },
    async formData() {
      throw new TypeError("formData() not supported by safeFetch");
    },
  };
  return response as unknown as Response;
}

/** Fetch compatible with better-auth / better-fetch, backed by XMLHttpRequest. */
export function safeFetch(
  input: RequestInfo | URL,
  init?: RequestInit & Record<string, unknown>,
): Promise<Response> {
  const url = toUrl(input);
  const method = toMethod(init);
  const headerRecord = toHeaderRecord(init?.headers);
  const body = method === "GET" || method === "HEAD" ? null : toBody(init?.body as BodyInit | null | undefined);

  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);

      if (init?.credentials === "include") {
        xhr.withCredentials = true;
      }

      for (const [key, value] of Object.entries(headerRecord)) {
        try {
          xhr.setRequestHeader(key, value);
        } catch {
          /* ignore forbidden headers */
        }
      }

      const signal = init?.signal;
      const onAbort = () => {
        xhr.abort();
        reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      xhr.onload = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve(
          makeResponse(
            xhr.status === 0 ? 200 : xhr.status,
            xhr.statusText,
            xhr.responseText ?? "",
            parseResponseHeaders(xhr.getAllResponseHeaders() || ""),
          ),
        );
      };

      xhr.onerror = () => {
        signal?.removeEventListener("abort", onAbort);
        reject(new TypeError(`Network request failed (${method} ${url})`));
      };

      xhr.ontimeout = () => {
        signal?.removeEventListener("abort", onAbort);
        reject(new TypeError("Network request timed out"));
      };

      xhr.send(body);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
