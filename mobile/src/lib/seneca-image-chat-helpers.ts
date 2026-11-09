import type { Conversation } from "./types";

export type DurableSenecaImageMedia = {
  url: string;
  contentType: string;
  sizeBytes: number;
  filename: string;
};

export type SenecaImageSendInput = {
  generationId: string;
  conversationId: string;
  caption: string;
  durableMedia?: DurableSenecaImageMedia | null;
  onDurableMedia?: (media: DurableSenecaImageMedia) => void;
};

export class SenecaImageSendError extends Error {
  constructor(
    public readonly stage: "copy" | "message",
    public readonly originalError: unknown,
  ) {
    super(
      originalError instanceof Error
        ? originalError.message
        : "The image could not be sent.",
    );
    this.name = "SenecaImageSendError";
  }
}

function otherParticipant(
  conversation: Conversation,
  currentUserId: string,
) {
  if (conversation.recipient) return conversation.recipient;
  return conversation.participants?.find(
    (participant) => participant.id !== currentUserId,
  );
}

export function senecaConversationLabel(
  conversation: Conversation,
  currentUserId: string,
): string {
  if (conversation.isGroup || conversation.type === "GROUP") {
    const explicitName = conversation.name?.trim();
    if (explicitName) return explicitName;
    const participantNames = (conversation.participants ?? [])
      .filter((participant) => participant.id !== currentUserId)
      .map((participant) => participant.name?.trim() || participant.email?.trim())
      .filter((name): name is string => Boolean(name));
    return participantNames.join(", ") || "Group conversation";
  }

  const other = otherParticipant(conversation, currentUserId);
  return other?.name?.trim() || other?.email?.trim() || "Direct message";
}

export function filterSenecaConversations(
  conversations: Conversation[],
  query: string,
  currentUserId: string,
): Conversation[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const eligible = conversations.filter(
    (conversation) =>
      conversation.type === undefined ||
      conversation.type === "DIRECT" ||
      conversation.type === "GROUP",
  );
  if (!normalizedQuery) return eligible;

  return eligible.filter((conversation) => {
    const searchable = [
      senecaConversationLabel(conversation, currentUserId),
      conversation.name,
      ...(conversation.participants ?? []).flatMap((participant) => [
        participant.name,
        participant.email,
      ]),
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .toLocaleLowerCase();
    return searchable.includes(normalizedQuery);
  });
}

export function normalizeSenecaImageCaption(caption: string): string | undefined {
  const normalized = caption.trim();
  return normalized || undefined;
}

export function buildSenecaImageMessagePayload(
  durableMediaUrl: string,
  caption: string,
): {
  content?: string;
  mediaUrl: string;
  mediaType: "image";
} {
  const content = normalizeSenecaImageCaption(caption);
  return {
    ...(content ? { content } : {}),
    mediaUrl: durableMediaUrl,
    mediaType: "image",
  };
}

export async function sendSenecaImageWithDurableRetry<T>(
  input: SenecaImageSendInput,
  operations: {
    copyMedia: (generationId: string) => Promise<DurableSenecaImageMedia>;
    sendMessage: (
      conversationId: string,
      payload: ReturnType<typeof buildSenecaImageMessagePayload>,
    ) => Promise<T>;
  },
): Promise<{ media: DurableSenecaImageMedia; message: T }> {
  let media = input.durableMedia ?? null;
  if (!media) {
    try {
      media = await operations.copyMedia(input.generationId);
    } catch (error) {
      throw new SenecaImageSendError("copy", error);
    }
  }
  input.onDurableMedia?.(media);
  let message: T;
  try {
    message = await operations.sendMessage(
      input.conversationId,
      buildSenecaImageMessagePayload(media.url, input.caption),
    );
  } catch (error) {
    throw new SenecaImageSendError("message", error);
  }
  return { media, message };
}
