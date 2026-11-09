export const MEETING_REACTIONS = ["👍", "👏", "❤️", "😂", "🎉"] as const;

export type MeetingReaction = (typeof MEETING_REACTIONS)[number];

export type MeetingSignal =
  | {
      type: "reaction";
      reaction: MeetingReaction;
      senderName: string;
      sentAt: number;
    }
  | {
      type: "hand";
      raised: boolean;
      senderName: string;
      sentAt: number;
    }
  | {
      type: "end-for-all";
      sentAt: number;
    };

export function isMeetingReaction(value: unknown): value is MeetingReaction {
  return MEETING_REACTIONS.includes(value as MeetingReaction);
}

export function parseMeetingSignal(value: unknown): MeetingSignal | null {
  if (!value || typeof value !== "object") return null;
  const signal = value as Record<string, unknown>;
  if (signal.type === "reaction") {
    if (
      !isMeetingReaction(signal.reaction) ||
      typeof signal.senderName !== "string" ||
      typeof signal.sentAt !== "number"
    ) {
      return null;
    }
    return {
      type: "reaction",
      reaction: signal.reaction,
      senderName: signal.senderName,
      sentAt: signal.sentAt,
    };
  }
  if (signal.type === "hand") {
    if (
      typeof signal.raised !== "boolean" ||
      typeof signal.senderName !== "string" ||
      typeof signal.sentAt !== "number"
    ) {
      return null;
    }
    return {
      type: "hand",
      raised: signal.raised,
      senderName: signal.senderName,
      sentAt: signal.sentAt,
    };
  }
  if (signal.type === "end-for-all" && typeof signal.sentAt === "number") {
    return { type: "end-for-all", sentAt: signal.sentAt };
  }
  return null;
}

export function selectFeaturedParticipantId({
  pinnedParticipantId,
  activeSpeakerId,
  participantIds,
  stageThreshold = 4,
}: {
  pinnedParticipantId: string | null;
  activeSpeakerId: string | null;
  participantIds: string[];
  stageThreshold?: number;
}): string | null {
  if (
    pinnedParticipantId &&
    participantIds.includes(pinnedParticipantId)
  ) {
    return pinnedParticipantId;
  }
  if (participantIds.length <= stageThreshold) return null;
  if (activeSpeakerId && participantIds.includes(activeSpeakerId)) {
    return activeSpeakerId;
  }
  return participantIds[0] ?? null;
}
