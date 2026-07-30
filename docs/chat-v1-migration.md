# Chat V1 migration notes

## Philosophy

Alenio does **not** create conversations for users. People start DMs and groups when they need them.

V1 product surface is **DIRECT** + **GROUP** only (`Conversation` / `DirectMessage`). Team Main Chat and Spaces remain in the database but are **hidden from product UI**.

## How to identify legacy streams

| Kind | Identification | V1 action |
|------|----------------|-----------|
| Main Chat | `Message` where `topicId IS NULL` for a `teamId` | Preserve; no UI |
| Spaces | `Topic` rows (+ `Message` with that `topicId`) | Preserve; no UI |
| User groups | `Conversation.isGroup = true` | Keep as GROUP |
| Direct messages | `Conversation.isGroup = false` | Keep as DIRECT |

## Inventory queries (read-only)

```sql
-- Teams with any Main Chat traffic
SELECT COUNT(DISTINCT "teamId") FROM "Message" WHERE "topicId" IS NULL;

-- Main Chat message count
SELECT COUNT(*) FROM "Message" WHERE "topicId" IS NULL;

-- Spaces
SELECT COUNT(*) FROM "Topic";
SELECT COUNT(*) FROM "Message" WHERE "topicId" IS NOT NULL;

-- DMs / Groups
SELECT COUNT(*) FROM "Conversation" WHERE "isGroup" = false;
SELECT COUNT(*) FROM "Conversation" WHERE "isGroup" = true;
```

## V1 rules

1. **Do not delete** Main Chat or Space messages.
2. **Do not convert** Main Chat / Spaces into `Conversation` rows in this phase.
3. Workspace create already creates **no** `Conversation` — keep that behavior.
4. New product paths must not open `/team-chat` or Spaces create UI.

## Later (out of V1)

Optional conversion job:

1. For each team with Main Chat messages: create a `GROUP` named after the team (or “General”), set `teamId`, add current `TeamMember`s as participants, backfill `DirectMessage` from `Message` where `topicId IS NULL`.
2. For Spaces with messages: same pattern per `Topic`.
3. Empty generals / empty topics: archive or leave orphaned (no UI).
4. Duplicate DMs: resolve via `dmPairKey` backfill (prefer conversation with messages).

## QA checklist (Chat V1)

- [ ] New workspace → no Conversation rows created; Chat empty state shows “Start a conversation”
- [ ] Chat tab has no Workspaces / Main Chat / Spaces panel
- [ ] Workspace hub has no Main Chat row or Spaces list; CTA opens Chat
- [ ] `/team-chat` deep link / push soft-redirects to Chat inbox
- [ ] Message someone → find-or-create returns same DM on second open
- [ ] Create group with workspace selected → `Conversation.teamId` set; inbox shows workspace label
- [ ] Create group never auto-adds all workspace members
- [ ] Ineligible member rejected by API when outside workspace
- [ ] Filters: All / Unread / Direct / Groups work client-side; workspace chip does not change `activeTeamId`
- [ ] Pin rail shows only when pins exist (no empty pin card)
- [ ] Unread conversations sort above read; then by latest activity
- [ ] Multi-workspace user sees unified DM+Group inbox
- [ ] Web `/chat` defaults to DM+Group inbox (not Team chat / channels)
- [ ] Legacy Main Chat / Space messages still present in DB (no deletes)

## DM uniqueness

- Column: `Conversation.dmPairKey` (nullable unique) = sorted `userIdA:userIdB` for `isGroup = false`.
- `find-or-create` sets the key in a transaction; unique conflicts return the existing row.
- Backfill (careful, staging first):

```bash
cd backend && npx tsx scripts/backfill-dm-pair-key.ts
```

Behavior:
1. For each 1:1 conversation with exactly two participants, compute `dmPairKey`.
2. If the key is free, set it.
3. If another conversation already owns the key, prefer the one with more messages (then latest `updatedAt`); clear `dmPairKey` on the loser and log it — **do not delete** conversations with messages.
