---
title: Charts
description: Get useful charts for every table without writing queries. Suggestions come from your migrations, you choose and tune them in one file you own, and one strict, policy-aware endpoint feeds them.
---

**Charts** turn your records into pictures: how many posts were written each month, how many are drafts, which authors write the most. In Strutvane every resource gets chart **suggestions** worked out from its columns. You keep the ones you want in a small file you own, and they appear on the resource's Insights tab and on the home dashboard.

:::tip[Coming from Laravel?]
This is Strutvane's version of Nova metrics or Filament's chart widgets. The difference: you don't write a query per chart. Strutvane suggests charts from your migrations, and one shared endpoint (`/aggregate`) computes them, already filtered by your policies and teams.
:::

:::caution[Planned after 0.2]
Charts and dashboards are planned for **phase 3** of the roadmap (on the way to 1.0), so they are not part of 0.2. Everything on this page is proven in a prototype (spike 16: 178 tests on SQLite and PostgreSQL with identical numbers; MySQL's SQL is written but wasn't run), but nothing is released. Names and import paths may change. The prototype's look is a placeholder: the released charts take their colours from your [design](../designs/).
:::

## The smallest example

Say your `posts` table has a `status` enum (`draft`, `published`), a `price` decimal, an `author_id` that points at `users`, and `timestamps()`. After `node strut migrate`, run:

```bash
node strut charts:sync
```

**What you'll see** (something like this):

```text
+ New chart file resources/charts/posts.charts.ts (7 suggestions).
- Skipped internal table sessions: it never gets charts or an aggregate endpoint.
```

Open the Posts screen and pick the **Insights** tab: a "New posts" card with its trend, posts per month, a donut of posts by status, posts per month split by status, price totals and averages per month, and the top authors.

## How suggestions are made

`charts:sync` reads `.strutvane/resources.json` (written by `migrate`) and suggests charts from the column types. Each suggestion has an **id** made of the resource and a name:

| Suggestion id | When it's suggested | What it shows |
|---|---|---|
| `posts.new` | the table has `created_at` | A **KPI card** (a big number): new rows in the last 30 days, the trend against the 30 days before, and a small line (sparkline) |
| `posts.per-period` | the table has `created_at` | Area chart: rows per month (switchable to day or week) |
| `posts.by-status` | one per enum or yes/no column | Donut for up to 6 groups, otherwise bars |
| `posts.per-period-by-status` | `created_at` plus an enum | Stacked bars: rows per month, split by the first enum |
| `posts.sum-price` | one per decimal column | Bars: the sum per month |
| `posts.avg-price` | one per decimal column | Line: the average per month |
| `posts.top-author` | one per `belongsTo` relation | Horizontal bars: the top 10 related records by count |

Some columns are **never** charted, whatever you write: ids, the team column, `deleted_at`, secret and hidden columns (like `password`), columns marked `aggregatable: false` or `personal`, and internal tables such as `sessions`.

## The file you own: `resources/charts/posts.charts.ts`

`charts:sync` writes this file **once**, for new tables only, and never overwrites it. Edit it freely.

### Follow the schema with `auto()`

The generated file uses `auto()`, which keeps picking up new suggestions after every migrate:

```ts title="resources/charts/posts.charts.ts"
import { auto, defineResourceCharts } from '@strutvane/ui/charts'

export default defineResourceCharts('posts', {
  widgets: auto(),
  dashboard: auto(),
  aggregates: auto(),
  sort: 1,
})
```

**What you'll see:** every suggestion on the Insights tab. `dashboard: auto()` puts the KPI card and the first category chart on the home dashboard.

### A typical file: hide one, reorder the rest

```ts title="resources/charts/posts.charts.ts"
import { auto, defineResourceCharts } from '@strutvane/ui/charts'

export default defineResourceCharts('posts', {
  widgets: auto({ except: ['posts.avg-price'], order: ['posts.by-status', 'posts.new'] }),
  dashboard: ['posts.new', 'posts.by-status'],
  aggregates: auto(),
  sort: 1,
})
```

**What you'll see:** the donut first, then the KPI card, then the rest, without the average-price line. After a later migrate, new suggestions still appear, because the list is `auto()`.

### An advanced file: your own widgets

An explicit list shows exactly what you write. Mix suggestion ids with widgets of your own:

```ts title="resources/charts/posts.charts.ts"
import { auto, defineResourceCharts } from '@strutvane/ui/charts'

export default defineResourceCharts('posts', {
  widgets: [
    { id: 'posts.revenue', kind: 'stat', title: 'Revenue', metric: 'sum', field: 'price', date: 'created_at', days: 30 },
    'posts.new',
    {
      id: 'posts.published-per-month',
      kind: 'bar',
      title: 'Posts per month, by status',
      metric: 'count',
      groupBy: 'created_at',
      interval: 'month',
      range: { last: 6, unit: 'month' },
      splitBy: 'status',
      size: 'lg',
    },
    'posts.by-status',
    'posts.top-author',
  ],
  dashboard: ['posts.revenue', 'posts.new', 'posts.by-status'],
  aggregates: auto(),
  sort: 1,
})
```

The options you'll use most:

| Option | What it does |
|---|---|
| `widgets` | `auto()`, `auto({ except, order })`, or an explicit list of suggestion ids and custom widgets |
| `dashboard` | Which widgets go on the home dashboard: `auto()`, a list of ids, or `false` for none |
| `aggregates` | What the endpoint may compute: `auto()` (everything the widgets need), `{ numeric: [...], groupBy: [...] }` to narrow it, or `false` to switch it off |
| `privacy` | `{ minGroupSize: 5 }` hides small groups (see below) |
| `sort` | The resource's order on the home dashboard |

Widget **kinds**: `stat` (a KPI card with a sparkline), `line`, `area`, `bar` (stacked or grouped with `splitBy`, horizontal for top N), `pie` and `donut`. Each widget has a `size` on a 4-column grid; every widget is full width on phones.

Field names and suggestion ids are **type-checked**. These are compile errors: `metric: 'sum'` without a numeric `field`, a `field` on `count`, `interval` on a non-date group (or a date group without one), a `splitBy` that isn't an enum or yes/no column, `limit` on a non-relation group, and secret, team or unknown column names.

### What happens when the schema changes

After a migrate, `charts:sync` never rewrites your file. It reports instead:

```text
+ New suggestion posts.by-featured is shown (widgets: auto()).
! New suggestion posts.sum-discount is NOT shown: widgets in resources/charts/posts.charts.ts is an explicit list. Add 'posts.sum-discount' to show it.
```

When a migration drops a column your file still names, the file stops compiling (`TS2322`), so you find it in your editor, not on the dashboard.

## The aggregate endpoint

Every chart is fed by one endpoint per resource. You can call it yourself for reports:

```bash
curl "http://localhost:3000/api/v1/posts/aggregate?metric=count&groupBy=status" \
  -H "Authorization: Bearer <token>"
```

**What you'll see:**

```json
{
  "data": [
    { "key": "draft", "values": { "value": 13 } },
    { "key": "published", "values": { "value": 22 } }
  ],
  "series": [{ "key": "value" }],
  "meta": { "resource": "posts", "metric": "count", "field": null, "groupBy": "status", "groupKind": "category", "interval": null, "splitBy": null, "dateField": "created_at", "timezone": "UTC", "minGroupSize": null, "suppressedCells": 0, "truncated": false }
}
```

(The `meta` object is shortened here; it also carries the date range.)

### Every parameter

| Parameter | Values | Notes |
|---|---|---|
| `metric` | `count`, `sum`, `avg` | Required. No `min`/`max`: they would reveal one row's exact value. |
| `field` | a numeric column | Required for `sum` and `avg`; refused for `count`. |
| `groupBy` | a date, enum, yes/no or `belongsTo` column | Leave it out for one total (`__total__`). |
| `interval` | `day`, `week`, `month` | Required exactly when `groupBy` is a date. Weeks start on Monday. |
| `splitBy` | an enum or yes/no column | A second dimension (stacked or grouped bars); not with a top N. |
| `dateField` | a date column | What `from`/`to` limit; defaults to the `groupBy` date, else `created_at`. |
| `from`, `to` | `2026-11-14` or `2026-11-14T09:30:00Z` | UTC; `from` inclusive, `to` exclusive; years 1900–9998. At most 400 buckets. |
| `limit` | 1–50 | Top N for `belongsTo` groups (default 10); the rest becomes `__other__`. |
| `filter[field][op]` | `eq ne in gt gte lt lte contains startsWith null` | The same filters as the list endpoint. |

A typical stacked chart: posts per month for a year, split by status.

```bash
curl "http://localhost:3000/api/v1/posts/aggregate?metric=count&groupBy=created_at&interval=month&splitBy=status&from=2025-12-01&to=2026-12-01" \
  -H "Authorization: Bearer <token>"
```

**What you'll see:** 12 entries in `data`, one per month, each with a `draft` and a `published` value, empty months filled with `0`.

Keys in the response: dates as the bucket's start (`2026-11-01`), enum options in migration order, `true`/`false`, related ids, plus `__other__`, `__none__` (no value) and `__total__`. Labels are the browser's job, in the user's language. Responses carry `Cache-Control: private, no-store`.

### Errors

Every error is an RFC 9457 problem (`application/problem+json`) with a stable `code`:

| Status | `code` | When |
|---|---|---|
| 404 | `not_found` | Unknown or internal resource, or `aggregates: false`. All give the same body, so nobody can probe which tables exist. |
| 403 | `forbidden` | The user may not `viewAny` the resource. Checked **before** the parameters, so field names never leak. |
| 403 | `tenant_required` | A team resource was asked for without a current team. |
| 422 | `invalid_aggregate` | Bad parameters. Every problem is listed at once in `issues`, each with a fix and only the names the user may use. |
| 405 | `method_not_allowed` | Anything but GET. |
| 500 | `server_error` | A bug. The details go to the log, never to the client. |

## Security built in

- **Policies first.** The endpoint checks `viewAny` and applies the policy's row filter, so a chart counts only rows the user could list. A resource without a policy is denied. See [Authorization](../authorization/).
- **Teams.** Every query is scoped to the current team before any SQL is produced; on PostgreSQL, row-level security is a second lock. Team A never sees team B's numbers. See [Tenancy](../tenancy/).
- **Allow-lists.** Only declared fields can be summed, grouped or filtered; unknown parameters are refused.
- **Small groups hidden.** For sensitive data, hide groups that are too small to be anonymous:

  ```ts title="resources/charts/users.charts.ts"
  import { auto, defineResourceCharts } from '@strutvane/ui/charts'

  export default defineResourceCharts('users', {
    widgets: auto(),
    privacy: { minGroupSize: 5 },
  })
  ```

  **What you'll see:** groups of 1 to 4 read "Hidden (too few records)", with a privacy note. Strutvane also hides the next-smallest group in the same row or column, so a hidden value can't be worked out from the total. With privacy on, filters are limited to exact matches on group fields. This guards against "don't show 1 to 4 people"; it isn't a formal anonymity guarantee.
- **Rate limits** (designed for the product): a `throttle:aggregate` limiter, 30 requests a minute per user and 120 per team, plus a statement timeout per database.

## Where charts appear

- **The Insights tab** of each resource (`/posts?tab=insights`) shows all its widgets.
- **The home dashboard** shows each resource's `dashboard` picks, ordered by `sort`, then by name. Resources the user can't list are left out.
- **Named dashboards** collect widgets from several resources. A package or your app adds one in a provider's `boot()`:

  ```ts title="app/providers/app.provider.ts"
  import { ServiceProvider, type Application } from '@strutvane/framework'
  import { defineDashboard } from '@strutvane/ui/charts'

  export class AppServiceProvider extends ServiceProvider {
    override boot(app: Application): void {
      app.dashboards.add(defineDashboard({
        name: 'editorial',
        label: 'Editorial',
        permission: 'dashboards.editorial',
        widgets: ['posts.new', 'posts.by-status', 'posts.top-author'],
      }))
    }
  }
  ```

  **What you'll see:** an **Editorial** entry under **Dashboards** in the sidebar, at `/dashboards/editorial`, shown only to users with the `dashboards.editorial` permission. Widgets of resources the user can't list are dropped.

## Accessible by default

Every chart is a `role="img"` with a title and a one-sentence summary for screen readers, plus a hidden data table with the exact numbers. A "Show as a table" button reveals it for everyone. Charts take keyboard focus, and the arrow keys move the tooltip. Loading, error, empty and "hidden for privacy" states are built in. The prototype's screens have 0 axe violations.

Charts are drawn with **Recharts** (an open-source React chart library, MIT licence) behind Strutvane's own components, so the library could be swapped without changing your files. Colours come only from the design's chart tokens, so light and dark mode, and your brand colour, re-theme every chart.

## Common mistakes

### "count counts rows, so it takes no field"

```json
{ "field": "field", "code": "not_allowed", "message": "count counts rows, so it takes no field. Remove field, or use metric=sum or avg." }
```

**Why:** you sent `metric=count&field=price`.

**Fix:** drop `field`, or sum it:

```text
/api/v1/posts/aggregate?metric=sum&field=price
```

### "Grouping by a date needs interval=day|week|month"

```json
{ "field": "interval", "code": "required", "message": "Grouping by a date needs interval=day|week|month." }
```

**Why:** a date can be grouped by day, week or month, and Strutvane won't guess.

**Fix:** add the interval:

```text
/api/v1/posts/aggregate?metric=count&groupBy=created_at&interval=month
```

### "That range has more than 400 days"

```json
{ "field": "interval", "code": "too_many_buckets", "message": "That range has more than 400 days. Use a larger interval (week or month) or a shorter range." }
```

**Why:** one bar per day for two years is too many buckets for one request.

**Fix:** use `interval=week` or `interval=month`, or a shorter `from`/`to`.

### "… is not an aggregate parameter"

```json
{ "field": "sort", "code": "unknown_parameter", "message": "\"sort\" is not an aggregate parameter. Use: metric, field, groupBy, interval, splitBy, dateField, from, to, limit, filter[field][op]." }
```

**Why:** the endpoint refuses anything it doesn't know, so a typo never silently changes a number.

**Fix:** remove the parameter, or use one from the list.

### My new column doesn't show up as a chart

```text
! New suggestion posts.sum-discount is NOT shown: widgets in resources/charts/posts.charts.ts is an explicit list. Add 'posts.sum-discount' to show it.
```

**Why:** your `widgets` is an explicit list, which `charts:sync` never rewrites.

**Fix:** add the id, or switch back to `auto()`:

```ts title="resources/charts/posts.charts.ts"
widgets: ['posts.new', 'posts.by-status', 'posts.sum-discount'],
```

### I get 403 but I can see the Posts list

**Why:** the aggregate endpoint runs the same `viewAny` check as the list, but for the user making the request. A script without a token, or with another user's token, is a different user. On a team app, a missing current team gives `tenant_required`.

**Fix:** call it with a token of a user who may list posts, and with a team selected.

## Next steps

- [Auto CRUD & UI](../crud/): the screens the Insights tab lives on.
- [Authorization](../authorization/): the policies charts respect.
- [Designs](../designs/): where chart colours come from.
- [Package Catalogue](../packages/catalogue/): when charts become installable.
