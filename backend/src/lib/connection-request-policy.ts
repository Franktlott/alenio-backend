export type ConnectionRequestState =
  | "none"
  | "accepted"
  | "pending_outgoing"
  | "pending_incoming"
  | "declined"
  | "reconnect_required";

export const DECLINED_CONNECTION_COOLDOWN_DAYS = 30;
export const CONNECTION_REQUEST_COOLDOWN_CODE = "CONNECTION_REQUEST_COOLDOWN";

export type ConnectionRequestDecision =
  | { action: "none"; responseStatus: "connected" | "pending_outgoing" }
  | {
      action: "blocked";
      code: typeof CONNECTION_REQUEST_COOLDOWN_CODE;
      remainingSeconds: number;
      retryAt: Date;
    }
  | {
      action: "create";
      nextStatus: "accepted" | "pending";
      responseStatus: "connected" | "pending_outgoing";
    }
  | {
      action: "update";
      nextStatus: "accepted" | "pending";
      resetDirection: boolean;
      responseStatus: "connected" | "pending_outgoing";
    };

/**
 * Shared workspace membership is trust evidence for this request only. It does
 * not create, remove, or otherwise couple the underlying workspace membership.
 */
export function decideConnectionRequest(
  state: ConnectionRequestState,
  sharesWorkspace: boolean,
  options: {
    declinedAt?: Date | null;
    now?: Date;
  } = {},
): ConnectionRequestDecision {
  if (state === "accepted") {
    return { action: "none", responseStatus: "connected" };
  }

  if (state === "declined" && options.declinedAt) {
    const now = options.now ?? new Date();
    const retryAt = new Date(
      options.declinedAt.getTime() +
        DECLINED_CONNECTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
    );
    const remainingMilliseconds = retryAt.getTime() - now.getTime();
    if (remainingMilliseconds > 0) {
      return {
        action: "blocked",
        code: CONNECTION_REQUEST_COOLDOWN_CODE,
        remainingSeconds: Math.ceil(remainingMilliseconds / 1000),
        retryAt,
      };
    }
  }

  // Requesting someone who already requested you remains an explicit accept,
  // regardless of whether the users currently share a workspace.
  if (state === "pending_incoming") {
    return {
      action: "update",
      nextStatus: "accepted",
      resetDirection: false,
      responseStatus: "connected",
    };
  }

  // Blocking deliberately ends the prior relationship. After unblocking, a
  // fresh request and explicit acceptance are required even for coworkers.
  if (state === "reconnect_required") {
    return {
      action: "update",
      nextStatus: "pending",
      resetDirection: true,
      responseStatus: "pending_outgoing",
    };
  }

  if (sharesWorkspace) {
    if (state === "none") {
      return {
        action: "create",
        nextStatus: "accepted",
        responseStatus: "connected",
      };
    }
    return {
      action: "update",
      nextStatus: "accepted",
      resetDirection: state === "declined",
      responseStatus: "connected",
    };
  }

  if (state === "pending_outgoing") {
    return { action: "none", responseStatus: "pending_outgoing" };
  }
  if (state === "none") {
    return {
      action: "create",
      nextStatus: "pending",
      responseStatus: "pending_outgoing",
    };
  }
  return {
    action: "update",
    nextStatus: "pending",
    resetDirection: true,
    responseStatus: "pending_outgoing",
  };
}
