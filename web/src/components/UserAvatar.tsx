import { useEffect, useState } from "react";
import { resolveUserImageUrl, userInitials } from "../lib/user-avatar";

type Props = {
  user: { name?: string | null; email?: string | null; image?: string | null };
  className?: string;
  /** Extra class on the <img> when a photo is shown. */
  imgClassName?: string;
  alt?: string;
};

/**
 * Circular user avatar: shows profile photo when available, otherwise initials.
 * Falls back to initials if the image URL fails to load.
 */
export function UserAvatar({ user, className = "", imgClassName = "", alt }: Props) {
  const uri = resolveUserImageUrl(user.image);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = !!uri && failedUri !== uri;
  const label = alt ?? user.name ?? user.email ?? "Member";

  useEffect(() => {
    setFailedUri(null);
  }, [uri]);

  return (
    <span className={className}>
      {showImage ? (
        <img
          src={uri}
          alt={label}
          className={imgClassName}
          onError={() => setFailedUri(uri)}
        />
      ) : (
        userInitials(user)
      )}
    </span>
  );
}
