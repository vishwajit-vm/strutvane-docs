---
title: Prompts
description: Ask questions in your own `node strut` commands (text, select, search, confirm), show a spinner, a progress bar and tables, behave sensibly in CI and with no terminal, and test it all with a fake. A preview of the API planned for 0.2.
---

**Prompts** are the friendly questions a command asks in the terminal: "What's the post title?", a list you move through with the arrow keys, "Are you sure? (y/N)". They turn a command with ten flags into a short conversation. Strutvane's installer already works this way; the prompts API brings the same to **your own** commands.

:::tip[Coming from Laravel?]
It's Laravel Prompts: `text()`, `select()`, `search()`, `confirm()`, `spin()`, `progress()` and `table()`, with the same idea of a fake for tests. They'll be imported from `@strutvane/framework/console`.
:::

:::caution[Coming in 0.2]
The prompts API is a **gap found on 2026-11-15** and added to the 0.2 plan (Laravel parity matrix): "text, select, search, confirm, spinner, progress, table, with a test fake". It isn't built yet. The installer prototype (spike 13) proves the mechanics underneath (questions, defaults, flags, CI mode, a scripted fake), but the function names and options on this page are a **sketch that may change**.
:::

## The smallest example (preview)

```ts title="app/console/posts-create.command.ts"
import { defineCommand, text } from '@strutvane/framework/console'
import { Post } from '../models/post.ts'

export const createPost = defineCommand({
  name: 'posts:create',
  description: 'Create a draft post',
  async run({ output }) {
    const title = await text({ message: 'What is the title?', placeholder: 'Hello World' })
    const post = await Post.forceCreate({ title, status: 'draft', author_id: 1 })
    output.line(`  Created "${post.title}" (${post.slug}).`)
  },
})
```

```bash
node strut posts:create
```

**What you'll see** (something like this):

```text
◆ What is the title?
│ Launch day
└
  Created "Launch day" (launch-day).
```

## Every kind of prompt (preview)

| Prompt | Asks for | Returns |
|---|---|---|
| `text()` | A line of text | `string` |
| `password()` | Hidden text (a masked answer) | `string` |
| `select()` | One choice from a list | the chosen value |
| `multiselect()` | Several choices | an array of values |
| `search()` | One choice from a list you filter by typing | the chosen value |
| `confirm()` | Yes or no | `boolean` |
| `spin()` | Nothing: shows a spinner while work runs | the work's result |
| `progress()` | Nothing: shows a progress bar over a list | the results |
| `table()` | Nothing: prints rows as a table | — |

### Text, with a default and validation

```ts
const name = await text({
  message: 'Team name?',
  defaultValue: 'Acme',
  validate: (value) => (value.trim().length < 2 ? 'Use at least 2 characters.' : undefined),
})
```

A wrong answer shows the message under the field and asks again; it never throws.

### Select one, or several

```ts
const status = await select({
  message: 'Which status?',
  options: [
    { value: 'draft', label: 'Draft' },
    { value: 'published', label: 'Published' },
  ],
  initialValue: 'draft',
})

const tags = await multiselect({
  message: 'Which tags?',
  options: [{ value: 'news', label: 'News' }, { value: 'release', label: 'Release' }],
})
```

The returned value is typed from the options: `status` is `'draft' | 'published'`.

### Search a long list

When the list is long (every user, every post), let the person type to filter:

```ts
const authorId = await search({
  message: 'Who is the author?',
  options: async (term) =>
    (await User.query().where('name', 'like', `%${term}%`).limit(10).get()).map((user) => ({ value: user.id, label: user.name })),
})
```

### Confirm a dangerous step

```ts
if (!(await confirm({ message: 'Delete 120 old drafts?', initialValue: false }))) {
  output.line('  Nothing deleted.')
  return 0
}
```

Destructive questions default to **No**, so pressing Enter by habit is safe.

### Spinner, progress and tables

```ts
const count = await spin('Counting posts…', () => Post.query().count())

await progress('Re-indexing', posts, async (post) => {
  await searchIndex.update(post)
})

table(['Status', 'Posts'], [['draft', 12], ['published', 30]])
```

**What you'll see** (something like this):

```text
◇ Counting posts… done
Re-indexing ████████████████████ 42/42
  Status     Posts
  ---------  -----
  draft      12
  published  30
```

## In CI, scripts and with no terminal

A prompt needs a person at a terminal. When there's none (CI, a pipe, a cron job, `--no-interaction`), prompts never hang waiting:

| Situation | What a prompt does |
|---|---|
| A real terminal | Asks |
| No terminal, CI (`CI=true`), or `--no-interaction` | Takes its default; a prompt with **no** default stops the command with a clear error naming the flag to pass |
| A flag answers the question | The prompt isn't shown at all |

The rule from the installer: **every question also has a flag**, so the same command works interactively and in a script. Design your commands the same way: read the option first, and only ask when it's missing.

```ts
const title = options.title ?? (await text({ message: 'What is the title?' }))
```

**Secrets are never flags.** A password typed on a command line ends up in shell history and process lists. Read secrets from an environment variable in scripts (the installer uses `STRUT_ADMIN_PASSWORD` and `STRUT_DB_PASSWORD`), and with `password()` interactively.

## Windows, macOS, Linux and Docker

- Prompts work in Windows Terminal, PowerShell, cmd, macOS Terminal and Linux terminals. Arrow keys, Space and Enter behave the same everywhere.
- **With Docker**, `node strut posts:create` is forwarded into the container with your terminal attached, so prompts still work.
- In a terminal without colours or Unicode, prompts fall back to plain text.

## Testing commands that ask questions (preview)

The fake answers prompts in order, so a test never waits for a keyboard:

```ts title="tests/console/posts-create.test.ts"
import { randomBytes } from 'node:crypto'
import { expect, test } from 'vitest'
import { Prompts, runConsole } from '@strutvane/framework/console'
import { createApp } from '../../bootstrap/app.ts'

test('posts:create asks for a title', async () => {
  const app = createApp({ APP_ENV: 'testing', APP_KEY: `base64:${randomBytes(32).toString('base64')}`, DB_CONNECTION: 'sqlite' })
  const lines: string[] = []
  Prompts.fake(['Launch day'])          // the answers, in order

  const code = await runConsole(app, ['posts:create'], { output: { line: (t = '') => lines.push(t), error: (t) => lines.push(t) } })

  expect(code).toBe(0)
  expect(lines).toContain('  Created "Launch day" (launch-day).')
  Prompts.assertAllAnswered()
})
```

A friendlier form is planned too: `strut('posts:create').expectsQuestion('What is the title?', 'Launch day').assertExitCode(0)`. See [Strut Console](../strut-console/).

## Common mistakes

### My command hangs in CI

**Why:** it asked a question with no terminal to answer it. (With the prompts API this can't happen: it takes the default or stops with an error.)
**Fix:** pass the answer as a flag in CI, and give the question a flag in your command.

### "This question has no default …" in a script

**Why:** there's no terminal, and the question has no safe default (a title, a password).
**Fix:** pass it as an option (`--title "Launch day"`), or as an environment variable for secrets.

### I put a password in a flag

**Why:** flags are saved in shell history and visible in process lists.
**Fix:** read secrets from the environment (`process.env.MY_SECRET`) or ask with `password()`.

## Next steps

- [Strut Console](../strut-console/): writing and registering commands.
- [Installation](../installation/): the installer, the biggest user of prompts.
- [Testing](../testing/): running your command tests.
