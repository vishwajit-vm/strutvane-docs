---
title: URL Generation
description: Build links to your own routes with the typed `route()` helper and `url`, make signed and expiring links with `url.signedRoute()` and `url.temporarySignedRoute()`, read the current and previous URL, add absolute URLs and query strings, and avoid the mistakes that break links.
---

**URL generation** means letting the framework build addresses for you instead of typing them as strings. You name a route once (`posts.show`) and ask for its URL wherever you need it: in an API response, an email, a redirect. If the route's path changes later, every link follows, and a typo in a route name is a **compile error**, not a broken link in production.

:::tip[Coming from Laravel?]
`route('posts.show', $post)` is `route('posts.show', { post })`, `url('/posts')` is `url('/posts')`, and `URL::signedRoute()` / `URL::temporarySignedRoute()` are `url.signedRoute()` / `url.temporarySignedRoute()`. The difference: route names and their parameters are **typed** from your routes files, so `route('posts.shwo')` or a missing `{post}` doesn't compile.
:::

:::caution[Coming in 0.2]
**Proven in a prototype** (spike 12): typed `route()`, absolute URLs, query strings, model parameters and signed and expiring links (as the functions `signedRoute()` and `temporarySignedRoute()`). Decided for 0.2 and not built yet: the `url` object (`url()`, `url.signedRoute()`, `url.temporarySignedRoute()` with `expiresIn` and `oneTime`, `url.current()`, `url.previous()`) and default parameters.
:::

## The smallest example

Name a route:

```ts title="routes/api.ts"
import { defineRoutes, Route } from '@strutvane/framework'
import { PostController } from '../app/http/controllers/post.controller.ts'

export default defineRoutes([
  Route.apiResource('posts', PostController, { bindBy: 'slug' }),   // posts.index, posts.show, …
])
```

Build its URL anywhere during a request:

```ts title="app/http/controllers/post.controller.ts"
import { Controller, route, type HttpContext } from '@strutvane/framework'
import { Post } from '../../models/post.ts'

export class PostController extends Controller {
  show(ctx: HttpContext): Response {
    const post = ctx.model(Post)
    return ctx.json({ data: post, links: { self: route('posts.show', { post }), all: route('posts.index') } })
  }
}
```

**What you'll see:**

```json
{ "data": { "id": 1, "title": "Hello World", "slug": "hello-world" }, "links": { "self": "/api/posts/hello-world", "all": "/api/posts" } }
```

## `route()`: URLs of named routes

| Call | Result |
|---|---|
| `route('posts.index')` | `/api/posts` |
| `route('posts.show', { post })` | `/api/posts/hello-world` (a model fills `{post:slug}` with its slug) |
| `route('posts.show', { post: 'hello-world' })` | `/api/posts/hello-world` (a string or a number works too) |
| `route('posts.index', { page: 2 })` | `/api/posts?page=2` (parameters the path doesn't use become the query string) |
| `route('posts.index', {}, { query: { page: 2, sort: '-created_at' } })` | `/api/posts?page=2&sort=-created_at` |
| `route('posts.show', { post }, { absolute: true })` | `http://localhost:3000/api/posts/hello-world` |

Values are URL-encoded for you, so a slug or search term with spaces or symbols is safe.

### Typed names and parameters

`bootstrap/app.ts` tells TypeScript about your routes once (new apps already have it), and from then on:

```ts
route('posts.shwo', { post })         // ✖ compile error: no route has that name
route('posts.show')                   // ✖ compile error: {post} is required
route('posts.show', { pots: post })   // ✖ compile error: wrong parameter name
route('admin.stats')                  // ✔ group name prefixes are typed too
```

When the name comes from a variable (so TypeScript can't check it), the same mistakes are friendly runtime errors (see Common mistakes).

### Absolute URLs

By default `route()` returns a **path** (`/api/posts`), which is what you want inside your own app. For anything that leaves the app (an email, a webhook, a QR code), ask for an **absolute** URL. It's built from `APP_URL`, never from the request's `Host` header, so a forged header can't end up in a password-reset link:

```ts
route('posts.show', { post }, { absolute: true })   // → 'https://blog.example.com/api/posts/hello-world'
```

Set `APP_URL` to the address people use (with `https://` in production). See [Configuration](../configuration/).

## `url()`: any path on your site (preview)

For a path that isn't a named route, `url()` makes it absolute from `APP_URL`:

```ts
import { url } from '@strutvane/framework'

url('/help/getting-started')                    // → 'https://blog.example.com/help/getting-started'
url('/search', { query: { q: 'launch' } })      // → 'https://blog.example.com/search?q=launch'
```

Prefer `route()` whenever a route has a name: a renamed path then can't break the link.

## Signed and expiring links

A **signed URL** carries a signature made from your `APP_KEY`. Anyone can open it, but nobody can change any part of it (the id, the expiry) without breaking the signature. Use it for links you email: unsubscribe, download, confirm.

```ts title="app/http/controllers/report.controller.ts"
import { Controller, url, type HttpContext } from '@strutvane/framework'

export class ReportController extends Controller {
  share(ctx: HttpContext): Response {
    const link = url.temporarySignedRoute('reports.download', new Date(Date.now() + 30 * 60_000), { report: ctx.param('report') })
    return ctx.json({ link })
  }
}
```

```ts title="routes/api.ts"
Route.get('/reports/{report}/download', [ReportController, 'download']).name('reports.download').middleware('signed'),
```

| Helper | Makes |
|---|---|
| `url.signedRoute(name, params)` | A signed link that doesn't expire |
| `url.signedRoute(name, params, { expiresIn: 3600 })` | One that expires after an hour |
| `url.signedRoute(name, params, { oneTime: true })` | One that works once |
| `url.temporarySignedRoute(name, expiresAt, params)` | One that expires at a given `Date` |

**What you'll see** when the link is opened: the route runs. A changed link answers `403 invalid_signature`, an expired one `403 signature_expired`, so your page can offer "send me a new link". The same signer (an HMAC over the path, the sorted query, the expiry and a purpose) is used by sign-in emails and temporary file URLs. After `node strut key:rotate`, links made with the old key keep working. See [Routing: Signed routes](../routing/).

:::note[Today's names]
In the prototype these are plain functions, `signedRoute(name, params)` and `temporarySignedRoute(name, expiresAt, params)`, imported from `@strutvane/framework`. `expiresIn` and `oneTime` come with the `url.` form.
:::

## The current and previous URL (preview)

```ts
url.current()     // the URL of this request, without the query string
url.full()        // the same, with the query string
url.previous()    // where the user came from (from the session), or a fallback
```

`url.previous()` reads the **session**, not the `Referer` header (which any client can fake or leave out), and only ever returns a same-site path, so it's safe to redirect to. For "back to where you were going after sign-in", use `redirect().intended(ctx, '/dashboard')` ([Helpers](../helpers/)).

## Default parameters (preview)

Laravel's `URL::defaults()`: when many routes share a parameter, such as `{locale}` or `{team}`, set it once per request (in a middleware) and `route()` fills it in:

```ts
url.defaults({ team: ctx.user?.team_slug ?? 'personal' })
route('team.projects.index')   // → '/acme/projects', no need to pass { team }
```

## In the browser

The generated UI uses a typed client built from the same route table (`.strutvane/client.gen.ts`), so browser code gets the same compile errors for a wrong route or field. See [Frontend](../frontend/).

## With Docker

Nothing changes, except one thing to check: `APP_URL` must be the address **your browser** uses (`http://localhost:3000`), not the container's internal name, or absolute links in emails will point at an address nobody can open.

## Common mistakes

### "No route is named …"

```text
✖ No route is named "post.show".
→ Did you mean "posts.show"?
```

**Why:** the name came from a variable (so it wasn't checked at compile time) and has a typo, or the route has no `.name()`.
**Fix:** use the suggestion, or name the route; `node strut route:list` shows every name.

### "route('…') needs a value for {post}"

```text
✖ route('posts.show') needs a value for {post}.
→ Pass every parameter of /api/posts/{post:slug}: { post }.
```

**Fix:** pass the parameter: `route('posts.show', { post })`.

### My email links say `localhost`

**Why:** `APP_URL` on the server is still `http://localhost:3000`, and absolute URLs are built from it.
**Fix:** set `APP_URL=https://your-domain.example` in the server's environment.

### "route() was called outside a request or console command"

**Why:** `route()` ran at the top level of a file, before any app was handling a request.
**Fix:** call it inside a function, or wrap it: `app.run(() => route('posts.index'))`. See [Helpers](../helpers/).

### A signed link answers 403 "invalid_signature"

**Why:** something changed the URL after it was signed (an email client re-encoding it, a parameter added by hand), or the checking server has a different `APP_KEY`.
**Fix:** send the link exactly as it was made, and give every server the same `APP_KEY`.

## Next steps

- [Routing](../routing/): naming routes and binding parameters.
- [Helpers](../helpers/): `redirect()` and the other helpers.
- [Session](../session/): where the previous URL is kept.
