---
title: Requests
description: "Read everything about the current request from one object, ctx: path parameters, the query string, the JSON body, headers, the signed-in user and bound models, plus the 400, 413 and 415 errors you get for bad bodies."
---

Every controller action, middleware and closure route receives one argument: **`ctx`**, the **HTTP context**. It holds everything about the current request: the URL, the parameters, the body, the headers, the signed-in user and the records found by route model binding.

:::tip[Coming from Laravel?]
`$request->input()`, `$request->query()`, `$request->user()`, `$request->route('post')` and an injected `Post $post` all live on one object:

| Laravel | Strutvane |
|---|---|
| `$request->query('page')` | `ctx.query.get('page')` |
| `$request->route('post')` (raw) | `ctx.param('post')` |
| `Post $post` (bound) | `ctx.model(Post)` |
| `$request->user()` | `ctx.user` / `ctx.requireUser()` |
| `$request->all()` (JSON) | `await ctx.body()` |
| `$request->expectsJson()` | `ctx.wantsJson()` |
| `$request->ip()` | `ctx.ip` |
:::

## The smallest example

```ts title="routes/api.ts"
Route.get('/echo/{word}', (ctx) =>
  ctx.json({ word: ctx.param('word'), shout: ctx.query.get('shout') === 'yes', method: ctx.method }),
),
```

```bash
curl "http://localhost:3000/api/echo/hello?shout=yes"
```

What you'll see:

```json
{ "word": "hello", "shout": true, "method": "GET" }
```

## Everything on `ctx`

| Property or method | Type | What it is |
|---|---|---|
| `ctx.request` | `Request` | The raw Web-standard request |
| `ctx.url` | `URL` | The parsed URL |
| `ctx.method` | `string` | `GET`, `POST`… (upper case) |
| `ctx.query` | `URLSearchParams` | The query string |
| `ctx.params` | `Record<string, string>` | All path parameters, as text |
| `ctx.param(name)` | `string` | One path parameter |
| `ctx.body()` | `Promise<unknown>` | The JSON body, parsed once |
| `ctx.user` | your user type `\| null` | The signed-in user, or `null` |
| `ctx.requireUser()` | your user type | The user, or a `401` |
| `ctx.model(Post)` | `Post` | The record bound from the route |
| `ctx.wantsJson()` | `boolean` | Does the client want JSON? |
| `ctx.ip` | `string` | The client address |
| `ctx.route` | `{ name, method, uri, action }` | The matched route |
| `ctx.tenant` | `{ id } \| undefined` | The current tenant, when tenancy is on |
| `ctx.defer(task)` | `void` | Run work after the response is sent (see [Middleware](../middleware/)) |

## Path parameters: `ctx.param()`

```ts
Route.get('/reports/{year}/{month}', (ctx) =>
  ctx.json({ year: Number(ctx.param('year')), month: Number(ctx.param('month')) }),
),
```

`GET /api/reports/2026/11` → `{ "year": 2026, "month": 11 }`.

Parameters are always **text**: convert them yourself (`Number(...)`). Asking for a parameter the route doesn't have is a programming mistake, so it throws (see Common mistakes).

## The query string: `ctx.query`

`ctx.query` is a standard `URLSearchParams`:

```ts
const page = Number(ctx.query.get('page') ?? '1')          // ?page=2 → 2
const tags = ctx.query.getAll('tag')                       // ?tag=a&tag=b → ['a', 'b']
const hasDrafts = ctx.query.has('drafts')                  // ?drafts → true
```

## Headers

Read any header from the raw request:

```ts
const version = ctx.request.headers.get('x-client-version')   // string | null
```

Header names are case-insensitive.

## The JSON body: `ctx.body()`

```ts title="app/http/controllers/note.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'

export class NoteController extends Controller {
  async store(ctx: HttpContext): Promise<Response> {
    const body = await ctx.body()                       // unknown: validate before you trust it
    return ctx.json({ received: body }, 201)
  }
}
```

```bash
curl -X POST http://localhost:3000/api/notes \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"text":"Buy milk"}'
```

What you'll see:

```json
{ "received": { "text": "Buy milk" } }
```

The body is typed `unknown` on purpose: it came from outside. Use a [form request](../validation/) to turn it into checked, typed values. Calling `ctx.body()` twice is fine; it's parsed once and cached.

### What can go wrong with a body

`ctx.body()` refuses bad bodies with a clear problem+json response:

| Problem | Status | `code` | `title` / `detail` |
|---|---|---|---|
| `Content-Type` isn't `application/json` (or `application/*+json`) | **415** | `unsupported_media_type` | "Unsupported media type" |
| The JSON doesn't parse | **400** | `invalid_json` | "The request body is not valid JSON. Check for trailing commas and unquoted keys." |
| Bigger than 1 MiB | **413** | `payload_too_large` | "Request too large" |
| Nested more than 32 levels deep | **413** | `json_too_deep` | "The request body is nested deeper than this server accepts." |
| More than 1,000 keys in total | **413** | `json_too_many_keys` | "The request body has more keys than this server accepts." |
| A `__proto__` key or a `constructor.prototype` object (a known attack) | **400** | `forbidden_json_key` | "The request body contains a "__proto__" key or a "constructor.prototype" object, which is never accepted." |

For example, a trailing comma:

```json
{"type":"https://strutvane.dev/errors/invalid-json","title":"Invalid JSON","status":400,"code":"invalid_json","detail":"The request body is not valid JSON. Check for trailing commas and unquoted keys.","traceId":"…","instance":"/api/notes"}
```

The size limit holds even when `Content-Length` is missing or lies: bytes are counted as they arrive, and reading stops at the limit. Change the limits for the whole app (the ceilings are 100 MiB, 512 levels and 1,000,000 keys):

```ts title="bootstrap/app.ts"
.withMiddleware((middleware) => {
  middleware.limits({ maxBytes: 5 * 1024 * 1024, maxDepth: 64, maxKeys: 5000 })
})
```

:::caution[Coming in 0.2]
A per-route body limit for application routes isn't built yet in 0.2.0-next.0; the app-wide `limits()` applies to every route.
:::

**Why such limits?** A huge or deeply nested body can tie up the server for seconds; these limits make that impossible, and the `__proto__` check stops **prototype pollution** (a trick that changes every object in your app through one crafted key).

:::caution[Coming in 0.2]
`ctx.body()` reads JSON only. Reading form-encoded bodies (`application/x-www-form-urlencoded`) and multipart forms from application routes isn't built yet; the framework only looks inside a urlencoded form for `_token` (CSRF) and `_method` (method spoofing). Uploads (checked by their content, not their file name) come with `@strutvane/files`.
:::

## Validating input: form requests

Never use the raw body directly. A **form request** is a small class that says what a valid body looks like, and turns `unknown` into typed, checked values (or a `422` listing every problem):

```ts title="app/http/requests/note.request.ts"
import { z } from 'zod'
import { FormRequest } from '@strutvane/framework'

const schema = z.object({ text: z.string().trim().min(1).max(500) })

export class StoreNoteRequest extends FormRequest<z.infer<typeof schema>> {
  rules() {
    return schema
  }
}
```

```ts title="app/http/controllers/note.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'
import { StoreNoteRequest } from '../requests/note.request.ts'

export class NoteController extends Controller {
  async store(ctx: HttpContext): Promise<Response> {
    const input = await new StoreNoteRequest().validate(ctx)   // { text: string }
    return ctx.json({ data: input }, 201)
  }
}
```

**What you'll see** for `{"text":"","pinned":true}`: a `422` with one issue for `text`; once `text` is valid, `pinned` is refused as an `unknown_field`, because fields the schema doesn't list are rejected (Laravel only does that when you ask). A form request can also say who may send it (`authorize(ctx)`) and tidy input first (`prepareForValidation`). Every option is on [Validation](../validation/).

:::caution[Coming in 0.2]
Planned in the parity matrix, not built yet:
- `node strut make:request StoreNoteRequest` to write the file (`node strut make:rule` for your own reusable rules already exists);
- async database rules `unique()` and `exists()` ("this email isn't taken", "this author exists"), automatically limited to the current team when teams are on;
- live validation from the browser with the same rules, without saving: see [Precognition](../precognition/).
:::

## Cookies, the session and request details

| Read | Gives you |
|---|---|
| `ctx.cookie('theme')` | One cookie's value, or `undefined` (a malformed value is returned as-is, never a 500) |
| `ctx.sessionId()` | The session cookie's value, or `undefined`. Always `undefined` when the request carries a `Bearer` token: a token request is never also a cookie session |
| `ctx.method` | `'GET'`, `'POST'`… (upper case) |
| `ctx.url` | The full URL, parsed (`ctx.url.pathname`, `ctx.url.searchParams`) |
| `ctx.params` | Every path parameter as text, before model binding |
| `ctx.route` | The matched route: `{ name, method, uri, action }`, for logging |
| `ctx.nonce` | This response's CSP nonce, for inline `<script nonce="…">` |
| `ctx.request` | The raw Web-standard `Request`, when you need something else |

:::caution[Coming in 0.2]
Flash data (a message kept for the next request only), old input (re-filling a form after a validation error) and reading and writing session values from a request come with the session layer of `@strutvane/auth`. The framework already has the session store underneath (see [Session](../session/)). The React UI doesn't need these: it keeps form state in the browser.
:::

## The signed-in user: `ctx.user` and `ctx.requireUser()`

The authentication package finds the user for every request (from the session cookie or an API token) and puts it in `ctx.user`; the `auth` middleware then refuses guests. On routes without `auth` (or with `auth:optional`), `ctx.user` can be `null`:

```ts
Route.get('/greeting', (ctx) =>
  ctx.json({ message: ctx.user === null ? 'Hello, guest' : `Hello, ${ctx.user.name}` }),
).middleware('auth:optional'),
```

`ctx.requireUser()` returns the user, or stops the request with `401` when nobody is signed in. Use it in actions that only make sense with a user:

```ts
const author = ctx.requireUser()      // typed as your user model, never null
```

`ctx.user` is typed as **your** user model, so `ctx.user?.is_admin` is checked by the compiler. Until you declare it, it's an **actor** (`id`, `type`, `roles`, `attrs`). Declare it once in `bootstrap/app.ts`:

```ts title="bootstrap/app.ts"
declare module '@strutvane/framework' {
  interface UserRegistry { user: Author }
}
```

## Bound models: `ctx.model()`

When a route has `{post}` and `post` is bound to `Post` in `withRouting({ bindings })`, the record is looked up before your action runs:

```ts
show(ctx: HttpContext): Response {
  const post = ctx.model(Post)          // typed as Post; a missing post was already a 404
  return ctx.json({ data: post })
}
```

`ctx.bound('post')` returns the record bound to a parameter whatever its class, or `undefined`.

:::caution[Coming in 0.2]
Binding needs a model class with a static `resolveRouteBinding()` method; [ORM](../orm/) models get it later in 0.2. See [Routing](../routing/#route-model-binding).
:::

With two models in one path, pass the parameter name:

```ts
// /authors/{author}/posts/{post}
const author = ctx.model(Author, 'author')
const post = ctx.model(Post, 'post')
```

## Does the client want JSON? `ctx.wantsJson()`

`true` for any `/api/...` path, or when the `Accept` header mentions JSON. The error handler uses it to choose between a problem+json body and a small HTML error page; you can use it too:

```ts
return ctx.wantsJson() ? ctx.json({ data: post }) : ctx.html(`<h1>${post.title}</h1>`)
```

## The client address: `ctx.ip`

`ctx.ip` is the address the server saw on the connection. Headers like `X-Forwarded-For` are **not** trusted by default, because any client can send them.

Behind a load balancer or reverse proxy, the connection comes from the proxy, so every user would share its address (and one rate-limit bucket). Tell Strutvane which proxies to believe:

```ts title="bootstrap/app.ts"
.withMiddleware((middleware) => {
  middleware.trustProxies({ at: ['10.0.0.0/8'] })   // your load balancer's network
})
```

**What you'll see:** for requests that arrive **from** those addresses, `ctx.ip` becomes the real client from `X-Forwarded-For`, and HTTPS and the host are read from `X-Forwarded-Proto` and `X-Forwarded-Host`. The same header from anyone else is still ignored. `'*'` is refused: name your proxies. When the address can't be known, `ctx.ip` is `'unknown'`. See [Security Features](../security/).

## Common mistakes

### "The route … has no {…} parameter"

```text
✖ The route "/api/posts/{post:slug}" has no {id} parameter.
→ Parameters here: post.
```

**Why:** the name in `ctx.param()` doesn't match the name in the route path.

**Fix:** use the name from the path: `ctx.param('post')`.

### "No Post is bound on route …"

```text
✖ No Post is bound on route "/api/posts/{slug}" (bound parameters: none).
→ Add {post} to the route path and register the model in withRouting({ bindings }).
```

**Fix:** name the parameter after the binding (`{post}` or `{post:slug}`) and register `bindings: { post: Post }`.

### 415 when I post a form

```json
{ "title": "Unsupported media type", "status": 415, "code": "unsupported_media_type", … }
```

**Why:** `ctx.body()` reads JSON only, and an HTML form sends `application/x-www-form-urlencoded`.

**Fix:** send JSON with the header `Content-Type: application/json`.

### `ctx.user` is always `null`

**Why:** nothing signs users in yet. The `auth` middleware only checks that someone is signed in; finding the user (from a session cookie or a token) is the job of the authentication package's request hook.

**Fix:** install and configure `@strutvane/auth` (see [Authentication](../authentication/)), then add `.middleware('auth')` to routes that need a user.

### 413 "json_too_deep" on a big import

**Why:** the body nests deeper than 32 levels or has more than 1,000 keys, the default limits.
**Fix:** raise them for the app (`middleware.limits({ maxDepth: 64, maxKeys: 20000 })`), or better, send big imports as a file upload or in batches.

### Everyone has the same `ctx.ip` in production

**Why:** the app runs behind a proxy and every connection comes from it.
**Fix:** `middleware.trustProxies({ at: ['<your proxy network>'] })` in `bootstrap/app.ts`.

### Windows: my JSON body arrives broken

**Why:** in PowerShell and cmd, single quotes don't protect the JSON like they do in bash, so the quotes inside it get lost.
**Fix:** use `curl.exe` and escape the inner quotes, or put the body in a file:

```powershell
'{"text":"Buy milk"}' | Out-File -Encoding utf8 body.json
curl.exe -X POST http://localhost:3000/api/notes -H "Content-Type: application/json" --data-binary "@body.json"
```

## Next steps

- [Validation](../validation/): turn `ctx.body()` into checked, typed values.
- [Responses](../responses/): what to send back.
- [Routing](../routing/): parameters and model binding.
