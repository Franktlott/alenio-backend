import { useState } from "react";

export function useMention() {
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null); // null = picker hidden

  function onTextChange(text: string) {
    const match = text.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
    } else {
      setMentionQuery(null);
    }
  }

  function selectMention(
    text: string,
    user: { id: string; name: string }
  ): string {
    const newText = text.replace(/@(\w*)$/, `@${user.name} `);
    setMentionedUserIds((prev) =>
      prev.includes(user.id) ? prev : [...prev, user.id]
    );
    setMentionQuery(null);
    return newText;
  }

  function resetMentions() {
    setMentionedUserIds([]);
    setMentionQuery(null);
  }

  return { mentionedUserIds, mentionQuery, onTextChange, selectMention, resetMentions };
}
