import type { ProbeAdapter } from "./ProbeAdapter";
import { ProbeSession } from "./ProbeSession";
import { ProbeStore } from "./ProbeStore";
import {
  ReconnectPolicy,
  type ReconnectPolicyOptions,
} from "./ReconnectPolicy";
import {
  ReadingValidator,
  type ReadingValidatorOptions,
} from "./ReadingValidator";

export type CreateProbeSystemOptions = {
  adapter: ProbeAdapter;
  store?: ProbeStore;
  validator?: ReadingValidator | ReadingValidatorOptions;
  reconnectPolicy?: ReconnectPolicy | ReconnectPolicyOptions;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

export type ProbeSystem = {
  session: ProbeSession;
  store: ProbeStore;
  adapter: ProbeAdapter;
  validator: ReadingValidator;
  reconnectPolicy: ReconnectPolicy;
  dispose: () => void;
};

/** Wire adapter + store + session with sensible defaults. */
export function createProbeSystem(options: CreateProbeSystemOptions): ProbeSystem {
  const store = options.store ?? new ProbeStore();
  const validator =
    options.validator instanceof ReadingValidator
      ? options.validator
      : new ReadingValidator(options.validator);
  const reconnectPolicy =
    options.reconnectPolicy instanceof ReconnectPolicy
      ? options.reconnectPolicy
      : new ReconnectPolicy(options.reconnectPolicy);

  const session = new ProbeSession({
    adapter: options.adapter,
    store,
    validator,
    reconnectPolicy,
    setTimeoutFn: options.setTimeoutFn,
    clearTimeoutFn: options.clearTimeoutFn,
  });

  return {
    session,
    store,
    adapter: options.adapter,
    validator,
    reconnectPolicy,
    dispose: () => session.dispose(),
  };
}
