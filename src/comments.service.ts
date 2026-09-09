import { Injectable } from "@nestjs/common";
import { Database } from "./database";
import { AdapterRegistry } from "./adapters/registry";
import { Comment } from "./adapters/platform";
import { ApiError } from "./errors";
@Injectable()
export class CommentsService {
  constructor(
    private readonly db: Database,
    private readonly registry: AdapterRegistry,
  ) {}
  private async publication(workspaceId: string, id: string) {
    const publication = await this.db.publication.findFirst({
      where: { id, post: { workspaceId }, socialAccount: { workspaceId } },
      include: { socialAccount: true },
    });
    if (!publication)
      throw new ApiError(
        404,
        "PUBLICATION_NOT_FOUND",
        "Publication not found.",
      );
    if (publication.status !== "PUBLISHED" || !publication.externalPostId)
      throw new ApiError(409, "NOT_PUBLISHED", "Publication is not published.");
    return { ...publication, externalPostId: publication.externalPostId };
  }
  private snapshot(publicationId: string, comment: Comment, fetchedAt: Date) {
    const data = { ...comment, publicationId, fetchedAt };
    return this.db.commentSnapshot.upsert({
      where: {
        publicationId_externalCommentId: {
          publicationId,
          externalCommentId: comment.externalCommentId,
        },
      },
      create: data,
      update: data,
    });
  }
  async list(workspaceId: string, id: string, limit: number, cursor?: string) {
    const p = await this.publication(workspaceId, id);
    const page = await this.registry
      .get(p.socialAccount.platform)
      .list(p.externalPostId, limit, cursor);
    const fetchedAt = new Date();
    await this.db.$transaction(
      page.comments.map((c) => this.snapshot(p.id, c, fetchedAt)),
    );
    return page;
  }
  async reply(workspaceId: string, id: string, parent: string, input: unknown) {
    if (
      typeof input !== "string" ||
      !input.trim() ||
      input.trim().length > 2000
    )
      throw new ApiError(
        400,
        "INVALID_TEXT",
        "Text must contain 1 to 2000 characters after trimming.",
      );
    const p = await this.publication(workspaceId, id);
    const adapter = this.registry.get(p.socialAccount.platform);
    if (!adapter.supportsReplies)
      throw new ApiError(
        422,
        "REPLIES_UNSUPPORTED",
        "This platform does not support replies.",
      );
    if (!(await adapter.resolve(p.externalPostId, parent)))
      throw new ApiError(
        404,
        "COMMENT_NOT_FOUND",
        "Comment not found on this publication.",
      );
    const reply = await adapter.reply(
      p.externalPostId,
      parent,
      input.trim(),
      p.socialAccount.externalAccountId,
    );
    await this.snapshot(p.id, reply, new Date());
    return reply;
  }
}
