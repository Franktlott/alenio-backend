import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Check-in templates are no longer part of the product. Every check-in uses
 * the fixed write-up, so old links land on workspace settings instead.
 */
export default function CheckInTemplateEditorRedirect() {
  const params = useLocalSearchParams<{ teamId?: string }>();
  const teamId = Array.isArray(params.teamId) ? params.teamId[0] : params.teamId;
  return (
    <Redirect
      href={{
        pathname: "/workspace-settings",
        params: teamId ? { teamId } : {},
      }}
    />
  );
}
