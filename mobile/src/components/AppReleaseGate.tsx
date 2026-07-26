import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { AppUpdateModal } from "@/components/AppUpdateModal";
import {
  dismissSoftUpdate,
  getInstalledAppVersion,
  isBehindLatest,
  isBelowMinimum,
  wasSoftUpdateDismissed,
  type AppVersionInfo,
} from "@/lib/app-version";

type SoftState = {
  info: AppVersionInfo;
  currentVersion: string;
} | null;

/** Soft update nudge + optional force-update gate. Notes come from Railway. */
export function AppReleaseGate({ enabled }: { enabled: boolean }) {
  const currentVersion = getInstalledAppVersion();
  const [soft, setSoft] = useState<SoftState>(null);

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
        if (!cancelled) setSoft(null);
        return;
      }

      if (isBehindLatest(currentVersion, versionInfo) && versionInfo.latestVersion) {
        const dismissed = await wasSoftUpdateDismissed(versionInfo.latestVersion);
        if (cancelled) return;
        if (!dismissed) {
          setSoft({ info: versionInfo, currentVersion });
          return;
        }
      }

      if (!cancelled) setSoft(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, versionInfo, currentVersion]);

  const forced = !!versionInfo && isBelowMinimum(currentVersion, versionInfo);

  return (
    <AppUpdateModal
      visible={forced || !!soft}
      forced={forced}
      info={
        forced && versionInfo
          ? versionInfo
          : soft?.info ?? {
              latestVersion: null,
              minimumVersion: "0.0.0",
              iosStoreUrl: null,
              androidStoreUrl: null,
              updateTitle: null,
              bullets: [],
            }
      }
      currentVersion={currentVersion}
      onDismiss={
        forced
          ? undefined
          : () => {
              const latest = soft?.info.latestVersion;
              setSoft(null);
              if (latest) void dismissSoftUpdate(latest);
            }
      }
    />
  );
}
