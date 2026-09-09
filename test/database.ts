import "dotenv/config";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { seed } from "../prisma/seed";
import { CommentsService } from "../src/comments.service";
import { Database } from "../src/database";
import { AdapterRegistry } from "../src/adapters/registry";
import { MockAlphaAdapter, MockBetaAdapter } from "../src/adapters/mocks";
async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required");
  const parsed = new URL(url);
  if (
    !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
    parsed.pathname !== "/blotato_test"
  )
    throw new Error("Tests require localhost database named blotato_test");
  if (
    process.env.DATABASE_URL &&
    new URL(process.env.DATABASE_URL).pathname === "/blotato_test"
  )
    throw new Error("Development DATABASE_URL must not target blotato_test");
  execFileSync(
    "node",
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" },
  );
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    await seed(db);
    await db.commentSnapshot.deleteMany({
      where: { publicationId: { in: ["pub-alpha", "pub-beta"] } },
    });
    const service = new CommentsService(
      db as Database,
      new AdapterRegistry([new MockAlphaAdapter(), new MockBetaAdapter()]),
    );
    // Exercise the actual Prisma ownership query, not just the unit-test double.
    for (const [id, status] of [
      ["missing", 404],
      ["pub-other", 404],
      ["pub-draft", 409],
    ] as const) {
      await assert.rejects(service.list("workspace-demo", id, 20), { status });
      await assert.rejects(
        service.reply("workspace-demo", id, "alpha-1", "Not allowed"),
        { status },
      );
    }
    await assert.rejects(
      service.reply("workspace-demo", "pub-alpha", "other-1", "Wrong post"),
      { status: 404 },
    );
    // The external parent need not have a local snapshot or foreign-key row.
    const uncachedReply = await service.reply(
      "workspace-demo",
      "pub-beta",
      "beta-1",
      "Uncached parent reply",
    );
    assert.equal(
      await db.commentSnapshot.count({ where: { publicationId: "pub-beta" } }),
      1,
    );
    assert.equal(uncachedReply.externalParentCommentId, "beta-1");
    await service.list("workspace-demo", "pub-alpha", 20);
    await service.list("workspace-demo", "pub-alpha", 1);
    await service.list("workspace-demo", "pub-beta", 20);
    assert.equal(
      await db.commentSnapshot.count({
        where: { publicationId: { in: ["pub-alpha", "pub-beta"] } },
      }),
      7,
    );
    await db.commentSnapshot.updateMany({
      where: { publicationId: "pub-alpha", externalCommentId: "alpha-1" },
      data: { text: "stale" },
    });
    await service.list("workspace-demo", "pub-alpha", 1);
    assert.equal(
      (
        await db.commentSnapshot.findUniqueOrThrow({
          where: {
            publicationId_externalCommentId: {
              publicationId: "pub-alpha",
              externalCommentId: "alpha-1",
            },
          },
        })
      ).text,
      "Comment 1",
    );
    const reply = await service.reply(
      "workspace-demo",
      "pub-alpha",
      "alpha-1",
      "Persisted reply",
    );
    assert.equal(
      await db.commentSnapshot.count({
        where: { publicationId: { in: ["pub-alpha", "pub-beta"] } },
      }),
      8,
    );
    assert.ok(
      (await service.list("workspace-demo", "pub-alpha", 20)).comments.some(
        (c) => c.externalCommentId === reply.externalCommentId,
      ),
    );
    console.log("PostgreSQL persistence checks passed");
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
