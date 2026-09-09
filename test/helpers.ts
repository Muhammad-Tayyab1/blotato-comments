import { Database } from "../src/database";
export function fakeDatabase() {
  const snapshots = new Map<string, unknown>();
  const db = {
    publication: {
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: {
            id: string;
            post: { workspaceId: string };
            socialAccount: { workspaceId: string };
          };
        }) => {
          const workspace =
            where.id === "pub-other" ? "workspace-other" : "workspace-demo";
          if (
            !["pub-alpha", "pub-beta", "pub-other", "pub-draft"].includes(
              where.id,
            ) ||
            where.post.workspaceId !== workspace ||
            where.socialAccount.workspaceId !== workspace
          )
            return null;
          return {
            id: where.id,
            status: where.id === "pub-draft" ? "DRAFT" : "PUBLISHED",
            externalPostId:
              where.id === "pub-beta" ? "beta-post" : "alpha-post",
            socialAccount: {
              platform: where.id === "pub-beta" ? "mock-beta" : "mock-alpha",
              externalAccountId: "account-alpha",
            },
          };
        },
      ),
    },
    commentSnapshot: {
      upsert: jest.fn(
        async ({
          create,
        }: {
          create: { publicationId: string; externalCommentId: string };
        }) => {
          snapshots.set(
            `${create.publicationId}/${create.externalCommentId}`,
            create,
          );
          return create;
        },
      ),
    },
    $transaction: jest.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };
  return { db: db as unknown as Database, snapshots, raw: db };
}
