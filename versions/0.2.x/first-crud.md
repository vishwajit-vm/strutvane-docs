---
title: Your First CRUD in 5 Minutes
description: Build a complete "Posts" feature (a database table, a secured JSON API, admin screens and a sidebar entry) from one migration and two commands, step by step.
---

**CRUD** stands for create, read, update and delete: the four things you do with records in any business app. In this guide you'll add **blog posts** to a new app. You'll write about fifteen lines of code, and at the end you'll have:

- a `posts` table in your database;
- a JSON API to list, search, create, update and delete posts;
- admin screens: a list with search, filters and pages, create and edit forms, and a detail page;
- **Posts** in the sidebar, for everyone who's allowed to see it;
- fake posts to play with.

:::tip[Coming from Laravel?]
This is `php artisan make:model Post -mfs` plus a Filament resource, in one flow. The differences: you start from `make:migration` (it writes the model for you), columns are only written in the migration (there's no `$fillable` guesswork: you list `fillable` once in the model), and the API and admin screens appear on `migrate` without a separate generator.
:::

**Before you start:** create an app and start it, as shown in [Installation](../installation/):

```bash
npm create strutvane@latest my-app
cd my-app
npm run dev
```

Leave `npm run dev` running, and open a **second terminal** in the `my-app` folder for the commands below. (With Docker, type the commands exactly the same way: `node strut` forwards them into the app container.)

## Step 1: Make the migration

A **migration** is a small file that describes one change to your database, like "create a posts table". Ask Strutvane to write one:

```bash
node strut make:migration create_posts_table --seeder
```

**What you'll see** (something like this):

```text
  Created database/migrations/2026_11_14_093000_create_posts_table.ts
  Created app/models/post.ts
  Created database/seeders/post.seeder.ts
  Created database/factories/post.factory.ts

  Next: add your columns to the migration, then run `node strut migrate`.
```

Strutvane reads the name `create_posts_table` the way Laravel does: it means "create a table called `posts`". Because it creates a table, it **also writes the model**. `--seeder` adds a seeder (code that fills the table) and the factory it uses (a recipe for one fake post); `--factory` alone adds only the factory. The date at the start of the file name is the current time in UTC; it keeps migrations in order.

:::caution[Coming in 0.2]
In the prototype (spike 12), `--seeder` writes only the seeder, so pass `--seeder --factory` to get both, and it prints "Then call PostSeeder from database/seeders/database.seeder.ts." instead of registering the seeder for you (see the next step).
:::

## Step 2: Describe your columns

Open the new migration. It already has an `id` and timestamps. Add the columns a post needs:

```ts title="database/migrations/2026_11_14_093000_create_posts_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.create('posts', (t) => {
      t.id()
      t.string('title', 200)
      t.slug('slug').from('title')
      t.text('body').nullable()
      t.decimal('price', 12, 2).default(0)
      t.enum('status', ['draft', 'published']).default('draft')
      t.foreignId('author_id').constrained('users')
      t.timestamps()
      t.softDeletes()
    })
  },
  down(schema) {
    schema.drop('posts')
  },
})
```

Line by line:

| Line | What it makes |
|---|---|
| `t.id()` | An auto-increment primary key called `id`. |
| `t.string('title', 200)` | Required text, at most 200 characters. Columns are required unless you add `.nullable()`. |
| `t.slug('slug').from('title')` | A URL-friendly copy of the title, filled in for you: "Hello World" becomes `hello-world`. |
| `t.text('body').nullable()` | Long text that may be empty. |
| `t.decimal('price', 12, 2).default(0)` | An exact number with 2 decimals, `0` when not given. |
| `t.enum('status', ['draft', 'published']).default('draft')` | One value from a fixed list. The form shows a select. |
| `t.foreignId('author_id').constrained('users')` | A link to a user. The form shows a user picker. |
| `t.timestamps()` | `created_at` and `updated_at`, kept up to date automatically. |
| `t.softDeletes()` | `deleted_at`: "delete" hides a post instead of erasing it, so it can be restored. |

`down()` says how to undo `up()`, so `node strut migrate:rollback` can take the change back.

Now open `app/models/post.ts` and list the columns people may fill in through forms and the API. Anything not on this list (like `id`, `created_at`, or a column you add later and forget) is refused, so nobody can set a field you didn't mean to expose:

```ts title="app/models/post.ts"
import { Model } from '@strutvane/framework'

export class Post extends Model('posts', { fillable: ['title', 'body', 'price', 'status', 'author_id'] }) {}
```

:::tip[Columns live only in migrations]
You never list columns on the command line or repeat them in the model. The migration is the single source of truth, and Strutvane works out everything else from it.
:::

### Fill the seeder and the factory

A **factory** describes one fake post. Open it and return the columns of one row (`faker` makes realistic text, `sequence` counts up so every row is different):

```ts title="database/factories/post.factory.ts"
import { defineFactory } from '@strutvane/framework'
import { Post } from '../../app/models/post.ts'

export default defineFactory(Post, ({ faker, sequence }) => ({
  title: `${faker.lorem.words(3)} ${sequence}`,
  body: faker.lorem.paragraph(),
  price: '9.99',
  status: sequence % 2 === 0 ? 'published' : 'draft',
}))
```

A **seeder** puts rows in the table. This one says it runs **after** the users seeder (a post needs an author), and uses the factory to make ten posts by the first user:

```ts title="database/seeders/post.seeder.ts"
import { defineSeeder } from '@strutvane/framework'
import { Post } from '../../app/models/post.ts'
import { User } from '../../app/models/user.ts'

/** Seeds the `posts` table. */
export default defineSeeder({
  after: ['users'],
  async run() {
    const author = await User.query().orderBy('id').firstOrFail()
    await Post.factory().count(10).for(author, 'author').create()
  },
})
```

Factories write through `forceCreate()`, which is for trusted code: it may set columns that aren't in `fillable` (such as `author_id`). You don't edit `database/seeders/database.seeder.ts`: every seeder is registered there automatically, in the order their `after` lists require. See [Seeding](../seeding/) and [ORM: Factories](../orm-factories/).

:::caution[Coming in 0.2]
`defineSeeder` and `defineFactory` are the decided shapes. The prototype still writes a `PostSeeder` class and a plain `postDefinition(sequence)` function, and asks you to call the seeder from `database.seeder.ts` yourself.
:::

## Step 3: Migrate

```bash
node strut migrate
```

This one command does five things, in order:

1. **Creates the `posts` table.** On PostgreSQL and SQLite, a failing migration leaves nothing half-done.
2. **Regenerates your TypeScript types.** `Post`, `NewPost`, `PostPatch` and `PostJson` now exist, with every column typed: `post.title` is a `string` and `post.status` is `'draft' | 'published'`.
3. **Seeds** the new `post.seeder.ts` once, so you get fake posts. It remembers that it ran, so it won't add more next time.
4. **Generates the API** for posts.
5. **Generates the UI** for posts and adds **Posts** to the sidebar.

**What you'll see** (something like this):

```text
  ✔ 2026_11_14_093000_create_posts_table   14ms
  ✔ Types and metadata regenerated (3 tables)
  ✔ Seeded post.seeder.ts
  ✔ API: /api/posts  ·  UI: Posts (sidebar)
```

:::caution[Coming in 0.2]
`node strut migrate` combines spike 10 (migrations, types, SQL) with spikes 11, 12 and 14. The prototypes prove each part; the single command arrives with 0.2.
:::

## Step 4: Look at what you built

Go back to the browser at [http://localhost:3000](http://localhost:3000). **Posts** is in the sidebar. You're signed in as the admin, who may do everything; other users see Posts only once a policy or their role allows it (see [Authorization](../authorization/)). Click it and try:

- **Search** for a word: it looks in the title and other text columns.
- **Sort** by clicking a column header.
- **Filter** by status.
- **Create** a post. Leave the title empty and you'll see a friendly validation message.
- **Open** a post: the address uses its slug, like `/posts/hello-world`.
- **Delete** a post, then show deleted posts and **restore** it.

The same data is available as JSON. While signed in:

```bash
curl "http://localhost:3000/api/posts?search=hello&sort=-created_at&page=1"
```

**What you'll see:**

```json
{
  "data": [
    { "id": 1, "title": "Hello World", "slug": "hello-world", "status": "draft", "price": "0.00", "author_id": 1,
      "created_at": "2026-11-14T09:31:02.000Z", "updated_at": "2026-11-14T09:31:02.000Z", "deleted_at": null }
  ],
  "meta": { "page": 1, "perPage": 25, "total": 1, "lastPage": 1, "from": 1, "to": 1 }
}
```

Errors come back in one standard shape (RFC 9457 "problem details") with a stable `code`, and validation errors list every problem field at once. See [Validation](../validation/).

## Step 4b: Use the API from a terminal

Scripts, mobile apps and other servers use the API with an **API token** instead of a browser session. Create one as shown in [Authentication: API tokens](../authentication/), then keep it in a variable so the commands below stay short:

| Shell | Set the variable |
|---|---|
| macOS / Linux (bash, zsh) | `TOKEN=svp_your_token_here` |
| Windows PowerShell | `$TOKEN = 'svp_your_token_here'` |

In PowerShell, type `curl.exe` instead of `curl` (plain `curl` is a different PowerShell command), and use `$TOKEN` exactly as below.

### Create a post

```bash
curl -X POST http://localhost:3000/api/posts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello World","body":"My first post.","status":"draft"}'
```

**What you'll see:** status `201 Created`, a `Location` header pointing at the new post, and the post itself, with the slug filled in from the title:

```json
{
  "data": { "id": 11, "title": "Hello World", "slug": "hello-world", "body": "My first post.", "price": "0.00", "status": "draft", "author_id": 1,
            "created_at": "2026-11-14T09:40:00.000Z", "updated_at": "2026-11-14T09:40:00.000Z", "deleted_at": null }
}
```

### Send something wrong

Leave out the title and pick a status that doesn't exist:

```bash
curl -X POST http://localhost:3000/api/posts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"archived"}'
```

**What you'll see:** status `422`, with **every** problem at once, each on its field:

```json
{
  "type": "https://strutvane.dev/problems/validation_failed",
  "title": "Some fields need attention",
  "status": 422,
  "code": "validation_failed",
  "detail": "Fix the fields listed in `issues` and try again.",
  "issues": [
    { "path": ["title"], "field": "title", "code": "invalid_type", "message": "Title is required." },
    { "path": ["status"], "field": "status", "code": "invalid_value", "message": "Status must be one of: draft, published." }
  ]
}
```

Now send a valid post with one extra field the API doesn't accept:

```bash
curl -X POST http://localhost:3000/api/posts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Sneaky","is_admin":true}'
```

**What you'll see:** `422` again, this time for the unknown field:

```json
{ "path": ["is_admin"], "field": "is_admin", "code": "unknown_field", "message": "\"is_admin\" is not a field you can send here. Remove it from the request body." }
```

Unknown fields are refused on purpose: a typo or an attempt to set `is_admin` never passes silently. They're reported once the other fields are valid. (The exact wording of each message may still change.)

### Change and delete

```bash
# change only the status (PATCH sends just the fields you change)
curl -X PATCH http://localhost:3000/api/posts/hello-world \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"published"}'

# soft-delete it (it can be restored from the Deleted filter in the UI)
curl -X DELETE http://localhost:3000/api/posts/hello-world -H "Authorization: Bearer $TOKEN"
```

**What you'll see:** `200` with the updated post, then `204 No Content` (an empty answer that means "done"). Notice the address uses the slug, `hello-world`, not the id.

### List, search, sort and filter

| You want | Add to `/api/posts` |
|---|---|
| Page 2, 50 per page | `?page=2&perPage=50` (at most 100) |
| Posts mentioning "launch" | `?search=launch` |
| Newest first, then by title | `?sort=-created_at,title` |
| Only drafts | `?filter[status]=draft` |
| Drafts or published | `?filter[status][in]=draft,published` |
| Price of at least 10 | `?filter[price][gte]=10` |

A field that can't be sorted or filtered is a `422` that lists the ones that can. See [Search & Filters](../crud-search/).

## Step 5: Make it yours

The first `migrate` also wrote a small file you own, `resources/ui/posts.ui.ts`. It starts with `columns: auto()` and `form: auto()`, so the screens follow your migrations automatically: a column you add later shows up by itself. Change it whenever you want, for example to choose which columns the list shows. Strutvane never overwrites this file. See [Customising Screens](../crud-customising/).

:::caution[Coming in 0.2]
The exact options of `*.ui.ts` files are being finalised in the auto CRUD UI prototype (spike 14).
:::

## Step 5b: Let other people use Posts

The generated policy, `app/policies/post.policy.ts`, lets **admins** do everything and **denies everyone else**. That's on purpose: a new feature is never open by accident. Open it and decide, method by method. For example, "members may list and read posts, and change their own":

```ts title="app/policies/post.policy.ts"
import { hasAdminRole, type AuthUser, type Policy } from '@strutvane/framework'
import type { Post } from '../models/post.ts'

export class PostPolicy implements Policy<Post> {
  /** Admins may do everything. */
  before(user: AuthUser | null): boolean | undefined {
    return hasAdminRole(user) ? true : undefined
  }

  viewAny(user: AuthUser | null): boolean {
    return user !== null
  }

  view(user: AuthUser | null, _post: Post): boolean {
    return user !== null
  }

  create(user: AuthUser | null): boolean {
    return user !== null
  }

  update(user: AuthUser | null, post: Post): boolean {
    return user !== null && post.author_id === user.id
  }

  delete(user: AuthUser | null, post: Post): boolean {
    return user !== null && post.author_id === user.id
  }
}
```

**What you'll see:** a member now finds Posts in the sidebar and can create posts. Edit and Delete appear only on their own posts, and the API answers `403` if they try someone else's. A method you delete also denies. See [Authorization](../authorization/) for rules that also filter lists in SQL.

## Step 6: Change your mind later

Need a subtitle? Never edit an old migration that has already run. Add a new one:

```bash
node strut make:migration add_subtitle_to_posts_table
```

The name means "change the `posts` table", so the new file starts with `schema.table('posts', …)`. Add the column:

```ts title="database/migrations/2026_11_14_101500_add_subtitle_to_posts_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.table('posts', (t) => {
      t.string('subtitle').nullable()
    })
  },
  down(schema) {
    schema.table('posts', (t) => {
      t.dropColumn('subtitle')
    })
  },
})
```

```bash
node strut migrate
```

**What you'll see:** the new column in the detail page and the API. To let people *edit* it, add `'subtitle'` to `fillable` in `app/models/post.ts`; until then it's read-only, on purpose. If you had *removed* a column instead, every line of TypeScript that still used it would now be a compile error, so nothing breaks silently.

### Undo the last migration

Made a mistake in a migration you just ran (and nobody else has it yet)? Roll it back, fix the file, and migrate again:

```bash
node strut migrate:rollback     # runs down() of the last batch
node strut migrate              # runs your corrected up()
```

Once a migration is shared with teammates or deployed, never edit it: write a new one instead, as above.

:::caution[Coming in 0.2]
Rollback is proven in the schema prototype (spike 10); the `migrate:rollback` command is designed, not built yet.
:::

### Start again from scratch

While you're experimenting, you can drop every table, migrate and seed again in one go (development only, it deletes all your data):

```bash
node strut migrate:fresh --seed
```

## The same flow with Docker or without

Nothing changes in what you type. With Docker, `node strut make:migration` writes files on your computer (the project folder is shared with the container), and `node strut migrate` runs inside the `app` container, against the MySQL container. Without Docker, both run on your computer against your database. See [Docker](../docker/).

## Common mistakes

### "is not a valid migration name"

```text
  ✖ "CreatePosts" is not a valid migration name.
  → Use snake_case letters, digits and underscores, for example: node strut make:migration create_posts
```

**Why:** migration names are snake_case, so Strutvane can read what you mean (`create_posts_table` → create `posts`).
**Fix:**

```bash
node strut make:migration create_posts_table
```

### "is required but has no default"

```text
[INVALID_COLUMN] in 2026_11_14_101500_add_subtitle_to_posts_table.ts: The new column "posts.subtitle" is required but has no default, so existing rows would have no value. Hint: Make it .nullable(), or give it a .default(…).
```

**Why:** the table already has rows, and they need a value for the new column.
**Fix:** `t.string('subtitle').nullable()` or `t.string('subtitle').default('')`.

### Saving the form fails with MASS_ASSIGNMENT

```text
"subtitle" can't be mass-assigned on "posts". If users may set it, add it to `fillable` in Model('posts', { fillable: [...] }). If your own code sets it, assign it directly (model.subtitle = value) or use forceCreate().
```

**Why:** columns are read-only through forms and the API until you list them in `fillable`.
**Fix:** add the column to `fillable` in `app/models/post.ts`. See [Mass Assignment](../orm-mass-assignment/).

### Posts doesn't appear in the sidebar

**Why:** the sidebar only shows resources you may `viewAny`. If you're not the admin, the generated policy denies everything until you edit it.
**Fix:** sign in as the admin from the installer's summary, or open `app/policies/post.policy.ts` and allow `viewAny` (Step 5b). See [Authorization](../authorization/).

### The API answers 401

```text
{"type":"https://strutvane.dev/problems/unauthenticated","title":"Unauthenticated","status":401,"code":"unauthenticated","detail":"Sign in first: send an \"Authorization: Bearer <token>\" header."}
```

**Why:** the request carried no session and no token, and the API is deny by default.
**Fix:** send `-H "Authorization: Bearer $TOKEN"` with a token you created (Step 4b).

### The API answers 415 when I create a post

```text
{"type":"https://strutvane.dev/problems/unsupported_media_type","title":"Unsupported media type","status":415,"code":"unsupported_media_type","detail":"Send the body as JSON with \"Content-Type: application/json\"."}
```

**Why:** the body was sent without `Content-Type: application/json` (curl's `-d` sends a form type by default).
**Fix:** add `-H "Content-Type: application/json"`.

### PowerShell says "A parameter cannot be found that matches parameter name 'X'"

**Why:** in Windows PowerShell, `curl` is a different command (`Invoke-WebRequest`) with other options.
**Fix:** type `curl.exe` instead of `curl`. Everything else stays the same.

### The seeder adds the same posts twice

**Why:** it doesn't, in development: each seeder runs once and is remembered in a `seeders` table. You see duplicates only if you ran `node strut migrate --seed` or `node strut db:seed` on purpose.
**Fix:** `node strut migrate:fresh --seed` starts clean (development only).

### "The new column … is required but has no default" when I add a column

See ["is required but has no default"](#is-required-but-has-no-default) above: give the column `.nullable()` or a `.default(…)`.

## What you learned

- `node strut make:migration create_x_table --seeder` writes the migration, model, seeder and factory.
- Columns go in the migration, and only there; `fillable` in the model says which ones people may set.
- `node strut migrate` updates the database, the types, the API and the screens in one go.
- Files you own (`resources/ui/*.ui.ts`, models, migrations) are never overwritten.

## Next steps

- [Migrations](../migrations/): every column type and how to change tables safely.
- [Seeding](../seeding/): starting data and fake data.
- [ORM: Getting Started](../orm/): reading and writing posts in your own code.
- [Authorization](../authorization/): decide who may see and change posts.
