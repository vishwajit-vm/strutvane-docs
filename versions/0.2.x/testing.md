---
title: "Testing: Getting Started"
description: "Run your app's tests with one command, understand the tests a new app comes with, write your first feature test, and know which kind of test to write for what: unit, feature, database, console and browser tests."
---

A **test** is a small program that uses your app and checks the result: "when Alice posts a title, the API answers 201 and the slug is `my-first-post`". You run all of them with one command, before every commit and in CI, so you find out about a broken feature in seconds instead of from a customer.

Strutvane apps use **Vitest**, a fast test runner for TypeScript (the installer offers Vitest only in 0.2; generated tests never use `node:test`). Feature tests send requests **straight into your app** (no server, no port, no network) against a **real database** of the same kind you use in production. That makes them fast and trustworthy.

:::tip[Coming from Laravel?]
It's Laravel's testing, in Vitest:
- `php artisan test` → `npm test` (which runs `vitest run`);
- `tests/Feature` and `tests/Unit` → `tests/feature/` and `tests/unit/`;
- `$this->getJson('/api/posts')->assertStatus(200)` → `await app.handle(new Request(…))` today, and `await testClient(app).getJson('/api/posts')` then `.assertStatus(200)` once the test client is exported;
- `actingAs($user)` → `.actingAs(user)`, `Http::fake()` → `Http.fake()`; `RefreshDatabase`, Sanctum's token helpers and `Mail::fake()` come later.

What's different: every resource gets **generated** feature tests and **cross-tenant attack tests**, and tests run against your real engine (MySQL or PostgreSQL), not a different one.
:::

:::caution[What exists, and when]
- **On framework `main` (0.2.0-next.0, not on npm yet):** sending requests straight into your app with `app.handle()` (with the test-only switches `actingAs` and `withoutCsrf`, refused outside `APP_ENV=testing`); `Http.fake()` and `Http.preventStrayRequests()`; swapping any service in the container; ORM factories (`defineFactory` from `@strutvane/framework/database`).
- **Built but not exported yet:** the test client `testClient(app)` with `assertStatus`, `assertJsonPath` and `assertProblem`. It lives in the framework (`src/testing/app-client.ts`) but `@strutvane/framework/testing` doesn't export it in 0.2.0-next.0. What that entry exports today (`createTestApp`, `refreshDatabase`, `actingAs`, its own `defineFactory`) is the 0.1 kit for `defineModel` apps.
- **Coming in 0.2:** the rest of the testing kit: the exported test client, `withToken(token)`, `asTenant(team)`, `refreshDatabase` and `seed` for migration-first apps, a transaction per test, a test database per worker on your app's engine, `Mail.fake()`, time travel, console tests, and generated feature and attack tests per resource.
- **Coming in 0.3:** fakes for queues, events, notifications and processes.
- **Coming after 1.0:** browser tests with page objects, `@strutvane/browser-testing` (phase 7). Until then the installer offers `vitest` or `none` only.

Names that aren't proven yet are marked on each page.
:::

## The smallest example

A new app already has tests. Run them:

```bash
npm test
```

**What you'll see** (something like this):

```text
 ✓ tests/feature/health.test.ts (1 test) 4ms
 ✓ tests/feature/posts.test.ts (3 tests) 61ms

 Test Files  2 passed (2)
      Tests  4 passed (4)
   Duration  1.32s
```

Every line with a ✓ is a test file; the numbers are its tests and how long they took. If one fails, you see a ✗, the test's name, and what was expected versus what happened.

## Your first feature test

A **feature test** checks one thing a user can do, through the same HTTP routes the UI uses. Here's a complete one, against the `/api/hello` route from [Routing](../routing/#the-smallest-example). It runs on framework `main` today:

```ts title="tests/feature/hello.test.ts"
import { describe, expect, it } from 'vitest'
import app from '../../bootstrap/app.ts'

describe('hello', () => {
  it('answers guests', async () => {
    const response = await app.handle(new Request('http://localhost/api/hello'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: 'Hello!' })
  })

  it('answers 404 for an unknown path', async () => {
    const response = await app.handle(new Request('http://localhost/api/nope'))
    expect(response.status).toBe(404)
    expect((await response.json()).code).toBe('not_found')
  })
})
```

Read it top to bottom:

1. `bootstrap/app.ts` is your app, the same one `node strut start` serves. Importing it builds it; nothing listens on a port.
2. `app.handle(request)` boots the app on first use and sends the request **straight in**, through middleware, CSRF, routing and your controller, and gives back the `Response`.
3. The assertions are Vitest's own `expect`.

Tests must run with `APP_ENV=testing`. Set it for the whole run in `vitest.config.ts`:

```ts title="vitest.config.ts"
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { env: { APP_ENV: 'testing' } },
})
```

**What you'll see:**

```text
 ✓ tests/feature/hello.test.ts (2 tests) 41ms
```

### The same test with the test client (coming in 0.2)

:::caution[Coming in 0.2]
The test client is built (`testClient(app)`) but not exported from `@strutvane/framework/testing` in 0.2.0-next.0, so this import doesn't resolve yet. `withToken()`, `refreshDatabase(app)` and `seed(app)` for migration-first apps aren't built yet.
:::

```ts title="tests/feature/posts.test.ts"
import { describe, it } from 'vitest'
import { testClient } from '@strutvane/framework/testing'
import app from '../../bootstrap/app.ts'

describe('posts', () => {
  it('lists posts for guests', async () => {
    ;(await testClient(app).getJson('/api/posts')).assertStatus(200)
  })

  it('stops other authors from editing it', async () => {
    const bob = { id: '2', type: 'user', roles: [], attrs: {} }
    ;(await testClient(app).actingAs(bob).patchJson('/api/posts/hello-world', { title: 'Mine now' })).assertProblem(403, 'forbidden')
  })
})
```

The leading `;` before `(await …)` is only there because the line starts with a parenthesis; it stops JavaScript from joining it to the line above.

## The kinds of tests

| Kind | What it checks | Where | Speed | Page |
|---|---|---|---|---|
| **Unit** | one function or class, no app (a policy, a cast, a price calculation) | `tests/unit/` | microseconds | below |
| **Feature (HTTP)** | a route, end to end: validation, policies, database, response | `tests/feature/` | milliseconds | [HTTP Tests](../http-tests/) |
| **Database** | what's stored: rows, soft deletes, tenancy | `tests/feature/` | milliseconds | [Database Testing](../database-testing/) |
| **Console** | a `node strut` command: questions, output, exit code | `tests/feature/` | milliseconds | [below](#console-tests) |
| **Browser** | the real UI in a real browser | `tests/browser/` | seconds | [Browser Tests](../browser-tests/) |

Write mostly feature tests: they catch the most with the least code. Add unit tests for tricky logic, and a few browser tests for the paths that must never break (sign-in, checkout).

### A unit test

```ts title="tests/unit/post.policy.test.ts"
import { allows } from '@strutvane/framework'   // not exported yet in 0.2.0-next.0: see Authorization
import { expect, it } from 'vitest'
import { PostPolicy } from '../../app/policies/post.policy.ts'
import type { Post } from '../../app/models/post.ts'

it('hides drafts from other authors', async () => {
  const draft = { id: 10, status: 'draft', author_id: 1 } as unknown as Post
  expect(await allows(new PostPolicy(), 'view', { id: '2', type: 'user', roles: [], attrs: {} }, draft)).toBe(false)
})
```

**What you'll see:** `✓ tests/unit/post.policy.test.ts (1 test) 2ms`. Until `allows()` is exported, call the policy method directly: `expect(new PostPolicy().view(bob, draft)).toBe(false)`.

## Running tests

| Command | What it runs |
|---|---|
| `npm test` | every test once (`vitest run`, as in CI) |
| `npx vitest` | watch mode: re-runs the tests touched by each file you save |
| `npx vitest tests/feature/posts.test.ts` | one file |
| `npx vitest -t "lets an author"` | tests whose name contains that text |
| `npx vitest --coverage` | with a coverage report |
| `npm run test:e2e` | browser tests, once you set up Playwright (see [Browser Tests](../browser-tests/)) |

## Test settings and the test database

Tests always run with `APP_ENV=testing`. That switches on a few test-only things:

- a test may skip the CSRF check and pick the signed-in user (`app.handle(request, { testing: { withoutCsrf: true, actor } })`, or the test client's `withoutCsrf()` and `actingAs()`); any other environment refuses the request with `withoutCsrf()/actingAs() was used with APP_ENV=local.`;
- `APP_DEBUG=true` shows the debug page, as in `local`.

:::caution[Coming in 0.2]
A separate test database written by the installer (`DB_TEST_DATABASE`), a database per Vitest worker and a transaction per test are designed, not built. Until then, point tests at their own database yourself; see [Database Testing](../database-testing/).
:::

The planned layout keeps your tests away from your development data with a **separate test database** next to your development one:

| Database | `.env` key | Value |
|---|---|---|
| SQLite | `DB_TEST_DATABASE` | `database/testing.sqlite` |
| MySQL or PostgreSQL | `DB_TEST_DATABASE` | `<app name>_test` (created with the right grants by the Docker setup) |

The plan for 0.2: each Vitest **worker** (Vitest runs files in parallel) gets its own copy of that database, and each test runs inside a **transaction that is rolled back** at the end. So tests never see each other's rows and can run in parallel. See [Database Testing](../database-testing/).

## Console tests

A **console test** runs a `node strut` command and checks its questions, output and exit code, Laravel's `expectsQuestion()` style:

:::caution[Coming in 0.2]
**Planned API (a sketch: names may change).** The parity checklist names `strut('cmd').expectsQuestion()…`; the rest follows Laravel's console assertions.
:::

```ts title="tests/feature/make-policy.test.ts"
import { strut } from '@strutvane/framework/testing'
import { it } from 'vitest'

it('asks for the model when none is given', async () => {
  await strut(app, 'make:policy')
    .expectsQuestion('Which model is this policy for?', 'Post')
    .expectsOutput('Created app/policies/post.policy.ts')
    .assertExitCode(0)
})
```

## Tests you get for free

When `node strut migrate` creates the API for a new table, it also writes **owned** test files for it (you can edit them; they're never overwritten):

- **feature tests**: list, show, create, update, delete, validation errors, and denials per role;
- **cross-tenant attack tests** (with teams): team A tries to read, change, delete, search and count team B's posts, and must get `404` or an empty list every time;
- **security tests**: CSRF refusal, mass assignment, and enumeration (a hidden post answers exactly like a missing one).

:::caution[Coming in 0.2]
Generated tests are part of the 0.2 testing kit (blueprint §5), not built yet.
:::

## Platform and Docker differences

- **Docker mode:** `npm test` on your computer is forwarded into the `app` container, where the test database lives. You type the same command.
- **Without Docker:** tests run on your machine against the test database in `.env`.
- **Windows (PowerShell):** setting a variable for one run looks different:

  **macOS / Linux:**

  ```bash
  DB_CONNECTION=sqlite npm test
  ```

  **Windows (PowerShell):**

  ```powershell
  $env:DB_CONNECTION='sqlite'; npm test
  ```

- **CI:** the generated GitHub Actions workflow (installer question 25) runs `npm test` on every push. The framework's own CI runs on real MySQL and PostgreSQL; do the same for your app by giving CI the same engine as production.

## Common mistakes

### A test fails with "Expected status 201, got 419"

```text
Error: Expected status 201, got 419. Body: {"type":"https://strutvane.dev/errors/csrf-token-mismatch","title":"Page expired","status":419,"code":"csrf_token_mismatch",…}
```

**Why:** the request used a session cookie, so the CSRF check applies, as it does for a real browser.
**Fix:** send the request without the cookie (a bearer token, once your auth package issues them), or skip the check in this test only:

```ts
await app.handle(
  new Request('http://localhost/api/posts', {
    method: 'POST',
    headers: { cookie: 'strutvane_session=abc', 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Hi' }),
  }),
  { testing: { withoutCsrf: true } },
)
```

### My tests pass alone but fail together

**Why:** one test left rows, a fake or a changed setting behind that another test sees: `bootstrap/app.ts` is one app shared by every test in a file, and the ORM connection is shared by the whole process.
**Fix:** undo what a test changes (`afterEach`), give each test its own rows, and clean the tables a test writes to; see [Database Testing](../database-testing/).

### "was called outside a request or console command"

```text
route() was called outside a request or console command, so there is no current app.
→ Call it from a controller, middleware or command, or wrap the code in app.run(() => …) (tests: await app.run(async () => …)).
```

**Why:** helpers such as `route()`, `config()` and `encrypt()` need a current app, and test code runs outside one.
**Fix:** wrap the call: `await app.run(async () => route('posts.show', { post }))`.

### Tests touch my development data

**Why:** the tests use the `DB_*` settings from `.env`, which name your development database (`DB_TEST_DATABASE` isn't read yet in 0.2.0-next.0).
**Fix:** give the test run its own database in `vitest.config.ts` (`test: { env: { APP_ENV: 'testing', DB_DATABASE: 'database/testing.sqlite' } }`), as on [Database Testing](../database-testing/).

### `npm test` says "no test files found"

**Why:** test files must end in `.test.ts` (browser tests: `.spec.ts`) and live under `tests/`.
**Fix:** rename `posts.ts` to `posts.test.ts`.

## Next steps

- [HTTP Tests](../http-tests/): every request helper and assertion.
- [Database Testing](../database-testing/): factories, seeders and checking rows.
- [Mocking](../mocking/): fakes for HTTP, the clock and any service.
- [Browser Tests](../browser-tests/): testing the real UI.
