import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useMemo } from "react";
import { GoBackendModuleShell } from "../../components/alenio-go/GoBackendModuleShell";
import { GoLinkedDevicesSubnav } from "../../components/alenio-go/linked-devices/GoLinkedDevicesSubnav";
import { LinkedDevicesAccessPanel } from "../../components/alenio-go/linked-devices/LinkedDevicesAccessPanel";
import { LinkedDevicesDisplayPanel } from "../../components/alenio-go/linked-devices/LinkedDevicesDisplayPanel";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

function LinkedDevicesLayout() {
  const ctx = useAlenioGoShell();
  const { canManage, approvals } = ctx;

  const tabs = useMemo(() => {
    const items = [
      {
        id: "access",
        label: "Link & access",
        to: "/go/devices",
        badge: canManage && approvals.total > 0 ? approvals.total : undefined,
      },
    ];
    if (canManage) {
      items.push({ id: "display", label: "Tablet display", to: "/go/devices/display" });
    }
    return items;
  }, [approvals.total, canManage]);

  return (
    <GoBackendModuleShell
      title="Linked devices"
      subtitle={
        canManage
          ? "Link floor tablets, approve access, and customize the associate experience on linked devices."
          : "Link store devices with your workspace code — leaders approve access in Link & access."
      }
      tone="violet"
    >
      <GoLinkedDevicesSubnav tabs={tabs} />
      <Outlet context={ctx} />
    </GoBackendModuleShell>
  );
}

function LinkedDevicesAccessPage() {
  const { teamId, teamName, inviteCode, canManage, approvals } = useAlenioGoShell();
  return (
    <LinkedDevicesAccessPanel
      teamId={teamId}
      teamName={teamName}
      inviteCode={inviteCode}
      canManage={canManage}
      approvals={approvals}
    />
  );
}

function LinkedDevicesDisplayPage() {
  const { teamId, teamName, teamImage, canManage } = useAlenioGoShell();
  if (!canManage) return <Navigate to="/go/devices" replace />;
  if (!teamId) return null;
  return <LinkedDevicesDisplayPanel teamId={teamId} teamName={teamName} teamImage={teamImage} />;
}

export function AlenioGoLinkedDevicesRoutes() {
  return (
    <Routes>
      <Route element={<LinkedDevicesLayout />}>
        <Route index element={<LinkedDevicesAccessPage />} />
        <Route path="display" element={<LinkedDevicesDisplayPage />} />
      </Route>
    </Routes>
  );
}
