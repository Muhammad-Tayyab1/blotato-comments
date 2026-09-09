import { CommentsService } from "../src/comments.service";
import { AdapterRegistry } from "../src/adapters/registry";
import { MockAlphaAdapter, MockBetaAdapter } from "../src/adapters/mocks";
import { fakeDatabase } from "./helpers";
import { ProviderError } from "../src/adapters/platform";
function setup() {
  const f = fakeDatabase();
  const alpha = new MockAlphaAdapter();
  const service = new CommentsService(
    f.db,
    new AdapterRegistry([alpha, new MockBetaAdapter()]),
  );
  return { ...f, alpha, service };
}
test("lists both adapters and upserts snapshots without deleting other pages", async () => {
  const { service, snapshots, raw } = setup();
  await service.list("workspace-demo", "pub-alpha", 20);
  await service.list("workspace-demo", "pub-alpha", 1);
  await service.list("workspace-demo", "pub-beta", 20);
  expect(snapshots.size).toBe(6);
  expect(raw.commentSnapshot.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        publicationId_externalCommentId: {
          publicationId: "pub-alpha",
          externalCommentId: "alpha-1",
        },
      },
    }),
  );
});
test("replies to a valid uncached parent and reads the reply", async () => {
  const { service, snapshots } = setup();
  expect(snapshots.size).toBe(0);
  const reply = await service.reply(
    "workspace-demo",
    "pub-alpha",
    "alpha-1",
    " Thanks ",
  );
  expect(reply.text).toBe("Thanks");
  expect(snapshots.size).toBe(1);
  expect(
    (await service.list("workspace-demo", "pub-alpha", 20)).comments,
  ).toContainEqual(reply);
});
test.each(["", "   ", null, 12, "a".repeat(2001)])(
  "rejects invalid text %p",
  async (text) => {
    const { service, raw } = setup();
    await expect(
      service.reply("workspace-demo", "pub-alpha", "alpha-1", text),
    ).rejects.toMatchObject({ status: 400 });
    expect(raw.publication.findFirst).not.toHaveBeenCalled();
  },
);
test.each([
  ["missing", 404],
  ["pub-draft", 409],
  ["pub-other", 404],
])("rejects %s for reads and replies", async (id, status) => {
  const { service, alpha } = setup();
  const spy = jest.spyOn(alpha, "list");
  await expect(
    service.list("workspace-demo", String(id), 20),
  ).rejects.toMatchObject({ status });
  await expect(
    service.reply("workspace-demo", String(id), "alpha-1", "Hi"),
  ).rejects.toMatchObject({ status });
  expect(spy).not.toHaveBeenCalled();
});
test("rejects parent belonging to another external publication", async () => {
  const { service } = setup();
  await expect(
    service.reply("workspace-demo", "pub-alpha", "other-1", "Hi"),
  ).rejects.toMatchObject({ status: 404 });
});
test("enforces reply capability before provider writes", async () => {
  const { service, alpha } = setup();
  Object.defineProperty(alpha, "supportsReplies", { value: false });
  const spy = jest.spyOn(alpha, "reply");
  await expect(
    service.reply("workspace-demo", "pub-alpha", "alpha-1", "Hi"),
  ).rejects.toMatchObject({ status: 422 });
  expect(spy).not.toHaveBeenCalled();
});
test("does not retry an uncertain provider write", async () => {
  const { service, alpha } = setup();
  const spy = jest
    .spyOn(alpha, "reply")
    .mockRejectedValue(new ProviderError("failure"));
  await expect(
    service.reply("workspace-demo", "pub-alpha", "alpha-1", "Hi"),
  ).rejects.toMatchObject({ kind: "failure" });
  expect(spy).toHaveBeenCalledTimes(1);
});
