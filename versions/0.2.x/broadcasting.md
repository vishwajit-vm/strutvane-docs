---
title: "Broadcasting"
description: "Push changes to open browser tabs as they happen: live-updating tables, notifications that appear without a reload, who's-online lists. How @strutvane/realtime will work, with public, private and presence channels authorised by your policies."
---

Normally a page shows what the server said when it loaded, and nothing changes until you reload. **Broadcasting** lets the server **push** a message to every open tab that's listening: "post 42 was published", "Grace is now editing this invoice", "you have a new notification". Tables refresh themselves, the bell lights up, and two people editing the same record see each other.

Messages travel over a **WebSocket**: a connection the browser keeps open to the server, so the server can send at any time. A **channel** is a named stream of messages ("posts", "team.7.projects"); a page **subscribes** to the channels it cares about.

:::tip[Coming from Laravel?]
`@strutvane/realtime` is **Reverb + Echo** in one package: a WebSocket server you run yourself, and a small browser client. Laravel's ideas keep their names: public, **private** and **presence** channels, channel authorisation in `routes/channels.ts`, broadcasting events with a `broadcastOn()` method, model broadcasting, and a `broadcast` notification channel.

What's different: channel access is decided by your **policies** (the same rules as the API), every channel name is **team-scoped by construction**, and the generated admin tables use it with no code from you.
:::

:::caution[Coming after 1.0 (phase 6)]
Broadcasting is **planned, not built**: `@strutvane/realtime` is in phase 6 of the roadmap ("money, realtime and collaboration", after 1.0). Installer question 33, "Live updates (tables refresh when others change data)", installs it; until the package is published, the installer doesn't show that question. Nothing here is in a prototype.

What's decided (package catalogue): a WebSocket server, private and presence channels authorised by policies, model broadcasting, a client subpath, `config/broadcasting.ts`, `routes/channels.ts`, a dev process that `npm run dev` starts, team-scoped channel names, payloads filtered by your read rules, and a `Broadcaster` service other packages (charts, notifications, GraphQL) use when it's installed.

**Proposed API (a sketch: every name may change).** The code on this page shows the intended shape, following Laravel's.
:::

## The smallest example

1. Install the package:

   ```bash
   node strut install:realtime
   ```

   **What you'll see** (something like this):

   ```text
     ✔ Installed @strutvane/realtime
     ✔ Wrote config/broadcasting.ts and routes/channels.ts
     ✔ Registered the "realtime" dev process (npm run dev starts it)
     ✔ The generated admin tables now refresh live
   ```

2. Open the **Posts** screen in two browser windows, signed in as two different users of the same team.
3. Publish a post in one window.

**What you'll see:** the other window's table updates within a moment, without a reload, showing only the posts that user may see.

That's model broadcasting, switched on for every generated resource. The rest of this page is for your own screens and events.

## Channels: public, private and presence

| Kind | Who may listen | Example | Use it for |
|---|---|---|---|
| **Public** | anyone, signed in or not | `status` | a public status banner |
| **Private** | signed-in users your rule allows | `posts.42` | updates about one record |
| **Presence** | like private, and everyone sees who else is listening | `posts.42.editing` | "Grace is also editing this post" |

Private and presence channels are **authorised**: when a tab subscribes, the server asks your rule whether this user may listen. A refused subscription is just refused; the tab learns nothing about the channel.

### Authorising channels

```ts title="routes/channels.ts"
import { allows } from '@strutvane/framework'
import { defineChannels } from '@strutvane/realtime'
import { Post } from '../app/models/post.ts'
import { PostPolicy } from '../app/policies/post.policy.ts'

const policy = new PostPolicy()

export default defineChannels((channel) => {
  // Only users who may view the post hear about it. The same policy as GET /api/posts/{post}.
  channel.private('posts.{post}', { post: Post }, (user, post) => allows(policy, 'view', user, post))

  // Presence: return what others may see about this user (never more than their name).
  channel.presence('posts.{post}.editing', { post: Post }, async (user, post) =>
    user !== null && (await allows(policy, 'update', user, post)) ? { id: user.id, name: user.name } : false,
  )
})
```

`{post}` is bound like a route parameter, so the rule receives the post, or the subscription fails as "not found" when the user may not see it.

**Team-scoped by construction:** channel names are prefixed with the current team behind the scenes. A user of team A subscribing to `posts.42` subscribes to team A's `posts.42`; there is no way to name another team's channel.

## Broadcasting your own events

Make an event broadcastable by saying which channels it goes to:

```ts title="app/events/post-published.event.ts"
import { defineBroadcast } from '@strutvane/realtime'
import type { Post } from '../models/post.ts'

export const PostPublished = defineBroadcast('post.published', (post: Post) => ({
  on: [`posts.${post.id}`, 'posts'],
  payload: { id: post.id, title: post.title, slug: post.slug },
}))
```

Send it from your code:

```ts title="app/http/controllers/post.controller.ts"
import { broadcast } from '@strutvane/realtime'
import { PostPublished } from '../../events/post-published.event.ts'

await broadcast(PostPublished(post), { afterCommit: true })
```

**What you'll see:** every tab subscribed to `posts.42` or `posts` receives `{ id: 42, title: 'Hello world', slug: 'hello-world' }`.

- **`afterCommit: true`** waits until the database transaction has committed, so listeners never fetch a post that doesn't exist yet.
- **Payloads are filtered** through the model's serializer and read rules: hidden and secret columns are never sent, even if you pass the whole model.
- Broadcasting goes through the [queue](../queues/) when one is configured, so a slow WebSocket server never slows down the request.

### Model broadcasting

Every generated resource broadcasts `created`, `updated`, `deleted` and `restored` for its records, on a channel per record and one per list. The admin tables listen to the list channel and refetch the rows the user may see (they don't trust the pushed data to decide visibility). Turn it off for a model:

```ts title="app/models/post.ts"
export class Post extends Model('posts', { fillable: ['title', 'body', 'status'], broadcasts: false }) {}
```

## Listening in the browser

The package's client subpath is the Echo-like part:

```ts title="resources/ui/lib/live.ts"
import { realtime } from '@strutvane/realtime/client'

const live = realtime()   // connects to the app's WebSocket server, signed in with the session cookie

// A private channel
const unsubscribe = live.private('posts.42').listen('post.published', (post) => {
  console.log(`"${post.title}" is live`)
})

// A presence channel
live.presence('posts.42.editing')
  .here((people) => showEditors(people))
  .joining((person) => addEditor(person))
  .leaving((person) => removeEditor(person))

// Later, when the page goes away
unsubscribe()
```

In React, the UI kit's hooks do the subscribing and cleaning up for you:

```tsx title="resources/ui/pages/posts/show.tsx"
import { usePresence } from '@strutvane/ui/realtime'

export function EditingBadge({ postId }: { postId: number }) {
  const editors = usePresence(`posts.${postId}.editing`)
  return editors.length > 1 ? <span>{editors.length - 1} other person editing</span> : null
}
```

## Notifications on the `broadcast` channel

[Notifications](../notifications/) can use a `broadcast` channel. With `@strutvane/realtime` installed, the bell updates the moment a notification is stored; without it, the bell checks again when the window regains focus.

## Running the server

- **Development:** `npm run dev` starts the WebSocket server as one more process, next to the app and Vite. In Docker mode it runs in the `app` container like everything else.
- **Production:** run it as its own long-running process (or container) next to the web server. With more than one WebSocket server, they share messages through Redis (see [Redis](../redis/)).
- Behind a proxy, allow WebSocket upgrades on the realtime path, and keep the connection timeout above the client's ping interval.

## When the connection drops

| Situation | What users see |
|---|---|
| Wi-Fi drops, laptop sleeps | the client reconnects by itself and re-subscribes; tables refetch once to catch up on what they missed |
| The WebSocket server is down | the app works normally; pages just stop updating live, and a quiet "Live updates paused" notice appears |
| A subscription is refused | nothing is shown; the channel stays silent |
| The session expires | subscriptions to private channels end; the usual session-expired notice appears |

Live updates are a convenience on top of the normal API, never the only way to see data.

## With Docker or without Docker

- **With Docker,** the realtime server runs inside the `app` container; its port is forwarded to `127.0.0.1` like the app's.
- **Without Docker,** `npm run dev` runs it on your machine. Windows, macOS and Linux behave the same.

## Common mistakes

### My page never receives anything

**Why:** the realtime server isn't running (only the web server is), the event wasn't broadcast on the channel the page listens to, or the subscription was refused.
**Fix:** check that `npm run dev` shows the realtime process, compare the channel names, and check the channel rule for that user.

### Another team's updates appear

**Why:** this can't happen through channel names (they're team-scoped), so look for a custom server-side broadcast that sends another team's data on purpose, for example from a command running without a team.
**Fix:** broadcast inside the team's context; jobs and requests carry it automatically.

### The browser shows a secret column in the payload

**Why:** it can't, if the payload goes through the model's serializer. A hand-built payload object bypasses it.
**Fix:** pass model data through the serializer, or list only the fields you mean to send.

### Updates arrive before the record exists

**Why:** the broadcast was sent inside a transaction that hadn't committed yet.
**Fix:** `broadcast(event, { afterCommit: true })`.

## Next steps

- [Events](../events/): the event system broadcasting builds on.
- [Notifications](../notifications/): the bell and the `broadcast` channel.
- [Redis](../redis/): sharing messages between several realtime servers.
- [@strutvane/realtime](../packages/realtime/): the package page.
