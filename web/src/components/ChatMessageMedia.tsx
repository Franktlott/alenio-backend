import { useState } from "react";

function isImageType(mediaType: string | null): boolean {
  if (!mediaType) return false;
  return mediaType === "image" || mediaType.startsWith("image/");
}

function isVideoType(mediaType: string | null): boolean {
  if (!mediaType) return false;
  return mediaType === "video" || mediaType.startsWith("video/");
}

function looksLikeImagePath(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|svg)(\?|#|$)/i.test(url);
}

function looksLikeFirebaseStorage(url: string): boolean {
  return /firebasestorage\.(googleapis\.com|app)/i.test(url);
}

type Props = {
  url: string;
  mediaType: string | null;
};

/**
 * Team chat attachments. Mobile uses mediaType `image` | `video`, not image/* MIME.
 */
export function ChatMessageMedia({ url, mediaType }: Props) {
  const [imgFailed, setImgFailed] = useState(false);

  const isVideo = isVideoType(mediaType);
  const isImage =
    isImageType(mediaType) ||
    (!isVideo && (looksLikeImagePath(url) || looksLikeFirebaseStorage(url)));

  if (isVideo) {
    return <video src={url} controls className="chat-video" preload="metadata" />;
  }

  if (isImage && !imgFailed) {
    return (
      <img
        src={url}
        alt="Shared image"
        className="chat-media"
        onError={() => setImgFailed(true)}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="chat-attachment-link">
      {isImage && imgFailed ? "Open image" : "Attachment"}
    </a>
  );
}
