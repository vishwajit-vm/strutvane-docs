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
import { Model } from '@strutvane/framework'
import { Task } from './task.ts'

export class Project extends Model('projects', { fillable: ['name', 'budget'] }) {
  tasks() {
    return this.hasMany(Task, 'project_id')
  }
}
```

The model has nothing about tenants: the `projects` table has a `tenant_id` column, and that's enough.

```ts
import { runWithTenant } from '@strutvane/framework'

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
         t.tenant()                    // tenant_id, indexed
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

:::caution[Coming in 0.2]
`t.tenant()` adds the tenant column the right way in one call: the column from `config/tenancy.ts`, tenant-prefixed unique keys (so a slug like `website` is unique per team, not across all teams), and composite foreign keys `(tenant_id, project_id)` so a task can never point at another team's project. It's decided (2026-11-15) and added to the schema builder for 0.2. The ORM prototype was tested with that table layout; until the helper ships, `t.uuid('tenant_id').index()` gives you the column and the ORM's protection.
:::

## Setting the active tenant

`runWithTenant(tenantId, fn)` runs `fn` with that tenant active. Everything inside it, however deep, uses that tenant, and concurrent calls never see each other's tenant (the spike checks 200 interleaved requests).

- **In HTTP requests**, the framework wraps every request in `runWithTenant` with the signed-in user's team, so controllers query as usual.
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

:::caution[Coming in 0.2]
`{ global: true }` (and `{ internal: true }` for Strutvane's own kind of table) are decided (2026-11-15) and added to the schema builder for 0.2; in the ORM prototype, the global flag comes from the schema snapshot.
:::

## Choosing the tenant column

There is **one** tenant column for the whole app, set in `config/tenancy.ts`. Tenancy is **off** unless you answered yes to "Teams?" in the installer; then no table needs a tenant column or a global flag, and the tenant scope doesn't run at all.

```ts title="config/tenancy.ts"
export default {
  enabled: true,        // false for a single-tenant app
  column: 'team_id',    // tenant_id by default
}
```

The framework passes these settings to the ORM at boot (`configureOrm({ tenancy: { column } })`, or `{ tenancy: false }` when `enabled` is false), so you don't call `configureOrm` yourself for this.

:::caution[Coming in 0.2]
The `config/tenancy.ts` switch is decided (2026-11-15). The ORM prototype is configured directly and has tenancy **on** by default (`tenant_id`) until it's set to `false`.
:::

## The deliberate exception: `unsafeWithoutTenancy`

A maintenance job or a usage report sometimes really must read across tenants. Say so explicitly, with a reason:

```ts
import { configureOrm } from '@strutvane/framework'

configureOrm({ onUnsafeTenancy: (event) => console.warn('tenancy bypass', event) }) // send to your audit log

const all = await Project.query().unsafeWithoutTenancy('nightly usage report').count()
```

Every bypass calls `onUnsafeTenancy` with `{ kind: 'query', tables: ['projects'], reason: 'nightly usage report' }`, so it shows up in your audit log. Use it in jobs, never in request code.

## Raw SQL in a tenant context

Inside `runWithTenant`, raw SQL that names a tenant table is refused, because Strutvane can't check it for a tenant condition. Use the query builder instead. Raw SQL on global tables, and outside any tenant (migrations, jobs), is allowed.

:::caution[Coming in 0.2]
`unsafeRaw(reason, fragment)` is the audited way to run hand-written SQL across tenants, for jobs only. It needs a reason and reports to `onUnsafeTenancy` like `unsafeWithoutTenancy`. It and `TenantScopeMissingError` are exported from `@strutvane/framework` (decided 2026-11-15); the ORM prototype has both but doesn't export them yet.

```ts
import { defaultConnection, sql, unsafeRaw } from '@strutvane/framework'

const { rows } = await defaultConnection().run(
  unsafeRaw('nightly usage report', sql`SELECT ${sql.id('tenant_id')}, COUNT(*) AS total FROM ${sql.id('projects')} GROUP BY ${sql.id('tenant_id')}`),
)
```
:::

## MySQL, SQLite and PostgreSQL

| Protection | MySQL (default) | SQLite | PostgreSQL |
|---|---|---|---|
| ORM tenant condition on every query | ✔ the guarantee | ✔ the guarantee | ✔ first layer |
| Final SQL check before sending | ✔ | ✔ | ✔ |
| Composite foreign keys `(tenant_id, x)` | coming in 0.2 | coming in 0.2 | coming in 0.2 |
| Row-level security in the database | not available | not available | ✔ second layer |
| One tenant per transaction | ORM check | ORM check | enforced |

On **PostgreSQL**, each tenant query also sets the tenant inside the database, and row-level security (ADR-0007) refuses other tenants' rows even if the app's condition were bypassed. To make that work, every query on a tenant table runs inside a short transaction that sets the tenant for the database, and one transaction can only ever belong to one tenant. On **MySQL and SQLite** there's no such database feature, so the ORM's condition, its final check and attack-style tests (a tenant trying every way into another's data) are the guarantee. Once composite foreign keys arrive, tasks also can't point at another tenant's project, because the foreign key will include the tenant column.

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
