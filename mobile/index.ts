import "react-native-get-random-values";
import { randomUUID as expoRandomUUID } from "expo-crypto";

// react-native-get-random-values only sets getRandomValues; some web-oriented libs call crypto.randomUUID().
if (globalThis.crypto && typeof globalThis.crypto.randomUUID !== "function") {
  Object.assign(globalThis.crypto, {
    randomUUID: () => expoRandomUUID(),
  });
}

// Some SDK dependencies call static Response.json(...) (not instance res.json()).
// Hermes / RN runtimes may miss this static helper, causing:
// "Response.json is not a function (it is undefined)".
if (typeof Response !== "undefined" && typeof (Response as any).json !== "function") {
  (Response as any).json = (data: unknown, init?: ResponseInit) => {
    const baseHeaders = init?.headers ?? {};
    const headers = new Headers(baseHeaders as HeadersInit);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return new Response(JSON.stringify(data), {
      ...init,
      headers,
    });
  };
}

import "react-native-reanimated";
import { LogBox } from "react-native";
import "./global.css";
import "expo-router/entry";
LogBox.ignoreLogs(["Expo AV has been deprecated", "Disconnected from Metro"]);
