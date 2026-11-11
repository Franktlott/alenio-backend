import { youtubeEmbedUrl } from "../../lib/discover-blocks";

type Props = {
  videoId?: string;
  title?: string;
};

export function DiscoverYoutubeEmbed({ videoId = "", title = "YouTube video" }: Props) {
  const src = youtubeEmbedUrl(videoId);
  if (!src) {
    return (
      <div className="ddoc-youtube ddoc-youtube--empty" role="note">
        Add a YouTube link to embed a video here.
      </div>
    );
  }
  return (
    <div className="ddoc-youtube">
      <div className="ddoc-youtube-frame">
        <iframe
          src={src}
          title={title || "YouTube video"}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    </div>
  );
}
