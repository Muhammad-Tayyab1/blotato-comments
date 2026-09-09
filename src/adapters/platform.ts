export interface Comment {
  externalCommentId: string;
  externalParentCommentId: string | null;
  authorId: string;
  authorName: string;
  text: string;
  providerTimestamp: Date;
}
export interface Page {
  comments: Comment[];
  nextCursor: string | null;
}
export interface PlatformAdapter {
  readonly platform: string;
  readonly supportsReplies: boolean;
  list(externalPostId: string, limit: number, cursor?: string): Promise<Page>;
  resolve(
    externalPostId: string,
    externalCommentId: string,
  ): Promise<Comment | null>;
  reply(
    externalPostId: string,
    parentId: string,
    text: string,
    externalAccountId: string,
  ): Promise<Comment>;
}
export class ProviderError extends Error {
  constructor(
    readonly kind: "failure" | "rate_limit" | "invalid_cursor" | "not_found",
  ) {
    super(kind);
  }
}
