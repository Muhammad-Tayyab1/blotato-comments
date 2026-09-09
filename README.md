# Blotato comment API take-home

A small NestJS / strict TypeScript / Prisma / PostgreSQL implementation of retrieving and replying to comments on published social posts. The focus is publication ownership, provider abstraction, and snapshot persistence.

## Scope and partial implementation

The REST endpoints, application logic, database migration, seed, and snapshot writes are implemented. **Mock Alpha and Mock Beta are deterministic, in-memory social providers, not integrations with verified real platform APIs.** Alpha uses nested users, message fields, and ISO timestamps; Beta uses actor tuples, nested bodies, and epoch milliseconds. Each adapter normalizes its own format. Replies mutate its fixtures and are visible on subsequent reads in the same process.

Real provider HTTP integration is the intentionally deferred part. No external accounts, credentials, OAuth, frontend, queues, or background workers are needed.

## Run locally

Requires Node.js 22+, npm, and Docker Compose. PostgreSQL binds to localhost port 55432; the API binds to localhost port 3000.

```sh
cp .env.example .env
npm ci
npm run generate
docker compose up -d --wait
npm run migrate
npm run seed
npm run dev
```

`npm run dev` uses ts-node so Nest constructor injection metadata is emitted; restart it after edits.

For a compiled run:

```sh
npm run build
npm start
```

The identity stub must be explicitly enabled with `DEV_IDENTITY_STUB=true`. Startup rejects `NODE_ENV=production`. It always supplies `workspace-demo`, ignores client identity headers, and is **development-only, not authentication**. Replace it with the existing application's authenticated workspace identity before deployment.

```sh
npm run typecheck
npm test
npm run test:db
npm run build
```

`npm test` runs adapter/service unit tests and HTTP integration tests using the real Nest controller, service, adapters, and error filter with an in-memory database test double. `npm run test:db` separately applies migrations and exercises actual PostgreSQL uniqueness/upserts, workspace ownership, unpublished/missing publication rejection, foreign-parent rejection, and replies to uncached parents. It requires `TEST_DATABASE_URL` pointing to a local database named exactly `blotato_test`; the script refuses other hosts/names and never resets a database. It deletes only this test's Alpha/Beta snapshots in that dedicated database. Do not point it at valuable data.

Compose creates both databases on first volume initialization. If an existing project volume predates the test database, create it once:

```sh
docker compose exec postgres createdb -U blotato blotato_test
```

The seed is repeatable and does not delete data. Stop PostgreSQL with `docker compose down`; this preserves its volume.

## Seed and curl examples

| Entity                                  | ID / provider ID                                       |
| --------------------------------------- | ------------------------------------------------------ |
| Current workspace                       | `workspace-demo`                                       |
| Logical post (shared by both platforms) | `post-demo`                                            |
| Alpha account                           | `account-alpha`                                        |
| Beta account                            | `account-beta`                                         |
| Alpha publication / external post       | `pub-alpha` / `alpha-post`                             |
| Beta publication / external post        | `pub-beta` / `beta-post`                               |
| Draft publication                       | `pub-draft`                                            |
| Other workspace's publication           | `pub-other`                                            |
| Initial comment IDs                     | `alpha-1` through `alpha-3`; `beta-1` through `beta-3` |

```sh
curl 'http://localhost:3000/v1/publications/pub-alpha/comments?limit=2'
curl 'http://localhost:3000/v1/publications/pub-beta/comments?limit=2'

curl -X POST 'http://localhost:3000/v1/publications/pub-alpha/comments/alpha-1/replies' \
  -H 'Content-Type: application/json' -d '{"text":"Thanks for your feedback!"}'
curl -X POST 'http://localhost:3000/v1/publications/pub-beta/comments/beta-1/replies' \
  -H 'Content-Type: application/json' -d '{"text":"Thanks for your feedback!"}'

# Includes the replies just created:
curl 'http://localhost:3000/v1/publications/pub-alpha/comments'
curl 'http://localhost:3000/v1/publications/pub-beta/comments'
```

## Database design

See `prisma/schema.prisma` and the checked-in SQL migration.

- A workspace owns posts and social accounts. A post has multiple publications; each publication refers to one connected social account. Both the post and account must belong to the current workspace for the service to grant access. The schema's foreign keys ensure existence; the service checks both ownership paths to also reject inconsistent cross-workspace links. Existing publishing code would enforce that invariant when creating publications.
- A publication has a status and nullable external post ID (drafts need not have a provider ID). A published publication must have an external ID to support comments.
- `(workspaceId, platform, externalAccountId)` uniquely identifies an account within its workspace. `(socialAccountId, externalPostId)` prevents duplicate publications of the same external post for that account. Platform is a string so adding adapters does not require a platform enum migration.
- Comment snapshots are unique on `(publicationId, externalCommentId)`. External IDs are strings and cannot be assumed globally unique. The nullable parent ID is an external string, deliberately **not a local foreign key**: parents may be on an unfetched page.
- Each snapshot records author ID/name, text, provider timestamp, and last fetched timestamp. Indexes support workspace post lookup, publication lookup by post, and snapshots by publication/time. The compound unique indexes also support account and comment lookups.
- Providers are the source of truth. Reads always fetch the provider and upsert that page in a transaction. Missing items on a page are never removed. There is no offline database-read fallback or independent authoritative comment store. Provider credentials are not stored.

## REST contract

`GET /v1/publications/:publicationId/comments?limit=20&cursor=...`

Resolves an owned published publication, selects its adapter, fetches and normalizes a page, persists snapshots, and returns HTTP 200:

```json
{
  "comments": [
    {
      "externalCommentId": "alpha-1",
      "externalParentCommentId": null,
      "authorId": "reader-1",
      "authorName": "Reader 1",
      "text": "Comment 1",
      "providerTimestamp": "2026-01-01T12:00:01.000Z"
    }
  ],
  "nextCursor": "eyJwbGF0Zm9ybSI6Im1vY2stYWxwaGEiLCJwb3N0IjoiYWxwaGEtcG9zdCIsIm9mZnNldCI6MX0"
}
```

This example uses `limit=1`. Listing is a flat list of **both top-level comments and replies**, ordered by fixture insertion (initial fixtures have increasing timestamps). The last initial comment is a reply to the first. Limit defaults to 20, with integer bounds 1–100. Pass `nextCursor` unchanged as the next request's `cursor`; `null` means the end. Mock cursors encode platform, external post, and offset, are validated by the adapter, and are not authentication tokens. Empty, malformed, out-of-range, or mismatched cursors return 400. They are intended for one running mock process, not durable bookmarks. Real adapters would implement provider-native pagination and normalize its token. Snapshot persistence does not imply a stable provider-side pagination snapshot.

`POST /v1/publications/:publicationId/comments/:externalCommentId/replies`

```json
{ "text": "Thanks for your feedback!" }
```

Text is trimmed and must contain 1–2000 JavaScript string code units. The service checks workspace ownership, publication status, reply capability, and resolves the parent **within the external post through the adapter**, even when uncached. It sends the reply using that publication's external social-account identity, persists the result, and returns HTTP 201:

```json
{
  "externalCommentId": "mock-alpha-reply-4",
  "externalParentCommentId": "alpha-1",
  "authorId": "account-alpha",
  "authorName": "Demo publisher",
  "text": "Thanks for your feedback!",
  "providerTimestamp": "2026-01-01T12:00:04.000Z"
}
```

Both mocks support replies; tests inject a disabled capability to exercise the unsupported path. URL-encode external IDs in path segments. Snapshot database IDs and fetched timestamps are internal and omitted from the API.

All errors have one envelope, without raw provider messages or internal exception details:

```json
{
  "error": {
    "code": "PUBLICATION_NOT_FOUND",
    "message": "Publication not found."
  }
}
```

| Status | Meaning / representative codes                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Invalid text, limit, cursor, or malformed request (`INVALID_TEXT`, `INVALID_LIMIT`, `INVALID_CURSOR`; framework parse errors use `HTTP_ERROR`) |
| 404    | Missing or inaccessible publication (`PUBLICATION_NOT_FOUND`), parent absent from this external post (`COMMENT_NOT_FOUND`)                     |
| 409    | Unpublished or missing external post ID (`NOT_PUBLISHED`)                                                                                      |
| 422    | Unsupported platform/reply capability (`UNSUPPORTED_PLATFORM`, `REPLIES_UNSUPPORTED`)                                                          |
| 429    | Normalized provider throttling (`PROVIDER_RATE_LIMIT`)                                                                                         |
| 502    | Normalized provider failure (`PROVIDER_FAILURE`)                                                                                               |
| 500    | Unexpected internal/persistence failure (`INTERNAL_ERROR`)                                                                                     |

Cross-workspace access returns the same 404 as missing resources, avoiding an existence leak. The mock providers do not simulate network failures through public magic inputs; tests inject typed provider failures to verify the error paths.

## Architecture and extension

`CommentsController` handles HTTP input and obtains the development workspace. `CommentsService` authorizes and orchestrates provider calls plus Prisma writes. The injected `AdapterRegistry` looks up the account's platform. `PlatformAdapter` exposes `list`, `resolve`, `reply`, and `supportsReplies`; controllers/services have no provider-specific branches. `ErrorFilter` maps typed provider errors to a safe common envelope.

To add a third provider, implement `PlatformAdapter`, normalize its response types and errors inside that adapter, and register it in the `ADAPTERS` factory. No comment controller change is needed. A real adapter would use an authenticated account-specific HTTP client supplied by the existing connection system, translate pagination, verify parent membership, and map rate limits/timeouts into `ProviderError`. The demo passes the external account ID for writes; production credential selection would be scoped to the social-account record, not to caller-supplied IDs.

## Assumptions and decisions

Social-account connection and post publishing already exist. One logical post can have separate platform publications, and each comment request targets exactly one publication. Replies use its connected account. Only published publications support these operations. Replies are text-only. Authentication normally comes from the existing application; the explicit fixed-workspace stub makes this demo runnable while service ownership checks remain in place.

Editing, deleting, webhooks, and background synchronization are out of scope. The 2000-character bound is a demo policy, not a claim about actual platform limits. Provider timestamps and reply IDs in the mocks are deterministic for interview reproducibility. The five models, one service, and small registry keep the main flows easy to trace.

## Reliability and limitations

Implemented: ownership/status checks before provider access, parent membership validation, capability checks, bounded input, page upserts with compound uniqueness, safe error responses, separate test database guards, and **no automatic retry of reply creation**.

Production considerations, intentionally deferred:

- A timeout may occur after a provider accepted a reply. Repeated client submissions can create duplicates. Local snapshot uniqueness prevents duplicate rows for one provider ID; it does not make reply creation idempotent. Use provider-supported idempotency keys where available and design an account/publication-scoped request ledger and reconciliation strategy before promising exactly-once behavior.
- Provider success followed by database failure returns 500 even though the reply exists upstream. A later listing can repair the snapshot; the client must not assume a retry is safe. A durable reconciliation subsystem is not implemented.
- Typed 429 responses are implemented; actual quota tracking, provider `Retry-After` propagation, read backoff, timeouts, observability, and production authentication are future work.
- Mock writes live only in memory and reset on restart. Database snapshots survive, so old reply snapshots may remain after the mock restarts. Listings still return provider fixtures, not stale database rows. Mock IDs can be reused after restart. Run one API process; these fixtures do not model distributed provider state.

Dependency audit during verification reported eight high-severity findings in the transitive Nest/Multer and Prisma configuration toolchain. No forced major-version downgrade or unverified dependency override was applied. Review `npm audit` before any production use; this demo has no upload routes or untrusted Prisma configuration.

## Verification performed

Verified on Node.js 22.22.2 with isolated local PostgreSQL 14.20: dependency installation, Prisma generation, migration and seed, strict type checking, all 32 Jest tests, separate PostgreSQL persistence checks, formatting, and compilation passed. Both development and compiled API startup worked. Live smoke tests for both platforms returned GET 200 and POST 201, then retrieved the created reply.

Compose configuration validation passed, but the PostgreSQL 16 container could not be started because the Docker daemon was not running. To verify that specific runtime after starting Docker Desktop, run:

```sh
docker compose up -d --wait
npm run migrate
npm run seed
npm run test:db
```

## AI usage

AI assistance was used to implement the code, develop and run tests, and write documentation. This disclosure does not assert that the submitting candidate has personally reviewed or verified the result. The candidate should review the implementation and be prepared to explain its decisions before submission.
