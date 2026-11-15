---
title: "Mail"
description: "Send email from your app: where mail goes in development, choosing a production mailer, writing mails as classes with React templates, queueing them, sending only after the database commits, failover between providers, and what happens when a mail server is down."
---

Your app sends **mail** for sign-in links, password resets, invitations, invoices and "your export is ready" messages. Strutvane gives you one way to write a mail and several **mailers** (ways to deliver it): a local inbox while you develop, and SMTP or a provider such as Resend, Postmark or Amazon SES in production. Your code doesn't change when you switch.

:::tip[Coming from Laravel?]
It's Laravel's mail: a `MAIL_MAILER` key in `.env`, mailers in `config/mail.ts`, a **mailable** class per mail, `Mail.to(user).send(new InvoicePaid(invoice))`, queued mail, the `failover` and `roundrobin` mailers, Markdown-style templates, and a browser preview. `Mail::fake()` becomes `Mail.fake()`.

What's different: templates are **React components** instead of Blade views, and the development inbox is Mailpit (with Docker) or the log (without), set up by the installer for you.
:::

:::caution[What exists, and when]
- **Coming in 0.2:** a minimal mail core: SMTP, a development inbox, the `log` mailer, and the six sign-in mails (reset, verification, email link, invitation, "password changed", "someone tried to register"). The sign-in mails are **proven in the auth prototype** (spike 20); Mailpit and `MAIL_MAILER=log` are **proven in the installer prototype** (spike 13).
- **Coming in 0.3:** mailable classes with React templates, queued mail, `afterCommit`, the browser preview, the `failover` and `roundrobin` mailers, and the Resend, Postmark and SES drivers (installer question 20).
- **Planned API (a sketch: names may change before 0.3).** No mail-sending API exists in a prototype yet. The code on this page follows Laravel's names, as the parity checklist asks; method names and output are "something like this".
:::

## The smallest example

Without touching any setting, sign-in mails already work in development. Ask for a password reset:

```bash
curl -X POST http://localhost:3000/forgot-password \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"email":"admin@my-app.test"}'
```

**What you'll see** depends on how you installed the app:

- **With Docker:** open `http://localhost:8025`. The **Mailpit** inbox shows "Reset your password", with the link inside. Nothing left your computer.
- **Without Docker:** the mail is written to your log, link included:

  ```text
  [2026-11-15 10:22:01.123] local.INFO: Mail (log mailer) {"to":"admin@my-app.test","subject":"Reset your password","mailer":"log"}
  ```

  (Something like this; the exact line isn't final. The full mail body follows it.)

**Mailpit** is a small mail server with a web inbox that catches every mail your app sends, so you can click links and check layouts without emailing real people.

## Where mail goes

The `MAIL_MAILER` key in `.env` picks the mailer:

| `MAIL_MAILER` | Where mail goes | Used for |
|---|---|---|
| `log` | written to your log, never sent | development without Docker (the default there) |
| `smtp` | an SMTP server | development with Docker (Mailpit), and production with any SMTP provider |
| `array` | kept in memory | tests (and `Mail.fake()`) |
| `resend`, `postmark`, `ses` | the provider's HTTP API | production (coming in 0.3) |
| `failover`, `roundrobin` | several mailers | production resilience (coming in 0.3) |

The `.env` a new app gets:

**With Docker:**

```ini title=".env"
MAIL_MAILER=smtp
MAIL_HOST=mailpit
MAIL_PORT=1025
FORWARD_MAILPIT_PORT=8025
MAIL_FROM_ADDRESS="hello@my-app.test"
MAIL_FROM_NAME="My App"
```

**Without Docker:**

```ini title=".env"
MAIL_MAILER=log
MAIL_FROM_ADDRESS="hello@my-app.test"
MAIL_FROM_NAME="My App"
```

`MAIL_FROM_ADDRESS` and `MAIL_FROM_NAME` are Laravel's names for the sender; their exact keys in Strutvane aren't final.

:::note[A dev inbox inside the app]
The roadmap also plans a development inbox served by the app itself at `/_strutvane/mail`, so you can read mail without Docker. It's designed for 0.2 and not built; until it is, use the log (without Docker) or Mailpit (with Docker).
:::

## Production: choosing a mailer

The installer asks which mailer to use in production (question 20): **decide later** (the default), SMTP, Resend, Postmark or SES. You can change it any time in `.env`.

### SMTP (works with almost any provider)

```ini title=".env.production"
MAIL_MAILER=smtp
MAIL_HOST=smtp.example-provider.com
MAIL_PORT=587
MAIL_USERNAME=apikey
MAIL_PASSWORD=your-smtp-password
MAIL_FROM_ADDRESS="hello@app.example.com"
MAIL_FROM_NAME="Acme Portal"
```

Port `587` uses STARTTLS, `465` uses TLS from the start. Never use plain port `25` from a cloud server: most hosts block it.

:::danger[Passwords go only in the environment]
`MAIL_PASSWORD` and API keys go in `.env` (git-ignored) or your host's secret settings, never in `config/mail.ts`, never in `.env.example`. The log redacts keys that look secret, but a password in a committed file is already leaked.
:::

### A provider's API (coming in 0.3)

```ini title=".env.production"
MAIL_MAILER=resend
RESEND_API_KEY=re_live_…
```

API mailers are usually faster than SMTP and report bounces. Each driver documents its own key names when it's released.

### Before your first real mail

Mail providers only deliver reliably when your domain proves the mail is yours:

1. Verify your sending domain in the provider's dashboard.
2. Add the **SPF** and **DKIM** DNS records they give you (they prove your server may send for your domain).
3. Add a **DMARC** record (it tells receivers what to do with mail that fails those checks).
4. Send a test mail to yourself and check it isn't in spam.

## Writing your own mail: mailables

:::caution[Coming in 0.3]
**Planned API (a sketch: names may change).** Mailable classes and React mail templates are planned for phase 2 (parity: "React mail templates"). The shape below follows Laravel's mailables.
:::

A **mailable** is a class that describes one kind of mail: who it's for, the subject, and what's in it. Make one:

```bash
node strut make:mail PostPublished
```

```tsx title="app/mail/post-published.mail.tsx"
import { Mailable } from '@strutvane/framework'
import type { Post } from '../models/post.ts'
import { PostPublishedEmail } from '../../resources/mail/post-published.tsx'

/** Tells the author their post is live. */
export class PostPublished extends Mailable {
  constructor(readonly post: Post) {
    super()
  }

  subject(): string {
    return `"${this.post.title}" is live`
  }

  render() {
    return <PostPublishedEmail title={this.post.title} slug={this.post.slug} />
  }
}
```

The template is a React component:

```tsx title="resources/mail/post-published.tsx"
import { Button, Layout, Text } from '@strutvane/framework/mail'

export function PostPublishedEmail({ title, slug }: { title: string; slug: string }) {
  return (
    <Layout preview={`${title} is live`}>
      <Text>Good news: your post "{title}" is now published.</Text>
      <Button href={`https://app.example.com/posts/${slug}`}>View your post</Button>
    </Layout>
  )
}
```

Send it:

```ts title="app/http/controllers/post.controller.ts"
import { Mail } from '@strutvane/framework'
import { PostPublished } from '../../mail/post-published.mail.tsx'

await Mail.to(author).send(new PostPublished(post))
```

**What you'll see:** in Mailpit, a mail titled `"Hello world" is live` with a button. The mail goes to `author.email`. React escapes `{title}`, so a post titled `<script>` can't inject anything into the mail.

### Recipients, copies and attachments

```ts
await Mail.to(author)
  .cc('editor@acme.test')
  .bcc(['audit@acme.test'])
  .send(new PostPublished(post).attach('storage/app/exports/posts-2026-11.csv', { name: 'posts.csv' }))
```

Attach files from a [storage](../storage/) disk rather than from paths users control.

## Sending later: queued mail

Sending takes time (a network round trip to the mail server). Don't make the user wait:

```ts
await Mail.to(author).queue(new PostPublished(post))
```

The request answers at once; a [queue](../queues/) worker sends the mail. If the mail server is down, the worker **retries** with back-off, and after the last try the job is recorded as failed (`node strut queue:retry` sends it again).

## Sending only after the database commits

Imagine you create a post in a transaction and queue a mail about it. If the worker is fast, it may look for the post **before** the transaction commits, and not find it. Or the transaction rolls back and the mail announces a post that doesn't exist.

`afterCommit` holds the mail until the transaction has committed, and drops it if it rolls back:

```ts
await Mail.to(author).queue(new PostPublished(post), { afterCommit: true })
```

The same `afterCommit: true` option exists on events and jobs (parity checklist). See [Transactions](../orm-transactions/).

## Previewing mail in the browser

:::caution[Coming in 0.3]
**Planned API (a sketch).** `/_strutvane/mail/preview/<mailable>` will render any mailable with sample data, in local development only. Like every `/_strutvane/*` tool, it is never reachable in production (`security:check` flags it).
:::

```text
http://localhost:3000/_strutvane/mail/preview/post-published
```

## Failover and round robin

:::caution[Coming in 0.3]
**Planned API (a sketch).** The `failover` and `roundrobin` mailers are in the parity checklist; their config shape below follows Laravel's.
:::

```ts title="config/mail.ts"
import { defineConfig, env } from '@strutvane/framework'

export default defineConfig({
  default: env.string('MAIL_MAILER', 'log'),
  mailers: {
    smtp: { transport: 'smtp', host: env.string('MAIL_HOST'), port: env.number('MAIL_PORT', 587) },
    postmark: { transport: 'postmark' },
    // Try Postmark first; if it fails, send through SMTP instead.
    failover: { transport: 'failover', mailers: ['postmark', 'smtp'] },
    // Spread mail evenly over two providers.
    roundrobin: { transport: 'roundrobin', mailers: ['postmark', 'smtp'] },
  },
})
```

With `MAIL_MAILER=failover`, a Postmark outage means mail goes through SMTP and one warning is logged per failed attempt.

## When the mail server is down

What happens depends on how the mail was sent:

| How it was sent | The user sees | You see |
|---|---|---|
| A sign-in mail (reset, verification, link, invitation) | the normal answer (`{"status":"sent"}`) | one log line with the mail kind and user id; the link is never logged |
| `Mail.to().send()` in a request | an error page (500), unless you catch it | the exception in the log with the mailer's message |
| `Mail.to().queue()` | the normal answer | retries in the worker log, then a failed job |
| `failover` mailer | the normal answer | a warning, and the mail sent by the next mailer |

**Why sign-in mails never fail the request:** a different answer when delivery fails would tell an attacker that the account exists. The sign-in mails are also sent in the background, so the response time doesn't depend on the mail server either.

A typical connection failure in the log looks something like this:

```text
[2026-11-15 10:22:01.456] production.ERROR: Mail could not be sent {"mailer":"smtp","kind":"password-reset","error":"connect ETIMEDOUT 203.0.113.25:587"}
```

## Testing mail

In tests, `Mail.fake()` keeps mails in memory and lets you check them:

```ts title="tests/feature/publish-post.test.ts"
import { Mail } from '@strutvane/framework'
import { client } from '@strutvane/framework/testing'
import { expect, it } from 'vitest'
import { PostPublished } from '../../app/mail/post-published.mail.tsx'

it('mails the author when a post is published', async () => {
  Mail.fake()
  await client(app).actingAs(aliceToken).postJson('/api/posts/hello-world/publish', {})
  Mail.assertSent(PostPublished, (sent) => sent.post.slug === 'hello-world')
  Mail.assertSentCount(1)
})
```

:::caution[Coming in 0.2]
`Mail.fake()` is part of the 0.2 testing kit (blueprint §5); `assertSent` and `assertSentCount` are Laravel's names and not final. See [Mocking](../mocking/).
:::

## With Docker or without Docker

| | With Docker | Without Docker |
|---|---|---|
| Default mailer | `smtp` to Mailpit | `log` |
| Where to read mail | `http://localhost:8025` | `storage/logs/` |
| Port taken? | change `FORWARD_MAILPIT_PORT` in `.env`, then `node strut services:up` | — |

On **Windows**, open the log with any editor, or follow it live with `node strut log:tail`. On **macOS and Linux**, `tail -f storage/logs/*.log` works too.

## Common mistakes

### No mail arrives in development

**Why:** without Docker, the `log` mailer writes mail to the log and sends nothing. With Docker, the Mailpit container may be stopped.
**Fix:** look in `storage/logs/`, or start the services and open Mailpit:

```bash
node strut services:up
```

### "connect ECONNREFUSED 127.0.0.1:1025"

```text
Error: connect ECONNREFUSED 127.0.0.1:1025
```

**Why:** `MAIL_HOST=mailpit` only works **inside** Docker. Something running on your computer (outside the container) tried `localhost:1025`, where nothing listens.
**Fix:** run the command through `node strut` (which forwards into the container), or use the `log` mailer when you run without Docker.

### Mail works locally but not in production

**Why:** usually `MAIL_*` keys are missing on the server (it falls back to `log`), the SMTP password is wrong, or the provider hasn't verified your domain yet.
**Fix:** check the server's environment, then send a test mail and read the log line. A wrong password looks something like this:

```text
production.ERROR: Mail could not be sent {"mailer":"smtp","error":"535 Authentication failed"}
```

### Links in mails point at localhost

**Why:** links are built from `APP_URL`, which still has its development value on the server.
**Fix:**

```ini title=".env.production"
APP_URL=https://app.example.com
```

### My mail lands in spam

**Why:** the sending domain has no SPF, DKIM or DMARC records, or `MAIL_FROM_ADDRESS` uses a domain you haven't verified with the provider.
**Fix:** follow [Before your first real mail](#before-your-first-real-mail).

### The queued mail says the post doesn't exist

**Why:** the mail was queued inside a transaction, and the worker ran before it committed.
**Fix:** `{ afterCommit: true }`.

## Next steps

- [Notifications](../notifications/): one message over mail, the in-app bell and more.
- [Queues](../queues/): sending mail in the background.
- [Password Reset](../passwords/) and [Email Verification](../email-verification/): the built-in mails.
- [Docker](../docker/): Mailpit and the local services.
