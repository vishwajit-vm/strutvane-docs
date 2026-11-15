---
title: "Multi-tenancy"
description: "Run one app for many customer companies (teams) and keep each team's data apart: turning teams on, how a request picks its team, the two layers of protection, shared tables, jobs, tests and the differences between MySQL, PostgreSQL and SQLite."
---

**Multi-tenancy** means one app serves many customer companies, and each one sees **only its own data**. Strutvane calls each company a **team** (the technical name is **tenant**). Acme's projects, tasks and invoices live in the same tables as Globex's, but Acme can never read, change or even count Globex's rows.

This page explains the whole setup: turning teams on, how each request picks its team, how the protection works on each database, and what you write in your own code. The ORM details (every method and error) are on [ORM: Tenancy](../orm-tenancy/).

:::tip[Coming from Laravel?]
Laravel has no built-in tenancy; you'd add a package such as stancl/tenancy, or a global scope on a `team_id` column, and hope every query goes through it. In Strutvane it's built in and fails closed:

- every query on a team's table is limited to the current team, and a check on the **final SQL** refuses anything that could reach another team;
- with no current team, those tables give an **error**, never "all rows";
- on PostgreSQL the database enforces it a second time, with row-level security.

Jetstream's "teams" feature (switching between teams you belong to) is the installer's "team switcher".
:::

## The smallest example

With teams on, a model looks exactly like any other:

```ts title="app/models/project.ts"
import { Model } from '@strutvane/framework'

export class Project extends Model('projects', { fillable: ['name'] }) {}
```

And a controller has no team code at all:

```ts title="app/http/controllers/project.controller.ts (excerpt)"
const projects = await Project.query().latest().get()
return ctx.json({ data: projects })
```

**What you'll see:** signed in as a member of Acme, `GET /api/projects` returns only Acme's projects. Signed in as Globex, the same URL returns only Globex's. Neither request mentioned a team: the framework set the current team before your code ran.

## Turning teams on

Teams are a question in the installer, because they shape your database from the first migration.

1. Run the installer and answer **yes** to "Teams? (each customer company sees only its own data)".
2. Answer **"How does a request pick its team?"**:
   - **Team switcher in the app** (the default): a user who belongs to several teams picks one from a menu; the choice is remembered in their session.
   - **Subdomain**: `acme.yourapp.com` is Acme, `globex.yourapp.com` is Globex.
3. Pick a database. With teams, **PostgreSQL** is pre-selected, because it adds a second wall (below). MySQL and SQLite work too; the installer tells you what that means:

   ```text
   Teams on MySQL: each team's data is isolated by the ORM tenant scope. PostgreSQL adds row-level security as a second lock.
   ```

**What you get:** a `teams` table and memberships, a `config/tenancy.ts`, and (on PostgreSQL with Docker) two database users, one for migrations and one for the app.

```ts title="config/tenancy.ts"
// Teams: each customer company sees only its own data. Isolation here: the ORM tenant scope,
// plus PostgreSQL row-level security as a second lock.
export default {
  enabled: true,          // false unless you answered yes to "Teams?"
  column: 'tenant_id',    // the tenant column, the same in every table
}
```

| Setting | What it does |
|---|---|
| `enabled` | Switches the whole tenancy layer on or off. Apps created **without** teams get `false`: there's no tenant scope, no `tenant_id` column needed, and no `tenant_required` errors. |
| `column` | The one name of the tenant column in every team table. `tenant_id` by default; some apps prefer `team_id`. |

How a request picks its team (switcher or subdomain) is the answer you gave the installer; it's saved with the rest of your choices.

:::caution[Coming in 0.2]
The installer questions and `config/tenancy.ts` are proven in the installer prototype (spike 13), and the protection itself in the ORM prototype (spike 11, on real MySQL 8.4, PostgreSQL and SQLite). Picking the team for each request (the switcher and subdomain resolvers) and adding teams to an app that was created without them are designed but not built yet. The `{ enabled, column }` shape of `config/tenancy.ts` is decided (2026-11-15); the installer prototype still writes `enabled` from a `TENANCY_ENABLED` environment variable, and the ORM prototype is switched on unless it's configured with `tenancy: false`.
:::

## How it works

Four pieces, from the request down to the database:

1. **The request picks the team.** Before your controller runs, the framework finds the signed-in user's current team (from the switcher or the subdomain), checks the user is a member, and makes it the **current team** for everything that happens during this request.
2. **The ORM limits every query.** Each query on a team's table gets `tenant_id = <current team>`. New rows are stamped with the current team. Updates and deletes only ever touch rows of the current team.
3. **A final check runs on every statement.** Right before SQL is sent, Strutvane checks that every team table in it (including joins, sub-queries and relation counts) carries the team condition. If one doesn't, the statement is refused with `tenant_scope_missing`. A bug in a query can't leak data; it becomes an error you'll see in development.
4. **PostgreSQL checks again.** On PostgreSQL, the database itself has **row-level security** (RLS): a rule on each team table that hides other teams' rows, even from a hand-written query.

The current team is carried with the request's async work (Node's `AsyncLocalStorage`), so two requests running at the same time can never see each other's team. The ORM prototype tests this with 200 interleaved requests.

### What's covered

Every way to reach a team's data goes through the same check: lists, `find`, lookups by slug, counts, numbered and cursor pages, search and filters, relations loaded with `with()`, relation counts, `whereHas`, many-to-many links (`attach` and `sync` check the ids belong to the team), and writes. Tricks such as `orWhere` to escape the condition or sending a different `tenant_id` in a form are refused. The full list, with the attacks that are tested, is on [ORM: Tenancy](../orm-tenancy/#every-way-in-is-covered).

## MySQL, PostgreSQL and SQLite

| | PostgreSQL | MySQL 8.4+ | SQLite |
|---|---|---|---|
| ORM team condition on every query | Yes | Yes | Yes |
| Final check on every statement | Yes | Yes | Yes |
| The database enforces it too (row-level security) | **Yes** | No: MySQL has no row-level security | No |
| What protects you if the app has a bug that bypasses the ORM | The database | Attack-style tests (generated for every resource) | Attack-style tests |
| Recommended for teams | Yes (pre-selected) | Yes, with the tests | Prototypes and demos |

`node strut doctor` will say which protection your app has *(coming in 0.2)*, and on PostgreSQL it checks that row-level security is really switched on for every team table.

### PostgreSQL's five rules

Row-level security only protects you if it's set up exactly right. Strutvane follows five rules, each one added because a test showed a real leak without it ([ADR-0007](https://github.com/vishwajit-vm/strutvane/blob/main/docs/adr/0007-tenancy-rls-enforcement-rules.md)):

1. The team rule is **restrictive** and **forced**, so no other rule added later (say, "admins see everything") can open it up, and it also blocks writing rows into another team.
2. The rule reads the current team in a way that returns **no rows** (not an error, not all rows) when no team is set.
3. The current team is set **per transaction**, never per connection, so a pooled connection never carries one request's team into the next.
4. The **app's database user** never owns the tables and can't bypass the rule; migrations run as a separate owner user (`DB_MIGRATION_USERNAME`).
5. The team id is checked to be a UUID, and a broken connection is thrown away instead of reused.

You don't write any of this; it's how Strutvane sets up and talks to PostgreSQL. It's here so you know why there are two database users.

## Your tables

Every table in a team app is one of three kinds:

| Kind | Example | How Strutvane knows | What happens |
|---|---|---|---|
| **A team's table** (scoped) | `projects`, `tasks`, `invoices` | It has the tenant column, `tenant_id` | Every query is limited to the current team |
| **A shared table** (global) | `countries`, `currencies`, `plans` | Marked shared in its migration | Every team sees all of it, read and write as usual |
| **Anything else** | a new table you forgot to mark | Neither | **Refused**: a query on it fails with `tenant_scope_missing` until you add the column or mark it shared |

The third row is deliberate: forgetting the column must never mean "every team sees everything".

### A team's table, in a migration

```ts title="database/migrations/2026_11_15_100000_create_projects_table.ts"
import { migration } from '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.create('projects', (t) => {
      t.id()
      t.tenant()                    // tenant_id, indexed
      t.string('name', 120)
      t.slug('slug').from('name')   // unique per team: (tenant_id, slug)
      t.timestamps()
    })
  },
  down(schema) {
    schema.dropIfExists('projects')
  },
})
```

Never list `tenant_id` in a model's `fillable`: Strutvane fills it in, and listing it is refused. Team ids are UUIDs, the `id` of the team's row.

:::caution[Coming in 0.2]
Two schema-builder helpers are decided (2026-11-15) and added for 0.2:

- `t.tenant()` adds the tenant column the right way in one call: the column from `config/tenancy.ts`, slugs and other uniques that apply per team (two teams can both have a project called "Website", each with the slug `website`), and composite foreign keys so a task can't point at another team's project;
- `schema.create('countries', (t) => { … }, { global: true })` marks a shared table.

Until they ship, `t.uuid('tenant_id').index()` gives you the column and the full ORM protection, but a `.unique()` on a team's table is unique across **all** teams.
:::

### The tenant column's name

It's `tenant_id` by default. Some apps prefer `team_id`; the whole app uses **one** name, set once in `config/tenancy.ts`:

```ts title="config/tenancy.ts"
export default {
  enabled: true,
  column: 'team_id',
}
```

**What you'll see:** `t.tenant()` now adds `team_id`, and every team query uses `team_id = <current team>`. Choose the name before your first migration: renaming it later means a migration for every team table.

## Outside a request: jobs, commands, seeders

A request gets its team from the user. A queued job, a `node strut` command or a seeder has no user, so it has no team until you give it one with `runWithTenant`:

```ts title="app/jobs/send-weekly-summary.ts (excerpt)"
import { runWithTenant } from '@strutvane/framework'
import { Project } from '../models/project.ts'
import { Team } from '../models/team.ts'

for (const team of await Team.all()) {
  await runWithTenant(team.id, async () => {
    const active = await Project.query().count()
    // send this team's summary
  })
}
```

**What you'll see:** each loop only counts that team's projects. Without `runWithTenant`, the first query stops with `tenant_required`.

:::caution[Coming in 0.2]
Jobs dispatched during a request will remember the team they were dispatched in, so the job runs as that team without your help. Until then, pass the team id to the job and wrap its work in `runWithTenant`.
:::

### Work that really spans teams

Some jobs must see every team: a nightly usage report, a data export for your own accounting. They use a named escape hatch that needs a reason and is written to the audit log:

```ts
const totals = await Project.query().unsafeWithoutTenancy('nightly usage report').count()
```

Use it only in jobs and commands, never with input from a request. See [ORM: Tenancy](../orm-tenancy/#the-deliberate-exception-unsafewithouttenancy).

## Testing

Every generated resource gets **cross-team attack tests**: team A tries to list, read, update, delete and create team B's rows through the API, and every attempt must fail with 404 (never 403, which would reveal that the row exists). In your own tests, run code as a team with `runWithTenant`, or with the testing kit's `asTenant(team)` *(coming in 0.2)*. See [Database Testing](../database-testing/).

## With Docker or without; Windows, macOS and Linux

Nothing about teams changes between systems. With **Docker and PostgreSQL**, the installer creates both database users and generates their passwords in `.env`. With **your own PostgreSQL server**, create them yourself: an owner user for `DB_MIGRATION_USERNAME`, and an app user for `DB_USERNAME` that is **not** the owner, not a superuser and has no `BYPASSRLS` (see [Database: Getting Started](../database/#postgresql-two-database-users)).

## Common mistakes

### No current team

```text
TenantRequiredError: "projects" is tenant-scoped, but no tenant is active. Wrap the work in runWithTenant(tenantId, () => …) (the HTTP layer does this for you per request). Deliberate cross-tenant jobs use .unsafeWithoutTenancy(reason), which is audited.
```

**Why:** the code runs outside a request (a job, a command, a seeder, a test), or in a route that has no signed-in user.
**Fix:** wrap it in `runWithTenant(team.id, async () => { … })`.

### A table that is neither a team's table nor shared

```text
TenantScopeMissingError: Refusing to run SQL on "labels": it has no "tenant_id" column and is not marked global, so tenancy cannot protect it. Add t.tenant() to its migration, or create it with { global: true } if every tenant may see all of it. Tenant data may only be read or written for the active tenant. If this really must cross tenants (a maintenance job), use unsafeWithoutTenancy(reason) or unsafeRaw(reason, …): both are audited.
```

**Why:** the table has no tenant column, and Strutvane refuses to guess whether it's shared.
**Fix:** add `t.uuid('tenant_id').index()` in a new migration if each team has its own labels. If every team should see all labels, mark the table shared *(coming in 0.2, see above)*.

### "is not a valid tenant id"

```text
OrmUsageError: "acme" is not a valid tenant id. Tenant ids are UUIDs, such as the id of a row in your tenants table.
```

**Why:** you passed a name or a slug instead of the team's id.
**Fix:** `runWithTenant(team.id, …)`, where `team` is a row of your teams table.

### Two teams in one transaction

```text
TenantMismatchError: Refusing to touch "this transaction": it already belongs to tenant 0193a0b2-0000-7000-8000-00000000000a, not 0193a0b2-0000-7000-8000-00000000000b. One unit of work may only ever see one tenant.
```

**Why:** on PostgreSQL, a transaction is tied to one team; your code switched team inside it.
**Fix:** start a separate transaction per team, inside each `runWithTenant` (see the job example above).

### A cached result shows another team's data

**Why:** a value cached in memory (a module-level variable, a memoised promise) was created during one team's request and reused in another's. The ORM can't see your caches.
**Fix:** include the team id in every cache key, for example `` `projects:${currentTenant()}` ``, or don't cache team data across requests.

## Next steps

- [ORM: Tenancy](../orm-tenancy/): every method, every error and every tested attack.
- [Migrations](../migrations/#tenant-columns): the tenant column in your migrations.
- [Database: Getting Started](../database/): PostgreSQL's two database users.
- [Authorization](../authorization/): who may do what **inside** a team.
