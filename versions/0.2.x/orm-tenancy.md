---
title: "Tenancy"
description: "Keep each customer company's data apart: every query is limited to the active tenant, checked again before the SQL runs, and refused when no tenant is set."
---

**Multi-tenancy** means one app serves many customer companies (**tenants**, or **teams**), and each one must only ever see its own data. A tenant table is a table with a **tenant column** (`tenant_id`, or `team_id` for teams) saying which tenant each row belongs to.

Strutvane's ORM does the separation for you:

- every query on a tenant table is limited to the **active tenant**;
- new rows are stamped with the active tenant;
- right before any SQL is sent, a final check refuses a statement that could reach another tenant's rows;
- with **no** active tenant, tenant tables return an error, never "all rows".

You set the active tenant once per request (the HTTP layer does it for you); your queries look exactly like single-tenant ones.

:::tip[Coming from Laravel?]
Laravel has no built-in tenancy; packages like stancl/tenancy or a global scope on a `team_id` column are common. Strutvane's version is a global scope you can't forget plus a check on the final SQL, and on PostgreSQL also row-level security in the database. The tenant comes from the request context (`runWithTenant`), not from a static property, so concurrent requests can't mix tenants.
:::

## The smallest example

```ts title="app/models/project.ts"
import { Model } from '@strutvane/framework/database'
import { Task } from './task.ts'

export class Project extends Model('projects', { fillable: ['name', 'budget'] }) {
  tasks() {
    return this.hasMany(Task, 'project_id')
  }
}
```

The model has nothing about tenants: the `projects` table has a `tenant_id` column, and that's enough.

```ts
import { runWithTenant } from '@strutvane/framework/database'

const teamA = '0193a0b2-0000-7000-8000-00000000000a'
const teamB = '0193a0b2-0000-7000-8000-00000000000b'

await runWithTenant(teamA, () => Project.create({ name: 'Apollo' }))
await runWithTenant(teamB, () => Project.create({ name: 'Borealis' }))

const seenByA = await runWithTenant(teamA, () => Project.all())
console.log(seenByA.map((project) => project.name))
```

**What you'll see:**

```text
[ 'Apollo' ]
```

Team A never sees Borealis, and `tenant_id` was filled in for both projects without you passing it.

## Making a table a tenant table

1. In the table's migration, add the tenant column. It holds a UUID: the `id` of the row in your teams table.

   ```ts title="database/migrations/2026_11_14_100000_create_projects_table.ts"
   import { migration } from '@strutvane/framework/schema'

   export default migration({
     up(schema) {
       schema.create('projects', (t) => {
         t.id()
         t.tenant()                    // tenant_id: a required UUID; t.tenant('team_id') for another name
         t.string('name', 120)
         t.slug('slug').from('name')   // unique per team: (tenant_id, slug)
         t.decimal('budget', 12, 2).default(0)
         t.timestamps()
       })
     },
     down(schema) {
       schema.dropIfExists('projects')
     },
   })
   ```

2. Run `node strut migrate`. The generated types now show `tenant_id`, and the ORM treats `projects` as **scoped**.
3. Write the model as usual. Don't list `tenant_id` in `fillable`: it's filled in for you, and listing it is refused.
4. Run every query on it inside a tenant (the next section).

`t.tenant()` sets the table up the right way in one call:

- the column is a required UUID, with no default (every row belongs to exactly one tenant);
- every unique index on the table starts with the tenant column, so a slug like `website` is unique **per team**, not across all teams (`projects_tenant_id_slug_unique`);
- the table gets a unique `(tenant_id, id)` key, and a foreign key from one tenant table to another becomes **composite**, `(tenant_id, project_id)` → `projects (tenant_id, id)`, so a task can never point at another team's project, even in raw SQL;
- on PostgreSQL, the migration also creates the row-level security policy (ADR-0007).

`t.tenant()` is named `tenant_id` unless you pass a name; use the same name as `column` in `config/tenancy.ts`.

## Setting the active tenant

`runWithTenant(tenantId, fn)` runs `fn` with that tenant active and returns what `fn` returns. Everything inside it, however deep, uses that tenant, and concurrent calls never see each other's tenant (it travels with the chain of `await` calls, not in a global variable).

- **In HTTP requests**, the framework is designed to wrap every request in `runWithTenant` with the signed-in user's team, so controllers query as usual (not built yet; see the box below).
- **In seeders**, `node strut db:seed --tenant <id>` runs the whole seed inside that tenant.
- **In jobs, commands and tests**, wrap the work yourself:

```ts title="a job or a test"
await runWithTenant(teamId, async () => {
  const projects = await Project.query().latest().get()
  // …
})
```

Tenant ids are UUIDs, such as the `id` of the row in your teams table. `currentTenant()` returns the active one (or `undefined`).

:::caution[Coming in 0.2]
The HTTP wrapping (`runWithTenant` around each request, from the signed-in user's team) and capturing the tenant when a job or event is dispatched are designed but not built yet.
:::

## Every way in is covered

The tenant condition is added to every query that touches a tenant table, not only to `get()`:

```ts
await runWithTenant(teamA, async () => {
  await Project.find(borealisId)                                  // → undefined
  await Project.query().where('slug', 'borealis').first()          // → undefined
  await Project.query().search('Borealis', ['name']).count()       // → 0
  await Project.query().paginate(10)                               // total: 1
  await Project.query().with('tasks').withCount('tasks').get()     // only A's tasks, A's counts
  await Project.query().whereHas('tasks', (q) => q.where('title', 'B task')).count() // → 0
})
```

**OR conditions can't escape it.** Your conditions are put in brackets before the tenant condition is added:

```ts
await runWithTenant(teamA, () =>
  Project.query().where('name', 'Apollo').orWhere('name', 'Borealis').get(),
)
// SQL: WHERE (name = ? OR name = ?) AND tenant_id = ?
// → [ 'Apollo' ]
```

## Writes are protected too

- **New rows** get the active tenant's id. `tenant_id` can never be mass-assigned, not even with `forceCreate()`.
- **Updates and deletes** always include `AND tenant_id = ?`, so a model loaded as team A and saved as team B is "not found".
- **Changing `tenant_id`** on a saved row is refused.
- **Pivot links** (`attach`, `sync`) first check that every id belongs to the active tenant.

```ts
await runWithTenant(teamA, async () => {
  const smuggled = JSON.parse(`{"name": "Trojan", "tenant_id": "${teamB}"}`)
  await Project.create(smuggled)
  // MassAssignmentError: "tenant_id" on "projects" is managed by Strutvane …
})
```

## Shared tables

Some tables belong to everyone: countries, plans, the users table itself. With tenancy on, every table must be either **scoped** (it has the tenant column) or **global** (marked as shared in its migration). A table that is neither is refused, so a forgotten column can't become a leak.

```ts title="database/migrations/2026_11_14_090000_create_countries_table.ts"
schema.create('countries', (t) => {
  t.id()
  t.string('name')
}, { global: true })
```

`schema.create()` also accepts `{ internal: true }`, for Strutvane's own bookkeeping tables with no API or screens. A table can't be both global and have the tenant column: the migration is refused.

## Choosing the tenant column

There is **one** tenant column for the whole app, set in `config/tenancy.ts`. Tenancy is **off** unless you answered yes to "Teams?" in the installer; then no table needs a tenant column or a global flag, and the tenant scope doesn't run at all.

```ts title="config/tenancy.ts"
export default {
  enabled: true,        // false for a single-tenant app
  column: 'team_id',    // tenant_id by default
}
```

`node strut migrate`, `node strut db:seed` and the other database commands read this file and pass it to the ORM (`configureOrm({ tenancy: { column } })`; `column` defaults to `tenant_id`). Without the file, or with `enabled: false`, tenancy stays off: the ORM's own default is `tenancy: false`.

With tenancy **off**, a table whose migration has `t.tenant()` is refused instead of being read unscoped (see Common mistakes).

:::caution[Coming in 0.2]
Applying `config/tenancy.ts` when the app server boots comes with the ORM's boot set-up (see [Where the ORM gets its connection](../orm/#where-the-orm-gets-its-connection)). Until then, call `configureOrm({ tenancy: { column: 'tenant_id' } })` yourself where you set up the connection.
:::

## The deliberate exception: `unsafeWithoutTenancy`

A maintenance job or a usage report sometimes really must read across tenants. Say so explicitly, with a reason:

```ts
import { configureOrm } from '@strutvane/framework/database'

configureOrm({ onUnsafeTenancy: (event) => console.warn('tenancy bypass', event) }) // send to your audit log

const all = await Project.query().unsafeWithoutTenancy('nightly usage report').count()
```

Every bypass calls `onUnsafeTenancy` with `{ kind: 'query', tables: ['projects'], reason: 'nightly usage report' }`, so it shows up in your audit log. Use it in jobs, never in request code.

## Raw SQL in a tenant context

Inside `runWithTenant`, raw SQL that names a tenant table is refused, because Strutvane can't check it for a tenant condition. That includes a `whereRaw()` condition that mentions one (use `whereHas()` instead). Raw SQL on global tables, and outside any tenant (migrations, jobs), is allowed.

`unsafeRaw(reason, fragment)` is the audited way to run hand-written SQL that names tenant tables, for jobs only. It needs a reason and reports to `onUnsafeTenancy` like `unsafeWithoutTenancy` (with `kind: 'raw'`):

```ts
import { defaultConnection, sql, unsafeRaw } from '@strutvane/framework/database'

const { rows } = await defaultConnection().run(
  unsafeRaw('nightly usage report', sql`SELECT ${sql.id('tenant_id')}, COUNT(*) AS total FROM ${sql.id('projects')} GROUP BY ${sql.id('tenant_id')}`),
)
```

**What you'll see:** one row per tenant, like `{ tenant_id: '0193a0b2-…', total: 3 }`, and one `onUnsafeTenancy` call.

## MySQL, SQLite and PostgreSQL

| Protection | MySQL (default) | SQLite | PostgreSQL |
|---|---|---|---|
| ORM tenant condition on every query | ✔ the guarantee | ✔ the guarantee | ✔ first layer |
| Final SQL check before sending | ✔ | ✔ | ✔ |
| Composite foreign keys `(tenant_id, x)` | ✔ | ✔ | ✔ |
| Row-level security in the database | not available | not available | ✔ second layer |
| One tenant per transaction | not checked | not checked | enforced |

On **PostgreSQL**, each tenant query also sets the tenant inside the database, and row-level security (ADR-0007) refuses other tenants' rows even if the app's condition were bypassed. To make that work, every query on a tenant table runs inside a short transaction that sets the tenant for the database, and one transaction can only ever belong to one tenant. On **MySQL and SQLite** there's no such database feature, so the ORM's condition, its final check and attack-style tests (a tenant trying every way into another's data) are the guarantee. On every engine, composite foreign keys mean a task can't point at another tenant's project, because the foreign key includes the tenant column.

## Common mistakes

### No active tenant

```text
TenantRequiredError: "projects" is tenant-scoped, but no tenant is active. Wrap the work in runWithTenant(tenantId, () => …) (the HTTP layer does this for you per request). Deliberate cross-tenant jobs use .unsafeWithoutTenancy(reason), which is audited.
```

**Why:** without a tenant, Strutvane can't know whose rows you mean, so it fails instead of returning everything.

**Fix:** wrap the code (a job, a command, a test) in `runWithTenant(teamId, async () => { … })`.

### A table that isn't scoped or global

```text
TenantScopeMissingError: Refusing to run SQL on "team_projects": it has no "tenant_id" column and is not marked global, so tenancy cannot protect it. Add t.tenant() to its migration, or create it with { global: true } if every tenant may see all of it. Tenant data may only be read or written for the active tenant. If this really must cross tenants (a maintenance job), use unsafeWithoutTenancy(reason) or unsafeRaw(reason, …): both are audited.
```

**Fix:** add the tenant column to the table in a new migration, or mark the table as global if all tenants share it. Also check that `column` in `config/tenancy.ts` names the column your tables really use.

### A tenant table while tenancy is off

```text
OrmUsageError: "projects" has a tenant column (tenant_id, from t.tenant()), but tenancy is off, so its rows would not be scoped. Turn tenancy on in config/tenancy.ts ({ enabled: true, column: 'tenant_id' }), or call configureOrm({ tenancy: { column: 'tenant_id' } }) at boot.
```

**Why:** the table was built for tenancy, so reading it without the tenant scope would mix every team's rows. Strutvane fails closed instead.

**Fix:** set `enabled: true` in `config/tenancy.ts`, or remove `t.tenant()` from the table in a new migration if the app really is single-tenant.

### A raw condition that names a tenant table

```text
TenantScopeMissingError: Refusing to run SQL on "projects": a raw condition (whereRaw) names a tenant table, and raw SQL cannot be checked for a tenant condition; use whereHas, or wrap the fragment in unsafeRaw(reason, …). Tenant data may only be read or written for the active tenant. If this really must cross tenants (a maintenance job), use unsafeWithoutTenancy(reason) or unsafeRaw(reason, …): both are audited.
```

**Fix:** express the condition with `whereHas()` (which adds the tenant condition for you), or, in a job that really must cross tenants, wrap it in `unsafeRaw(reason, …)`.

### A tenant id that isn't a UUID

```text
OrmUsageError: "acme" is not a valid tenant id. Tenant ids are UUIDs, such as the id of a row in your tenants table.
```

**Fix:** pass the team's `id`, not its name or slug.

### A bypass without a reason

```text
OrmUsageError: Tenancy bypasses need a short reason for the audit log, e.g. unsafeWithoutTenancy("nightly usage report").
```

**Fix:** write why: `unsafeWithoutTenancy('monthly billing export')`.

### Caching a result across requests

**Why:** a promise or value cached in memory by one request and reused by another still holds the first tenant's data. The ORM can't see your cache.

**Fix:** include the tenant id in every cache key (`currentTenant()`), or don't cache tenant data in module-level variables.

## Next steps

- [Transactions](../orm-transactions/): one tenant per unit of work.
- [Teams & Tenancy](../tenancy/): how teams, sign-in and tenancy fit together in an app.
- [Authorization](../authorization/): who may do what inside one team.
