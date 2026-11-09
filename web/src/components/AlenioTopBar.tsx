import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CircleHelp, Search } from "lucide-react";
import type { WebMeUser } from "../lib/api";
import { JoinRequestBell } from "./JoinRequestBell";
import { UserAvatar } from "./UserAvatar";
import "./alenio-top-bar.css";

type Props = {
  user: WebMeUser | null;
  onOpenAccount: () => void;
};

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function AlenioTopBar({ user, onOpenAccount }: Props) {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");

  // Cmd/Ctrl+K focuses search from anywhere in the app.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    navigate(term ? `/discover?q=${encodeURIComponent(term)}` : "/discover");
    searchRef.current?.blur();
  };

  return (
    <header className="alenio-topbar" data-testid="alenio-topbar">
      <form className="alenio-topbar-search" role="search" onSubmit={submitSearch}>
        <Search size={17} strokeWidth={2.2} className="alenio-topbar-search-icon" aria-hidden />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search articles, topics, or insights..."
          aria-label="Search articles, topics, or insights"
          data-testid="topbar-search"
        />
        <kbd className="alenio-topbar-kbd" aria-hidden>
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </form>

      <div className="alenio-topbar-actions">
        <JoinRequestBell />

        <a
          href="/help"
          target="_blank"
          rel="noreferrer"
          className="alenio-topbar-icon-button"
          aria-label="Help Center"
          data-testid="topbar-help"
        >
          <CircleHelp size={20} strokeWidth={2} aria-hidden />
        </a>

        <button
          type="button"
          className="alenio-topbar-avatar"
          onClick={onOpenAccount}
          aria-label="Open profile"
          data-testid="topbar-profile"
        >
          <UserAvatar
            user={user ?? { name: null, email: null, image: null }}
            className="alenio-topbar-avatar-inner"
            imgClassName="alenio-topbar-avatar-img"
            alt=""
          />
        </button>
      </div>
    </header>
  );
}
