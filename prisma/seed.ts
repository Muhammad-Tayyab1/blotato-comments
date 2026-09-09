import "dotenv/config";
import { PrismaClient } from "@prisma/client";
export async function seed(db: PrismaClient) {
  for (const id of ["workspace-demo", "workspace-other"])
    await db.workspace.upsert({ where: { id }, create: { id }, update: {} });
  for (const [id, platform, workspaceId] of [
    ["account-alpha", "mock-alpha", "workspace-demo"],
    ["account-beta", "mock-beta", "workspace-demo"],
    ["account-other", "mock-alpha", "workspace-other"],
  ]) {
    await db.socialAccount.upsert({
      where: { id },
      create: { id, platform, workspaceId, externalAccountId: id },
      update: {},
    });
  }
  for (const [id, workspaceId] of [
    ["post-demo", "workspace-demo"],
    ["post-other", "workspace-other"],
  ])
    await db.post.upsert({
      where: { id },
      create: { id, workspaceId, text: "Scheduled launch" },
      update: {},
    });
  for (const [id, socialAccountId, postId, externalPostId] of [
    ["pub-alpha", "account-alpha", "post-demo", "alpha-post"],
    ["pub-beta", "account-beta", "post-demo", "beta-post"],
    ["pub-other", "account-other", "post-other", "other-post"],
    ["pub-draft", "account-alpha", "post-demo", null],
  ] as const) {
    const data = {
      id,
      socialAccountId,
      postId,
      externalPostId,
      status: externalPostId ? ("PUBLISHED" as const) : ("DRAFT" as const),
    };
    await db.publication.upsert({ where: { id }, create: data, update: {} });
  }
}
if (require.main === module) {
  const db = new PrismaClient();
  seed(db)
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
