import { currentCorrelationId } from "./correlation";
import type { AuthzAction, AuthzDecision, AuthzResourceRef } from "./types";

export function logAuthz(input: {
  actorUserId: string;
  action: AuthzAction;
  resource: AuthzResourceRef;
  decision: AuthzDecision;
}): void {
  const payload = {
    type: "authz",
    correlationId: currentCorrelationId(),
    actorUserId: input.actorUserId,
    action: input.action,
    resourceType: input.resource.type,
    resourceId: input.resource.id,
    workspaceId: input.decision.workspaceId,
    allow: input.decision.allow,
    code: input.decision.allow ? "ALLOW" : input.decision.code,
  };
  console.info("[authz]", JSON.stringify(payload));
}
