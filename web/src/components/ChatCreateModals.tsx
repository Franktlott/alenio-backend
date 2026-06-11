import { useEffect, useMemo, useState } from "react";
import {
  createGroupDm,
  createTeamTopic,
  findOrCreateDm,
  searchUsers,
  type UserSearchRow,
  type WebTeamMemberRow,
} from "../lib/api";

const TOPIC_COLORS = ["#4361EE", "#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];

type UserPickRow = UserSearchRow;

function userLabel(user: UserPickRow): string {
  return user.name ?? user.email ?? "Member";
}

function UserPickList({
  users,
  onPick,
  multiSelect,
  selectedIds,
  onToggle,
}: {
  users: UserPickRow[];
  onPick?: (user: UserPickRow) => void;
  multiSelect?: boolean;
  selectedIds?: Set<string>;
  onToggle?: (user: UserPickRow) => void;
}) {
  if (users.length === 0) {
    return <p className="enterprise-muted chat-create-empty">No people found.</p>;
  }
  return (
    <ul className="chat-create-user-list">
      {users.map((user) => {
        const selected = selectedIds?.has(user.id);
        return (
          <li key={user.id}>
            <button
              type="button"
              className={`chat-create-user-item${selected ? " chat-create-user-item--selected" : ""}`}
              onClick={() => (multiSelect ? onToggle?.(user) : onPick?.(user))}
            >
              {user.image ? (
                <img src={user.image} alt="" className="chat-create-user-avatar" />
              ) : (
                <span className="chat-create-user-avatar chat-create-user-avatar-fallback">
                  {(user.name?.[0] ?? user.email?.[0] ?? "?").toUpperCase()}
                </span>
              )}
              <span className="chat-create-user-copy">
                <span className="chat-create-user-name">{userLabel(user)}</span>
                {user.email && user.email !== user.name ? (
                  <span className="chat-create-user-email">{user.email}</span>
                ) : null}
              </span>
              {multiSelect ? (
                <span className={`chat-create-user-check${selected ? " chat-create-user-check--on" : ""}`} aria-hidden>
                  {selected ? "✓" : ""}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

type CreateChannelModalProps = {
  open: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: { name: string; description: string; color: string }) => void;
};

export function CreateChannelModal({ open, saving, error, onClose, onSubmit }: CreateChannelModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(TOPIC_COLORS[0]);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setColor(TOPIC_COLORS[0]);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="enterprise-task-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="enterprise-task-modal chat-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-create-channel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="enterprise-task-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <header className="enterprise-task-modal-head">
          <h3 id="chat-create-channel-title" className="enterprise-task-modal-title">
            New channel
          </h3>
          <p className="enterprise-muted">Create a workspace channel for your team.</p>
        </header>
        <div className="chat-create-modal-body">
          {error ? <p className="enterprise-form-error" role="alert">{error}</p> : null}
          <label className="auth-label" htmlFor="chat-channel-name">
            Channel name
          </label>
          <input
            id="chat-channel-name"
            className="auth-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Announcements"
            autoFocus
            data-testid="chat-create-channel-name"
          />
          <label className="auth-label" htmlFor="chat-channel-desc">
            Description <span className="enterprise-muted">(optional)</span>
          </label>
          <input
            id="chat-channel-desc"
            className="auth-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this channel for?"
          />
          <span className="auth-label">Color</span>
          <div className="chat-create-color-row">
            {TOPIC_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`chat-create-color-swatch${color === c ? " chat-create-color-swatch--active" : ""}`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        <div className="enterprise-task-modal-actions">
          <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="enterprise-task-modal-btn enterprise-task-modal-btn-primary"
            disabled={!name.trim() || saving}
            onClick={() => onSubmit({ name: name.trim(), description: description.trim(), color })}
            data-testid="chat-create-channel-submit"
          >
            {saving ? "Creating…" : "Create channel"}
          </button>
        </div>
      </div>
    </div>
  );
}

type NewDmModalProps = {
  open: boolean;
  saving: boolean;
  error: string | null;
  teamMembers: WebTeamMemberRow[];
  myUserId: string;
  onClose: () => void;
  onPick: (userId: string) => void;
};

export function NewDmModal({ open, saving, error, teamMembers, myUserId, onClose, onPick }: NewDmModalProps) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserPickRow[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSearchResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    void searchUsers(query)
      .then((rows) => {
        if (!cancelled) setSearchResults(rows.filter((u) => u.id !== myUserId));
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, query, myUserId]);

  const teamUsers = useMemo(
    () =>
      teamMembers
        .filter((m) => m.userId !== myUserId)
        .map((m) => m.user),
    [teamMembers, myUserId],
  );

  const displayUsers = query.trim().length >= 2 ? searchResults : teamUsers;

  if (!open) return null;

  return (
    <div className="enterprise-task-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="enterprise-task-modal chat-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-new-dm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="enterprise-task-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <header className="enterprise-task-modal-head">
          <h3 id="chat-new-dm-title" className="enterprise-task-modal-title">
            New direct message
          </h3>
          <p className="enterprise-muted">Pick someone to message.</p>
        </header>
        <div className="chat-create-modal-body">
          {error ? <p className="enterprise-form-error" role="alert">{error}</p> : null}
          <input
            className="auth-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            data-testid="chat-new-dm-search"
          />
          {searching ? <p className="enterprise-muted">Searching…</p> : null}
          <UserPickList users={displayUsers} onPick={(user) => onPick(user.id)} />
          {saving ? <p className="enterprise-muted">Opening conversation…</p> : null}
        </div>
      </div>
    </div>
  );
}

type CreateGroupModalProps = {
  open: boolean;
  saving: boolean;
  error: string | null;
  teamMembers: WebTeamMemberRow[];
  myUserId: string;
  onClose: () => void;
  onSubmit: (input: { name: string; participantIds: string[] }) => void;
};

export function CreateGroupModal({
  open,
  saving,
  error,
  teamMembers,
  myUserId,
  onClose,
  onSubmit,
}: CreateGroupModalProps) {
  const [groupName, setGroupName] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserPickRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<UserPickRow[]>([]);

  useEffect(() => {
    if (!open) {
      setGroupName("");
      setQuery("");
      setSearchResults([]);
      setSelected([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    void searchUsers(query)
      .then((rows) => {
        if (!cancelled) setSearchResults(rows.filter((u) => u.id !== myUserId));
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, query, myUserId]);

  const teamUsers = useMemo(
    () =>
      teamMembers
        .filter((m) => m.userId !== myUserId)
        .map((m) => m.user),
    [teamMembers, myUserId],
  );

  const displayUsers = query.trim().length >= 2 ? searchResults : teamUsers;
  const selectedIds = useMemo(() => new Set(selected.map((u) => u.id)), [selected]);

  const toggleUser = (user: UserPickRow) => {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user],
    );
  };

  if (!open) return null;

  return (
    <div className="enterprise-task-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="enterprise-task-modal chat-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-create-group-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="enterprise-task-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <header className="enterprise-task-modal-head">
          <h3 id="chat-create-group-title" className="enterprise-task-modal-title">
            New group message
          </h3>
          <p className="enterprise-muted">Add a name and pick at least one teammate.</p>
        </header>
        <div className="chat-create-modal-body">
          {error ? <p className="enterprise-form-error" role="alert">{error}</p> : null}
          <label className="auth-label" htmlFor="chat-group-name">
            Group name
          </label>
          <input
            id="chat-group-name"
            className="auth-input"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="e.g. Seaworld Managers"
            data-testid="chat-create-group-name"
          />
          <input
            className="auth-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search teammates…"
          />
          {selected.length > 0 ? (
            <p className="chat-create-selected-count">
              {selected.length} selected
            </p>
          ) : null}
          {searching ? <p className="enterprise-muted">Searching…</p> : null}
          <UserPickList
            users={displayUsers}
            multiSelect
            selectedIds={selectedIds}
            onToggle={toggleUser}
          />
        </div>
        <div className="enterprise-task-modal-actions">
          <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="enterprise-task-modal-btn enterprise-task-modal-btn-primary"
            disabled={!groupName.trim() || selected.length < 1 || saving}
            onClick={() =>
              onSubmit({
                name: groupName.trim(),
                participantIds: selected.map((u) => u.id),
              })
            }
            data-testid="chat-create-group-submit"
          >
            {saving ? "Creating…" : "Create group"}
          </button>
        </div>
      </div>
    </div>
  );
}
