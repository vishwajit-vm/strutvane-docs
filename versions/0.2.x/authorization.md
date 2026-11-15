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

:::caution[Coming in 0.2]
Policies, `before()`, `authorize()`, `allows()`, `visible()`, `indexConstraints()`, named abilities with the `can` middleware, deny-as-404 and the local-mode hints are **proven in the application-core prototype** (spike 12, including a planted-bug test where a missing method allowing makes three tests fail). They aren't released yet. Policy **row conditions compiled to SQL** (proven in spike 02 and built in 0.1), automatic policy discovery, the role map and the UI `can()` hook are designed for 0.2, not wired into the new core yet. Each section says which is which.
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

### A complete policy (typical)

```ts title="app/policies/post.policy.ts"
import type { AuthUser, Policy } from '@strutvane/framework'
import type { Post } from '../models/post.ts'

/**
 * Who may do what with posts. A method that is missing denies, so `delete` below is
 * admin-only through `before()`.
 */
export class PostPolicy implements Policy<Post> {
  /** Admins may do everything; for everyone else, fall through to the methods below. */
  before(user: AuthUser | null): boolean | undefined {
    return user?.is_admin === true ? true : undefined
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

await authorize(this.policy, 'update', ctx.user, post, 'post')   // throws 403 if not allowed
```

| Argument | Meaning |
|---|---|
| `this.policy` | The policy to ask |
| `'update'` | The action: `viewAny`, `view`, `create`, `update` or `delete` |
| `ctx.user` | Who's asking (`null` for guests) |
| `post` | The record (`undefined` for `viewAny` and `create`) |
| `'post'` | A label for the message: "You are not allowed to update this post." |

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
| No | (not asked) | `404` `No post matches "alice-draft".` (same as a missing post) |
| Yes | No | `403` `You are not allowed to update this post.` (honest) |
| Yes | Yes | `200` |

In your own actions, do the same with `visible()`:

```ts title="app/http/controllers/post.controller.ts"
async publish(ctx: HttpContext): Promise<Response> {
  const post = await this.visible(ctx)                               // 404 if they can't see it
  await authorize(this.policy, 'update', ctx.user, post, 'post')    // 403 if they can't change it
  post.fill({ status: 'published' })
  await post.save()
  return ctx.json({ data: post })
}
```

## Lists: what may each user see?

`viewAny` answers "may this user list posts at all?". It doesn't filter **which** posts. Narrow the list in the controller with `indexConstraints()`:

```ts title="app/http/controllers/post.controller.ts"
protected override indexConstraints(ctx: HttpContext): Constraint[] {
  if (ctx.user?.is_admin === true) return []
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

In local debug mode (`APP_DEBUG=true`, `APP_ENV=local` or `testing`), every `403` explains itself:

```json
{
  "status": 403,
  "code": "forbidden",
  "detail": "You are not allowed to delete this post.",
  "hint": "PostPolicy has no delete() method, so this is denied (Strutvane denies by default). Add delete(user, post) to the policy to allow it."
}
```

When the method exists and said no:

```json
{ "detail": "You are not allowed to update this post.", "hint": "PostPolicy.update() returned false for this user." }
```

In production the `hint` is never sent.

## Abilities that aren't about one record: `can`

Some checks have no record: "may this user see the stats page?", "may they run an import?". Laravel calls these **gates**. In Strutvane they're **named abilities**, defined once in `bootstrap/app.ts`:

```ts title="bootstrap/app.ts"
import { dirname } from 'node:path'
import { Application, hasAdminRole } from '@strutvane/framework'
// the rest of the file (config, providers, routing) is unchanged

export function createApp(): Application {
  return Application.configure({ basePath: dirname(import.meta.dirname) })
    .withMiddleware((middleware) => {
      middleware.defineAbility('view-stats', (user) => user !== null && hasAdminRole(user))
      middleware.defineAbility('import-posts', (user) => user?.is_admin === true)
    })
    .create()
}
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
{ "status": 403, "code": "forbidden", "detail": "You are not allowed to do this.", "hint": "The \"view-stats\" ability denied this request." }
```

(The `hint` appears in local debug mode only.) A guest gets `401` from `auth` first, before the ability runs.

The same check, in the other styles every protection supports:

| Style | Code |
|---|---|
| On a route | `.middleware('auth', 'can:view-stats')` |
| On a controller | `static readonly middleware = [can({ params: ['view-stats'] })]` |
| Around a plain handler | `export default withCan(async (ctx) => ctx.json(stats), 'view-stats')` |

**A typo can't slip through.** Start-up checks every `can:` reference. A route naming an ability that doesn't exist stops the app (and `node strut route:list`, and every test):

```text
✖ GET /admin/stats uses can:view-stat, but no such ability is defined.
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

One file per model, `app/policies/<model>.policy.ts`, exporting `<Model>Policy`. In the prototype, a controller names its policy (`protected readonly policy = new PostPolicy()`). The blueprint plans **automatic discovery by name**, like Laravel, so a `PostPolicy` in `post.policy.ts` is found for `Post` without that line; that's coming in 0.2. `node strut make:policy` writes a deny-all policy.

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

`node strut make:controller PostController --api` (or `--resource`, or `--model=Post`) writes `app/policies/post.policy.ts` if it doesn't exist:

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

And a resource controller **without** a policy doesn't start at all (see Common mistakes).

## Common mistakes

### Everyone gets 403 on create

```json
{ "status": 403, "code": "forbidden", "detail": "You are not allowed to create a post.", "hint": "PostPolicy has no create() method, so this is denied (Strutvane denies by default). Add create(user) to the policy to allow it." }
```

**Fix:** add the method:

```ts
create(user: AuthUser | null): boolean {
  return user !== null
}
```

### "… serves resource routes but has no policy"

```text
✖ PostController serves resource routes but has no policy.
→ Give it a `protected readonly policy = new PostPolicy()` and call authorize() in every action (node strut make:controller --resource writes this for you).
```

### My update returns 404 for a post that exists

**Why:** `view()` returns `false` for this user, so the post is treated as invisible.

**Fix:** decide whether they should see it. If yes, allow it in `view()`; then `update()` decides about changing it.

### My policy returns a truthy value but is still denied

**Why:** only exactly `true` allows. `1`, `'yes'` or an object count as "no".

**Fix:** return a real boolean: `return user?.id === post.author_id`.

### A guest gets 401, not the 403 I expected

```json
{ "status": 401, "code": "unauthenticated", "detail": "Sign in first: send an \"Authorization: Bearer <token>\" header." }
```

**Why:** the route has the `auth` middleware, which runs before any policy. Someone who isn't signed in is asked to sign in first.
**Fix:** nothing, if the route needs sign-in. If guests should be allowed, remove `auth` and decide in the policy what `null` may do.

### The app won't start: "no such ability is defined"

```text
✖ GET /admin/stats uses can:view-stat, but no such ability is defined.
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
