---
title: Resources
description: Every table with a model gets a secured CRUD API and admin screens after `node strut migrate`. What you get, the endpoints and their answers, the screens and conveniences, who may see what, which tables never get one, and how to opt out or take over.
---

A **resource** is one table seen from the outside: its API (list, show, create, update, delete) and its screens (a list, forms, a detail page, a sidebar entry). In Strutvane you don't build resources: after `node strut migrate`, **every table with a model gets one**, behind sign-in and your policies. You then customise what you want, and nothing you customise is overwritten.

:::tip[Coming from Laravel?]
Think `Route::apiResource()` + a controller + a Filament resource (`php artisan make:filament-resource Post`), all generated from the migration. The differences: there's no separate generator to run (it happens on `migrate`), the screens keep following your schema (`auto()`), and the API is deny-by-default until your policy says yes.
:::

:::caution[Coming in 0.2]
Each part is **proven in a prototype**: the API in spikes 10 and 12, the screens, sidebar and conveniences in spike 14 (133 tests, axe accessibility checks). Generating all of it from one `node strut migrate` is designed, not built as one command yet.
:::

## The smallest example

```bash
node strut make:migration create_tags_table
```

Add a column to the migration (`t.string('name', 50).unique()`), then:

```bash
node strut migrate
```

**What you'll see:** **Tags** in the sidebar (for users whose policy allows it), with a list, a "New tag" form, a detail page and edit and delete; and an API:

```bash
curl http://localhost:3000/api/tags -H "Authorization: Bearer $TOKEN"
```

```json
{ "data": [], "meta": { "page": 1, "perPage": 25, "total": 0, "lastPage": 1, "from": null, "to": null } }
```

[Your First CRUD](../first-crud/) walks through the same flow with a bigger table.

## What `migrate` generates

| Piece | Where | Owned by |
|---|---|---|
| Types (`Tag`, `NewTag`, `TagPatch`, `TagJson`) | `.strutvane/types/models.d.ts` | Strutvane (regenerated) |
| Metadata: labels, searchable, sortable and filterable fields, relations, slug source | `.strutvane/resources.json` | Strutvane |
| The API routes | `routes/resources.gen.ts`, imported by `routes/api.ts` | Strutvane |
| The UI registry | `.strutvane/ui.gen.ts` | Strutvane |
| Screen settings, written **once** for a new table | `resources/ui/tags.ui.ts` | **You** |
| The model, written by `make:migration` | `app/models/tag.ts` | **You** |
| The policy | `app/policies/tag.policy.ts` | **You** |

`node strut ui:sync` regenerates just the UI part; `migrate` and `sync` run it for you.

## The API

| Method | URI | Does | Policy check | Answers |
|---|---|---|---|---|
| GET | `/api/posts` | One page of posts, with search, sort and filters | `viewAny` | `200` `{ data, meta }` |
| POST | `/api/posts` | Validate and create | `create` | `201` + `Location` header |
| GET | `/api/posts/{post}` | One post (by id, or by slug for tables with a slug) | `view` | `200` `{ data }` |
| PUT/PATCH | `/api/posts/{post}` | Validate and change (PATCH: only the fields sent) | `view`, then `update` | `200` `{ data }` |
| DELETE | `/api/posts/{post}` | Delete (soft delete when the table has `deleted_at`) | `view`, then `delete` | `204` |
| POST | `/api/posts/{post}/restore` | Bring back a soft-deleted post (tables with `deleted_at`) | `restore` | `200` `{ data }` |

### List options

| Query | Example | Rules |
|---|---|---|
| `page` | `?page=2` | 1 or more |
| `perPage` | `?perPage=50` | 1 to 100 |
| `search` | `?search=launch` | at most 200 characters; see [Search & Filters](../crud-search/) |
| `sort` | `?sort=-created_at,title` | up to 3 sortable fields; `-` means newest/largest first |
| `filter[field]` | `?filter[status]=draft` | only filterable fields |
| `filter[field][op]` | `?filter[price][gte]=10` | operators per field type |
| `filter[trashed]` | `?filter[trashed]=with` | `with` or `only` deleted rows (soft-delete tables) |

Every bad option is reported **at once** in a `422`, and the message lists what *is* allowed:

```json
{
  "status": 422,
  "code": "validation_failed",
  "issues": [
    { "path": ["sort"], "field": "sort", "code": "not_sortable", "message": "\"body\" can't be sorted on. Sortable fields: id, title, slug, price, status, author_id, created_at." },
    { "path": ["perPage"], "field": "perPage", "code": "invalid_integer", "message": "Page size must be a whole number from 1 to 100." }
  ]
}
```

### What the API refuses

| Request | Answer |
|---|---|
| Not signed in | `401 unauthenticated` |
| A record you may not **see** | `404`, exactly like a missing one, so hidden records can't be discovered by guessing URLs |
| A record you may see but not **change** | `403 forbidden` |
| A field that isn't in the model's `fillable` list, or isn't a column | `422 unknown_field` |
| A model hook (`creating`, `updating`, `saving`, `deleting`, `restoring`) returned `false` | `422 write_cancelled` (nothing was saved) |
| A duplicate value in a unique column | `422` with code `taken` on that field ("That email is already taken.") |
| Two saves racing for the same unique value | `409 conflict` |
| A body that isn't JSON | `415` |

### What the API never shows

- **Hidden and secret columns** (`password`, tokens, keys, and any name the shared redaction matcher catches, such as `api_key` or `remember_token`) are never serialised, searched, sorted, filtered or accepted.
- **Internal tables never get an API or screens:** `migrations`, `seeders`, `sessions`, `cache*`, `jobs`, `failed_jobs`, `job_batches`, `password_reset_tokens`, `personal_access_tokens`, `passkeys`, roles and team memberships, invitations, audit logs and outboxes. The app refuses to start if a resource controller would serve one.

## The screens

| Screen | Address | What's on it |
|---|---|---|
| List | `/posts` | Search, sortable columns, a filter panel and filter chips, numbered pages (25 per page; 10, 50 or 100), deleted rows on request |
| Create | `/posts/new` | One field per fillable column, the right widget per type, the slug following the title |
| Detail | `/posts/hello-world` | Every visible field, relation links, a tab per related list ("Posts, 13"), previous/next record |
| Edit | `/posts/hello-world/edit` | The form, sending only what changed |

Widgets by column type:

| Column | Widget |
|---|---|
| `string` | text box (with a character counter when it has a length) |
| `text` | multi-line text |
| `decimal`, `integer` | number box (the decimal point survives typing) |
| `enum` | select |
| `boolean` | switch; "✓ Yes / — No" in lists |
| `date`, `timestamp` | date picker; lists show relative time ("3 hours ago") with the exact time on hover |
| `foreignId` | a searchable picker ("combobox") over the related table; lists show the related title as a link |
| `slug` | follows the title until you edit it, with a live URL preview |

## Conveniences you get for free

Proven in spike 14 (P0 in the UI standard):

- **Back** returns to the list with its page, filters, sort and scroll restored (Alt+←).
- **Breadcrumbs** on every page; **deep links**: search, filters, sort, page and size live in the URL, so you can share a view.
- **Ctrl/Cmd+K** opens a command palette: jump to a screen, a record by title, or an action ("New post").
- **Keyboard shortcuts:** `?` help, `/` search, `n` new, `e` edit, `g d` dashboard; never while you type.
- **Lists:** sticky header, show/hide columns, compact density, filter chips with "Clear all", "Copy link to this view", search-term highlight.
- **Forms:** "Save and add another", an unsaved-changes guard, the first error scrolled into view and focused.
- **Safety:** Undo after delete (10 seconds), type-to-confirm for permanent deletes, automatic retry of reads on network errors.
- **Detail:** previous/next record, related-record counts on tabs, Copy ID.

:::caution[Coming in 0.2]
Planned for the 0.2 build (P1): column resize and reorder, saved views, a quick-view drawer, inline edit, duplicate record, autosaved drafts, recently viewed records, pinned favourites, optimistic updates, offline and session-expiry notices, created/updated by, activity history and a first-run tour.
:::

## Who sees what

Everything goes through the model's policy, found **by name**: the model `Post` uses `app/policies/post.policy.ts` with no registration (an explicitly set policy overrides it):

| Policy method | Controls |
|---|---|
| `viewAny` | the sidebar entry, the list, and search in the command palette |
| `view` | the detail page (and whether a record "exists" for this user at all) |
| `create` | the "New" button and the create form |
| `update` | the Edit button and the edit form |
| `delete` | the Delete button |

New policies **allow only admins**. Hiding a button is a convenience; the API refuses the same action regardless. See [Authorization](../authorization/).

## High-level endpoints and actions

:::caution[Coming in 0.2]
Designed in the blueprint's API standard, not in the prototypes yet (the UI uses the list endpoint for these today).
:::

| Endpoint | Does |
|---|---|
| `/api/posts/options` | `{ value, label }` pairs for select boxes |
| `/api/posts/count` | A count with the same filters as the list |
| `/api/posts/aggregate` | Group-by counts and sums, for charts (its own `aggregate` rate limit) |
| CSV export | Up to 10,000 rows, formula-safe (a cell can't start a spreadsheet formula); **opt-in** per resource |
| Bulk actions | Up to 100 ids, each checked against the policy, all or nothing; **opt-in** per resource |
| `/api/search` | One search across every resource you may list |
| `ETag` / `If-Match` | A `409` when someone else saved the record since you opened it |

Turn on the opt-in ones in the resource's settings file: `actions: { export: true, bulk: true }`. See [Customising Screens](../crud-customising/).

## Opting out and taking over

| You want | Do |
|---|---|
| No API and no screens for a model | `Model('posts', { fillable, api: false, ui: false })` in the model |
| Screens but no API, or the other way round | `api: false` or `ui: false` alone |
| Keep the screens, write the API yourself | `node strut make:controller PostController --model=Post`, route it in `routes/api.ts` |
| Every line of the API in your file | `node strut make:controller PostController --api` |
| Keep the API, change the screens | edit `resources/ui/posts.ui.ts` |
| Hide only the sidebar entry | `navigation: { hidden: true }` in `posts.ui.ts` |

Your own controller extending `ResourceController` keeps every safety check (policies, `visible()`, unique checks, problem+json) and lets you override one step. See [Controllers](../controllers/).

:::caution[Coming in 0.2]
The `api: false` / `ui: false` model options, policy discovery by name and the `restore` endpoint are decided, not in the prototypes yet (spike 12 asks for the policy on the controller; spike 14's mock API has `restore`).
:::

## With teams

With teams switched on, every resource is limited to the current team: lists, details, unique checks and slugs. Cross-team attack tests are generated for every resource. See [Tenancy](../tenancy/).

## Common mistakes

### My table has no screen after `migrate`

**Why:** one of: it has no model (`create_*_table` migrations write one; others don't), it's an internal table, or your policy denies `viewAny`.
**Fix:** check `node strut model:show tags`; it says when a table is internal. Then check the policy.

### `ui:sync` says a table is internal

```text
- sessions is an internal table: no screen, sidebar entry or typed names (by design).
```

**Why:** framework and identity tables never get auto screens or APIs.
**Fix:** none needed. For a real admin need, write a purpose-built controller with explicit fields.

### "… would serve the internal … table over the API"

```text
✖ SessionController would serve the internal "sessions" table over the API.
→ Framework and identity tables (sessions, tokens, roles, jobs, users…) are never auto resources. Write a purpose-built controller with explicit fields instead.
```

**Fix:** use a plain `Controller` and return only the fields you mean to show.

### A column I added doesn't appear in the list

**Why:** `posts.ui.ts` lists its columns explicitly, so new ones aren't added; `ui:sync` reported it.
**Fix:** add the column to the list, or switch back to `columns: auto()`. See [Customising Screens](../crud-customising/).

### A member gets 404 for a post that exists

**Why:** their policy's `view` says no, and hidden records answer exactly like missing ones.
**Fix:** that's intended. If they should see it, change `view` in the policy.

## Next steps

- [Customising Screens](../crud-customising/): columns, forms, filters, labels.
- [Sidebar](../crud-sidebar/): icons, groups, order and badges.
- [Search & Filters](../crud-search/): what search matches, and every filter.
- [Slugs](../crud-slugs/): readable URLs.
