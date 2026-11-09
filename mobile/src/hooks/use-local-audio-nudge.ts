import { useEffect, useRef, useState } from "react";
import type {
  DailyCall,
  DailyEventObjectLocalAudioLevel,
} from "@daily-co/react-native-daily-js";
import {
  initialAudioNudgeState,
  nextAudioNudge,
  type AudioNudge,
} from "@/lib/call-audio-nudge";

const OBSERVER_INTERVAL_MS = 200;

type Options = {
  getCall: () => DailyCall | null;
  /** True only while Daily transcription is actually running. */
  enabled: boolean;
  muted: boolean;
};

/**
 * Watches this phone's microphone during live notes and returns a local-only
 * prompt when the person is muted or talking too quietly for a good transcript.
 */
export function useLocalAudioNudge({
  getCall,
  enabled,
  muted,
}: Options): AudioNudge {
  const [nudge, setNudge] = useState<AudioNudge>(null);
  const stateRef = useRef(initialAudioNudgeState());
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) {
      stateRef.current = initialAudioNudgeState();
      setNudge(null);
      return;
    }
    const next = nextAudioNudge(stateRef.current, {
      level: 0,
      muted,
      atMs: Date.now(),
    });
    stateRef.current = next;
    setNudge(next.nudge);
  }, [enabled, muted]);

  useEffect(() => {
    const call = getCall();
    if (!enabled || !call) return;

    const onLevel = (event?: DailyEventObjectLocalAudioLevel) => {
      if (!enabledRef.current) return;
      const next = nextAudioNudge(stateRef.current, {
        level: event?.audioLevel ?? 0,
        muted: mutedRef.current,
        atMs: Date.now(),
      });
      stateRef.current = next;
      setNudge(next.nudge);
    };

    call.on("local-audio-level", onLevel);
    if (!call.isLocalAudioLevelObserverRunning()) {
      void call.startLocalAudioLevelObserver(OBSERVER_INTERVAL_MS).catch(() => {
        /* the muted prompt still works without a meter */
      });
    }

    return () => {
      call.off("local-audio-level", onLevel);
      try {
        if (call.isLocalAudioLevelObserverRunning()) {
          call.stopLocalAudioLevelObserver();
        }
      } catch {
        /* the call may already have ended */
      }
    };
  }, [enabled, getCall]);

  return enabled ? nudge : null;
}
