import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

type CorrelationStore = { correlationId: string };

const storage = new AsyncLocalStorage<CorrelationStore>();

export function createCorrelationId(incoming?: string | null): string {
  const trimmed = incoming?.trim();
  return trimmed && trimmed.length > 0 && trimmed.length <= 128
    ? trimmed
    : randomUUID();
}

export function runWithCorrelation<T>(correlationId: string, fn: () => T): T {
  return storage.run({ correlationId }, fn);
}

export function currentCorrelationId(): string | null {
  return storage.getStore()?.correlationId ?? null;
}
