import { useCallback, useEffect, useRef, useState } from "react";
import { AUTH_LOADING_STEPS } from "./types";

const STEP_MS = 780;

/**
 * Drives the checklist sequence in parallel with real auth work.
 * Resolves when both the visual steps and the provided auth promise have finished.
 */
export function useAuthLoadingSequence() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const runWithAuth = useCallback(
    async <T,>(authWork: () => Promise<T>): Promise<T> => {
      clearTimers();
      setActiveIndex(0);
      setAllDone(false);
      setExiting(false);

      const stepsPromise = new Promise<void>((resolve) => {
        AUTH_LOADING_STEPS.forEach((_, index) => {
          if (index === 0) return;
          const t = setTimeout(() => setActiveIndex(index), STEP_MS * index);
          timersRef.current.push(t);
        });
        const doneTimer = setTimeout(
          () => {
            setAllDone(true);
            resolve();
          },
          STEP_MS * AUTH_LOADING_STEPS.length,
        );
        timersRef.current.push(doneTimer);
      });

      const [result] = await Promise.all([authWork(), stepsPromise]);
      setAllDone(true);
      setExiting(true);
      await new Promise((r) => setTimeout(r, 250));
      return result;
    },
    [clearTimers],
  );

  return { activeIndex, allDone, exiting, runWithAuth };
}
