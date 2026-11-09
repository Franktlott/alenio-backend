import type { ReactNode } from "react";
import { UserAvatar } from "../UserAvatar";

type Person = { id: string; name?: string | null; email?: string | null; image?: string | null };

/**
 * One person in a list: avatar, name, a one-line subtitle, actions on the right.
 * Clicking the name/avatar opens that person's profile.
 */
export function PersonRow({
  person,
  subtitle,
  onOpen,
  actions,
  size = "md",
  active = false,
  testId,
}: {
  person: Person;
  subtitle?: ReactNode;
  onOpen?: () => void;
  actions?: ReactNode;
  size?: "sm" | "md";
  /** Green dot on the avatar. */
  active?: boolean;
  testId?: string;
}) {
  const Tag = onOpen ? "button" : "div";
  return (
    <div className={`nw-person nw-person--${size}`} data-testid={testId}>
      <Tag
        type={onOpen ? "button" : undefined}
        className="nw-person-main"
        onClick={onOpen}
        aria-label={onOpen ? `Open ${person.name ?? "profile"}` : undefined}
      >
        <span className="nw-avatar-wrap">
          <UserAvatar user={person} className="nw-avatar" imgClassName="nw-avatar-img" alt="" />
          {active ? <span className="nw-active-dot" aria-label="Active now" /> : null}
        </span>
        <span className="nw-person-copy">
          <span className="nw-person-name">{person.name || person.email || "Someone"}</span>
          {subtitle ? <span className="nw-person-sub">{subtitle}</span> : null}
        </span>
      </Tag>
      {actions ? <span className="nw-person-actions">{actions}</span> : null}
    </div>
  );
}
