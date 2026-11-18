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

What's different: commands are typed objects made with `defineCommand()` (no `$signature` string to parse), and there's a lower-level `runCli()` you can call today.
:::

:::caution[What exists, and when]
- **On framework `main` (0.2.0-next.0, not on npm yet):** commands as `defineCommand({ name, description, args, flags, run })` from `@strutvane/framework/console`, registered with `withCommands([...])` in `bootstrap/app.ts`; `node strut make:command`; and `runCli({ argv, builtins, streams })`, which runs a command line in-process, returns its exit code and captures output through your own streams; typed flags; friendly errors for unknown commands and options.
- **Coming in 0.2:** the fluent `strut()` test helper (`expectsQuestion()`, `expectsOutput()`, `assertExitCode()`…) and the console prompts API with its test fake.

**Planned API (a sketch: names may change).** The fluent helper's name comes from the parity checklist (`strut('cmd').expectsQuestion()…`); the rest follows Laravel.
:::

## The smallest example (works today)

Run `route:list --json` in-process and check its output:

```ts title="tests/feature/route-list.test.ts"
import { expect, it } from 'vitest'
import { BUILTIN_COMMANDS, runCli } from '@strutvane/framework/console'

it('lists the hello route as JSON', async () => {
  const out: string[] = []
  const err: string[] = []

  const exitCode = await runCli({
    argv: ['route:list', '--json', '--name=hello'],
    builtins: BUILTIN_COMMANDS,
    streams: { stdout: (text) => out.push(text), stderr: (text) => err.push(text) },
  })

  expect(exitCode).toBe(0)
  const result = JSON.parse(out.join(''))
  expect(result.data.routes).toContainEqual(
    expect.objectContaining({ method: 'GET', uri: '/api/hello', name: 'hello', middleware: ['csrf', 'throttle:api'] }),
  )
})
```

**What you'll see:**

```text
 ✓ tests/feature/route-list.test.ts (1 test) 120ms
```

`runCli()` returns the exit code instead of ending the process, and writes into your streams instead of the terminal: that's what makes commands testable. With `--json`, every command prints one document: `{ "schemaVersion": 1, "ok": true, "command": "route:list", "exitCode": 0, "data": { … }, "warnings": [] }`. It runs in the current folder (pass `cwd` for another) with `APP_ENV` from the environment.

## The fluent helper: `strut()`

:::caution[Coming in 0.2]
**Planned API (a sketch).** `strut()` wraps `runCli()` with Laravel-style expectations.
:::

```ts title="tests/feature/make-migration.test.ts"
import { strut } from '@strutvane/framework/testing'
import { it } from 'vitest'

it('creates a posts migration, model, factory and seeder', async () => {
  await strut(app, 'make:migration create_posts_table --seeder')
    .expectsOutputToContain('database/migrations/2026_11_15_100000_create_posts_table.ts')
    .expectsOutputToContain('app/models/post.ts')
    .expectsOutputToContain('database/factories/post.factory.ts')
    .expectsOutputToContain('database/seeders/post.seeder.ts')
    .expectsOutput('Next: node strut migrate')
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
Error: Expected the output "Next: node strut migrate", but the command printed:
  error Missing required argument <name>.
  hint: Usage: node strut make:migration <name> [flags]
```

### Fixed time for generated file names

Migration file names start with the date and time (UTC), so they differ on every run. Until the fluent helper's `freezeTime()` lands (see [Mocking](../mocking/)), match the name with a pattern instead of the exact text:

```ts
expect(out.join('')).toMatch(/database\/migrations\/\d{4}_\d{2}_\d{2}_\d{6}_create_posts_table\.ts/)
```

## Testing your own command

A command is a typed object. `node strut make:command ArchiveDrafts --command=posts:archive-drafts` writes the file; here it is filled in, archiving old drafts:

```ts title="app/console/commands/archive-drafts.command.ts"
import { defineCommand } from '@strutvane/framework/console'
import { Post } from '../../models/post.ts'

export const archiveDraftsCommand = defineCommand({
  name: 'posts:archive-drafts',
  description: 'Archive drafts not touched for a number of days',
  flags: {
    days: { type: 'string', default: '90', description: 'Age in days' },
    dry: { type: 'boolean', description: 'Only count, change nothing' },
  },
  async run({ flags, out }) {
    const days = Number(flags.days)
    if (!Number.isInteger(days) || days < 1) {
      out.warn(`--days must be a whole number of days, got "${flags.days}".`)
      return { exitCode: 2 }
    }
    const before = new Date(Date.now() - days * 86_400_000)
    const drafts = await Post.query().where('status', 'draft').where('updated_at', '<', before).get()
    if (flags.dry) {
      out.line(`${drafts.length} drafts would be archived.`)
      return { data: { count: drafts.length } }
    }
    for (const post of drafts) {
      post.status = 'archived'
      await post.save()
    }
    out.success(`Archived ${drafts.length} drafts.`)
    return { data: { count: drafts.length } }
  },
})
```

Register it in `bootstrap/app.ts` with `.withCommands([archiveDraftsCommand])`. A command returns `{ data }` (what `--json` prints) and, when it needs attention, an `exitCode`.

Test the dry run and the failure path with `runCli()` *(unverified: app commands through an in-process `runCli()` aren't covered by a framework test)*:

```ts title="tests/feature/archive-drafts.test.ts"
import { describe, expect, it } from 'vitest'
import { BUILTIN_COMMANDS, runCli } from '@strutvane/framework/console'

async function strut(...argv: string[]): Promise<{ exitCode: number; output: string }> {
  const lines: string[] = []
  const write = (text: string): void => {
    lines.push(text)
  }
  const exitCode = await runCli({ argv, builtins: BUILTIN_COMMANDS, streams: { stdout: write, stderr: write } })
  return { exitCode, output: lines.join('') }
}

describe('posts:archive-drafts', () => {
  it('changes nothing in a dry run', async () => {
    const { exitCode, output } = await strut('posts:archive-drafts', '--dry')
    expect(exitCode).toBe(0)
    expect(output).toContain('would be archived')
  })

  it('refuses a bad --days', async () => {
    const { exitCode, output } = await strut('posts:archive-drafts', '--days=soon')
    expect(exitCode).toBe(2)
    expect(output).toContain('--days must be a whole number of days, got "soon".')
  })
})
```

With the planned fluent helper, the same tests read `await strut(app, 'posts:archive-drafts --dry').expectsOutputToContain('would be archived').assertSuccessful()`. Then check the database as in [Database Testing](../database-testing/).

### Unknown commands and options

The console already explains typos, and you can test that your command's options are spelled as you think:

```text
error Unknown option '--pathh'.
hint: Run `node strut help route:list` to see its flags.
```

```text
error Missing required argument <name>.
hint: Usage: node strut make:migration <name> [flags]
```

Both exit with code `2` (a usage error; see the [CLI Reference](../cli-reference/) for every exit code).

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

### Without a terminal: `--no-interactive`

In CI and scripts there's nobody to answer. Commands then must not ask: they take every answer from arguments and flags, and fail with a clear message when one is missing (`--no-interactive` is a global flag every command accepts). Test that path too:

```ts
await strut(app, 'team:invite --no-interactive').expectsError('team:invite needs --email when it can\'t ask.').assertFailed()
```

## Testing a real process

Sometimes you want to be sure the command works the way a user starts it: through `node strut`, in a separate process, with the real `.env` handling. The prototype does this for a few critical paths:

```ts title="tests/feature/strut-process.test.ts"
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('node strut route:list works as a real process', () => {
  const result = spawnSync(process.execPath, ['strut.js', 'route:list', '--json'], { encoding: 'utf8', env: { ...process.env, APP_ENV: 'testing' } })
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout).data.routes).toContainEqual(expect.objectContaining({ name: 'hello' }))
})
```

These take a second or more each (a cold `node strut` start), so keep them few. The prototype ran these for a few critical paths; on framework `main` the `--json` shape above is real.

## Platform and Docker differences

- **In-process tests** (`runCli`, `strut()`) behave the same on Windows, macOS and Linux: no shell, no quoting.
- **Real-process tests** use `process.execPath` (the running Node) and an argument **array**, never a shell string, so PowerShell, cmd and bash all behave the same. (Node 24.3 or newer is required: earlier 24.x releases break arguments in PowerShell.)
- **Docker mode:** `npm test` runs inside the `app` container, so commands run there too, against the test database.

## Common mistakes

### The test hangs

**Why:** the command asked a question the test didn't answer, and something passed a real terminal to it.
**Fix:** use `strut()` (its prompt fake never waits) and add the missing `expectsQuestion()`.

### Generated file names differ on every run

**Why:** migration names contain the current time.
**Fix:** match the name with a pattern today; the fluent helper's `freezeTime()` (planned) fixes it.

### `expectsOutput` fails, but the text is clearly printed

**Why:** `expectsOutput` compares a **whole line**, and the command prints extra text on the same line (or the message went to the error stream).
**Fix:** use `expectsOutputToContain()`, or `expectsError()` for messages printed on the error stream (`out.info()`, `out.warn()`).

### My command works in the terminal but exits 1 in the test

**Why:** the test app has `APP_ENV=testing` and a different database, so the command found no data, or a required `.env` key is missing in the test environment.
**Fix:** create the data the command needs in the test, and set the settings it reads in `vitest.config.ts` (`test.env`).

## Next steps

- [CLI Reference](../cli-reference/): every built-in command.
- [Testing](../testing/): the kinds of tests and how to run them.
- [Mocking](../mocking/): freezing time and faking services.
- [Database Testing](../database-testing/): checking what a command changed.
