import { Comment, Page, PlatformAdapter, ProviderError } from "./platform";

type Alpha = {
  id: string;
  parent: string | null;
  user: { id: string; name: string };
  message: string;
  created_at: string;
};
type Beta = {
  key: string;
  thread: string | null;
  actor: [string, string];
  body: { plain: string };
  timestamp_ms: number;
};
const epoch = Date.parse("2026-01-01T12:00:00Z");

// In-memory provider fixtures, intentionally not real social-platform integrations.
abstract class MockAdapter<T> implements PlatformAdapter {
  abstract readonly platform: string;
  readonly supportsReplies = true;
  protected fixtures = new Map<string, T[]>();
  protected abstract normalize(raw: T): Comment;
  protected abstract encode(comment: Comment): T;
  protected initialize(post: string, prefix: string) {
    this.fixtures.set(
      post,
      [1, 2, 3].map((n) =>
        this.encode({
          externalCommentId: `${prefix}-${n}`,
          externalParentCommentId: n === 3 ? `${prefix}-1` : null,
          authorId: `reader-${n}`,
          authorName: `Reader ${n}`,
          text: `Comment ${n}`,
          providerTimestamp: new Date(epoch + n * 1000),
        }),
      ),
    );
  }
  async list(post: string, limit: number, cursor?: string): Promise<Page> {
    const rows = this.rows(post);
    let offset = 0;
    if (cursor !== undefined) {
      try {
        if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
        const decoded = Buffer.from(cursor, "base64url").toString("utf8");
        const value: unknown = JSON.parse(decoded);
        if (typeof value !== "object" || value === null) throw new Error();
        const v = value as Record<string, unknown>;
        if (
          v.post !== post ||
          v.platform !== this.platform ||
          !Number.isSafeInteger(v.offset) ||
          Number(v.offset) < 1 ||
          Number(v.offset) > rows.length ||
          Buffer.from(decoded).toString("base64url") !== cursor
        )
          throw new Error();
        offset = Number(v.offset);
      } catch {
        throw new ProviderError("invalid_cursor");
      }
    }
    const end = offset + limit;
    return {
      comments: rows.slice(offset, end).map((r) => this.normalize(r)),
      nextCursor:
        end < rows.length
          ? Buffer.from(
              JSON.stringify({ platform: this.platform, post, offset: end }),
            ).toString("base64url")
          : null,
    };
  }
  async resolve(post: string, id: string) {
    return (
      this.rows(post)
        .map((r) => this.normalize(r))
        .find((c) => c.externalCommentId === id) ?? null
    );
  }
  async reply(post: string, parentId: string, text: string, account: string) {
    if (!(await this.resolve(post, parentId)))
      throw new ProviderError("not_found");
    const rows = this.rows(post);
    const comment: Comment = {
      externalCommentId: `${this.platform}-reply-${rows.length + 1}`,
      externalParentCommentId: parentId,
      authorId: account,
      authorName: "Demo publisher",
      text,
      providerTimestamp: new Date(epoch + (rows.length + 1) * 1000),
    };
    rows.push(this.encode(comment));
    return comment;
  }
  private rows(post: string) {
    const rows = this.fixtures.get(post);
    if (!rows) throw new ProviderError("not_found");
    return rows;
  }
}
export class MockAlphaAdapter extends MockAdapter<Alpha> {
  readonly platform = "mock-alpha";
  constructor() {
    super();
    this.initialize("alpha-post", "alpha");
    this.initialize("other-post", "other");
  }
  protected normalize(r: Alpha): Comment {
    return {
      externalCommentId: r.id,
      externalParentCommentId: r.parent,
      authorId: r.user.id,
      authorName: r.user.name,
      text: r.message,
      providerTimestamp: new Date(r.created_at),
    };
  }
  protected encode(c: Comment): Alpha {
    return {
      id: c.externalCommentId,
      parent: c.externalParentCommentId,
      user: { id: c.authorId, name: c.authorName },
      message: c.text,
      created_at: c.providerTimestamp.toISOString(),
    };
  }
}
export class MockBetaAdapter extends MockAdapter<Beta> {
  readonly platform = "mock-beta";
  constructor() {
    super();
    this.initialize("beta-post", "beta");
  }
  protected normalize(r: Beta): Comment {
    return {
      externalCommentId: r.key,
      externalParentCommentId: r.thread,
      authorId: r.actor[0],
      authorName: r.actor[1],
      text: r.body.plain,
      providerTimestamp: new Date(r.timestamp_ms),
    };
  }
  protected encode(c: Comment): Beta {
    return {
      key: c.externalCommentId,
      thread: c.externalParentCommentId,
      actor: [c.authorId, c.authorName],
      body: { plain: c.text },
      timestamp_ms: c.providerTimestamp.getTime(),
    };
  }
}
