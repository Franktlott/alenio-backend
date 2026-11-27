import { useSyncExternalStore } from "react";

/**
 * Height of the purple tab header band, mirrored into the Duo status column
 * so the color runs straight across under the clock at the same height.
 */
let bleedHeight = 0;
const listeners = new Set<() => void>();

export function setDuoHeaderBleedHeight(height: number): void {
  const next = Math.max(0, Math.round(height));
  if (Math.abs(bleedHeight - next) < 1) return;
  bleedHeight = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): number {
  return bleedHeight;
}

export function useDuoHeaderBleedHeight(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
