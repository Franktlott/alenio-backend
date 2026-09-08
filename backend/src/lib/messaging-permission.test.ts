import { describe, expect, test } from "bun:test";
import {
  evaluateMessagePermission,
  evaluateUserSearchMessagePermission,
  type MessagePermission,
  type MessagePermissionFacts,
  type MessagePrivacy,
} from "./messaging-permission";

const privacyValues: MessagePrivacy[] = [
  "everyone",
  "connections_and_shared",
  "connections_only",
];

function expectedPermission(facts: MessagePermissionFacts): MessagePermission {
  if (facts.sameUser) return { allowed: true, reason: "self" };
  if (facts.blocked) return { allowed: false, reason: "blocked" };
  if (facts.reconnectRequired) return { allowed: false, reason: "not_connected" };
  if (facts.recipientPrivacy === "everyone") return { allowed: true, reason: "open_inbox" };
  if (facts.connected) return { allowed: true, reason: "connected" };
  if (facts.recipientPrivacy === "connections_only") {
    return { allowed: false, reason: "not_connected" };
  }
  if (facts.sharedWorkspace) return { allowed: true, reason: "shared_workspace" };
  if (facts.sharedConversation) return { allowed: true, reason: "shared_group" };
  return { allowed: false, reason: "not_connected" };
}

describe("messaging permission matrix", () => {
  for (const recipientPrivacy of privacyValues) {
    for (const connected of [false, true]) {
      for (const sharedWorkspace of [false, true]) {
        for (const sharedConversation of [false, true]) {
          const facts: MessagePermissionFacts = {
            sameUser: false,
            blocked: false,
            recipientPrivacy,
            connected,
            sharedWorkspace,
            sharedConversation,
          };
          test(`${recipientPrivacy}: connected=${connected}, workspace=${sharedWorkspace}, group=${sharedConversation}`, () => {
            expect(evaluateMessagePermission(facts)).toEqual(expectedPermission(facts));
          });
        }
      }
    }
  }

  test("a block wins over every privacy and relationship combination", () => {
    for (const recipientPrivacy of privacyValues) {
      for (const connected of [false, true]) {
        for (const sharedWorkspace of [false, true]) {
          for (const sharedConversation of [false, true]) {
            expect(
              evaluateMessagePermission({
                sameUser: false,
                blocked: true,
                recipientPrivacy,
                connected,
                sharedWorkspace,
                sharedConversation,
              }),
            ).toEqual({ allowed: false, reason: "blocked" });
          }
        }
      }
    }
  });

  test("self messaging remains allowed", () => {
    expect(
      evaluateMessagePermission({
        sameUser: true,
        blocked: false,
        recipientPrivacy: "connections_only",
        connected: false,
        sharedWorkspace: false,
        sharedConversation: false,
      }),
    ).toEqual({ allowed: true, reason: "self" });
  });

  test("post-unblock reconnection overrides workspace, conversation, and open inbox access", () => {
    expect(
      evaluateMessagePermission({
        sameUser: false,
        blocked: false,
        reconnectRequired: true,
        recipientPrivacy: "everyone",
        connected: false,
        sharedWorkspace: true,
        sharedConversation: true,
      }),
    ).toEqual({ allowed: false, reason: "not_connected" });
  });

  test("builds global-search permissions from batched relationship facts", () => {
    expect(
      evaluateUserSearchMessagePermission({
        recipientPrivacy: "everyone",
        connected: false,
        sharedWorkspace: false,
        sharedConversation: false,
      }),
    ).toEqual({ allowed: true, reason: "open_inbox" });
    expect(
      evaluateUserSearchMessagePermission({
        recipientPrivacy: "connections_and_shared",
        connected: false,
        sharedWorkspace: true,
        sharedConversation: false,
      }),
    ).toEqual({ allowed: true, reason: "shared_workspace" });
    expect(
      evaluateUserSearchMessagePermission({
        recipientPrivacy: "connections_only",
        connected: false,
        sharedWorkspace: true,
        sharedConversation: true,
      }),
    ).toEqual({ allowed: false, reason: "not_connected" });
    expect(
      evaluateUserSearchMessagePermission({
        recipientPrivacy: "connections_only",
        connected: true,
        sharedWorkspace: false,
        sharedConversation: false,
      }),
    ).toEqual({ allowed: true, reason: "connected" });
  });
});
