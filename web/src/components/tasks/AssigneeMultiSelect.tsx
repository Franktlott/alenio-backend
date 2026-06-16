import { useEffect, useMemo, useRef, useState } from "react";
import { assigneeInitials } from "../../lib/task-display";

export type AssigneeMember = {
  userId: string;
  user: { id: string; name: string | null; email: string | null; image?: string | null };
};

type Props = {
  members: AssigneeMember[];
  selectedIds: string[];
  onChange?: (ids: string[]) => void;
  onToggle?: (userId: string, selected: boolean) => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  readOnly?: boolean;
  /** Detail modal: chips + link-style add control */
  compact?: boolean;
  addLabel?: string;
};

function memberLabel(member: AssigneeMember): string {
  return member.user.name?.trim() || member.user.email?.trim() || member.userId;
}

export function AssigneeMultiSelect({
  members,
  selectedIds,
  onChange,
  onToggle,
  disabled,
  loading,
  readOnly,
  compact,
  addLabel = "+ Add assignee",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedMembers = useMemo(
    () => members.filter((m) => selectedIds.includes(m.userId)),
    [members, selectedIds],
  );

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => memberLabel(m).toLowerCase().includes(q));
  }, [members, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggleMember = (userId: string) => {
    const willSelect = !selectedIds.includes(userId);
    if (onToggle) {
      void onToggle(userId, willSelect);
      return;
    }
    onChange?.(willSelect ? [...selectedIds, userId] : selectedIds.filter((id) => id !== userId));
  };

  const removeMember = (userId: string) => {
    if (onToggle) {
      void onToggle(userId, false);
      return;
    }
    onChange?.(selectedIds.filter((id) => id !== userId));
  };

  const chips = selectedMembers.length > 0 ? (
    <ul className="assignee-multi-select-chips assignee-multi-select-chips--compact" aria-label="Selected assignees">
      {selectedMembers.map((member) => (
        <li key={member.userId} className="assignee-multi-select-chip">
          <span className="assignee-multi-select-chip-avatar" aria-hidden>
            {assigneeInitials(member.user.name, member.user.email)}
          </span>
          <span className="assignee-multi-select-chip-label">{memberLabel(member)}</span>
          {!disabled && !readOnly ? (
            <button
              type="button"
              className="assignee-multi-select-chip-remove"
              aria-label={`Remove ${memberLabel(member)}`}
              onClick={() => removeMember(member.userId)}
            >
              ×
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  ) : readOnly ? (
    <p className="enterprise-muted assignee-multi-select-empty-readonly">—</p>
  ) : null;

  if (readOnly) {
    return <div className="assignee-multi-select assignee-multi-select--readonly">{chips}</div>;
  }

  if (compact) {
    return (
      <div className="assignee-multi-select assignee-multi-select--compact" ref={rootRef}>
        {chips}
        {!disabled && !loading ? (
          <button
            type="button"
            className="assignee-multi-select-add-link"
            aria-expanded={open}
            aria-haspopup="listbox"
            onClick={() => setOpen((v) => !v)}
          >
            {addLabel}
          </button>
        ) : null}
        {open ? (
          <div className="assignee-multi-select-menu" role="listbox" aria-multiselectable="true">
            {members.length > 6 ? (
              <div className="assignee-multi-select-search-wrap">
                <input
                  type="search"
                  className="auth-input assignee-multi-select-search"
                  placeholder="Search teammates…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
            ) : null}
            <ul className="assignee-multi-select-options">
              {filteredMembers.length === 0 ? (
                <li className="assignee-multi-select-empty">No teammates match your search.</li>
              ) : (
                filteredMembers.map((member) => {
                  const checked = selectedIds.includes(member.userId);
                  return (
                    <li key={member.userId}>
                      <label className="assignee-multi-select-option">
                        <input type="checkbox" checked={checked} onChange={() => toggleMember(member.userId)} />
                        <span className="assignee-multi-select-option-avatar" aria-hidden>
                          {assigneeInitials(member.user.name, member.user.email)}
                        </span>
                        <span className="assignee-multi-select-option-text">
                          <strong>{memberLabel(member)}</strong>
                          {member.user.email && member.user.name ? (
                            <span className="assignee-multi-select-option-email">{member.user.email}</span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="assignee-multi-select" ref={rootRef}>
      <button
        type="button"
        className="assignee-multi-select-trigger auth-input"
        disabled={disabled || loading}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        {loading ? (
          "Loading teammates…"
        ) : selectedMembers.length === 0 ? (
          "Select assignees…"
        ) : (
          `${selectedMembers.length} selected`
        )}
        <span className="assignee-multi-select-chevron" aria-hidden>
          ▾
        </span>
      </button>

      {chips}

      {open ? (
        <div className="assignee-multi-select-menu" role="listbox" aria-multiselectable="true">
          {members.length > 6 ? (
            <div className="assignee-multi-select-search-wrap">
              <input
                type="search"
                className="auth-input assignee-multi-select-search"
                placeholder="Search teammates…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
          ) : null}
          <ul className="assignee-multi-select-options">
            {filteredMembers.length === 0 ? (
              <li className="assignee-multi-select-empty">No teammates match your search.</li>
            ) : (
              filteredMembers.map((member) => {
                const checked = selectedIds.includes(member.userId);
                return (
                  <li key={member.userId}>
                    <label className="assignee-multi-select-option">
                      <input type="checkbox" checked={checked} onChange={() => toggleMember(member.userId)} />
                      <span className="assignee-multi-select-option-avatar" aria-hidden>
                        {assigneeInitials(member.user.name, member.user.email)}
                      </span>
                      <span className="assignee-multi-select-option-text">
                        <strong>{memberLabel(member)}</strong>
                        {member.user.email && member.user.name ? (
                          <span className="assignee-multi-select-option-email">{member.user.email}</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
