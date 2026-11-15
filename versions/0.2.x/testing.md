---
title: "Testing: Getting Started"
description: "Run your app's tests with one command, understand the tests a new app comes with, write your first feature test, and know which kind of test to write for what: unit, feature, database, console and browser tests."
---

A **test** is a small program that uses your app and checks the result: "when Alice posts a title, the API answers 201 and the slug is `my-first-post`". You run all of them with one command, before every commit and in CI, so you find out about a broken feature in seconds instead of from a customer.

Strutvane apps use **Vitest**, a fast test runner for TypeScript. Feature tests send requests **straight into your app** (no server, no port, no network) against a **real database** of the same kind you use in production. That makes them fast and trustworthy.

:::tip[Coming from Laravel?]
It's Laravel's testing, in Vitest:
- `php artisan test` → `npm test` (which runs `node strut test`);
- `tests/Feature` and `tests/Unit` → `tests/feature/` and `tests/unit/`;
- `$this->getJson('/api/posts')->assertStatus(200)` → `await client(app).getJson('/api/posts')` then `.assertStatus(200)`;
- `RefreshDatabase` → `refreshDatabase(app)`, `actingAs($user)` → `.actingAs(…)`, `Mail::fake()` → `Mail.fake()`.

What's different: every resource gets **generated** feature tests and **cross-tenant attack tests**, and tests run against your real engine (MySQL or PostgreSQL), not a different one.
:::

:::caution[What exists, and when]
- **Proven in a prototype:** the request client and response assertions (`client(app)`, `assertStatus`, `assertJsonPath`, `assertProblem`, `withoutCsrf()`), `refreshDatabase(app)` from a schema dump, and a generated app's feature test (spike 12). The installer writes the test setup (spike 13).
- **Coming in 0.2:** the full testing kit: a transaction per test, a test database per worker on your app's engine, `actingAs(user)` with real sign-in, `asTenant(team)`, `Mail.fake()`, `Http.fake()`, time travel, console tests, and generated feature and attack tests per resource.
- **Coming in 0.3:** fakes for queues, events, notifications and processes.
- **Planned after 0.3:** browser tests with page objects, `@strutvane/browser-testing` (phase 7).

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

A **feature test** checks one thing a user can do, through the same HTTP routes the UI uses. Here's a complete one for the posts API:

```ts title="tests/feature/posts.test.ts"
import { beforeEach, describe, it } from 'vitest'
import type { Application } from '@strutvane/framework'
import { client, refreshDatabase } from '@strutvane/framework/testing'
import { createApp } from '../../bootstrap/app.ts'
import { DatabaseSeeder, demoTokens } from '../../database/seeders/database.seeder.ts'

let app: Application

beforeEach(async () => {
  app = createApp({ APP_ENV: 'testing', APP_KEY: 'base64:dGVzdGluZy1rZXktdGVzdGluZy1rZXktdGVzdGluZy0=', DB_CONNECTION: 'sqlite', DB_DATABASE: ':memory:' })
  await refreshDatabase(app)
  await app.run(() => new DatabaseSeeder().run())
})

describe('posts', () => {
  it('lists published posts for guests', async () => {
    ;(await client(app).getJson('/api/posts')).assertStatus(200).assertJsonPath('meta.total', 3)
  })

  it('lets an author write a post', async () => {
    const response = await client(app).actingAs(demoTokens.alice).postJson('/api/posts', { title: 'My second post' })
    response.assertStatus(201).assertJsonPath('data.slug', 'my-second-post').assertJsonPath('data.status', 'draft')
  })

  it('stops other authors from editing it', async () => {
    ;(await client(app).actingAs(demoTokens.bob).patchJson('/api/posts/hello-world', { title: 'Mine now' })).assertProblem(403, 'forbidden')
  })
})
```

This is the prototype's own example-app test. Read it top to bottom:

1. `createApp({...})` builds **a fresh app** for each test, with test settings: `APP_ENV=testing` and an in-memory SQLite database.
2. `refreshDatabase(app)` creates every table from the schema your migrations produce (in milliseconds, without replaying each migration).
3. The seeder adds three published posts and two authors.
4. `client(app)` sends requests directly into the app, and each response has assertions you can chain.

**What you'll see:**

```text
 ✓ tests/feature/posts.test.ts (3 tests) 61ms
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
import { allows } from '@strutvane/framework'
import { expect, it } from 'vitest'
import { PostPolicy } from '../../app/policies/post.policy.ts'
import type { Post } from '../../app/models/post.ts'

it('hides drafts from other authors', async () => {
  const draft = { id: 10, status: 'draft', author_id: 1 } as unknown as Post
  expect(await allows(new PostPolicy(), 'view', { id: 2, is_admin: false }, draft)).toBe(false)
})
```

**What you'll see:** `✓ tests/unit/post.policy.test.ts (1 test) 2ms`.

## Running tests

| Command | What it runs |
|---|---|
| `npm test` | every test once (`node strut test`, as in CI) |
| `npx vitest` | watch mode: re-runs the tests touched by each file you save |
| `npx vitest tests/feature/posts.test.ts` | one file |
| `npx vitest -t "lets an author"` | tests whose name contains that text |
| `npx vitest --coverage` | with a coverage report |
| `npm run test:e2e` | browser tests (when you picked Playwright) |

## Test settings and the test database

Tests always run with `APP_ENV=testing`. That switches on a few test-only things:

- the test client may skip the CSRF check with `withoutCsrf()` (it's refused in every other environment);
- error responses include the developer `hint`;
- mail goes nowhere real.

Your tests never touch your development data. The installer creates a **separate test database** next to your development one and writes its name to `.env`:

| Database | `.env` key | Value |
|---|---|---|
| SQLite | `DB_TEST_DATABASE` | `database/testing.sqlite` |
| MySQL or PostgreSQL | `DB_TEST_DATABASE` | `<app name>_test` (created with the right grants by the Docker setup) |

In 0.2, each Vitest **worker** (Vitest runs files in parallel) gets its own copy of that database, and each test runs inside a **transaction that is rolled back** at the end. So tests never see each other's rows and can run in parallel. See [Database Testing](../database-testing/).

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
Error: Expected status 201, got 419. Body: {"type":"about:blank","title":"Page expired","status":419,"code":"csrf_token_mismatch",…}
```

**Why:** the request used a session cookie, so the CSRF check applies, as it does for a real browser.
**Fix:** use a bearer token (`actingAs(token)` in the prototype), or skip the check in this test only:

```ts
await client(app).withHeaders({ cookie: 'strutvane_session=abc' }).withoutCsrf().postJson('/api/posts', { title: 'Hi' })
```

### My tests pass alone but fail together

**Why:** one test left rows, a fake or a changed setting behind that another test sees. Usually a shared `app` built once at the top of the file instead of in `beforeEach`.
**Fix:** build the app and refresh the database in `beforeEach`, as in the example above.

### "was called outside a request or console command"

```text
✖ route() was called outside a request or console command, so there is no current app.
→ Call it from a controller, middleware or command, or wrap the code in app.run(() => …) (tests: await app.run(async () => …)).
```

**Why:** helpers such as `route()`, `config()` and `encrypt()` need a current app, and test code runs outside one.
**Fix:** wrap the call: `await app.run(async () => route('posts.show', { post }))`.

### Tests touch my development data

**Why:** `DB_TEST_DATABASE` is missing from `.env`, or a test sets `DB_DATABASE` to the development file.
**Fix:** restore the key (`DB_TEST_DATABASE=database/testing.sqlite`, or `<app>_test` for a server) and never point tests at the development database.

### `npm test` says "no test files found"

**Why:** test files must end in `.test.ts` (browser tests: `.spec.ts`) and live under `tests/`.
**Fix:** rename `posts.ts` to `posts.test.ts`.

## Next steps

- [HTTP Tests](../http-tests/): every request helper and assertion.
- [Database Testing](../database-testing/): factories, seeders and checking rows.
- [Mocking](../mocking/): fakes for mail, HTTP and time.
- [Browser Tests](../browser-tests/): testing the real UI.
