---
title: "Console Tests"
description: "Test node strut commands, including your own: run a command inside a test, answer its questions, check what it prints and its exit code, test generated files, and fake prompts and time so console tests stay fast and predictable."
---

Your app has commands: the built-in `node strut make:migration`, and your own, such as `node strut posts:archive` or `node strut reports:send`. A **console test** runs a command inside a test, answers its questions for you, and checks what it printed and its **exit code** (the number a command ends with: `0` for success, anything else for failure). You'd write one for every command your team or your scheduler relies on.

Console tests run the command **in the same process** as the test, with output captured in memory, so they take milliseconds and never touch your real terminal.

:::tip[Coming from Laravel?]
It's Laravel's console testing:
- `$this->artisan('make:migration create_posts_table')` → `strut(app, 'make:migration create_posts_table')`;
- `->expectsQuestion('Name?', 'Post')`, `->expectsOutput('…')`, `->doesntExpectOutput('…')` and `->assertExitCode(0)` keep their names;
- `->expectsConfirmation()` and `->expectsChoice()` cover prompts, like Laravel Prompts' test helpers.

What's different: commands are typed objects made with `defineCommand()` (no `$signature` string to parse), and there's a lower-level `runConsole()` you can call today in the prototype.
:::

:::caution[What exists, and when]
- **Proven in the application-core prototype (spike 12):** commands as `defineCommand({ name, description, arguments, options, run })`; `runConsole(app, argv, { output, now })`, which runs a command line in-process, returns its exit code and captures output into a buffer; typed options; friendly errors for unknown commands and options. Spike 12 has 14 console tests built this way, including real `node strut` processes.
- **Coming in 0.2:** the fluent `strut()` test helper (`expectsQuestion()`, `expectsOutput()`, `assertExitCode()`…), the console prompts API with its test fake, and `make:command`.

**Planned API (a sketch: names may change).** The fluent helper's name comes from the parity checklist (`strut('cmd').expectsQuestion()…`); the rest follows Laravel.
:::

## The smallest example (works in the prototype)

Run `route:list --json` and check its output:

```ts title="tests/feature/route-list.test.ts"
import { randomBytes } from 'node:crypto'
import { expect, it } from 'vitest'
import { runConsole, type Output } from '@strutvane/framework/console'
import { createApp } from '../../bootstrap/app.ts'

/** Collects what a command prints, instead of writing to the terminal. */
function buffer(): Output & { out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  return { out, err, line: (text = '') => out.push(text), error: (text) => err.push(text) }
}

it('lists the admin routes as JSON', async () => {
  const app = createApp({ APP_ENV: 'testing', APP_KEY: 'base64:' + randomBytes(32).toString('base64'), DB_CONNECTION: 'sqlite', DB_DATABASE: ':memory:' })
  const output = buffer()

  const exitCode = await runConsole(app, ['route:list', '--json', '--name=admin'], { output })

  expect(exitCode).toBe(0)
  expect(JSON.parse(output.out.join('\n'))).toEqual([
    { method: 'GET', uri: '/api/admin/stats', name: 'admin.stats', action: 'StatsController@show', middleware: 'api, auth, admin' },
  ])
})
```

**What you'll see:**

```text
 ✓ tests/feature/route-list.test.ts (1 test) 12ms
```

`runConsole()` returns the exit code instead of ending the process, and writes into your buffer instead of the terminal: that's what makes commands testable.

## The fluent helper: `strut()`

:::caution[Coming in 0.2]
**Planned API (a sketch).** `strut()` wraps `runConsole()` with Laravel-style expectations.
:::

```ts title="tests/feature/make-migration.test.ts"
import { strut } from '@strutvane/framework/testing'
import { it } from 'vitest'

it('creates a posts migration, model, factory and seeder', async () => {
  await strut(app, 'make:migration create_posts_table --seeder')
    .expectsOutput('Created database/migrations/2026_11_15_100000_create_posts_table.ts')
    .expectsOutput('Created app/models/post.ts')
    .expectsOutput('Created database/factories/post.factory.ts')
    .expectsOutput('Created database/seeders/post.seeder.ts')
    .assertExitCode(0)
})
```

| Expectation | Passes when… |
|---|---|
| `expectsOutput(text)` | a printed line equals `text` |
| `expectsOutputToContain(text)` | some printed line contains `text` |
| `doesntExpectOutput(text)` | no line equals `text` |
| `expectsError(text)` | a line on the error stream contains `text` |
| `expectsQuestion(question, answer)` | the command asks `question`, and gets `answer` |
| `expectsConfirmation(question, 'yes' \| 'no')` | a yes/no prompt |
| `expectsChoice(question, answer, choices?)` | a select prompt, optionally checking the offered choices |
| `assertExitCode(code)` / `assertSuccessful()` / `assertFailed()` | the exit code |

The chain runs when awaited. A failure shows everything the command printed, so you see what went wrong:

```text
Error: Expected the output "Created app/models/post.ts", but the command printed:
  Created database/migrations/2026_11_15_100000_create_posts_table.ts
  ✖ app/models/post.ts already exists.
  → Pick another name, or add --force to overwrite it (your changes in that file would be lost).
```

### Fixed time for generated file names

Migration file names start with the date and time. Freeze the clock so the name is the same on every run (the prototype's `runConsole` takes `now` for this):

```ts
await runConsole(app, ['make:migration', 'create_posts_table'], { output, now: () => new Date('2026-11-15T10:00:00Z') })
// → database/migrations/2026_11_15_100000_create_posts_table.ts
```

With the fluent helper, `freezeTime()` or `travelTo()` do the same (see [Mocking](../mocking/)).

## Testing your own command

A command is a typed object. Here's one that archives old drafts:

```ts title="app/console/commands/archive-drafts.command.ts"
import { defineCommand } from '@strutvane/framework/console'
import { Post } from '../../models/post.ts'

export const archiveDraftsCommand = defineCommand({
  name: 'posts:archive-drafts',
  description: 'Archive drafts not touched for a number of days',
  options: {
    days: { type: 'string', description: 'Age in days (default 90)' },
    dry: { type: 'boolean', description: 'Only count, change nothing' },
  },
  async run({ options, output, now }) {
    const days = Number(options.days ?? '90')
    if (!Number.isInteger(days) || days < 1) {
      output.error(`--days must be a whole number of days, got "${options.days}".`)
      return 1
    }
    const before = new Date(now().getTime() - days * 86_400_000)
    const drafts = Post.query().where('status', 'draft').where('updated_at', '<', before)
    const count = await drafts.count()
    if (options.dry) {
      output.line(`${count} drafts would be archived.`)
      return 0
    }
    await drafts.update({ status: 'archived' })
    output.line(`Archived ${count} drafts.`)
    return 0
  },
})
```

Test the success path, the dry run and the failure path:

```ts title="tests/feature/archive-drafts.test.ts"
import { strut } from '@strutvane/framework/testing'
import { describe, it } from 'vitest'

describe('posts:archive-drafts', () => {
  it('archives old drafts', async () => {
    await Post.factory().count(3).create({ status: 'draft', updated_at: new Date('2026-01-01') })
    await strut(app, 'posts:archive-drafts --days=30').expectsOutput('Archived 3 drafts.').assertExitCode(0)
  })

  it('changes nothing in a dry run', async () => {
    await strut(app, 'posts:archive-drafts --dry').expectsOutputToContain('would be archived').assertSuccessful()
  })

  it('refuses a bad --days', async () => {
    await strut(app, 'posts:archive-drafts --days=soon')
      .expectsError('--days must be a whole number of days, got "soon".')
      .assertExitCode(1)
  })
})
```

Then check the database as in [Database Testing](../database-testing/).

### Unknown commands and options

The console already explains typos, and you can test that your command's options are spelled as you think. From the prototype:

```text
make:controller has no --resorce option.
  → Did you mean --resource?
```

```text
make:migration needs <name>.
```

Both exit with code `1`.

## Prompts: questions, confirmations and choices

When a command runs without the arguments it needs, it can **ask** (Laravel Prompts' style: text, select, search, confirm, spinner, progress, table). In tests there's no keyboard, so the prompts are **faked**: each `expectsQuestion()` provides the answer, in order.

:::caution[Coming in 0.2]
**Planned API (a sketch).** The prompts API (`@strutvane/framework/console`) and its test fake are in the parity checklist for 0.2; the names below follow Laravel Prompts.
:::

```ts title="app/console/commands/team-invite.command.ts"
import { confirm, defineCommand, select, text } from '@strutvane/framework/console'

export const teamInviteCommand = defineCommand({
  name: 'team:invite',
  description: 'Invite someone to a team',
  async run({ output }) {
    const email = await text({ label: 'Email address?', required: true })
    const role = await select({ label: 'Role?', options: ['admin', 'member'] })
    if (!(await confirm({ label: `Invite ${email} as ${role}?` }))) return 1
    output.line(`Invitation sent to ${email}.`)
    return 0
  },
})
```

```ts title="tests/feature/team-invite.test.ts"
it('invites after confirmation', async () => {
  await strut(app, 'team:invite')
    .expectsQuestion('Email address?', 'grace@example.com')
    .expectsChoice('Role?', 'member', ['admin', 'member'])
    .expectsConfirmation('Invite grace@example.com as member?', 'yes')
    .expectsOutput('Invitation sent to grace@example.com.')
    .assertExitCode(0)
})

it('stops when the user says no', async () => {
  await strut(app, 'team:invite')
    .expectsQuestion('Email address?', 'grace@example.com')
    .expectsChoice('Role?', 'admin')
    .expectsConfirmation('Invite grace@example.com as admin?', 'no')
    .assertExitCode(1)
})
```

A question the test didn't expect fails the test (it never waits for a keyboard), and an expected question that's never asked fails it too.

### Without a terminal: `--no-interaction`

In CI and scripts there's nobody to answer. Commands then must not ask: they take every answer from arguments and options, and fail with a clear message when one is missing. Test that path too:

```ts
await strut(app, 'team:invite --no-interaction').expectsError('team:invite needs --email when it can\'t ask.').assertFailed()
```

## Testing a real process

Sometimes you want to be sure the command works the way a user starts it: through `node strut`, in a separate process, with the real `.env` handling. The prototype does this for a few critical paths:

```ts title="tests/feature/strut-process.test.ts"
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('node strut route:list works as a real process', () => {
  const result = spawnSync(process.execPath, ['strut.js', 'route:list', '--json'], { encoding: 'utf8', env: { ...process.env, APP_ENV: 'testing' } })
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout)).toContainEqual(expect.objectContaining({ name: 'posts.index' }))
})
```

These take about a second each (a cold `node strut` start), so keep them few.

## Platform and Docker differences

- **In-process tests** (`runConsole`, `strut()`) behave the same on Windows, macOS and Linux: no shell, no quoting.
- **Real-process tests** use `process.execPath` (the running Node) and an argument **array**, never a shell string, so PowerShell, cmd and bash all behave the same. (Node 24.3 or newer is required: earlier 24.x releases break arguments in PowerShell.)
- **Docker mode:** `npm test` runs inside the `app` container, so commands run there too, against the test database.

## Common mistakes

### The test hangs

**Why:** the command asked a question the test didn't answer, and something passed a real terminal to it.
**Fix:** use `strut()` (its prompt fake never waits) and add the missing `expectsQuestion()`.

### Generated file names differ on every run

**Why:** migration names contain the current time.
**Fix:** pass a fixed clock (`now` in `runConsole`, or `freezeTime()`).

### `expectsOutput` fails, but the text is clearly printed

**Why:** `expectsOutput` compares a **whole line**, and the command prints extra text on the same line (or the message went to the error stream).
**Fix:** use `expectsOutputToContain()`, or `expectsError()` for messages printed with `output.error()`.

### My command works in the terminal but exits 1 in the test

**Why:** the test app has `APP_ENV=testing` and a different database, so the command found no data, or a required `.env` key is missing in the test environment.
**Fix:** create the data the command needs in the test, and pass the settings it reads to `createApp()`.

## Next steps

- [CLI Reference](../cli-reference/): every built-in command.
- [Testing](../testing/): the kinds of tests and how to run them.
- [Mocking](../mocking/): freezing time and faking services.
- [Database Testing](../database-testing/): checking what a command changed.
