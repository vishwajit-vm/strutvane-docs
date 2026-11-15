---
title: "Audit"
description: "Keep a permanent record of who did what, when and to which record: the security events Strutvane writes for you, recording your own actions with recordAudit(), field-level changes with secrets redacted, and reading the log back."
---

An **audit log** is a permanent list of important things that happened in your app: who signed in, who changed a role, who exported the customer list, who edited invoice 42 and what they changed. When a customer asks "who deleted this?", or an auditor asks "who can prove nothing was tampered with?", the audit log answers.

Each entry is an **audit event**: one record with *who* (the actor), *what* (the action), *when*, *which record*, and for changes, *which fields* went from what to what. Strutvane writes the security events for you and gives you `recordAudit()` for your own.

:::tip[Coming from Laravel?]
Laravel has no audit log in the framework; you'd add `owen-it/laravel-auditing` or `spatie/laravel-activitylog`. In Strutvane:
- **security events** (sign-ins, role changes, tokens, impersonation, policy bypasses) are recorded by the framework itself;
- `recordAudit()` is the small API for your own events (like `activity()->log()`);
- the per-record **history tab**, the activity feed and an audit explorer come with `@strutvane/activity-log` (Spatie's Activitylog), later.

What's different: audit events are written **in the same database transaction** as the change, so the data and its audit record can never disagree, and secret fields are redacted before they're stored.
:::

:::caution[Coming in 0.2]
`recordAudit()`, `diffChanges()`, `memoryAuditSink()` and the `AuditEvent` shape are **built in 0.1** (`@strutvane/auth`, with tests) and being moved into the framework for 0.2, so the import path below may change. The auth events (sign-in, two-factor, tokens, impersonation…) are **proven in the auth prototype** (spike 20), including a test that runs every feature and checks that no secret ever reaches an event. The framework's audit table writer, the `assertAudited()` test helper and the `audit:verify` hash chain are designed, not built. `@strutvane/activity-log` is coming after 1.0 (phase 4; see [the activity-log package](#the-activity-log-package-later)).
:::

## The smallest example

Record that someone exported the posts:

```ts title="app/http/controllers/post-export.controller.ts"
import { recordAudit } from '@strutvane/framework'
import type { HttpContext } from '@strutvane/framework'
import { auditSink } from '../../audit.ts'

export class PostExportController {
  async store(ctx: HttpContext): Promise<Response> {
    // … build the CSV …
    await recordAudit(auditSink, { action: 'post.export', resource: { type: 'post' }, reason: 'monthly report' })
    return ctx.json({ data: { rows: 128 } })
  }
}
```

**What you'll see:** one new event, stored with everything it needs:

```json
{
  "id": "0193a1e0-5c2d-7a4b-9e8f-0a1b2c3d4e5f",
  "occurredAt": "2026-11-15T10:22:01.123Z",
  "actor": { "id": "0193a1c2-7e4b-7c1d-9f2e-5a6b7c8d9e0f", "type": "user" },
  "tenantId": "acme",
  "action": "post.export",
  "resource": { "type": "post" },
  "reason": "monthly report",
  "requestId": "01JD7Q6Y9X3V2K8M4N5P6R7S8T"
}
```

You passed only the action, resource and reason. The **id** (a time-ordered UUIDv7), the **time** (UTC), the **actor**, the **tenant** and the **request id** were taken from the current request for you.

## What an audit event holds

| Field | Always there? | What it is |
|---|---|---|
| `id` | yes | unique, sortable by time |
| `occurredAt` | yes | ISO-8601 time in UTC |
| `actor` | yes (may be `null`) | `{ id, type }` of who did it; `null` for anonymous actions such as a failed sign-in |
| `action` | yes | what happened, as `resource.verb`: `invoice.update`, `auth.login.failed`, `role.assign` |
| `tenantId` | with teams | the team the action happened in |
| `resource` | often | `{ type, id? }`: which record |
| `changes` | for updates | `[{ field, from, to, redacted? }]` |
| `reason` | sometimes | why: a comment, or the policy reason for a denial. Never personal data |
| `requestId`, `traceId` | inside a request | to find the matching log lines |
| `ip`, `userAgent` | only if you pass them | store them only where your privacy policy allows; the user agent is cut to 512 characters |

The actor is stored as an id and a type only: no names, emails or roles. That keeps the log small and keeps personal data in one place (the `users` table), so erasing a person doesn't mean rewriting history.

### Action names

`action` must look like `resource.verb`, with at least one dot, at most 200 characters:

| Good | Refused |
|---|---|
| `post.update`, `post.export`, `auth.login.failed`, `team.member.removed` | `export`, `Post Update`, `post.`, `.update` |

A bad name throws right away, so a typo can't fill the log with junk:

```text
TypeError: audit action must look like "resource.verb" (e.g. "invoice.update")
```

## Recording a change, field by field

Pass the record **before** and **after** the change, and the event gets a list of what changed:

```ts title="app/http/controllers/post.controller.ts"
import { authorize, recordAudit, ResourceController, type HttpContext } from '@strutvane/framework'
import { auditSink } from '../../audit.ts'
import { Post } from '../../models/post.ts'
import { PostPolicy } from '../../policies/post.policy.ts'

export class PostController extends ResourceController<typeof Post> {
  protected readonly model = Post
  protected readonly policy = new PostPolicy()

  async publish(ctx: HttpContext): Promise<Response> {
    const post = await this.visible(ctx)
    await authorize(this.policy, 'update', ctx.user, post, 'post')
    const before = post.toJSON()
    await post.update({ status: 'published' })
    await recordAudit(auditSink, { action: 'post.publish', resource: { type: 'post', id: String(post.id) }, before, after: post.toJSON() })
    return ctx.json({ data: post })
  }
}
```

**What you'll see** in the event:

```json
"changes": [
  { "field": "status", "from": "draft", "to": "published" },
  { "field": "updated_at", "from": "2026-11-14T09:00:00.000Z", "to": "2026-11-15T10:22:01.000Z" }
]
```

| You pass | You get |
|---|---|
| `before` and `after` | every field that changed |
| only `after` (`before: null`) | a **create**: every field, from `null` |
| only `before` (`after: null`) | a **delete**: every field, to `null` |
| neither | no `changes` (an action without a diff, like an export) |

Fields that didn't change are left out. Dates are compared by time, objects key by key.

### Leaving noisy fields out

`updated_at` changes every time and tells you nothing. Pass `ignore`:

```ts
await recordAudit(auditSink, { action: 'post.publish', resource: { type: 'post', id: String(post.id) }, before, after }, { ignore: ['updated_at'] })
```

### Secrets are redacted

Fields whose names look secret (`password`, `token`, `secret`, `api_key` and the rest of the shared redaction list) are recorded as **changed**, but both values are replaced:

```json
{ "field": "password", "from": "[REDACTED]", "to": "[REDACTED]", "redacted": true }
```

You still know the password was changed, and when, and by whom; you never store it. Secret keys **inside** JSON values are redacted too. Add your own names:

```ts
await recordAudit(auditSink, { action: 'user.update', resource: { type: 'user', id }, before, after }, { sensitive: ['salary', 'iban'] })
```

### Fields only some people may read

Pass the resource's policy as `maskFor`, and every field that has a read rule is redacted the same way. The audit log then never shows a salary or an internal note to someone who later reads the log but may not read that field.

## Testing with an in-memory sink

`memoryAuditSink()` keeps events in a list, for tests:

```ts title="tests/feature/post-publish.test.ts"
import { memoryAuditSink, recordAudit } from '@strutvane/framework'
import { expect, it } from 'vitest'

it('records a publish with the status change', async () => {
  const sink = memoryAuditSink()
  await recordAudit(sink, { action: 'post.publish', resource: { type: 'post', id: '42' }, before: { status: 'draft' }, after: { status: 'published' } }, { now: () => new Date('2026-11-15T10:00:00Z'), id: () => 'evt-1' })

  expect(sink.events).toHaveLength(1)
  expect(sink.events[0]?.changes).toEqual([{ field: 'status', from: 'draft', to: 'published' }])
})
```

**What you'll see:**

```text
 ✓ tests/feature/post-publish.test.ts (1 test) 4ms
```

`now` and `id` make the event predictable in tests. `sink.clear()` empties the list between tests. A planned `assertAudited({ action, resource })` helper will do this through the HTTP test client; see [Testing](../testing/).

## Where events are stored

An **audit sink** is where events go: anything with a `write(event)` method. In 0.2 the framework provides the sink for you:

- an **append-only `audit_events` table** in your database, owned by the framework, created by an ordinary migration and marked **internal**, so it never gets an automatic API or admin screen;
- written **in the same transaction** as the change it describes: if the change rolls back, so does its audit event, and if the audit write fails, the change fails too.

:::caution[Coming in 0.2]
**Planned API (a sketch: names may change).** The framework's table sink, and how your code gets it (the `auditSink` import in the examples above), aren't built yet. The security model also plans that on PostgreSQL the app's database role gets `INSERT` but not `UPDATE` or `DELETE` on the audit table, so even a bug or an injection can't rewrite history.
:::

Your own sink, for example to also send events to a security tool, is a small object:

```ts title="app/audit.ts"
import type { AuditSink } from '@strutvane/framework'
import type { AuditEvent } from '@strutvane/framework/contracts'

/** Sends each event to two places; the database write is the one that must succeed. */
export function teeSink(primary: AuditSink, copy: (event: AuditEvent) => Promise<void>): AuditSink {
  return {
    async write(event) {
      await primary.write(event)
      copy(event).catch(() => undefined)   // a SIEM outage must never block the app
    },
  }
}
```

## What Strutvane records for you

These events are written without any code of yours. They carry ids, methods and counts only: a test runs every auth feature and proves that **no password, token, code, cookie, link or two-factor secret** ever reaches an event.

| Area | Events (prototype names) |
|---|---|
| Sign-in | `login` (with method), `login.failed`, `lockout`, `logout`, `registered` |
| Passwords | `password.changed` (via `settings` or `reset`), `password.rehashed` |
| Email | `email.verified` |
| Two-factor and passkeys | `two-factor.enabled`, `two-factor.disabled`, `recovery-codes.regenerated`, `recovery-code.used` (with how many remain), `passkey.added`, `passkey.removed` |
| Sessions | `session.revoked` (with a count) |
| API tokens | `token.created`, `token.revoked` |
| Teams | `team.created`, `team.switched`, `team.invitation.created`, `team.invitation.accepted`, `team.member.changed` |
| Impersonation | `impersonation.started`, `impersonation.stopped` (impersonator id and user id; impersonating needs the `impersonate` ability) |

The security model adds role and permission changes, data exports, tenant lifecycle, configuration changes made in the admin UI, and **policy bypasses** to the mandatory list.

:::note[Audit log or log file?]
The [log](../logging/) is for developers: lots of lines, kept for days, rotated away. The audit log is for accountability: few, structured records, kept for years, never edited. A failed sign-in goes to both; a slow query only to the log.
:::

## Reading the log

:::caution[Coming in 0.2]
**Planned API (a sketch: names may change).** The audit table is a normal table, so you can query it with the ORM from your own admin screen. A model for it, and filters by actor, record and action, are designed with the table sink. A ready-made explorer and a History tab on every record come with `@strutvane/activity-log`.
:::

A typical question, "who changed post 42?":

```ts title="app/http/controllers/post-history.controller.ts"
// Planned: an ORM model over the audit table. Its name isn't final.
const events = await AuditEvent.query()
  .where('resource_type', 'post')
  .where('resource_id', '42')
  .orderBy('occurred_at', 'desc')
  .limit(50)
  .get()
```

Remember that the audit log itself is sensitive (it shows who did what), so guard any screen that reads it with a policy that only admins pass.

## Tamper evidence: the hash chain

:::caution[Coming after 1.0]
The security model plans an optional **hash chain** per tenant: each event stores a SHA-256 of the previous one (over canonical JSON, RFC 8785), so deleting or editing an event breaks the chain. `node strut audit:verify` would check it. It isn't scheduled in a phase yet, so expect it after 1.0.
:::

## Retention and privacy

- Keep audit events as long as your rules require (often years). The planned prune registry (`model:prune`, phase 2) will let you set a retention per table.
- Don't put personal data in `reason`. Store `ip` and `userAgent` only where your privacy policy allows.
- Erasing a person (GDPR) removes them from `users`; their audit events keep only an id, which then points nowhere.

## The activity-log package (later)

:::caution[Coming after 1.0]
`@strutvane/activity-log` is in phase 4 of the roadmap (back-office essentials, 1.x).
:::

`@strutvane/activity-log` (catalogue #18) adds what end users see: a **History** tab on every record, an activity feed, and an audit explorer over the framework's table. The installer's question 27, "Record who changed what", installs it; until it's published, the installer doesn't show that question.

## Not the same thing: `tenancyAudit`

`tenancyAudit()` (from 0.1, for PostgreSQL) is a different tool with a similar name: it **inspects your database** and reports tables that row-level security doesn't protect. It writes nothing to the audit log. See [Teams & Tenancy](../tenancy/).

## With Docker or without Docker

The audit table lives in your app's database, so it's in the Docker database container or on your machine, wherever the rest of your data is. `node strut db:shell` opens a SQL prompt in either mode if you want to look at it directly.

## Common mistakes

### "audit action must look like resource.verb"

```text
TypeError: audit action must look like "resource.verb" (e.g. "invoice.update")
```

**Why:** the action has no dot, starts with a capital or a digit, or has spaces.
**Fix:** name it `resource.verb`:

```ts
await recordAudit(auditSink, { action: 'post.export' })
```

### My event has no actor

**Why:** it was recorded outside a request (a command, a queued job, a test), so there was no signed-in user to take it from.
**Fix:** pass the actor yourself, or `null` on purpose for system actions:

```ts
await recordAudit(auditSink, { action: 'post.prune', actor: null, reason: 'nightly clean-up of old drafts' })
```

### The changes list is full of `updated_at`

**Why:** every save changes `updated_at`.
**Fix:** `{ ignore: ['updated_at'] }`.

### A secret appears in `from` and `to`

**Why:** its column name doesn't look secret (`pin`, `note_private`), so the redaction list didn't catch it.
**Fix:** add it with `sensitive: ['pin']`, and mark the column `.secret()` in its migration so the API never sends it either.

### The audit event was saved but the change wasn't (or the other way round)

**Why:** you wrote the event with a sink that isn't part of the change's transaction.
**Fix:** write both in one transaction (the framework's table sink does this for you in 0.2). See [Transactions](../orm-transactions/).

## Next steps

- [Authentication](../authentication/): the sign-in events above, and impersonation.
- [Authorization](../authorization/): policies, and why a denial can be audited.
- [Logging](../logging/): the developer log, and how redaction works there.
- [Security Features](../security/): every protection that's on by default.
