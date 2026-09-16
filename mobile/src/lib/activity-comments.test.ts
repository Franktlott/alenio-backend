import { describe, expect, test } from "bun:test";
import {
  activityCommentsKey,
  activityDetailKey,
  buildCommentThreads,
  commentCountLabel,
  isPendingComment,
  pendingComment,
  reactionCountLabel,
  replyCountLabel,
  type ActivityComment,
} from "./activity-comments";

const author = { id: "frank", name: "Frank Lott", image: null };

describe("count labels", () => {
  test("stay singular for one", () => {
    expect(commentCountLabel(1)).toBe("1 comment");
    expect(reactionCountLabel(1)).toBe("1 reaction");
  });

  test("pluralize for none and for many", () => {
    expect(commentCountLabel(0)).toBe("0 comments");
    expect(commentCountLabel(4)).toBe("4 comments");
    expect(reactionCountLabel(0)).toBe("0 reactions");
    expect(reactionCountLabel(9)).toBe("9 reactions");
  });
});

describe("pendingComment", () => {
  test("trims the body and stamps the author", () => {
    const comment = pendingComment("  Nice work  ", author, 1_700_000_000_000);
    expect(comment.body).toBe("Nice work");
    expect(comment.author).toEqual(author);
    expect(comment.createdAt).toBe(new Date(1_700_000_000_000).toISOString());
  });

  test("is recognizable as in flight and not deletable yet", () => {
    const comment = pendingComment("Hi", author);
    expect(isPendingComment(comment)).toBe(true);
    expect(comment.canDelete).toBe(false);
  });

  test("a saved comment is not treated as pending", () => {
    expect(
      isPendingComment({
        id: "ckxyz123",
        body: "Saved",
        createdAt: new Date().toISOString(),
        author,
        canDelete: true,
      }),
    ).toBe(false);
  });
});

describe("replyCountLabel", () => {
  test("uses the irregular plural", () => {
    expect(replyCountLabel(1)).toBe("1 reply");
    expect(replyCountLabel(3)).toBe("3 replies");
  });
});

describe("buildCommentThreads", () => {
  function comment(
    id: string,
    parentId: string | null = null,
  ): ActivityComment {
    return {
      id,
      body: id,
      createdAt: new Date().toISOString(),
      parentId,
      author,
      canDelete: false,
    };
  }

  test("nests replies under the comment they answer", () => {
    const threads = buildCommentThreads([
      comment("a"),
      comment("b"),
      comment("a1", "a"),
      comment("a2", "a"),
    ]);

    expect(threads.map((thread) => thread.comment.id)).toEqual(["a", "b"]);
    expect(threads[0]!.replies.map((reply) => reply.id)).toEqual(["a1", "a2"]);
    expect(threads[1]!.replies).toEqual([]);
  });

  test("keeps an orphaned reply visible instead of dropping it", () => {
    const threads = buildCommentThreads([comment("orphan", "deleted-parent")]);
    expect(threads).toHaveLength(1);
    expect(threads[0]!.comment.id).toBe("orphan");
  });
});

describe("query keys", () => {
  test("scope comments to the activity and the detail to the workspace", () => {
    expect(activityCommentsKey("act-1")).toEqual([
      "activity-comments",
      "act-1",
    ]);
    expect(activityDetailKey("team-1", "act-1")).toEqual([
      "team-activity-item",
      "team-1",
      "act-1",
    ]);
  });
});
