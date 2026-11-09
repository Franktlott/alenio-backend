import type { ConnectionStatus, PersonSearchResult } from "./types";

export type NewDmRowAction = "message" | "connect" | "accept" | "requested";

export function resolveNewDmRowAction(
  person: Pick<PersonSearchResult, "connectionStatus" | "canMessage">,
): NewDmRowAction {
  if (person.connectionStatus === "pending_incoming") return "accept";
  if (person.connectionStatus === "pending_outgoing") return "requested";
  if (person.connectionStatus === "connected" || person.canMessage) return "message";
  return "connect";
}

export function connectionStatusAfterAction(
  action: "request" | "accept",
  responseStatus: ConnectionStatus,
): Pick<PersonSearchResult, "connectionStatus" | "canMessage"> {
  const connectionStatus =
    action === "accept" ? "connected" : responseStatus;
  return {
    connectionStatus,
    canMessage: connectionStatus === "connected",
  };
}
