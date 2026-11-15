---
title: "Mass Assignment"
description: "Why create() and fill() only accept the columns you list in fillable, and how to set everything else safely."
---

**Mass assignment** means setting many columns at once from an object, usually one that came from a request: `Post.create(body)` or `post.fill(body)`. It's convenient, and it's dangerous: if a user adds `"is_admin": true` or `"author_id": 7` to the form they send, a careless app saves it.

Strutvane only accepts the columns you list in the model's `fillable`. Anything else (an unknown field, a column you didn't list, a column Strutvane manages itself) **throws an error** instead of being silently dropped, so mistakes and attacks are both visible.

:::tip[Coming from Laravel?]
This is `$fillable`, with stricter defaults. There is no `$guarded` and no "unguarded" mode: the allowlist is the only way. Laravel's `preventSilentlyDiscardingAttributes` is always on. Columns that look sensitive (`is_*`, `role`, `*_at`…) need a second confirmation in `allowSensitive`. For trusted code (seeders, your own services), `forceCreate()` and `forceFill()` play the role of `forceFill()` in Laravel.
:::

## The smallest example

```ts title="app/models/post.ts"
import { Model } from '@strutvane/framework'

export class Post extends Model('posts', {
  fillable: ['title', 'body', 'status'],
}) {}
```

```ts
// A request body, exactly as it arrives:
const body = JSON.parse('{"title": "Hello", "status": "draft", "author_id": 7}')
await Post.create(body)
```

**What you'll see:**

```text
MassAssignmentError: "author_id" can't be mass-assigned on "posts". If users may set it, add it to `fillable` in Model('posts', { fillable: [...] }). If your own code sets it, assign it directly (model.author_id = value) or use forceCreate().
```

Nothing is saved. In a controller, the error becomes a 422 response. Remove `author_id` from the body (or set it from the signed-in user, below) and it works.

## What `fillable` controls

| Way of setting a value | Uses `fillable`? |
|---|---|
| `Post.create({...})` | yes |
| `post.fill({...})` | yes |
| `user.posts().create({...})` | yes (and the foreign key is set for you) |
| `post.title = 'x'` (plain assignment) | no: your own code, your decision |
| `post.setAttribute('title', 'x')` | no |
| `Post.forceCreate({...})`, `post.forceFill({...})` | no: any real column except managed ones |

The type of `create()` is "only the fillable columns", so `Post.create({ author_id: 7 })` is already a compile error in your own TypeScript. The runtime check matters for input that TypeScript can't see: request bodies.

## Setting owner columns from the server

The author of a post should come from who is signed in, never from the form. Two good ways:

```ts
// 1. Through the relationship: the foreign key is set for you.
const post = await user.posts().create({ title: 'Hello', status: 'draft' })

// 2. Assign it in your own code, then save.
const draft = Post.make()
draft.fill({ title: 'Hello' })    // from the request: checked against fillable
draft.author_id = user.id         // from the server: your decision
await draft.save()
```

## Trusted code: `forceCreate()` and `forceFill()`

Seeders, imports and your own services sometimes need to set columns users must never set. Use the `force` versions, and only with data you control:

```ts title="database/seeders/post.seeder.ts (excerpt)"
const post = await Post.forceCreate({ title: 'Seeded', author_id: ada.id, status: 'published' })
console.log(post.author_id === ada.id) // → true
```

`forceFill()` does the same on a model you already have, and `setAttribute()` sets one column by name (handy when the name is in a variable):

```ts
const post = await Post.findOrFail(1)
post.forceFill({ author_id: grace.id, status: 'published' })
post.setAttribute('title', 'Edited by an admin script')
await post.save()
```

Even `forceCreate()` and `forceFill()` refuse columns Strutvane manages itself, and every name must still be a real column: a typo throws with a "did you mean".

:::danger[Never pass request data to the force methods]
`forceCreate(ctx.body)` would let anyone set any column, including `is_admin`. Use the force methods only with values your own code chose.
:::

## Columns Strutvane manages

These can never be mass-assigned, not even with `forceCreate()`:

- the key (`id`);
- `created_at`, `updated_at` and `deleted_at`;
- the tenant column (`tenant_id` or `team_id`, see [Tenancy](../orm-tenancy/)).

## Sensitive-looking columns need `allowSensitive`

Some names usually mean "privileges" or "workflow": `is_*`, `*_at`, `*_by`, `role`, `roles`, `plan`, `permissions`, `user_id`, `owner_id`. If you list one in `fillable`, Strutvane asks you to confirm it by listing it in `allowSensitive` too. Say your `tasks` table has an `is_urgent` flag that users may really tick:

```ts title="app/models/task.ts"
import { Model } from '@strutvane/framework'

export class Task extends Model('tasks', {
  fillable: ['title', 'done', 'is_urgent'],
  allowSensitive: ['is_urgent'], // yes, users may really set this one
}) {}
```

Without `allowSensitive`, Strutvane refuses to use the model the first time it loads it (see Common mistakes).

## New columns are read-only until you list them

When a later migration adds a column, it's **not** fillable until you add it to the list. A column nobody thought about can't be set from a request by accident. That's also why a model written by `node strut make:migration create_posts_table` starts with an empty `fillable` list.

### Deciding what goes in `fillable`

For each column, ask in order:

1. **Does Strutvane manage it?** (`id`, timestamps, `deleted_at`, the tenant column) Leave it out; you can't list it anyway.
2. **Does it say who owns the row, or grant something?** (`author_id`, `is_admin`, `role`, `plan`) Leave it out and set it in your own code, usually through a relationship.
3. **Is it a plain value a user types in a form?** (`title`, `body`, `status`) Put it in `fillable`.
4. **Is it sensitive-looking but really user-editable?** Put it in `fillable` **and** `allowSensitive`.

## The order of the checks

For every key in the object you pass to `create()` or `fill()`, Strutvane checks, in this order, and stops at the first problem:

1. the column exists (otherwise "has no column", with a suggestion);
2. it isn't managed by Strutvane (otherwise "is managed by Strutvane");
3. it's in `fillable` (otherwise "can't be mass-assigned").

A refused body is never saved: `create()` stops before the INSERT. With `fill()` on a model you already loaded, the keys before the bad one are already set on the object, so after catching the error don't `save()` it; call `await post.refresh()` to get the stored values back.

## Typos get a suggestion, and tricks are refused

```ts
await User.create(JSON.parse('{"nmae": "Eve", "email": "eve@example.test"}'))
// MassAssignmentError: "users" has no column "nmae". Did you mean "name"? …

await User.create(JSON.parse('{"name": "Eve", "email": "e@x.test", "__proto__": {"is_admin": true}}'))
// MassAssignmentError: "users" has no column "__proto__". …
```

The second one is a classic JavaScript trick (prototype pollution). Here it's one more unknown column.

:::caution[Don't merge request bodies with Object.assign]
`Object.assign(target, body)` with a body that contains `__proto__` changes the object's prototype instead of copying a field. Pass request bodies straight to `create()`/`fill()` (which check every key), or validate them first with a form request (see [Validation](../validation/)).
:::

## Common mistakes

### "can't be mass-assigned"

```text
MassAssignmentError: "is_admin" can't be mass-assigned on "users". If users may set it, add it to `fillable` in Model('users', { fillable: [...] }). If your own code sets it, assign it directly (model.is_admin = value) or use forceCreate().
```

**Why:** the column exists but isn't in `fillable`.

**Fix:** if users may really set it, add it to `fillable` (and `allowSensitive` if asked). Otherwise set it in your own code: `user.is_admin = true`.

### "is managed by Strutvane"

```text
MassAssignmentError: "id" on "posts" is managed by Strutvane (keys, timestamps, soft deletes, tenant) and can't be mass-assigned. Remove it from the input.
```

**Fix:** remove `id`, the timestamps, `deleted_at` or the tenant column from the object. To update a row, load it with `findOrFail(id)` and call `fill()` on it.

### "looks privilege- or workflow-related"

```text
OrmUsageError: Task lists "is_urgent" as fillable, and it looks privilege- or workflow-related (is_*, *_at, *_by, role, plan…). If users really may set it from a request, also list it in allowSensitive: ['is_urgent']; otherwise set it in your own code.
```

**Fix:** add `allowSensitive: ['is_urgent']`, or remove it from `fillable` and set it in your own code.

### `create()` doesn't compile at all

**Why:** a model without `fillable` can't be mass-assigned, so `Post.create(...)` is a compile error (and refused at runtime).

**Fix:** add `fillable: [...]` to the model, or use `forceCreate()` in trusted code.

## Next steps

- [Validation](../validation/): check request bodies before they reach the model.
- [Authorization](../authorization/): decide who may create or change a record.
- [Casts & Accessors](../orm-casts/): what happens to each value you set.
