import { useEffect, useMemo, useRef, useState } from "react";
import { assigneeInitials } from "../../lib/task-display";

export type AssigneeMember = {
  userId: string;
  user: { id: string; name: string | null; email: string | null; image?: string | null };
};

type Props = {
  members: AssigneeMember[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  loading?: boolean;
};

function memberLabel(member: AssigneeMember): string {
  return member.user.name?.trim() || member.user.email?.trim() || member.userId;
}

export function AssigneeMultiSelect({ members, selectedIds, onChange, disabled, loading }: Props) {
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
    onChange(selectedIds.includes(userId) ? selectedIds.filter((id) => id !== userId) : [...selectedIds, userId]);
  };

  const removeMember = (userId: string) => {
    onChange(selectedIds.filter((id) => id !== userId));
  };

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

      {selectedMembers.length > 0 ? (
        <ul className="assignee-multi-select-chips" aria-label="Selected assignees">
          {selectedMembers.map((member) => (
            <li key={member.userId} className="assignee-multi-select-chip">
              <span className="assignee-multi-select-chip-avatar" aria-hidden>
                {assigneeInitials(member.user.name, member.user.email)}
              </span>
              <span className="assignee-multi-select-chip-label">{memberLabel(member)}</span>
              {!disabled ? (
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
