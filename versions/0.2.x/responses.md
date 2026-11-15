---
title: Responses
description: Everything a controller action can send back. JSON with any status and headers, HTML, 204 No Content, 201 with a Location header, and errors as RFC 9457 problem+json by throwing an HTTP error.
---

Every action ends by returning a **response**: a status code (200 OK, 201 Created, 404 Not Found…), some headers, and a body. Strutvane responses are standard Web `Response` objects, the same ones `fetch()` returns, made easy with three helpers on `ctx`.

For errors, you don't build a response at all: you **throw** an HTTP error, and Strutvane turns it into a consistent problem+json body.

:::tip[Coming from Laravel?]
| Laravel | Strutvane |
|---|---|
| `return response()->json($data, 201)` | `return ctx.json(data, 201)` |
| `return response()->noContent()` | `return ctx.noContent()` |
| `return response($html)` | `return ctx.html(html)` |
| `abort(404, 'No post')` | `throw new NotFoundError('No post')` |
| `abort(403)` / `$this->authorize()` | `throw new ForbiddenError(…)` / `await authorize(…)` |

There are no Blade views: web routes return the React app's HTML shell, and React renders the page.
:::

## The smallest example

```ts title="routes/api.ts"
Route.get('/ping', (ctx) => ctx.json({ pong: true })),
```

```bash
curl -i http://localhost:3000/api/ping
```

What you'll see:

```text
HTTP/1.1 200 OK
content-type: application/json

{"pong":true}
```

## JSON: `ctx.json(data, status?, headers?)`

```ts
return ctx.json({ data: post })                                   // 200
return ctx.json({ data: post }, 201)                              // 201 Created
return ctx.json({ data: post }, 201, { location: route('posts.show', { post }) })
return ctx.json({ queued: true }, 202, { 'retry-after': '30' })
```

`content-type: application/json` is always set for you. Models are turned into JSON through their `toJSON()`, so **hidden columns** (like `password` or `api_token`) never appear.

### Created: 201 with `Location`

When you create something, answer `201` and say where it lives:

```ts title="app/http/controllers/note.controller.ts"
async store(ctx: HttpContext): Promise<Response> {
  const input = await new StoreNoteRequest().validate(ctx)
  const note = await Note.create(input)
  return ctx.json({ data: note }, 201, { location: route('notes.show', { note }) })
}
```

What you'll see:

```text
HTTP/1.1 201 Created
location: /api/notes/12
content-type: application/json

{"data":{"id":12,"text":"Buy milk", …}}
```

`ResourceController`'s `store` does this for you whenever a `.show` route exists for the resource.

### Lists: the `data` + `meta` envelope

Resource lists use one shape everywhere, so a client can page through any of them the same way:

```json
{
  "data": [{ "id": 1, "title": "Hello World" }],
  "meta": { "page": 1, "perPage": 15, "total": 3, "lastPage": 1, "from": 1, "to": 3 }
}
```

## HTML: `ctx.html(markup, status?)`

Web routes return the React app's HTML shell; React takes over in the browser:

```ts title="app/http/controllers/spa.controller.ts"
import { config, Controller, type HttpContext } from '@strutvane/framework'

export class SpaController extends Controller {
  show(ctx: HttpContext): Response {
    // The app name goes into HTML, so strip characters that could break out of the title.
    const title = config('app.name').replace(/[<>&"]/g, '')
    return ctx.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><script type="module" src="/build/app.js"></script></head><body><div id="root"></div></body></html>`)
  }
}
```

`content-type: text/html; charset=utf-8` is set for you. **Escape anything dynamic** you put into HTML.

## Nothing: `ctx.noContent()`

For a successful delete, answer `204 No Content`:

```ts
async destroy(ctx: HttpContext): Promise<Response> {
  const post = ctx.model(Post)
  await post.delete()
  return ctx.noContent()
}
```

```text
HTTP/1.1 204 No Content
```

## Anything else: a plain `Response`

`ctx.json`, `ctx.html` and `ctx.noContent` are shortcuts. Any standard `Response` works:

```ts
return new Response('id,title\n1,Hello World\n', {
  headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="posts.csv"' },
})
```

### Setting a cookie

Use a plain `Response` and a `set-cookie` header. Mark cookies `HttpOnly` (JavaScript can't read them), `Secure` (HTTPS only) and `SameSite=Lax`:

```ts
const response = ctx.json({ data: { theme: 'dark' } })
response.headers.append('set-cookie', 'theme=dark; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax')
return response
```

:::caution[Coming in 0.2]
Encrypted cookies and session values (with `__Host-` names, ids rotated at sign-in) come with the session layer of `@strutvane/auth`. Never put secrets in a plain cookie.
:::

## Redirects: `redirect()`

To send the browser to another page, return a redirect. Strutvane's `redirect()` has three methods, so you always say whether you mean "my own page" or "another site":

```ts title="app/http/controllers/session.controller.ts"
import { Controller, redirect, type HttpContext } from '@strutvane/framework'

export class SessionController extends Controller {
  afterLogin(ctx: HttpContext): Response {
    return redirect().intended(ctx, '/dashboard')    // where they were going, or /dashboard
  }

  toPosts(): Response {
    return redirect().to('/posts', 303)              // one of your own paths
  }

  toBilling(): Response {
    return redirect().away('https://billing.example.com/portal')  // another site, on purpose
  }
}
```

**What you'll see:**

```text
HTTP/1.1 303 See Other
location: /posts
```

`to()` and `intended()` accept only paths on your own site, so a crafted link (`?intended=//evil.com`) can't turn your app into a springboard for phishing. `intended()` quietly falls back; `to()` throws, because an unsafe target there is a bug in your code. The default status is `302`; pass `301`, `303`, `307` or `308` when you need another. See [Helpers](../helpers/).

## Coming in 0.2: downloads and files

:::caution[Coming in 0.2]
Download and file responses are planned with storage (Laravel's `response()->download()` and `->file()`). Until then, build the `Response` yourself as in "Anything else" above. The preview below may change.
:::

```ts
return ctx.download('storage/exports/posts.csv', 'posts.csv')   // "Save as…" in the browser
return ctx.file('storage/reports/summary.pdf')                  // shown in the browser
```

Both will set a **safe `Content-Disposition`** header: the file name you give is cleaned, so a name like `../../etc/passwd` or one with quotes and newlines can't break the header or point at another file.

## Coming in 0.3: streaming and server-sent events

:::caution[Coming in 0.3]
Planned for phase 2 (0.3) in the parity matrix. A preview; names may change.
:::

- **`stream()`** sends a response in pieces as you produce them: a large CSV export without holding it all in memory.
- **`eventStream()`** sends **server-sent events** (SSE): a one-way stream of messages to the browser over one long request, for progress bars and live feeds (Laravel's `response()->eventStream()`).

Both will handle **back-pressure** (pausing when the client reads slowly) and **stop when the client disconnects**, so an abandoned tab doesn't keep your server working. A standard `ReadableStream` in a plain `Response` already works today if you need it.

## No views or Blade

Strutvane doesn't render HTML templates on the server. Pages are the React app (see [Frontend](../frontend/)); controllers answer JSON. `ctx.html()` is there for the app shell, small pages and emails' previews, not for building your UI.

## Errors: throw, don't return

To stop with an error, **throw** an HTTP error. The exception handler turns it into a response, so the same error looks the same from every action, middleware and helper:

```ts
import { ForbiddenError, HttpError, NotFoundError } from '@strutvane/framework'

throw new NotFoundError('No post matches "hello".')
throw new ForbiddenError('You may not delete this post.')
throw new HttpError(409, 'conflict', 'Conflict', 'That slug is taken.')
```

| Class | Status | `code` | When |
|---|---|---|---|
| `NotFoundError(detail, hint?)` | 404 | `not_found` | The route or record doesn't exist |
| `UnauthenticatedError(detail?)` | 401 | `unauthenticated` | Nobody is signed in (adds `www-authenticate: Bearer`) |
| `ForbiddenError(detail, hint?)` | 403 | `forbidden` | Signed in, but not allowed |
| `ValidationError(issues)` | 422 | `validation_failed` | Input failed validation |
| `TooManyRequestsError(seconds)` | 429 | `too_many_requests` | Rate limited (adds `retry-after`) |
| `HttpError(status, code, title, detail, extras?)` | any | yours | Everything else |

### The problem+json shape

Every error body is an **RFC 9457 problem** (a standard JSON shape for errors):

```text
HTTP/1.1 404 Not Found
content-type: application/problem+json
```

```json
{
  "type": "https://strutvane.dev/problems/not_found",
  "title": "Not found",
  "status": 404,
  "code": "not_found",
  "detail": "No post matches \"hello\"."
}
```

| Field | Meaning |
|---|---|
| `type` | A URL built from `code` |
| `title` | A short, fixed summary of the kind of problem |
| `status` | The HTTP status, repeated in the body |
| `code` | A stable identifier your client can `switch` on |
| `detail` | A sentence about this occurrence, for a person |
| `issues` | Only for validation: one `{ field, code, message }` per problem |
| `hint` | Only in local debug mode: how a developer can fix it. Never sent in production |

### Extra headers and developer hints

```ts
throw new HttpError(409, 'conflict', 'Conflict', 'That slug is taken.', {
  headers: { 'retry-after': '5' },
  hint: 'Pick another slug or let Strutvane generate one.',
})
```

The `hint` appears only when `APP_DEBUG=true` and `APP_ENV` is `local` or `testing`. See [Error Handling](../errors/).

### Browsers get a small HTML page

When the client doesn't want JSON (a browser on a web route), the same error is shown as a minimal HTML page with the status, title and detail.

### The quick way: `abort()`

For the three most common stops there's a one-liner:

```ts
import { abort } from '@strutvane/framework'

abort(404, 'No such post.')    // NotFoundError
abort(403)                     // ForbiddenError: "You are not allowed to do this."
abort(401)                     // UnauthenticatedError
```

### Answering early from deep code: `ResponseError`

Sometimes a check deep in your code has a whole **response** to send, not an error (a redirect, for example). Throw it wrapped in a `ResponseError`, and the handler sends it unchanged:

```ts
import { ResponseError } from '@strutvane/framework'

throw new ResponseError(new Response(null, { status: 302, headers: { location: '/login' } }))
```

### Every response gets security headers

Whatever you return (JSON, HTML, a 404, an error page), Strutvane adds the security headers on the way out: a Content-Security-Policy with this request's nonce, `X-Content-Type-Options: nosniff`, a strict `Referrer-Policy`, `Permissions-Policy`, framing protection and, in production, HSTS. You don't need to set them yourself. See [Security Features](../security/).

## Common mistakes

### "… returned nothing instead of a Response"

```text
PostController@show returned nothing instead of a Response.
→ Return ctx.json(...), ctx.html(...) or ctx.noContent().
```

**Fix:** add `return`: `return ctx.json({ data: post })`.

### My error shows up as a 500

**Why:** you threw a plain `Error`. Only `HttpError` and its subclasses become 4xx responses; anything else is treated as a bug.

**Fix:**

```ts
throw new NotFoundError('No report for that month.')   // not: throw new Error('not found')
```

### A secret column appears in my JSON

**Why:** you built the JSON by hand (`{ ...post }`) instead of letting the model serialise itself.

**Fix:** return the model (`ctx.json({ data: post })`); its `toJSON()` drops hidden columns.

### "redirect().to() was given …, which is not a same-origin path"

```text
✖ redirect().to() was given "https://partner.example/page", which is not a same-origin path.
→ Use redirect().away(url) for a deliberate external redirect.
```

**Fix:** use `redirect().away(url)` when leaving your site is intended.

### My header disappears or throws "immutable"

**Why:** responses built by `Response.json()`, `Response.redirect()` or `fetch()` have read-only headers.
**Fix:** copy first, then set: `const copy = new Response(response.body, response)`.

## Next steps

- [Error Handling](../errors/): what happens to errors you don't catch.
- [Validation](../validation/): the 422 response in detail.
- [Controllers](../controllers/): where responses are returned.
