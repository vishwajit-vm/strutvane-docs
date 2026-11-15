---
title: "Customising Screens"
description: "Change the generated list, form, filters, labels, sort and sidebar entry of a resource in its own `resources/ui/<table>.ui.ts` file, keep them following your schema with `auto()`, read the `ui:sync` report, and fix the compile error a dropped column causes."
---

Every generated resource gets a small **settings file** you own: `resources/ui/posts.ui.ts`. It decides which columns the list shows, which fields the form has, which filters are offered, and how the sidebar entry looks. Strutvane writes it **once**, when the table first appears, and never touches it again. Change anything; the next `migrate` keeps your edits.

:::tip[Coming from Laravel?]
It's the `table()`, `form()` and `getNavigationIcon()` parts of a Filament resource, as data instead of a class. The difference: `auto()` keeps following your migrations, so a new column appears by itself, and every field name is **type-checked** against the schema, so a dropped column becomes a compile error instead of a blank column.
:::

:::caution[Coming in 0.2]
**Proven in a prototype** (spike 14): the settings file, `auto()`, the `ui:sync` report and the compile-time checks, tested with the real TypeScript compiler. Overriding whole pages (levels L2 and L3) is designed, not prototyped.
:::

## The smallest example

After `node strut migrate` creates the `posts` table, you'll find:

```ts title="resources/ui/posts.ui.ts"
import { auto, defineResourceUi } from '@strutvane/ui'

/**
 * How posts look in the admin UI. This file is yours: `ui:sync` wrote it once,
 * when the `posts` table first appeared, and never touches it again.
 */
export default defineResourceUi('posts', {
  columns: auto(),
  form: auto(),
  filters: auto(),
  navigation: { icon: 'file-text' },
})
```

Hide the long `body` column from the list:

```ts title="resources/ui/posts.ui.ts"
export default defineResourceUi('posts', {
  columns: auto({ except: ['body'] }),
  form: auto(),
  filters: auto(),
  navigation: { icon: 'file-text' },
})
```

**What you'll see:** save the file and the list loses its Body column at once (hot reload). Nothing else changes, and future columns still appear by themselves.

## `auto()`: follow the schema

`auto()` means "whatever the schema says, now and later". It picks sensible defaults:

| Setting | `auto()` shows | Never shows |
|---|---|---|
| `columns` | listed columns, the title field first | the id, hidden and secret columns |
| `form` | fillable columns that have an input | hidden, secret and system columns |
| `filters` | columns with filter operators | long text and JSON, the id, `updated_at`, `deleted_at`, hidden and secret columns |

Two options adjust it without giving up the "follow the schema" behaviour:

| Option | Does | Example |
|---|---|---|
| `except` | leave these fields out | `auto({ except: ['meta'] })` |
| `order` | put these first, in this order; the rest follow in schema order | `auto({ order: ['title', 'status'] })` |

```ts
form: auto({ except: ['meta'], order: ['title', 'status'] }),
```

## An explicit list: take full control

Replace `auto()` with an array and you decide exactly what's shown, in that order:

```ts
columns: ['title', 'status', 'author_id', 'created_at'],
```

From then on, a new column is **not** added to that list. `ui:sync` tells you about it instead, so you can decide:

```text
ui:sync:
  ! New column posts.subtitle (columns) is NOT shown: resources/ui/posts.ui.ts lists columns explicitly. Add 'subtitle' to that list if you want it.
```

## Every setting

| Setting | Type | Default | Means |
|---|---|---|---|
| `columns` | `auto(…)` or a list | `auto()` | The list's columns |
| `form` | `auto(…)` or a list | `auto()` | The create and edit form fields |
| `filters` | `auto(…)` or a list | `auto()` | The filter panel |
| `label` | `{ singular, plural }` | from the table name | "Post" / "Posts" in titles, buttons and the sidebar |
| `navigation` | `{ icon, group, order, hidden, badge }` | an icon guessed from the name | The sidebar entry; see [Sidebar](../crud-sidebar/) |
| `pageSize` | `10`, `25`, `50` or `100` | `25` | Rows per page |
| `defaultSort` | a field, or `-field` | the table's default | `'title'` (A to Z) or `'-created_at'` (newest first) |
| `actions` | `{ export?, bulk? }` | both off | Opt-in "Export CSV" and bulk delete/restore |

### Typical: a real customisation

```ts title="resources/ui/posts.ui.ts"
import { auto, defineResourceUi } from '@strutvane/ui'

export default defineResourceUi('posts', {
  label: { singular: 'Article', plural: 'Articles' },
  columns: auto({ except: ['body'], order: ['title', 'status'] }),
  form: auto({ except: ['meta'], order: ['title', 'status'] }),
  filters: ['status', 'author_id', 'created_at'],
  navigation: { icon: 'file-text', group: 'Content', order: 1, badge: 'count' },
  pageSize: 50,
  defaultSort: '-created_at',
})
```

**What you'll see:** "Articles" in the sidebar under **Content**, with a live row count; the list newest first, 50 per page, Title and Status first; three filters only.

### Advanced: export and bulk actions

```ts
actions: { export: true, bulk: true },
```

**What you'll see:** an "Export CSV" button and row checkboxes with bulk delete and restore. They're **off by default** because exporting or deleting many rows at once is a bigger permission than viewing one; the API must also allow them for the user.

:::caution[Coming in 0.2]
In the prototype only the switches exist; the export and bulk screens and endpoints are designed (CSV up to 10,000 rows, formula-safe; bulk up to 100 ids, each checked against the policy).
:::

## Names are checked by the compiler

Every field name in the file is checked against your schema (`.strutvane/ui.gen.ts` teaches TypeScript the columns of each table):

```ts
columns: ['title', 'subtitel'],          // ✖ compile error: no such column
auto({ except: ['nope'] }),               // ✖ compile error
defaultSort: '-nope',                     // ✖ compile error
defineResourceUi('invoices', { … }),      // ✖ compile error: no such resource
navigation: { icon: 'reciept' },          // ✖ compile error ("Did you mean 'receipt'?")
columns: ['title', 'password'],           // ✖ compile error: secret columns aren't field names
```

### When a migration drops a column you still name

You drop `subtitle`, run `migrate`, and `ui:sync` says:

```text
ui:sync:
  x resources/ui/posts.ui.ts still names 'subtitle' in columns, but posts no longer has it. Remove it; until then the file does not type-check.
```

and the type check fails with exactly one error (the list of allowed names is shortened here):

```text
resources/ui/posts.ui.ts(5,23): error TS2322: Type '"subtitle"' is not assignable to type '"title" | "slug" | "status" | …'.
```

**Fix:** remove `'subtitle'` from the list. Nothing breaks silently: a dropped column can't leave an empty column on screen.

## Every `ui:sync` message

`node strut ui:sync` runs after every `migrate` (and with `sync`). Its report:

| Line starts with | Means |
|---|---|
| `+ New screen: …` | A new table got its settings file ("yours to edit; ui:sync will not touch it again") |
| `+ New column … appears automatically` | A new column joined an `auto()` list |
| `! New column … is NOT shown` | A new column, but the list is explicit; add it if you want it |
| `x … still names '…'` | A dropped column is still named; the file won't type-check until you remove it |
| `! … is missing` | You deleted a settings file; that screen uses the defaults (restore it from git to customise again) |
| `! … belongs to a table that no longer exists` | The table was dropped; delete the file |
| `? …` | The file couldn't be read safely (see below) |
| `- … is an internal table` | No screen, by design |
| `ui:sync: screens are up to date.` | Nothing to report |

## Keep the file simple: data, not code

`ui:sync` **reads** your settings file without running it (no app code runs during `migrate`). So it understands plain values, `auto(…)`, lists, `as const` and `satisfies`. If you build a list with a variable or a spread, it can't check it, and says so with the line number instead of guessing (something like this):

```text
ui:sync:
  ? resources/ui/posts.ui.ts:4: columns is built from a variable, so new columns can't be checked. Write the list inline.
```

The screens still work; only the "new column" report is skipped for that setting.

## What belongs elsewhere

The settings file only changes how screens **look**. Anything that changes what the API **accepts** stays where the API reads it:

| You want | Change it in |
|---|---|
| A field people may edit | `fillable` in `app/models/post.ts` |
| A column searchable, sortable, unique, or a slug | the migration |
| Who may see or change posts | `app/policies/post.policy.ts` |
| Validation beyond the column types | a form request ([Requests](../requests/)) |
| The look (colours, fonts, density) | `resources/ui/theme.css` ([Frontend](../frontend/), [Designs](../designs/)) |

## Going further: your own pages

:::caution[Coming in 0.2]
Designed, not prototyped: overriding one generated page with your own component (level L2), and **ejecting** a screen into your project so every line is yours (level L3). Custom pages next to the generated ones work today: see [Frontend](../frontend/).
:::

## Common mistakes

### My edit disappeared after `migrate`

**Why:** it can't have: settings files are created with "create only" writes and never overwritten. Most likely the change was in a generated file (`.strutvane/ui.gen.ts`), which **is** regenerated.
**Fix:** put customisations in `resources/ui/<table>.ui.ts` only.

### I deleted `posts.ui.ts` to reset it, and it didn't come back

**Why:** `ui:sync` never recreates a file you deleted, so it can't undo a deliberate choice; the screen uses the defaults and the report says the file is missing.
**Fix:** restore it from git (`git checkout -- resources/ui/posts.ui.ts`), or write a fresh one with `columns: auto()` and friends.

### `auto().except('body')` compiles but does nothing useful

**Why:** the chained form can't be type-checked, so it isn't supported.
**Fix:** use the options form: `auto({ except: ['body'] })`.

### Windows: `ui:sync` failed with EPERM while the dev server ran

**Why:** a file watcher briefly held the generated file. The prototype retries the rename with a short back-off; a rare failure is safe (nothing is half-written).
**Fix:** run `node strut ui:sync` again.

## Next steps

- [Sidebar](../crud-sidebar/): icons, groups, order and badges.
- [Search & Filters](../crud-search/): what the filter panel sends.
- [Resources](../crud/): the API behind the screens.
- [Designs](../designs/): the look.
