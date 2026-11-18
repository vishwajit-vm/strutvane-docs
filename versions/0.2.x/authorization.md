---
title: Authorization
description: Decide who may do what with policies. Everything is denied unless a policy allows it, invisible records answer 404 instead of 403, admins pass through before(), and developers get an explanation of every denial in local mode.
---

**Authentication** answers "who are you?". **Authorization** answers "are you allowed to do this?": may Bob edit Alice's post? May a guest see a draft?

In Strutvane, those answers live in **policies**: one class per model in `app/policies/`, with one method per action. And the most important rule: **anything a policy doesn't explicitly allow is denied.**

:::tip[Coming from Laravel?]
Policies work like Laravel's: `viewAny`, `view`, `create`, `update`, `delete`, plus `before()` for admins, and `authorize()` instead of `$this->authorize()`.

Two safer defaults: a **missing method denies** (in some Laravel tools a missing method allows), and a record the user may not `view` answers **404, not 403**, from show, update, delete and custom actions (Laravel's `denyAsNotFound`, always on), so hidden records can't be discovered by guessing URLs.

Gates map too: `Gate::define('view-stats', …)` becomes `defineAbility('view-stats', …)` in `bootstrap/app.ts`, and the `can:view-stats` middleware is the same.
:::

:::caution[What exists, and when]
**On framework `main` (0.2.0-next.0, not on npm yet):** policy classes in `app/policies/`, found automatically by name; `before()`; deny by default (a missing method denies); deny-as-404 in `ResourceController`, with `visible()` and `indexConstraints()`; named abilities with `defineAbility()`, the `can` middleware, `can()` and `withCan()`; the start-up checks for unknown abilities and policy-less resource controllers.

**Known gap in 0.2.0-next.0:** the `Policy` and `AuthUser` types and the `authorize()`, `allows()` and `hasAdminRole()` helpers exist inside the framework (`ResourceController` uses them) but aren't exported from `@strutvane/framework` yet, so `import { authorize } from '@strutvane/framework'` doesn't compile against this build. The examples show the import they're meant to have. Until it lands, a policy class can leave out `implements Policy<Post>` and type `user` itself: discovery only needs the methods.

**Coming in 0.2:** policy row conditions compiled to SQL (built in 0.1), the role map, the UI `can()` hook and local-mode hints on `403` answers. Each section says which is which.
:::

## The smallest example

```ts title="app/policies/post.policy.ts"
import type { AuthUser, Policy } from '@strutvane/framework'
import type { Post } from '../models/post.ts'

export class PostPolicy implements Policy<Post> {
  /** Anyone may list posts. */
  viewAny(): boolean {
    return true
  }

  /** Published posts are public; drafts only for their author. */
  view(user: AuthUser | null, post: Post): boolean {
    return post.status === 'published' || user?.id === post.author_id
  }
}
```

Give it to the controller:

```ts title="app/http/controllers/post.controller.ts"
export class PostController extends ResourceController<typeof Post> {
  protected readonly model = Post
  protected readonly policy = new PostPolicy()
}
```

In 0.2.0-next.0, `ResourceController` needs a model that implements its small `ResourceModel` contract; [ORM](../orm/) models don't yet (see [Controllers](../controllers/)). The table below is what the finished wiring answers.

What you'll see:

| Request | Result | Why |
|---|---|---|
| `GET /api/posts/hello-world` (published), as a guest | `200` | `view` allows published posts |
| `GET /api/posts/alice-draft`, as a guest | `404` | `view` says no, so it looks missing |
| `POST /api/posts`, as Alice | `403` | There's no `create` method, so it's denied |

## The policy methods

| Method | Called for | Arguments |
|---|---|---|
| `viewAny(user)` | Listing (`index`) | the user (or `null`) |
| `view(user, record)` | Showing one record, and before any update/delete | the user, the record |
| `create(user)` | `store` | the user |
| `update(user, record)` | `update` and custom actions you guard with it | the user, the record |
| `delete(user, record)` | `destroy` | the user, the record |
| `before(user, ability)` | **First**, before any of the above | the user, the action name |

Each method returns `true` or `false` (or a `Promise` of one). Anything other than `true` means **no**.

`user` is `null` for guests, so write `user?.id` and decide what guests may do.

**What type is `user`?** `AuthUser` is whatever your app declares as its user, once, in `bootstrap/app.ts`:

```ts title="bootstrap/app.ts (excerpt)"
import type { User } from '../app/models/user.ts'

declare module '@strutvane/framework' {
  interface UserRegistry { user: User }
}
```

Until you declare it, `AuthUser` is the plain identity every package shares: `{ id: string, type, roles: string[], attrs }` (the contracts' `Actor`). The examples on this page assume the `User` model, so `user.id` is comparable with `post.author_id`.

### A complete policy (typical)

```ts title="app/policies/post.policy.ts"
import { hasAdminRole, type AuthUser, type Policy } from '@strutvane/framework'
import type { Post } from '../models/post.ts'

/**
 * Who may do what with posts. A method that is missing denies, so `delete` below is
 * admin-only through `before()`.
 */
export class PostPolicy implements Policy<Post> {
  /** Admins may do everything; for everyone else, fall through to the methods below. */
  before(user: AuthUser | null): boolean | undefined {
    return hasAdminRole(user) ? true : undefined
  }

  /** Anyone may list posts (the controller narrows the list to what they may see). */
  viewAny(): boolean {
    return true
  }

  /** Published posts are public; drafts only for their author. */
  view(user: AuthUser | null, post: Post): boolean {
    return post.status === 'published' || user?.id === post.author_id
  }

  /** Any signed-in author may write. */
  create(user: AuthUser | null): boolean {
    return user !== null
  }

  /** Only the author may edit. */
  update(user: AuthUser | null, post: Post): boolean {
    return user?.id === post.author_id
  }
}
```

### `before()`: let admins through

`before()` runs first. Return:

- `true`: allowed, skip the other methods;
- `false`: denied, skip the other methods;
- `undefined`: no opinion, carry on to the normal method.

A helper, `hasAdminRole(user)`, is `true` for a user with `is_admin: true` or `'admin'` in a `roles` list. Generated policies use it.

## Checking a policy yourself: `authorize()`

`ResourceController` checks the policy in every action. In your own actions, call `authorize()`:

```ts
import { authorize } from '@strutvane/framework'

await authorize(this.policy, 'update', ctx.user, post)   // throws 403 if not allowed
```

| Argument | Meaning |
|---|---|
| `this.policy` | The policy to ask |
| `'update'` | The action: `viewAny`, `view`, `create`, `update` or `delete` |
| `ctx.user` | Who's asking (`null` for guests) |
| `post` | The record (`undefined` for `viewAny` and `create`) |

A denial throws `ForbiddenError`: status `403`, code `forbidden`, title "Not allowed", detail "You don't have permission to do this.". Why it was denied is kept on the error as its `cause` (a `PolicyDenial`), never sent to the client.

When you only need a yes/no answer (to show or hide a button), use `allows()`:

```ts
import { allows } from '@strutvane/framework'

const canEdit = await allows(this.policy, 'update', ctx.user, post)   // true or false
return ctx.json({ data: post, meta: { canEdit } })
```

## 403 or 404?

Imagine Bob tries `PATCH /api/posts/alice-draft`. If he got `403 Forbidden`, he'd learn that a draft called `alice-draft` exists. So Strutvane checks `view` **first**, in every action that targets one record:

| Bob may `view` it? | Bob may `update` it? | Bob gets |
|---|---|---|
| No | (not asked) | `404` `not_found`, "We couldn't find what you were looking for." (same as a missing post) |
| Yes | No | `403` `forbidden`, "You don't have permission to do this." (honest) |
| Yes | Yes | `200` |

In your own actions, do the same with `visible()`:

```ts title="app/http/controllers/post.controller.ts"
async publish(ctx: HttpContext): Promise<Response> {
  const post = await this.visible(ctx)                               // 404 if they can't see it
  await authorize(await this.resolvedPolicy(), 'update', ctx.user, post)   // 403 if they can't change it
  post.fill({ status: 'published' })
  await post.save()
  return ctx.json({ data: post })
}
```

## Lists: what may each user see?

`viewAny` answers "may this user list posts at all?". It doesn't filter **which** posts. Narrow the list in the controller with `indexConstraints()`:

```ts title="app/http/controllers/post.controller.ts"
// Constraint is { column, equals } or { anyOf: Constraint[] } (the type isn't exported yet)
protected override indexConstraints(ctx: HttpContext): Constraint[] {
  if (hasAdminRole(ctx.user)) return []
  const visible: Constraint[] = [{ column: 'status', equals: 'published' }]
  if (ctx.user !== null) visible.push({ column: 'author_id', equals: ctx.user.id })
  return [{ anyOf: visible }]
}
```

What you'll see for `GET /api/posts`: guests get the published posts; Alice also gets her drafts; admins get everything. Totals and pages match.

:::caution[Coming in 0.2]
Writing the same rule twice (in `view()` and in `indexConstraints()`) is temporary. In 0.2, a policy method may return a **row condition** that checks one record *and* filters lists in SQL, compiled from the policy (proven in spike 02).
:::

## Developers see why: hints in local mode

:::caution[Coming in 0.2]
Designed, not built yet. In 0.2.0-next.0 every `403` from a policy or an ability is the same catalog problem, in every environment, with no `hint` member:

```json
{
  "type": "https://strutvane.dev/errors/forbidden",
  "title": "Not allowed",
  "status": 403,
  "code": "forbidden",
  "detail": "You don't have permission to do this.",
  "traceId": "01a1ec64-21cf-76ad-b05f-41d90182c222",
  "instance": "/api/posts/alice-draft"
}
```

The reason (for example "PostPolicy has no delete() method, so this is denied (Strutvane denies by default). Add delete(user, model) to the policy to allow it.") is attached to the error as its `cause`, but it isn't sent, logged or shown on the debug page yet.
:::

The plan: in local debug mode (`APP_DEBUG=true`, `APP_ENV=local` or `testing`), a `403` carries that reason as a `hint`. In production the `hint` is never sent.

## Abilities that aren't about one record: `can`

Some checks have no record: "may this user see the stats page?", "may they run an import?". Laravel calls these **gates**. In Strutvane they're **named abilities**, defined once in `bootstrap/app.ts`:

```ts title="bootstrap/app.ts"
import { dirname } from 'node:path'
import { Application, hasAdminRole } from '@strutvane/framework'   // hasAdminRole: see the known gap above
import api from '../routes/api.ts'

export default Application.configure({ basePath: dirname(import.meta.dirname) })
  .withRouting({ api })
  .withMiddleware((middleware) => {
    middleware.defineAbility('view-stats', (user) => user !== null && hasAdminRole(user))
    middleware.defineAbility('import-posts', (user) => user?.roles.includes('editor') === true)
  })
  .create()
```

Then guard routes with `can:<ability>`:

```ts title="routes/api.ts"
import { defineRoutes, Route } from '@strutvane/framework'
import { StatsController } from '../app/http/controllers/stats.controller.ts'

export default defineRoutes([
  Route.get('/admin/stats', [StatsController, 'show']).name('admin.stats').middleware('auth', 'can:view-stats'),
])
```

**What you'll see** for a signed-in user who isn't an admin:

```json
{ "type": "https://strutvane.dev/errors/forbidden", "title": "Not allowed", "status": 403, "code": "forbidden", "detail": "You don't have permission to do this." }
```

(Shortened: the real body also has `traceId` and `instance`.) A guest gets `401` from `auth` first, before the ability runs. The check function receives `(user, ctx)`, so it can also look at the request.

The same check, in the other styles every protection supports:

| Style | Code |
|---|---|
| On a route | `.middleware('auth', 'can:view-stats')` |
| On a controller | `static readonly middleware = [can({ params: ['view-stats'] })]` |
| Around a plain handler | `export default withCan(async (ctx) => ctx.json(stats), 'view-stats')` |

**A typo can't slip through.** Start-up checks every `can:` reference. A route naming an ability that doesn't exist stops the app (and `node strut route:list`, and every test):

```text
error GET /admin/stats uses can:view-stat, but no such ability is defined.
  → Did you mean "view-stats"?
```

**Why abilities about one record stay in the controller:** route model binding runs after middleware. If a record check ran as middleware, a guest would learn whether the post exists before being told to sign in. So record checks use the policy and `authorize()` in the controller, as above.

## Roles

A **role** is a name given to a group of users ("admin", "member"), so policies can say "admins may delete" instead of listing people. The installer asks which roles to start with (question 10):

| Preset | Roles |
|---|---|
| `admin-member` (default) | `admin`, `member` |
| `admin-manager-member-viewer` | `admin`, `manager`, `member`, `viewer` |

Role **names** live in code; only who-has-which-role is stored (the `user_roles` table, and team roles in `team_members` when teams are on). New users get **no** roles. Policies decide what each role means:

```ts title="app/policies/post.policy.ts"
import { hasAdminRole, type AuthUser, type Policy } from '@strutvane/framework'
import type { Post } from '../models/post.ts'

const rolesOf = (user: AuthUser | null): readonly string[] =>
  user !== null && 'roles' in user && Array.isArray(user.roles) ? user.roles : []

export class PostPolicy implements Policy<Post> {
  before(user: AuthUser | null): boolean | undefined {
    return hasAdminRole(user) ? true : undefined
  }

  viewAny(user: AuthUser | null): boolean {
    return user !== null   // every signed-in role may list
  }

  view(user: AuthUser | null, post: Post): boolean {
    return post.status === 'published' || user?.id === post.author_id || rolesOf(user).includes('manager')
  }

  create(user: AuthUser | null): boolean {
    return rolesOf(user).some((role) => role === 'manager' || role === 'member')   // viewers can't write
  }

  update(user: AuthUser | null, post: Post): boolean {
    return user?.id === post.author_id || rolesOf(user).includes('manager')
  }
}
```

**What you'll see:** viewers read, members write their own posts, managers edit anyone's, admins pass through `before()`.

:::caution[Coming in 0.2]
In 0.1, a **role map** in `config/auth.ts` granted permissions such as `'*.view'` or `{ action: '*.update', own: true }` and compiled them to SQL next to the policies, with bounded wildcards that never reach identity, role or audit tables. Whether 0.2 keeps that map or keeps roles as plain policy input is still being decided. With **teams**, the role that counts is the user's role in the current team.
:::

## API tokens and policies

A request made with a [personal access token](../api-tokens/) must pass **both** the token's abilities **and** your policy. The policy is written once; it doesn't need to know whether the user came with a cookie or a token. A token can only narrow what the user may do, never widen it.

## Row conditions: one rule for one record and for lists

Today you write the visibility rule twice: in `view()` for one record, and in `indexConstraints()` for lists. In 0.2 a policy method may return a **row condition** instead of `true` or `false`. The same condition checks one record in memory *and* becomes a SQL `WHERE` for lists, counts, exports, search and charts, so they can never disagree.

:::caution[Coming in 0.2]
**Planned API (a sketch: names may change).** Row conditions are proven (spike 02: 0.1's policy compiler with two-valued, NULL-safe semantics, ADR-0008) and built in 0.1, but their shape inside v2 policy classes isn't final. The blueprint says: "Methods return a boolean or a row predicate."
:::

The rules the compiler keeps (from 0.1, and they stay):

- **NULL never matches by accident.** `author_id = <your id>` is false for a row whose `author_id` is NULL, and for a guest. In plain SQL, `NULL = NULL` is "unknown", and sloppy code turns that into "allow".
- **The negation is exact.** "Not mine" includes rows with no author.
- **A broken rule denies.** A condition that can't be compiled gives an error, never "all rows".

## In the UI: show only what's allowed

The generated screens hide the **New** button without `create`, hide **Edit** and **Delete** per row, and hide a resource from the sidebar without `viewAny`. The server still checks every request: hiding a button is a convenience, not a protection.

:::caution[Coming in 0.2]
A React `can()` hook for your own screens is planned (parity checklist: "a UI `can()` hook"). Until then, send the answer from the server with `allows()`, as above (`meta: { canEdit }`).
:::

## Where policies live

One file per model, `app/policies/<model>.policy.ts`, exporting the policy class as its **default export** or as `<Model>Policy`. Policies are **discovered by name**, like Laravel: model `Post` → `app/policies/post.policy.ts`, with no registration, found once and cached. A controller that names a policy explicitly (`protected readonly policy = new PostPolicy()`) overrides discovery. A `ResourceController` whose model has no policy file gets a policy that **denies everything**. A policy file that exports no policy stops the app at start-up:

```text
error app/policies/post.policy.ts exports no policy for Post.
  → Export the policy class as the default export or as PostPolicy.
```

`node strut make:policy Post` exists, but in 0.2.0-next.0 it still writes the 0.1-style rule file (`definePolicy` from `@strutvane/auth`, for `app/models/post.model.ts`), not the policy class on this page. Write the class by hand for now.

See which routes are protected by what:

```bash
node strut route:list --security
```

## Testing a policy

Policies are plain classes, so test them directly, without HTTP:

```ts title="tests/unit/post.policy.test.ts"
import { allows } from '@strutvane/framework'
import { describe, expect, it } from 'vitest'
import { PostPolicy } from '../../app/policies/post.policy.ts'
import type { Post } from '../../app/models/post.ts'

const policy = new PostPolicy()
const alice = { id: 1, is_admin: false }
const bob = { id: 2, is_admin: false }
const draft = { id: 10, status: 'draft', author_id: 1 } as unknown as Post

describe('PostPolicy', () => {
  it('lets the author see her draft, and nobody else', async () => {
    expect(await allows(policy, 'view', alice, draft)).toBe(true)
    expect(await allows(policy, 'view', bob, draft)).toBe(false)
    expect(await allows(policy, 'view', null, draft)).toBe(false)
  })
})
```

**What you'll see:**

```text
 ✓ tests/unit/post.policy.test.ts (1 test) 3ms
```

Feature tests check the whole route, the 404 included. See [HTTP Tests](../http-tests/).

## With Docker or without Docker

Authorization works the same in both: policies are your own TypeScript, read by the app wherever it runs. The local-mode `hint` depends only on `APP_ENV` and `APP_DEBUG`, so a container started with `APP_ENV=production` never shows hints, even on your laptop.

## Generated policies deny everything

:::caution[Coming in 0.2]
`node strut make:controller` isn't built yet (it isn't in `node strut list` for 0.2.0-next.0). When it lands, `make:controller PostController --api` (or `--resource`, or `--model=Post`) writes this file if it doesn't exist. Until then, copy it by hand.
:::

The deny-everything starting point:

```ts title="app/policies/post.policy.ts"
import { hasAdminRole, type AuthUser, type Policy } from '@strutvane/framework'
import type { Post } from '../models/post.ts'

/**
 * Who may do what with posts. Generated to deny everyone except admins: open up each
 * method deliberately. A method you delete also denies.
 */
export class PostPolicy implements Policy<Post> {
  /** Admins may do everything. */
  before(user: AuthUser | null): boolean | undefined {
    return hasAdminRole(user) ? true : undefined
  }

  /** TODO: who may list posts? */
  viewAny(_user: AuthUser | null): boolean {
    return false
  }

  /** TODO: who may see one post? */
  view(_user: AuthUser | null, _post: Post): boolean {
    return false
  }

  /** TODO: who may create a post? */
  create(_user: AuthUser | null): boolean {
    return false
  }

  /** TODO: who may change this post? */
  update(_user: AuthUser | null, _post: Post): boolean {
    return false
  }

  /** TODO: who may delete this post? */
  delete(_user: AuthUser | null, _post: Post): boolean {
    return false
  }
}
```

**Why so strict?** A new endpoint should never be open by accident. You open each action deliberately, one method at a time.

A `ResourceController` without a policy file falls back to denying everything. A plain controller that serves resource routes (`Route.apiResource()`) without a `policy` property doesn't start at all (see Common mistakes).

## Common mistakes

### Everyone gets 403 on create

```json
{ "type": "https://strutvane.dev/errors/forbidden", "title": "Not allowed", "status": 403, "code": "forbidden", "detail": "You don't have permission to do this." }
```

**Why:** `PostPolicy` has no `create()` method, or there's no `app/policies/post.policy.ts` at all, so creating is denied (Strutvane denies by default).

**Fix:** add the method:

```ts
create(user: AuthUser | null): boolean {
  return user !== null
}
```

### "… serves resource routes but has no policy"

```text
error PostController serves resource routes but has no policy.
  → Give it a `protected readonly policy = new PostPolicy()` and call authorize() in every action, or extend ResourceController.
```

**Why:** a plain controller (not a `ResourceController`) is routed with `Route.resource()` or `Route.apiResource()` and has no `policy` property, so nothing would guard its actions.

**Fix:** extend `ResourceController`, or add the `policy` property and check it in every action.

### My update returns 404 for a post that exists

**Why:** `view()` returns `false` for this user, so the post is treated as invisible.

**Fix:** decide whether they should see it. If yes, allow it in `view()`; then `update()` decides about changing it.

### My policy returns a truthy value but is still denied

**Why:** only exactly `true` allows. `1`, `'yes'` or an object count as "no".

**Fix:** return a real boolean: `return user?.id === post.author_id`.

### A guest gets 401, not the 403 I expected

```json
{ "type": "https://strutvane.dev/errors/unauthenticated", "title": "Sign-in required", "status": 401, "code": "unauthenticated", "detail": "Please sign in to continue." }
```

**Why:** the route has the `auth` middleware, which runs before any policy. Someone who isn't signed in is asked to sign in first.
**Fix:** nothing, if the route needs sign-in. If guests should be allowed, remove `auth` and decide in the policy what `null` may do.

### The app won't start: "no such ability is defined"

```text
error GET /admin/stats uses can:view-stat, but no such ability is defined.
  → Did you mean "view-stats"?
```

**Why:** the name in `can:` doesn't match any `defineAbility()`.
**Fix:** correct the spelling, or define the ability in `bootstrap/app.ts`.

### My `can` check returns the user and is still denied

**Why:** only exactly `true` allows, for abilities as for policies.
**Fix:** `(user) => user !== null && hasAdminRole(user)`, never `(user) => user`.

## Next steps

- [Controllers](../controllers/): `visible()`, `indexConstraints()` and custom actions.
- [Middleware](../middleware/): `auth`, and route-wide checks like `admin`.
- [Teams & Tenancy](../tenancy/): keeping each customer's data apart.
- [API Tokens](../api-tokens/): token abilities on top of policies.
- [Audit](../audit/): recording who changed what.
