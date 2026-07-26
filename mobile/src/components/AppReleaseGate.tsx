import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { AppUpdateModal } from "@/components/AppUpdateModal";
import { WhatsNewModal } from "@/components/WhatsNewModal";
import {
  dismissSoftUpdate,
  getInstalledAppVersion,
  isBehindLatest,
  isBelowMinimum,
  wasSoftUpdateDismissed,
  type AppVersionInfo,
} from "@/lib/app-version";
import {
  markWhatsNewSeen,
  resolveWhatsNewPrompt,
  type WhatsNewEntry,
} from "@/lib/whats-new";

type SoftState = {
  info: AppVersionInfo;
  currentVersion: string;
} | null;

type WhatsNewState = {
  version: string;
  entry: WhatsNewEntry;
} | null;

/**
 * Force update > soft update > What’s New. Only one surface at a time.
 */
export function AppReleaseGate({ enabled }: { enabled: boolean }) {
  const currentVersion = getInstalledAppVersion();
  const [soft, setSoft] = useState<SoftState>(null);
  const [whatsNew, setWhatsNew] = useState<WhatsNewState>(null);

  const { data: versionInfo } = useQuery({
    queryKey: ["app-version"],
    queryFn: () => api.get<AppVersionInfo>("/api/app-version"),
    enabled,
    staleTime: 1000 * 60 * 30,
    refetchOnMount: true,
  });

  useEffect(() => {
    if (!enabled || !versionInfo) return;
    let cancelled = false;

    void (async () => {
      if (isBelowMinimum(currentVersion, versionInfo)) {
        if (!cancelled) {
          setSoft(null);
          setWhatsNew(null);
        }
        return;
      }

      if (isBehindLatest(currentVersion, versionInfo) && versionInfo.latestVersion) {
        const dismissed = await wasSoftUpdateDismissed(versionInfo.latestVersion);
        if (cancelled) return;
        if (!dismissed) {
          setSoft({ info: versionInfo, currentVersion });
          setWhatsNew(null);
          return;
        }
      }

      const prompt = await resolveWhatsNewPrompt();
      if (cancelled) return;
      setSoft(null);
      setWhatsNew(prompt);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, versionInfo, currentVersion]);

  const forced =
    !!versionInfo && isBelowMinimum(currentVersion, versionInfo);

  return (
    <>
      <AppUpdateModal
        visible={forced || !!soft}
        forced={forced}
        info={forced && versionInfo ? versionInfo : soft?.info ?? {
          latestVersion: null,
          minimumVersion: "0.0.0",
          iosStoreUrl: null,
          androidStoreUrl: null,
          updateTitle: null,
          bullets: [],
        }}
        currentVersion={currentVersion}
        onDismiss={
          forced
            ? undefined
            : () => {
                const latest = soft?.info.latestVersion;
                setSoft(null);
                if (latest) {
                  void dismissSoftUpdate(latest).then(async () => {
                    const prompt = await resolveWhatsNewPrompt();
                    setWhatsNew(prompt);
                  });
                }
              }
        }
      />
      <WhatsNewModal
        visible={!forced && !soft && !!whatsNew}
        version={whatsNew?.version ?? currentVersion}
        entry={
          whatsNew?.entry ?? {
            title: "What’s new",
            bullets: [],
          }
        }
        onDismiss={() => {
          if (whatsNew) void markWhatsNewSeen(whatsNew.version);
          setWhatsNew(null);
        }}
      />
    </>
  );
}
