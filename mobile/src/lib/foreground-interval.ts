export type ForegroundIntervalController = {
  setEnabled: (enabled: boolean) => void;
  stop: () => void;
};

type TimerHandle = ReturnType<typeof setInterval>;

export function createForegroundIntervalController({
  task,
  intervalMs,
}: {
  task: () => Promise<unknown>;
  intervalMs: number;
}): ForegroundIntervalController {
  let enabled = false;
  let inFlight = false;
  let timer: TimerHandle | null = null;

  const run = async () => {
    if (!enabled || inFlight) return;
    inFlight = true;
    try {
      await task();
    } catch {
      // Foreground maintenance must never interrupt the user experience.
    } finally {
      inFlight = false;
    }
  };

  const stopTimer = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };

  const setEnabled = (nextEnabled: boolean) => {
    if (enabled === nextEnabled) return;
    enabled = nextEnabled;
    stopTimer();
    if (!enabled) return;

    void run();
    timer = setInterval(() => {
      void run();
    }, intervalMs);
  };

  return {
    setEnabled,
    stop: () => {
      enabled = false;
      stopTimer();
    },
  };
}
