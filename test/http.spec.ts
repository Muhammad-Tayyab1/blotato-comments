import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule, configure } from "../src/app";
import { Database } from "../src/database";
import { ADAPTERS } from "../src/adapters/registry";
import { MockAlphaAdapter, MockBetaAdapter } from "../src/adapters/mocks";
import { ProviderError } from "../src/adapters/platform";
import { fakeDatabase } from "./helpers";
let app: INestApplication;
let alpha: MockAlphaAdapter;
beforeEach(async () => {
  alpha = new MockAlphaAdapter();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Database)
    .useValue(fakeDatabase().db)
    .overrideProvider(ADAPTERS)
    .useValue([alpha, new MockBetaAdapter()])
    .compile();
  app = module.createNestApplication();
  configure(app);
  await app.init();
});
afterEach(async () => {
  await app.close();
});
test("GET pagination and POST 201 then GET for both platforms", async () => {
  for (const platform of ["alpha", "beta"]) {
    const path = `/v1/publications/pub-${platform}/comments`;
    const first = await request(app.getHttpServer())
      .get(path + "?limit=2")
      .expect(200);
    expect(first.body.comments).toHaveLength(2);
    expect(first.body.comments[0].providerTimestamp).toBe(
      "2026-01-01T12:00:01.000Z",
    );
    await request(app.getHttpServer())
      .get(path)
      .query({ cursor: first.body.nextCursor })
      .expect(200)
      .expect((r) => expect(r.body.comments).toHaveLength(1));
    const reply = await request(app.getHttpServer())
      .post(`${path}/${platform}-1/replies`)
      .send({ text: "Thanks!" })
      .expect(201);
    await request(app.getHttpServer())
      .get(path)
      .expect(200)
      .expect((r) => expect(r.body.comments).toContainEqual(reply.body));
  }
});
test.each([
  "limit=0",
  "limit=101",
  "limit=1.5",
  "limit=abc",
  "limit=1&limit=2",
  "cursor=",
  "cursor=bad!",
])("validates %s", async (query) => {
  await request(app.getHttpServer())
    .get("/v1/publications/pub-alpha/comments?" + query)
    .expect(400)
    .expect((r) => expect(r.body.error.code).toMatch(/^INVALID_/));
});
test("safe input and authorization errors", async () => {
  await request(app.getHttpServer())
    .post("/v1/publications/pub-alpha/comments/alpha-1/replies")
    .send({ text: " " })
    .expect(400);
  await request(app.getHttpServer())
    .get("/v1/publications/pub-other/comments")
    .expect(404);
  await request(app.getHttpServer())
    .get("/v1/publications/pub-draft/comments")
    .expect(409);
});
test.each([
  ["failure", 502, "PROVIDER_FAILURE"],
  ["rate_limit", 429, "PROVIDER_RATE_LIMIT"],
] as const)("maps provider %s safely", async (kind, status, code) => {
  jest.spyOn(alpha, "list").mockRejectedValue(new ProviderError(kind));
  await request(app.getHttpServer())
    .get("/v1/publications/pub-alpha/comments")
    .expect(status)
    .expect({
      error: {
        code,
        message:
          kind === "failure"
            ? "Social provider request failed."
            : "Social provider rate limit reached.",
      },
    });
});
test("hides unexpected internal exception details", async () => {
  jest.spyOn(alpha, "list").mockRejectedValue(new Error("secret token"));
  await request(app.getHttpServer())
    .get("/v1/publications/pub-alpha/comments")
    .expect(500)
    .expect({
      error: { code: "INTERNAL_ERROR", message: "An internal error occurred." },
    });
});

test("normalizes framework errors into the same envelope", async () => {
  await request(app.getHttpServer())
    .post("/v1/publications/pub-alpha/comments/alpha-1/replies")
    .set("Content-Type", "application/json")
    .send('{"text":')
    .expect(400)
    .expect({
      error: { code: "HTTP_ERROR", message: "Request could not be processed." },
    });
  await request(app.getHttpServer())
    .get("/does-not-exist")
    .expect(404)
    .expect({
      error: { code: "HTTP_ERROR", message: "Request could not be processed." },
    });
});
