import type {
  ConnectionRequestResponse,
  ConnectionStatus,
} from "./types";

export type ConnectionRequestOutcome = {
  status: ConnectionStatus;
  toastTitle: string;
  statusLabel: string;
  isConnected: boolean;
};

export function connectionRequestOutcome(
  response: ConnectionRequestResponse,
): ConnectionRequestOutcome {
  if (response.status === "connected") {
    return {
      status: response.status,
      toastTitle: "Connected",
      statusLabel: "Connected",
      isConnected: true,
    };
  }

  if (response.status === "pending_outgoing") {
    return {
      status: response.status,
      toastTitle: "Connection request sent",
      statusLabel: "Requested",
      isConnected: false,
    };
  }

  return {
    status: response.status,
    toastTitle: "Connection updated",
    statusLabel: "Updated",
    isConnected: false,
  };
}
