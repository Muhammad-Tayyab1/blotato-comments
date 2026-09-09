import {
  Body,
  Controller,
  Get,
  Injectable,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { CommentsService } from "./comments.service";
import { ApiError } from "./errors";
@Injectable()
export class DevelopmentIdentity {
  workspaceId() {
    return "workspace-demo";
  }
}
@Controller("v1/publications/:publicationId/comments")
export class CommentsController {
  constructor(
    private readonly service: CommentsService,
    private readonly identity: DevelopmentIdentity,
  ) {}
  @Get()
  list(
    @Param("publicationId") id: string,
    @Query() query: Record<string, unknown>,
  ) {
    const raw = query.limit;
    if (raw !== undefined && (typeof raw !== "string" || !/^\d+$/.test(raw)))
      throw new ApiError(
        400,
        "INVALID_LIMIT",
        "Limit must be an integer from 1 to 100.",
      );
    const limit = raw === undefined ? 20 : Number(raw);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new ApiError(
        400,
        "INVALID_LIMIT",
        "Limit must be an integer from 1 to 100.",
      );
    if (
      query.cursor !== undefined &&
      (typeof query.cursor !== "string" ||
        !query.cursor.length ||
        query.cursor.length > 1024)
    )
      throw new ApiError(400, "INVALID_CURSOR", "Invalid pagination cursor.");
    return this.service.list(
      this.identity.workspaceId(),
      id,
      limit,
      query.cursor as string | undefined,
    );
  }
  @Post(":externalCommentId/replies")
  reply(
    @Param("publicationId") id: string,
    @Param("externalCommentId") parent: string,
    @Body() body: unknown,
  ) {
    const text =
      typeof body === "object" && body !== null && "text" in body
        ? body.text
        : undefined;
    return this.service.reply(this.identity.workspaceId(), id, parent, text);
  }
}
