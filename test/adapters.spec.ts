import { MockAlphaAdapter, MockBetaAdapter } from "../src/adapters/mocks";
describe.each([
  [MockAlphaAdapter, "alpha-post", "alpha"],
  [MockBetaAdapter, "beta-post", "beta"],
] as const)("%s mock", (Adapter, post, prefix) => {
  test("normalizes distinct provider shapes, paginates both roots and replies", async () => {
    const adapter = new Adapter();
    const first = await adapter.list(post, 2);
    expect(first.comments[0]).toEqual({
      externalCommentId: `${prefix}-1`,
      externalParentCommentId: null,
      authorId: "reader-1",
      authorName: "Reader 1",
      text: "Comment 1",
      providerTimestamp: new Date("2026-01-01T12:00:01Z"),
    });
    const second = await adapter.list(post, 2, first.nextCursor!);
    expect(second.comments).toHaveLength(1);
    expect(second.comments[0].externalParentCommentId).toBe(`${prefix}-1`);
    expect(second.nextCursor).toBeNull();
  });
  test("reply mutates provider fixture and uses publication account", async () => {
    const adapter = new Adapter();
    const reply = await adapter.reply(
      post,
      `${prefix}-1`,
      "Thanks",
      "publisher",
    );
    expect(reply.authorId).toBe("publisher");
    expect((await adapter.list(post, 20)).comments).toContainEqual(reply);
  });
  test("rejects malformed and cross-post cursors and foreign parents", async () => {
    const adapter = new Adapter();
    await expect(adapter.list(post, 20, "bad!")).rejects.toMatchObject({
      kind: "invalid_cursor",
    });
    const cursor = Buffer.from(
      JSON.stringify({
        platform: adapter.platform,
        post: "foreign",
        offset: 1,
      }),
    ).toString("base64url");
    await expect(adapter.list(post, 20, cursor)).rejects.toMatchObject({
      kind: "invalid_cursor",
    });
    expect(await adapter.resolve(post, "foreign-1")).toBeNull();
  });
});
