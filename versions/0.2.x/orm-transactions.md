---
title: "Transactions"
description: "Group several database changes so they all succeed or all fail together, with nested transactions as savepoints."
---

A **transaction** groups several database changes into one unit: either all of them are saved (**commit**), or none of them are (**rollback**). Use one whenever a half-finished job would leave your data wrong, such as moving money between two accounts, or creating an order and its lines.

In Strutvane you wrap the work in `transaction(async () => { … })`. If the function finishes, everything is committed. If it throws, everything is rolled back, and the error is passed on to you.

:::tip[Coming from Laravel?]
This is `DB::transaction(function () { … })`. Nested calls become savepoints, exactly as in Laravel. The difference is how the transaction travels: there's no shared connection object to pass around. Any ORM call made inside the function, however deep, automatically runs in the transaction. Retrying on deadlocks (`attempts`) and `afterCommit` are coming in 0.2.
:::

## The smallest example

```ts title="app/http/controllers/tag.controller.ts (excerpt)"
import { transaction } from '@strutvane/framework'
import { Tag } from '../../models/tag.ts'

await transaction(async () => {
  await Tag.create({ name: 'kept-1' })
  await Tag.create({ name: 'kept-2' })
})

console.log((await Tag.query().orderBy('name').get()).map((tag) => tag.name))
```

**What you'll see:**

```text
[ 'kept-1', 'kept-2' ]
```

## When something fails, nothing is saved

```ts
try {
  await transaction(async () => {
    await Tag.create({ name: 'lost' })
    throw new Error('boom')
  })
} catch (error) {
  console.log((error as Error).message) // → boom
}

console.log(await Tag.query().where('name', 'lost').exists()) // → false
```

The `lost` tag was inserted, then undone when the function threw. You get the original error back, so you can show it or let the framework turn it into a response.

## Returning a value

`transaction()` returns whatever your function returns:

```ts
const post = await transaction(async () => {
  const created = await user.posts().create({ title: 'Release notes', status: 'draft' })
  await created.tags().attach([news.id])
  return created
})
console.log(post.slug) // → 'release-notes'
```

## Nested transactions are savepoints

Calling `transaction()` inside another one creates a **savepoint**: a bookmark inside the outer transaction. If the inner part fails, only the work since the bookmark is undone; the outer transaction carries on.

```ts
await transaction(async () => {
  await Tag.create({ name: 'outer' })

  try {
    await transaction(async () => {
      await Tag.create({ name: 'inner-lost' })
      throw new Error('inner failure')
    })
  } catch {
    // handled: only "inner-lost" is undone
  }

  await transaction(async () => {
    await Tag.create({ name: 'inner-kept' })
  })
})
// → tags now: [ 'inner-kept', 'outer' ]   (no 'inner-lost')
```

If the **outer** transaction fails, everything is undone, including inner work that had already finished:

```ts
await transaction(async () => {
  await transaction(() => Tag.create({ name: 'inner' }))
  throw new Error('outer failure')
}).catch(() => undefined)

console.log(await Tag.query().count()) // → 0
```

## Am I in a transaction?

`inTransaction()` on the connection tells you, which helps in code that must only run inside one:

```ts
import { defaultConnection, transaction } from '@strutvane/framework'

console.log(defaultConnection().inTransaction())                      // → false
await transaction(async () => console.log(defaultConnection().inTransaction())) // → true
```

Relationship helpers that change several rows already use a transaction for you: `attach()` and `sync()` run all their inserts and deletes as one unit, and join yours when you're already in one.

## Three transactions, from small to advanced

**Small:** two writes, all or nothing (the first example on this page).

**Typical:** create a post and its tags together, and return the post.

```ts title="app/services/create-post.ts"
import { transaction } from '@strutvane/framework'
import type { User } from '../models/user.ts'
import { Tag } from '../models/tag.ts'

export async function createPost(author: User, title: string, tagNames: readonly string[]) {
  return transaction(async () => {
    const post = await author.posts().create({ title, status: 'draft' })
    const tags = []
    for (const name of tagNames) tags.push(await Tag.create({ name }))
    await post.tags().attach(tags.map((tag) => tag.id))
    return post
  })
}
```

If any tag fails its checks (say, a name longer than its column allows), the post and every tag before it are rolled back, so you never get a post with half its tags.

**Advanced:** an optional step that may fail without spoiling the rest, using a nested transaction as a savepoint.

```ts title="app/services/publish-post.ts"
import { transaction } from '@strutvane/framework'
import { Post } from '../models/post.ts'
import { Tag } from '../models/tag.ts'

export async function publish(postId: number, tagName: string) {
  return transaction(async () => {
    const post = await Post.findOrFail(postId)
    post.status = 'published'
    await post.save()

    try {
      await transaction(async () => {
        const tag = await Tag.create({ name: tagName })
        await post.tags().attach([tag.id])
      })
    } catch {
      // the tag couldn't be created (a duplicate name, say): publish anyway, untagged
    }
    return post
  })
}
```

## Who sees what

- **Inside** the transaction, your code sees its own changes immediately.
- **Outside** it, nobody sees them until the commit. On MySQL and PostgreSQL other requests keep reading the committed data; on SQLite (one connection) they wait for the commit.
- Two requests running transactions at the same time never see each other's work: each transaction follows its own chain of `await` calls.

## Steps run one after another

Inside one transaction, run nested transactions one after another, not side by side. A database connection can only stack savepoints, so this is refused:

```ts
// ✘ Don't: two nested transactions at the same time
await transaction(async () => {
  await Promise.all([transaction(() => Tag.create({ name: 'a' })), transaction(() => Tag.create({ name: 'b' }))])
})
```

Plain queries can still run in parallel with `Promise.all`, but `await` nested transactions one at a time:

```ts
// ✔ Do
await transaction(async () => {
  await transaction(() => Tag.create({ name: 'a' }))
  await transaction(() => Tag.create({ name: 'b' }))
})
```

## Slugs and other retries stay safe

When two rows want the same [slug](../orm-slugs/) at the same moment, Strutvane retries the insert inside a savepoint, so your surrounding transaction survives the collision:

```ts
await runWithTenant(teamId, () =>
  transaction(async () => {
    const first = await Project.create({ name: 'Same' })
    const second = await Project.create({ name: 'Same' })
    console.log(first.slug !== second.slug) // → true
  }),
)
```

## Database differences

| | MySQL (default) | PostgreSQL | SQLite |
|---|---|---|---|
| Data changes (insert, update, delete) | rolled back | rolled back | rolled back |
| Table changes (migrations) | **not** rolled back: MySQL commits each one immediately | rolled back | rolled back |
| One tenant per transaction | ORM check | ORM check + row-level security | ORM check |

The table-change difference matters for migrations, not for your app code: see [Migrations](../migrations/). On PostgreSQL, a transaction is also tied to one tenant; switching tenant inside one transaction is refused (see [Tenancy](../orm-tenancy/)).

:::caution[Coming in 0.2]
Designed but not built yet: `transaction(fn, { attempts: 3 })` to retry on deadlocks, `afterCommit` callbacks (and model events delivered after commit), optimistic locking with a `lock_version` column, and `lockForUpdate()`.
:::

## Common mistakes

### Running nested transactions in parallel

```text
Error: Two nested transactions are running at the same time on one connection (for example inside Promise.all). Savepoints are a stack, so run nested transactions one after another.
```

**Fix:** `await` each nested `transaction()` in turn, as shown above.

### Forgetting `await` inside the transaction

```ts
await transaction(async () => {
  Tag.create({ name: 'oops' }) // ✘ no await: may run after the commit, or fail unseen
})
```

**What you'll see** when the late query arrives:

```text
Error: This transaction has already finished (committed or rolled back), so this statement was not run. Await all work inside transaction(…) before it returns.
```

**Why:** the transaction ends when your function's promise settles. A query you didn't wait for can finish after the commit. Strutvane refuses statements on a transaction that has already ended instead of letting them run unprotected. (Without that check, the prototype showed a late insert running outside any transaction, after a rollback, and surviving.)

**Fix:** `await` every database call inside the function. Your editor's "floating promise" lint rule catches this.

### Catching the error inside and expecting a rollback

```ts
await transaction(async () => {
  try {
    await Tag.create({ name: 'x' })
    throw new Error('problem')
  } catch {
    // ✘ swallowed: the transaction thinks everything went fine and commits "x"
  }
})
```

**Fix:** let the error escape the function (re-throw it), or wrap the risky part in its own nested `transaction()` so only that part rolls back.

### Switching tenant inside one transaction (PostgreSQL)

```text
TenantMismatchError: Refusing to touch "this transaction": it already belongs to tenant 0193a0b2-0000-7000-8000-0000000000aa, not 0193a0b2-0000-7000-8000-0000000000bb. One unit of work may only ever see one tenant.
```

**Fix:** start a separate transaction per tenant: `runWithTenant(a, () => transaction(...))`, then the same for `b`.

## Next steps

- [Tenancy](../orm-tenancy/): how transactions and teams fit together.
- [Relationships](../orm-relationships/): `attach()` and `sync()` inside a transaction.
- [Slugs](../orm-slugs/): how slug collisions are retried safely.
