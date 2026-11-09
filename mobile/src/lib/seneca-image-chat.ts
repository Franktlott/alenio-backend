import { api } from "./api/api";
import type { DirectMessage } from "./types";
import {
  sendSenecaImageWithDurableRetry,
  type DurableSenecaImageMedia,
  type SenecaImageSendInput,
} from "./seneca-image-chat-helpers";

export {
  buildSenecaImageMessagePayload,
  filterSenecaConversations,
  normalizeSenecaImageCaption,
  SenecaImageSendError,
  sendSenecaImageWithDurableRetry,
  senecaConversationLabel,
} from "./seneca-image-chat-helpers";
export type {
  DurableSenecaImageMedia,
  SenecaImageSendInput,
} from "./seneca-image-chat-helpers";

export function sendSenecaImageToConversation(
  input: SenecaImageSendInput,
): Promise<{ media: DurableSenecaImageMedia; message: DirectMessage }> {
  return sendSenecaImageWithDurableRetry(input, {
    copyMedia: (generationId) =>
      api.post<DurableSenecaImageMedia>("/api/dms/seneca-image-media", {
        generationId,
      }),
    sendMessage: (conversationId, payload) =>
      api.post<DirectMessage>(
        `/api/dms/${conversationId}/messages`,
        payload,
      ),
  });
}
