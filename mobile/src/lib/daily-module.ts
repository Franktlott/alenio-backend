import { NativeModules } from "react-native";

/**
 * Daily builds a native event emitter the moment it is imported, so an app
 * binary compiled without WebRTC throws before any of our code runs. The only
 * safe order is to ask whether the native side is there, then import.
 */
export function isVideoCallingSupported(): boolean {
  return NativeModules.WebRTCModule != null;
}
