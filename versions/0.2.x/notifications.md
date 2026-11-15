---
title: "Notifications"
description: "Tell people when something happens, over mail and the in-app bell at once: write one notification class, choose channels per user, queue it, notify someone without an account, mark notifications read, and handle a channel that fails."
---

A **notification** is a short message to a person about something that happened: "Your export is ready", "Grace invited you to Acme", "Your post was published". Unlike a [mail](../mail/), a notification doesn't care *how* it arrives. You write it once, and it goes out over one or more **channels**: an email, an entry in the **bell** menu at the top of your app, and later SMS, Slack, Microsoft Teams or a phone push.

:::tip[Coming from Laravel?]
It's Laravel's notifications: a class per notification with `via()`, `toMail()` and `toDatabase()`, `user.notify(new InvoicePaid(invoice))`, a `notifications` table for the database channel, on-demand notifications for people without an account, and `Notification.fake()` in tests.

What's different: the **bell and the notifications page are built into the admin UI** (no Livewire or Echo setup), and extra channels (SMS, Slack, Teams, web push, WhatsApp) come from one package, `@strutvane/notification-channels`, instead of a dozen community ones.
:::

:::caution[Coming in 0.3]
Notifications are in **phase 2 of the roadmap (0.3, "background work")**: the mail and database channels, broadcast, on-demand notifications, queueing, and the bell plus `/notifications` page in `@strutvane/ui`. Extra channels come with `@strutvane/notification-channels` in phase 6. Nothing here is built or proven in a prototype yet.

**Planned API (a sketch: names may change before 0.3).** The code follows Laravel's names, as the parity checklist asks. Output is "something like this".
:::

## The smallest example

1. Make a notification:

   ```bash
   node strut make:notification PostPublished
   ```

2. Fill it in:

   ```ts title="app/notifications/post-published.notification.ts"
   import { Notification, type Notifiable } from '@strutvane/framework'
   import type { Post } from '../models/post.ts'

   /** Tells an author that their post is live. */
   export class PostPublished extends Notification {
     constructor(readonly post: Post) {
       super()
     }

     /** Which channels to use for this person. */
     via(_user: Notifiable): readonly string[] {
       return ['mail', 'database']
     }

     toMail() {
       return this.mail()
         .subject(`"${this.post.title}" is live`)
         .line('Good news: your post is now published.')
         .action('View your post', `/posts/${this.post.slug}`)
     }

     toDatabase() {
       return { post_id: this.post.id, title: this.post.title, message: 'Your post was published.' }
     }
   }
   ```

3. Send it:

   ```ts title="app/http/controllers/post.controller.ts"
   import { PostPublished } from '../../notifications/post-published.notification.ts'

   await author.notify(new PostPublished(post))
   ```

**What you'll see:**

- a mail "`"Hello world" is live`" in Mailpit (`http://localhost:8025`) or your log;
- a red **1** on the bell in the top bar; clicking it shows "Your post was published." with a link.

## Channels

| Channel | What it does | Phase |
|---|---|---|
| `mail` | sends an email through your [mailer](../mail/) | 0.3 |
| `database` | stores a row in the `notifications` table; the bell and `/notifications` page read it | 0.3 |
| `broadcast` | pushes it live to the open browser tab | 0.3 (live delivery needs `@strutvane/realtime`, coming after 1.0) |
| `sms`, `slack`, `teams`, `webpush`, `whatsapp` | via `@strutvane/notification-channels` | coming after 1.0 (phase 6) |

### Choosing channels per person

`via()` receives the person, so it can follow their preferences:

```ts title="app/notifications/post-published.notification.ts"
via(user: Notifiable): readonly string[] {
  const channels = ['database']                      // always in the bell
  if (user.notify_by_email === true) channels.push('mail')
  return channels
}
```

**What you'll see:** people who switched email off still get the bell entry, and nothing in their inbox. (`notify_by_email` is a column you add to `users` yourself; a preference centre comes with `notification-channels`.)

## Who can be notified

Anything **notifiable**: by default your `User` model. It knows its email address (for `mail`) and its id (for `database`).

```ts title="app/models/user.ts"
import { Model, notifiable } from '@strutvane/framework'

export class User extends Model('users', { fillable: ['name', 'email'], hidden: ['password'], behaviours: [notifiable()] }) {}
```

`behaviours` is the planned way to add features to a model without decorators (catalogue F5); `notifiable()` adds `notify()`, `notifications()` and `unreadNotifications()`.

### Several people at once

```ts
import { Notification } from '@strutvane/framework'

await Notification.send(teamMembers, new PostPublished(post))
```

Each person gets their own copy, with their own `via()` answer.

### Someone without an account (on-demand)

To notify an address that has no user, for example the person who filled in a public contact form:

```ts
await Notification.route('mail', 'grace@example.com').notify(new ContactReceived(message))
```

Only channels with a route given (here `mail`) are used; `database` needs a user, so it's skipped.

## Queueing notifications

Sending over several channels takes time. Queue it, so the request answers at once:

```ts title="app/notifications/post-published.notification.ts"
export class PostPublished extends Notification {
  static readonly queued = { afterCommit: true, tries: 3 }
  // the rest of the class is unchanged
}
```

**What you'll see:** `notify()` returns right away; a [queue](../queues/) worker sends the mail and writes the bell entry. With `afterCommit: true`, nothing is sent until the transaction that created the post has committed, and nothing at all if it rolls back.

Each channel is sent as its own job, so a mail outage doesn't stop the bell entry.

## The bell and the notifications page

With the admin UI, the top bar has a **bell** with an unread count, a dropdown with the latest entries, and a full `/notifications` page. Users can mark one entry or all entries read. All of it reads the `database` channel; there's nothing to build.

Under the hood, the `notifications` table holds one row per entry: who it's for, the notification type, your `toDatabase()` data as JSON, and `read_at`. It's an **internal** table, so it never gets an automatic API or admin screen of its own.

Reading them in your own code:

```ts
const unread = await user.unreadNotifications().limit(10).get()
await user.unreadNotifications().markAsRead()
```

Old read entries can be pruned with the planned `model:prune` command on the [scheduler](../scheduling/).

## Tenancy

With teams, each entry belongs to the team it was created in. People see only the current team's entries in the bell, and switching team switches the list. Your `toDatabase()` data is visible to the person notified, so don't put another team's data in it.

## When a channel fails

| What fails | What happens |
|---|---|
| The mail server is down | the mail job retries with back-off; the bell entry is already there |
| A channel throws in `toMail()` (a bug) | that channel's job is recorded as a failed job (visible in `@strutvane/queue-dashboard`); other channels are unaffected |
| The person has no email address | the `mail` channel is skipped and a warning is logged |
| An SMS provider rejects the number (phase 6) | that job fails; the failure is recorded, nothing is retried forever |
| Not queued, and a channel throws | the error reaches your code; catch it or queue the notification |

Failed jobs can be retried with `node strut queue:retry <id|all>` once the cause is fixed. See [Queues](../queues/).

## Testing notifications

```ts title="tests/feature/publish-post.test.ts"
import { Notification } from '@strutvane/framework'
import { expect, it } from 'vitest'
import { PostPublished } from '../../app/notifications/post-published.notification.ts'

it('notifies the author when a post is published', async () => {
  Notification.fake()
  await client(app).withToken(aliceToken).postJson('/api/posts/hello-world/publish', {})
  Notification.assertSentTo(alice, PostPublished, (sent, channels) => channels.includes('database'))
  Notification.assertNotSentTo(bob, PostPublished)
})
```

`Notification.fake()` is a phase 2 fake (parity checklist); the assertion names follow Laravel and aren't final. See [Mocking](../mocking/).

## With Docker or without Docker

Notifications behave the same. The mail channel follows your mailer: Mailpit with Docker, the log without. The bell reads your database, wherever it runs. Queue workers that send queued notifications run inside the `app` container in Docker mode, and on your machine otherwise.

## Common mistakes

### The bell stays empty

**Why:** `via()` doesn't include `'database'`, or the notification is queued and no worker is running.
**Fix:** add the channel, and start a worker in development (`npm run dev` starts the processes packages register).

### "This notification has no toMail()"

```text
Error: PostPublished uses the "mail" channel but has no toMail() method.
```

(Something like this.) **Why:** every channel in `via()` needs its `to<Channel>()` method.
**Fix:** add `toMail()`, or remove `'mail'` from `via()`.

### Everyone got the notification twice

**Why:** the code that sends it ran twice (a retried request, a listener registered twice).
**Fix:** send notifications from one place, from a queued job with a unique id, or guard with an [idempotency key](../security/) on the route.

### The mail link points at localhost

**Why:** links are built from `APP_URL`.
**Fix:** set `APP_URL` to the real address on the server.

### Notifications of team A show up in team B

**Why:** the notification was sent outside a request, without a current team, so it was stored without one.
**Fix:** send it inside the team's context (jobs carry the team with them automatically; commands must set it).

## Next steps

- [Mail](../mail/): mailers, templates and the dev inbox.
- [Queues](../queues/): sending notifications in the background.
- [Events](../events/): reacting to "post published" and sending notifications from a listener.
- [Notification channels](../packages/notification-channels/): SMS, Slack, Teams and push.
