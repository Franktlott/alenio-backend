import type { Conversation } from "@/lib/types";
import { dmOtherParticipant } from "@/lib/user-avatar";

/** Open 1:1 thread with this person, if one already exists. */
export function existingDirectConversation(
  conversations: Conversation[],
  personId: string,
  currentUserId: string,
) {
  return (
    conversations.find((conversation) => {
      if (conversation.isGroup) return false;
      return dmOtherParticipant(conversation, currentUserId)?.id === personId;
    }) ?? null
  );
}
