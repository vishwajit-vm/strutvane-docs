---
title: "HTTP Tests"
description: "Test your routes end to end without a server: send JSON requests as a guest, a user or a token, check status codes, JSON paths and error responses, test CSRF, validation, policies and tenancy, and read failure messages."
---

An **HTTP test** (a feature test) sends a request to one of your routes and checks the response, exactly as a browser or another program would see it: the status code, the JSON body, the headers. It goes through everything: middleware, CSRF, validation, policies, the database. If an HTTP test passes, the feature works.

Requests go **straight into your app** in the same process: no server, no port, no network. A typical test takes a few milliseconds.

:::tip[Coming from Laravel?]
`$this->getJson('/api/posts')` → `await testClient(app).getJson('/api/posts')`, `$this->actingAs($user)` → `testClient(app).actingAs(user)`, `assertStatus(201)`, `assertJsonPath('data.slug', 'x')` keep their names, and Laravel's `assertJsonValidationErrors` becomes `assertProblem(422, 'validation_failed')` plus a look at `issues`. Underneath it all is `app.handle(request)`, which you can call yourself today.

What's different: the client is **immutable** (each `actingAs()`, `withCookie()` or `withHeaders()` gives a new client), and every error is an RFC 9457 problem with a stable `code`, so you assert on the code instead of on English text.
:::

:::caution[What exists, and when]
**On framework `main` (0.2.0-next.0, not on npm yet):** `app.handle(request, info)`, which sends a request straight into your app, with the test-only switches `info.testing.actor` and `info.testing.withoutCsrf` (refused unless `APP_ENV=testing`).

**Built but not exported yet:** the test client on this page, `testClient(app)`: `actingAs()`, `withoutCsrf()`, `withHeaders()`, `withCookie()`, `fromIp()`, the request methods, and `assertStatus`, `assertJsonPath` and `assertProblem`. It's in the framework (`src/testing/app-client.ts`), but `@strutvane/framework/testing` doesn't export it in 0.2.0-next.0, so `import { testClient }` doesn't resolve yet. Every `testClient` example below shows the API it has.

**Coming in 0.2:** `withToken(token)`, `asTenant(team)`, a real signed-in session for `actingAs()`, and the fluent JSON and validation assertions. Those parts are marked below.
:::

## The smallest example

This runs on framework `main` today, against the `/api/hello` route from [Routing](../routing/#the-smallest-example):

```ts title="tests/feature/hello.test.ts"
import { expect, it } from 'vitest'
import app from '../../bootstrap/app.ts'

it('says hello', async () => {
  const response = await app.handle(new Request('http://localhost/api/hello'))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ message: 'Hello!' })
})
```

Run it with `APP_ENV=testing` (set in `vitest.config.ts`, see [Testing](../testing/#your-first-feature-test)).

**What you'll see:**

```text
 ✓ tests/feature/hello.test.ts (1 test) 18ms
```

The same test with the test client, once it's exported:

```ts title="tests/feature/hello.test.ts"
import { it } from 'vitest'
import { testClient } from '@strutvane/framework/testing'   // not exported yet in 0.2.0-next.0
import app from '../../bootstrap/app.ts'

it('says hello', async () => {
  ;(await testClient(app).getJson('/api/hello')).assertStatus(200).assertJsonPath('message', 'Hello!')
})
```

## Sending requests

`testClient(app)` gives you a request builder for one app:

| Method | Sends |
|---|---|
| `getJson(path)` | `GET` with `Accept: application/json` |
| `postJson(path, body)` | `POST` with a JSON body |
| `putJson(path, body)` | `PUT` with a JSON body |
| `patchJson(path, body)` | `PATCH` with a JSON body |
| `deleteJson(path)` | `DELETE` |
| `get(path)` | `GET` as a browser would (`Accept: text/html`), for web routes |
| `postForm(path, fields)` | `POST` as an HTML form (`application/x-www-form-urlencoded`) |
| `send(method, path, body)` | any method; a string body is sent as-is |
| `request(request)` | a `Request` you built yourself |

Paths include the query string:

```ts
await testClient(app).getJson('/api/posts?filter[status]=published&sort=-created_at&search=hello')
```

Each request comes from the address `203.0.113.10`, so rate limits and IP rules behave as for a real visitor. `fromIp('198.51.100.7')` picks another one.

### As a signed-in user: `actingAs()`

`actingAs(user)` hands the user to each request the way the auth package's request hook would (`ctx.user`), so `auth`, abilities and policies see them. It takes your user model or a plain identity:

```ts
const alice = { id: '1', type: 'user', roles: ['member'], attrs: {} }
const asAlice = testClient(app).actingAs(alice)
await asAlice.postJson('/api/posts', { title: 'My second post' })
```

The client is **immutable**: `testClient(app)` is still a guest after that line. Keep `asAlice` around to make several requests as Alice. Without the client, pass the same switch to `app.handle(request, { testing: { actor: alice } })`. Both only work with `APP_ENV=testing`; anywhere else the app throws `withoutCsrf()/actingAs() was used with APP_ENV=local.`

:::caution[Coming in 0.2]
**Planned API (a sketch).** `withToken(token)` (send `Authorization: Bearer <token>`), `actingAs(user)` with a real session cookie and the CSRF token handled for you, and `asTenant(team)` to pick the current team aren't built yet.
:::

### Extra headers: `withHeaders()`

```ts
await testClient(app).withHeaders({ 'accept-language': 'fr', 'if-match': '"v3"' }).patchJson('/api/posts/hello-world', { title: 'Bonjour' })
```

`withCookie(name, value)` adds one cookie (and keeps the ones already set).

## Checking responses

Every response is a `TestResponse`. Assertions return the response, so you can chain them:

| Assertion | Fails unless… |
|---|---|
| `assertStatus(code)` | the status is exactly `code` |
| `assertJsonPath(path, value)` | the value at a dot path equals `value` (deep equality) |
| `assertProblem(status, code)` | it's `application/problem+json` with that status and `code` |

And for your own checks:

| Property | What it is |
|---|---|
| `status` | the status code |
| `headers` | a `Headers` object |
| `text` | the raw body |
| `json` | the body parsed as JSON |
| `path('data.0.title')` | the value at a dot path |

```ts title="tests/feature/posts.test.ts"
import { expect, it } from 'vitest'

it('sorts newest first', async () => {
  const response = await testClient(app).getJson('/api/posts?sort=-created_at')
  response.assertStatus(200)
  const titles = (response.path('data') as Array<{ title: string }>).map((post) => post.title)
  expect(titles).toEqual(['Third', 'Second', 'First'])
  expect(response.headers.get('content-type')).toContain('application/json')
})
```

Dot paths use numbers for list items: `data.0.title` is the first post's title.

### What a failure looks like

Every failure message includes the body (the first 2,000 characters), so a failing test explains itself:

```text
Error: Expected status 201, got 422. Body: {"type":"https://strutvane.dev/errors/validation-failed","title":"Validation failed","status":422,"code":"validation_failed","detail":"Some fields need your attention.","issues":[{"path":["title"],"field":"title","code":"too_small","message":"Title must be at least 3 characters."}],…}
```

```text
Error: Expected meta.total to be 3, got 2. Body: {"data":[…],"meta":{"total":2,…}}
```

```text
Error: Expected problem+json, got text/html.
```

## Typical tests, one per behaviour

These tests are written for the posts API from [Your First CRUD](../first-crud/), with two identities at the top of the file: `const alice = { id: '1', type: 'user', roles: ['member'], attrs: {} }` and `bob` (id `'2'`). They use `testClient`, which isn't exported yet (see the box at the top).

### Creating: 201 and a Location header

```ts
it('creates a post and points at it', async () => {
  const response = await testClient(app).actingAs(alice).postJson('/api/posts', { title: 'Hello world' })
  response.assertStatus(201).assertJsonPath('data.slug', 'hello-world')
  expect(response.headers.get('location')).toBe('/api/posts/hello-world')
})
```

### Validation: 422 with issues

```ts
it('needs a title', async () => {
  const response = await testClient(app).actingAs(alice).postJson('/api/posts', { body: 'No title' })
  response.assertProblem(422, 'validation_failed')
  expect(response.path('issues')).toContainEqual(expect.objectContaining({ path: ['title'], field: 'title', code: 'required' }))
})
```

### Unknown fields are refused

```ts
it('refuses fields that are not fillable', async () => {
  const response = await testClient(app).actingAs(alice).postJson('/api/posts', { title: 'Hi there', author_id: 99 })
  response.assertProblem(422, 'validation_failed').assertJsonPath('issues.0', {
    path: ['author_id'],
    field: 'author_id',
    code: 'unknown_field',
    message: '"Author id" is not a field you can send here. Remove it from the request body.',
  })
})
```

A client can't set `author_id` (it's set from the signed-in user), so it can't post as someone else. Test this for every field that must come from the server.

### Policies: 403 and the invisible 404

```ts
it('hides drafts as missing, and refuses changes others can see', async () => {
  ;(await testClient(app).actingAs(bob).getJson('/api/posts/alice-draft')).assertStatus(404)
  ;(await testClient(app).actingAs(bob).patchJson('/api/posts/hello-world', { title: 'Mine now' })).assertProblem(403, 'forbidden')
})
```

Testing the 404 matters: it proves Bob can't even learn that Alice's draft exists. See [Authorization](../authorization/).

### Guests: 401

```ts
it('asks guests to sign in', async () => {
  ;(await testClient(app).postJson('/api/posts', { title: 'Hello' })).assertProblem(401, 'unauthenticated')
})
```

### CSRF: a cookie request without a token is refused

Real browsers send a session cookie. A test can check that a forged form post is refused:

```ts
it('refuses a cross-site cookie request', async () => {
  const response = await testClient(app)
    .withHeaders({ cookie: 'strutvane_session=abc', origin: 'https://evil.example' })
    .postJson('/api/posts', { title: 'Hello' })
  response.assertProblem(419, 'csrf_token_mismatch')
})
```

When a test isn't about CSRF but uses a cookie, skip the check for that client only:

```ts
await testClient(app).withCookie('strutvane_session', 'abc').withoutCsrf().postJson('/api/posts', { title: 'Hello' })
```

`withoutCsrf()` is not a header: nothing a real client sends can switch CSRF off. It only works when `APP_ENV=testing`; the app refuses the request in any other environment.

### Rate limits: 429 with Retry-After

```ts
it('throttles after 60 requests a minute', async () => {
  for (let i = 0; i < 60; i++) await testClient(app).getJson('/api/posts')
  const response = await testClient(app).getJson('/api/posts')
  response.assertProblem(429, 'rate_limited')
  expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0)
})
```

### Web routes

```ts
it('serves the React shell', async () => {
  const response = await testClient(app).get('/posts')
  response.assertStatus(200)
  expect(response.text).toContain('<div id="root">')
})
```

### Tenancy: team A never sees team B

With teams, test isolation from the attacker's side. Generated attack tests do this for every resource; write the same for your custom routes:

```ts
it('never shows another team its projects', async () => {
  const asAcme = testClient(app).actingAs(acmeUser).asTenant(acme)   // asTenant: planned API, see above
  const asGlobex = testClient(app).actingAs(globexUser).asTenant(globex)
  const created = await asAcme.postJson('/api/projects', { name: 'Secret launch' })
  const id = created.path('data.id') as string

  ;(await asGlobex.getJson(`/api/projects/${id}`)).assertStatus(404)
  ;(await asGlobex.getJson('/api/projects?search=Secret')).assertJsonPath('meta.total', 0)
  ;(await asGlobex.deleteJson(`/api/projects/${id}`)).assertStatus(404)
})
```

## Fluent JSON assertions (planned)

:::caution[Coming in 0.2]
**Planned API (a sketch: names may change).** The parity checklist lists Laravel's fluent JSON assertions (`assertJson(fn)`, `has`, `where`, `missing`) and validation assertions for the testing kit. Until then, use `assertJsonPath`, `path()` and Vitest's `expect`.
:::

## Platform and Docker differences

HTTP tests never open a port, so they behave the same on Windows, macOS and Linux, with or without Docker. In Docker mode, `npm test` runs inside the `app` container next to the test database. The only difference is the database engine: use the same engine as production (see [Database Testing](../database-testing/)).

## Common mistakes

### Expected 200, got 404 for a post I just created

**Why:** the route binds by slug (`/api/posts/{post:slug}`) and you used the id, or the post isn't visible to the user making the request, which looks like a 404 on purpose.
**Fix:** request by slug, and check the policy's `view()` for that user.

### Expected 201, got 419

```text
Error: Expected status 201, got 419. Body: {…"code":"csrf_token_mismatch"…}
```

**Why:** the request carries a session cookie, so CSRF applies.
**Fix:** send it without the cookie, or use `.withoutCsrf()` on that client (`{ testing: { withoutCsrf: true } }` with `app.handle()`).

### `actingAs` didn't stick for my second request

**Why:** the client is immutable. `testClient(app).actingAs(alice)` returns a **new** client; calling `testClient(app)` again gives a guest.
**Fix:** keep the returned client: `const asAlice = testClient(app).actingAs(alice)`.

### `assertJsonPath('data.title', …)` gets `undefined`

**Why:** `data` is a list on index routes. The first item is `data.0`.
**Fix:** `assertJsonPath('data.0.title', 'Hello')`.

### The 422 body is right but `assertProblem` fails

```text
Error: Expected problem+json, got application/json.
```

**Why:** your controller built its own JSON error instead of throwing a framework error.
**Fix:** throw `ValidationError`, `ForbiddenError` or `StrutvaneError` (from `@strutvane/framework/core`), so every error has the same shape.

## Next steps

- [Database Testing](../database-testing/): factories, seeders and checking rows.
- [Mocking](../mocking/): fake HTTP calls, the clock and any service.
- [Authorization](../authorization/): what your 403 and 404 tests protect.
- [CSRF Protection](../csrf/): what the 419 test proves.
