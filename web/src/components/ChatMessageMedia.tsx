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
 * Fixed frame size avoids message-row layout jump when media loads.
 */
export function ChatMessageMedia({ url, mediaType }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const isVideo = isVideoType(mediaType);
  const isImage =
    isImageType(mediaType) ||
    (!isVideo && (looksLikeImagePath(url) || looksLikeFirebaseStorage(url)));

  if (isVideo) {
    return (
      <div className="chat-media-frame chat-media-frame--video">
        <video src={url} controls className="chat-video" preload="metadata" />
      </div>
    );
  }

  if (isImage && !imgFailed) {
    return (
      <div className={`chat-media-frame${loaded ? " is-loaded" : ""}`}>
        <img
          src={url}
          alt="Shared image"
          className="chat-media"
          onLoad={() => setLoaded(true)}
          onError={() => setImgFailed(true)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="chat-attachment-link">
      {isImage && imgFailed ? "Open image" : "Attachment"}
    </a>
  );
}
