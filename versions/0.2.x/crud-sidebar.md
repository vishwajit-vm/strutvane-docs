---
title: "The Sidebar"
description: "How generated resources and package pages appear in the admin sidebar: who sees each entry, how entries are grouped and ordered, and how to change a label, icon, group, order or badge, hide an entry, or add your own page."
---

The **sidebar** is the menu on the left of the admin UI. Every resource you may list gets an entry, by itself, the moment `node strut migrate` creates its table. Packages (the log viewer, billing) add their own pages to it. You decide the label, icon, group, order and badge of each entry.

:::tip[Coming from Laravel?]
It's Filament's navigation: `$navigationIcon`, `$navigationGroup`, `$navigationSort`, `getNavigationBadge()` and `shouldRegisterNavigation()`. Here they're the `navigation` settings in `resources/ui/<table>.ui.ts`, and an entry is hidden automatically when the user's policy denies `viewAny`.
:::

:::caution[Coming in 0.2]
The sidebar (ordering, groups, icons, badges, permissions, collapse-to-icons, the mobile drawer) is **proven in a prototype** (spike 14). How package pages are registered is proven in two prototypes with slightly different shapes; the final shape is described below.
:::

## The smallest example

Create a table:

```bash
node strut make:migration create_invoices_table
node strut migrate
```

**What you'll see:** an **Invoices** entry in the sidebar, with a receipt icon (guessed from the name), right after you sign in as a user whose `InvoicePolicy` allows `viewAny`. Click it: the invoice list.

## Who sees an entry

An entry is shown only when the user may use it: a **resource** when the policy's `viewAny` allows it, a **package page** when the user has its `permission`. Everything else is hidden, because an entry that only leads to "access denied" is worse than no entry. Opening the address directly still answers "Nothing here", and the API refuses the data regardless.

New policies allow only admins, so a new table's entry is visible to admins until you open the policy up. See [Authorization](../authorization/).

## Changing an entry

In the resource's settings file:

```ts title="resources/ui/invoices.ui.ts"
import { auto, defineResourceUi } from '@strutvane/ui'

export default defineResourceUi('invoices', {
  columns: auto(),
  form: auto(),
  filters: auto(),
  label: { singular: 'Invoice', plural: 'Bills' },
  navigation: { icon: 'receipt', group: 'Money', sort: 1, badge: 'count' },
})
```

| `navigation` option | Means | Example |
|---|---|---|
| `icon` | One of the built-in icon names (checked by the compiler) | `'receipt'` |
| `group` | A heading to group entries under | `'Money'` |
| `sort` | Order inside its group: lower first | `1` |
| `badge` | `'count'` for the live number of rows, or a short text | `'count'`, `'New'` |
| `hidden` | Keep the screens and routes, hide only the entry | `true` |

The entry's text is the plural label (`label.plural`), "Bills" here.

**What you'll see:** **Bills** under a **MONEY** heading, first in that group, with a pill showing the number of rows (read out by screen readers as "Bills, 12 rows").

### `badge: 'count'` costs one request

A count badge asks the API for the number of rows, so it's opt-in. Use it for tables people watch (open tickets, new orders), not for every table.

## How entries are ordered

1. Entries **without a group** come first, at the top.
2. Then the groups, **A to Z** by heading.
3. Inside a section: `sort` ascending (entries without `sort` come last), then the label A to Z.

Alphabetical, not migration order, so adding a table never reshuffles the menu. Example result:

```text
Dashboard
ACCESS
  Users
CONTENT
  Posts          (sort: 1)
  Categories     (sort: 2)
  Tags
MONEY
  Bills          12
```

## Icons

If you don't set one, the icon is guessed from the table name:

| The name contains | Icon |
|---|---|
| `user` | `users` |
| `invoice` | `receipt` |
| `order` | `shopping-cart` |
| `product` | `package` |
| `customer`, `contact` | `contact` |
| `setting` | `settings` |
| `report` | `chart-bar` |
| `post`, `file`, `document` | `file-text` |
| `project` | `folder-kanban` |
| `task` | `check-square` |
| `payment` | `credit-card` |
| `categor` (category, categories) | `folder` |
| `tag` | `tag` |
| anything else | `table` |

The first keyword the name contains wins, so `invoice_lines` gets `receipt`. A misspelt name is a compile error with a suggestion (`icon: 'reciept'` → "Did you mean 'receipt'?").

:::note[Which icon library]
The prototype's first pass used Lucide names, the redesign Tabler Icons; each design package ships its own icon set, mapped from the same names. See [Designs](../designs/).
:::

## Adding your own page

A page that isn't a table (a report, a settings screen, a package's tool) is added from a service provider:

```ts title="app/providers/app.provider.ts"
import { ServiceProvider, type Application } from '@strutvane/framework'

export class AppServiceProvider extends ServiceProvider {
  override boot(app: Application): void {
    app.navigation.add({ label: 'Reports', route: 'reports.index', group: 'Insights', icon: 'chart-bar', order: 10 })
  }
}
```

It's merged with the resource entries under the same ordering rules. Packages do the same in their own providers: the log viewer adds **Logs** at `/_strutvane/logs` under **System**, visible only with its permission.

:::caution[Coming in 0.2]
The two prototypes describe a page entry differently. The application core (spike 12) uses `{ label, route, group, icon, order }`; the UI (spike 14) uses `{ name, label, path, icon, group, sort, badge, permission }`, where `permission` decides who sees it (deny by default). The final shape merges them, with a required permission; `order` and `sort` will become one name.
:::

## Layout, collapsing and phones

- **Collapse to icons:** the "Collapse menu" button at the bottom shrinks the sidebar to icons, with the names as tooltips. Your choice is remembered in your browser.
- **Groups fold:** click a group heading to fold it (`aria-expanded` tells screen readers).
- **Phones and narrow windows:** the sidebar becomes a drawer behind a menu button.
- **Keyboard:** Tab reaches every entry; the current page is marked with `aria-current`. Ctrl/Cmd+K jumps to any screen without the sidebar.

## Hiding an entry, keeping the screens

```ts
navigation: { hidden: true },
```

The routes and screens still work (for links from elsewhere); only the menu entry disappears. To hide it from **some** users, change the policy instead: that also protects the data.

## Common mistakes

### A table doesn't appear in the sidebar

**Why:** the policy denies `viewAny` for you, the table is internal (sessions, tokens…), `navigation.hidden` is `true`, or `migrate` hasn't run since you created it.
**Fix:** check in that order; `node strut model:show <table>` says whether a table is internal.

### My entry is at the top instead of in its group

**Why:** it has no `group`, and ungrouped entries come first.
**Fix:** add `group: 'Content'`.

### Two entries are in the wrong order

**Why:** entries without `sort` come after those with one, then A to Z.
**Fix:** give both a `sort`.

### My page entry links nowhere

**Why:** `route` takes a route **name** (`'reports.index'`), not a path.
**Fix:** name the route in your routes file, and check with `node strut route:list`.

## Next steps

- [Customising Screens](../crud-customising/): every other setting in the same file.
- [Service Providers](../providers/): where page entries are added.
- [Authorization](../authorization/): `viewAny` and friends.
