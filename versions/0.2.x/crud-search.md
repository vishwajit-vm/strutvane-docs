---
title: "Search, Filters & Sorting"
description: "How `?search=`, `filter[...]`, `sort=` and paging work in the generated API and screens: what search matches, every filter operator, deleted rows, the filter panel and chips, the Ctrl/Cmd+K palette, and every error you can get."
---

Every generated list can be **searched** (type a word, find matching rows), **filtered** (only drafts, price at least 10), **sorted** (newest first) and **paged** (25 at a time). The screens send these as query parameters to the API, so a script can do exactly what the UI does, and every view has a URL you can share.

:::tip[Coming from Laravel?]
It's Filament's searchable columns, table filters and sorting, and in the API the `filter[field]=value` / `sort=-field` style of spatie/laravel-query-builder. The differences: which fields are searchable, sortable and filterable comes from your **migration** (no lists to maintain), and every field name and operator is checked against that list before it gets near SQL.
:::

:::caution[Coming in 0.2]
**Proven in prototypes:** search, filters, sort and paging in the API (spikes 10 and 12, on SQLite, with MySQL and PostgreSQL SQL pinned by tests), and the search box, filter panel, chips and palette in the UI (spike 14). Items marked "Coming" below are designed only.
:::

## The smallest example

```bash
curl "http://localhost:3000/api/posts?search=launch" -H "Authorization: Bearer $TOKEN"
```

**What you'll see:** the posts whose title or another text column contains "launch", in any case:

```json
{
  "data": [
    { "id": 7, "title": "Launch day", "slug": "launch-day", "status": "published" },
    { "id": 9, "title": "After the LAUNCH", "slug": "after-the-launch", "status": "draft" }
  ],
  "meta": { "page": 1, "perPage": 25, "total": 2, "lastPage": 1, "from": 1, "to": 2 }
}
```

In the UI, type "launch" in the list's search box: the same request, sent after you pause typing, and the count is announced to screen readers.

## Search: `?search=`

| Rule | Detail |
|---|---|
| Where it looks | Every **text** column marked searchable (titles, names, emails, short text), plus the id when the term is a number |
| Case | Ignored: `launch` finds "LAUNCH" |
| Partial words | Yes: `aunc` finds "Launch" |
| `%` and `_` | Literal characters, not wildcards: `100%` finds "100%" |
| Length | At most 200 characters |
| Hidden or secret columns | Never searched |
| Numbers and dates | Not searched as text: use filters (`filter[price][gte]=10`) |

What's searchable comes from each column's type in the migration; `node strut model:show Post` shows it (the Search column says `text` or `exact`).

:::caution[Coming in 0.2]
The blueprint's search standard goes further than the prototype: **AND between words, OR across columns** (`launch day` finds rows containing both words, in any searchable columns), at most 10 searched fields (the title field always included), an exact match on UUIDs, trigram indexes on PostgreSQL for speed, and opt-in full-text search for long text. The prototype matches the whole term as one phrase. A dedicated `search` package (external engines) comes later.
:::

## Filters: `filter[field]` and `filter[field][operator]`

```text
?filter[status]=draft                       status is draft (eq is the default)
?filter[status][in]=draft,published         one of a list (at most 100 values)
?filter[price][gte]=10                      at least 10
?filter[price][lt]=100                      less than 100
?filter[title][contains]=launch             contains, case-insensitive
?filter[title][startsWith]=How              starts with
?filter[published_on][null]=true            is empty (false: is not empty)
?filter[author_id]=2                        belongs to author 2
```

Several filters combine with **AND**: `?filter[status]=draft&filter[author_id]=2` is "drafts by author 2".

### Which operators work on which columns

| Column type | Operators |
|---|---|
| id, integer, decimal | `eq`, `ne`, `in`, `gt`, `gte`, `lt`, `lte` |
| foreign key (`author_id`) | `eq`, `ne`, `in` |
| string, slug | `eq`, `ne`, `in`, `contains`, `startsWith` |
| text (long) | `contains`, `null` |
| enum | `eq`, `ne`, `in` |
| boolean | `eq` (`true`/`false` or `1`/`0`) |
| date, timestamp | `eq`, `gt`, `gte`, `lt`, `lte` (`2026-11-14`) |
| nullable columns | also `null` |

`node strut model:show Post` lists the exact operators of every column (the Filters column).

### Deleted rows

For tables with soft deletes, deleted rows are hidden from lists. In the UI, the list's "Hide deleted" select switches to **with deleted** or **only deleted**; deleted rows carry a "Deleted" badge and a **Restore** action. The API form is `filter[trashed]=with` or `filter[trashed]=only`.

:::caution[Coming in 0.2]
`filter[trashed]` and `POST /api/posts/{post}/restore` are proven in the UI prototype's mock API, which the blueprint adopts; the API prototypes refuse `filter[trashed]` today (a `422`).
:::

## Sorting: `?sort=`

```text
?sort=title                 A to Z
?sort=-created_at           newest first (a leading minus means descending)
?sort=-created_at,title     newest first, then A to Z
```

- Up to **3** fields.
- Only sortable columns (`model:show` shows them); long text isn't sortable.
- Empty values come **last** in both directions, on every database.
- Without `sort`, the table's default applies (usually `-created_at`), and you can change it per screen with `defaultSort` ([Customising Screens](../crud-customising/)). Ties are broken by the primary key, so pages never repeat or skip rows.

Field names are the **column names** from your migration (`created_at`), as everywhere in Strutvane.

In the UI: click a header to sort ascending, again for descending; the header carries `aria-sort` for screen readers.

## Paging: `?page=` and `?perPage=`

| Parameter | Rules |
|---|---|
| `page` | 1 or more |
| `perPage` | 1 to 100; the UI offers 10, 25, 50 and 100 (25 by default) |

`meta` tells you where you are: `page`, `perPage`, `total`, `lastPage`, and `from`/`to` (the row numbers shown). The UI shows numbered pages with a summary ("Showing 26–35 of 35 posts"); changing the page size goes back to page 1.

:::caution[Coming in 0.2]
Designed: totals capped at 10,000 (so counting a huge table stays fast) and cursor paging (`?cursor=…`) for walking past that. See [ORM: Pagination](../orm-pagination/).
:::

## When something is wrong: one 422 with everything

Every mistake in the query is reported **at once**, each with a message that lists what is allowed:

```bash
curl "http://localhost:3000/api/posts?sort=body&filter[secret]=x&filter[price][contains]=1&perPage=500" -H "Authorization: Bearer $TOKEN"
```

**What you'll see:**

```json
{
  "status": 422,
  "code": "validation_failed",
  "issues": [
    { "field": "perPage", "code": "invalid_integer", "message": "Page size must be a whole number from 1 to 100." },
    { "field": "sort", "code": "not_sortable", "message": "\"body\" can't be sorted on. Sortable fields: id, title, slug, price, status, author_id, created_at." },
    { "field": "filter[secret]", "code": "not_filterable", "message": "\"secret\" can't be filtered on. Filterable fields: id, title, slug, price, status, author_id, created_at." },
    { "field": "filter[price][contains]", "code": "invalid_operator", "message": "\"contains\" doesn't work on Price. Try one of: eq, ne, in, gt, gte, lt, lte." }
  ]
}
```

(The lists depend on your columns.) Other messages you may meet:

| Code | Message (example) |
|---|---|
| `too_long` | Search terms can be at most 200 characters. |
| `too_many` | Sort by at most 3 fields. / List at most 100 values. |
| `invalid_filter` | Write filters as filter[field]=value or filter[field][operator]=value. |
| `invalid_integer` | Author must be a whole number. |
| `invalid_number` | Price must be a number. |
| `invalid_boolean` | Featured must be true or false. |
| `invalid_date` | Published on must be a date such as 2026-11-14. |
| `not_allowed` | Status must be one of: draft, published. |

**Why so strict?** Every name and operator is checked against the table's metadata before any SQL is built, and values are always sent as bound parameters, so a query string can't inject SQL, sort by a hidden column, or probe a secret one.

## In the screens

- **Search box:** waits until you pause typing, then searches; matches are highlighted in the rows.
- **Filter panel:** one control per filterable column, chosen by type: "Title contains", min/max for numbers, checkboxes for an enum, Any/Yes/No for a boolean, date ranges, and a searchable picker for a relation (it searches the related table as you type).
- **Filter chips:** each active search, filter or deleted-rows setting becomes a chip with a remove button ("Remove filter: Price at least 10"), plus **Clear all**.
- **Shareable URLs:** search, filters, sort, page and page size live in the address; "Copy link to this view" copies it.
- **Empty states:** "No posts match these filters" with **Clear**, or "No posts yet" with **New post**.

Which filters a screen offers is set by `filters` in `resources/ui/posts.ui.ts` (`auto()` by default). See [Customising Screens](../crud-customising/).

## Searching everything: Ctrl/Cmd+K

Press **Ctrl+K** (Windows, Linux) or **Cmd+K** (macOS), or `/`, anywhere in the app. The **command palette** opens:

- type a few letters of a record's title ("pric" finds "Pricing: …" posts), or a screen's name, or an action ("New post");
- Up/Down move, Enter opens, Escape closes and puts focus back;
- it only searches resources you may list.

:::caution[Coming in 0.2]
The prototype searches each resource in parallel through its list endpoint. A single global `/api/search` endpoint, recently viewed records in the palette, and saved views (named filter sets) are designed for 0.2.
:::

## Databases

The rules are the same on MySQL, PostgreSQL and SQLite; the SQL differs underneath (case-insensitive matching, "empty values last" emulated on MySQL). One thing to know on MySQL: a column with a binary (case-sensitive) collation, used for identifiers, is matched case-sensitively by search.

## Common mistakes

### Search doesn't find a number

**Why:** numbers aren't searched as text; a number term only matches ids exactly.
**Fix:** filter instead: `?filter[price][eq]=19.90`.

### My filter returns nothing on MySQL but works on SQLite

**Why:** most often a date filter with a time zone, or a case-sensitive (binary) collation on that column.
**Fix:** send dates as `2026-11-14` (or full ISO times in UTC), and check the column's collation in the migration.

### `?sort=-createdAt` is refused

**Why:** field names are the migration's column names, `created_at`.
**Fix:** `?sort=-created_at`.

### I can't filter on a column

**Why:** it's hidden or secret, it's long text or JSON, or its type has no such operator. The 422 lists what's possible.
**Fix:** pick an allowed field and operator; for long text, use `contains`.

### PowerShell breaks my filter URL

**Why:** `[` and `]` and `&` mean something to PowerShell, and `curl` is a different command there.
**Fix:** use `curl.exe` and wrap the URL in double quotes: `curl.exe "http://localhost:3000/api/posts?filter[status]=draft&sort=-created_at"`.

## Next steps

- [Resources](../crud/): the rest of the generated API.
- [Customising Screens](../crud-customising/): which filters and columns a screen shows.
- [ORM: Querying](../orm-querying/): the same in your own code.
