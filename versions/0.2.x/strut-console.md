---
title: Strut Console
description: How `node strut` works (listing, help, typo hints, exit codes, JSON output), and how to write, register and test your own commands with typed arguments and flags.
---

`node strut` is your app's command line: Strutvane's `php artisan`. You use it to create files (`make:migration`), change the database (`migrate`), look inside the app (`route:list`, `about`) and run your own commands. This page explains how it works and how to add commands of your own. Every built-in command is listed in the [CLI Reference](../cli-reference/).

:::tip[Coming from Laravel?]
`php artisan <command>` is `node strut <command>`. `php artisan list` is `node strut list`, `php artisan make:command` is `node strut make:command`, and commands are namespaced with a colon (`make:migration`, `route:list`) as in artisan.

The differences: a command is a plain object made with `defineCommand()`, not a class with a `$signature` string, so its arguments and flags are **typed**; you register it with `.withCommands([...])` in `bootstrap/app.ts` (Laravel's `routes/console.php`); and every command accepts `--json` for scripts and AI agents.
:::

## The smallest example

From your project folder:

```bash
node strut list
```

**What you'll see** (shortened):

```text
strutvane 0.2.0-next.0: the Strutvane command line

Usage: node strut <command> [arguments] [flags]

Commands:
  about        Show versions of the CLI, Node.js and installed Strutvane packages
  migrate      Diff models with the database, write a migration and apply it
  start        Start the app server (the API, and the built UI from dist/web when present)

make:
  make:command    Create a console command in app/console/commands
  make:migration  Create a migration (and, for create_*_table, its model)

route:
  route:list   List every route of the app (--security: protections, opt-outs, warnings)

Run `node strut help <command>` for details. Colon names also work with spaces: `node strut make model`.
```

`node strut` with no command does the same as `node strut list`, and `help` with no command name is an alias for it.

## How `node strut` works

The command line ships inside `@strutvane/framework`, as the `strutvane` program. So `npx strutvane <command>` works in any project that depends on the framework.

:::caution[Coming in 0.2]
`strut.js`, the small file in your project's root folder that makes `node strut` work, is written by the 0.2 installer (`create-strutvane`). It's a plain `.js` file run with `node`, so it works the same in **PowerShell, cmd, bash and zsh**: no `.cmd` or `.ps1` wrapper, no PowerShell execution-policy prompt, no `--` rule, and no clash with a shell alias (0.1's `sv` clashed with PowerShell's built-in `sv`). It hands every framework command to the installed framework's `strutvane` program, passing your arguments unchanged and returning its exit code; in Docker mode it first forwards the command into the app container (see [Docker](../docker/)). Until the installer ships, use `npx strutvane <command>`.
:::

What happens when you type a command:

1. The command line finds your project (the nearest folder whose `package.json` lists `@strutvane/framework`).
2. It collects the commands: the built-in ones, the ones your installed packages contribute (the framework itself adds `migrate`, `db:seed`, `start`, `dev`, `build` and `sync` this way), and your app's own, from `bootstrap/app.ts`. A package or app command with the same name as a built-in one replaces it.
3. It checks the arguments and flags against the command's declaration, and stops with exit code `2` on a mistake.
4. It runs the command and exits with its exit code.

Commands that need the app (`route:list`, `optimize`, `down`…) boot it themselves, so a bad `.env` value or a weak `APP_KEY` stops them with a clear message. `make:*` commands don't, so they work before `.env` exists.

## Getting help

```bash
node strut help make:migration
node strut make:migration --help     # the same
```

**What you'll see** (shortened):

```text
make:migration

Create a migration (and, for create_*_table, its model)

Usage: node strut make:migration <name> [flags]

Arguments:
  name  snake_case, e.g. create_posts_table or add_subtitle_to_posts_table

Flags:
  --seeder         Also create the seeder and its factory, and register the seeder
  --factory        Also create the factory

Examples:
  node strut make:migration create_posts_table --seeder
  node strut make:migration add_subtitle_to_posts_table
```

Flags with a value are written `--table=posts` or `--table posts`. A command group on its own lists the group: `node strut make`.

## Typos and mistakes

Strutvane never answers a typo with a stack trace. Every mistake prints **what happened** (`error`) and **how to fix it** (`hint`):

```bash
node strut rotue:list
```

```text
error Unknown command "rotue:list".
  - Did you mean `node strut route:list`?
hint: Run `node strut help` to see every command.
```

```text
error Unknown option '--pathh'.
hint: Run `node strut help route:list` to see its flags.
```

```text
error Missing required argument <name>.
hint: Usage: node strut make:migration <name> [flags]
```

An unambiguous abbreviation runs the command (`node strut m:st` runs `migrate:status`), except for destructive commands, which must be typed in full.

## Exit codes

| Code | Means |
|---|---|
| `0` | Success |
| `1` | A general failure (an unexpected error, a failed child process) |
| `2` | Invalid usage: an unknown command or flag, a bad or missing argument |
| `3` | Validation failed: a bad `.env` value, a boot error, failed checks |
| `4` | Conflict: a file you changed would be overwritten |
| `5` | A database error |
| `6` | Something is pending (a stale registry with `registry:build --check`) |
| `7` | Incompatible package versions |
| `130` | Interrupted with <kbd>Ctrl</kbd>+<kbd>C</kbd> |

Scripts and CI can check them: `node strut route:list || echo "the app doesn't boot"`.

## Machine-readable output: `--json`

Every command prints one JSON document with `--json`, for scripts and AI agents:

```bash
node strut route:list --json
node strut about --json
```

The document is always the same envelope: `schemaVersion`, `ok`, `command`, `exitCode`, the command's `data` and any `warnings`. See the example under [Typical: arguments, flags and output](#typical-arguments-flags-and-output).

`about` never prints secrets: no keys, no passwords, no full database URLs, so it's safe to paste into a bug report.

## Writing your own command

A command is an object made with `defineCommand()` from `@strutvane/framework/console`. Its arguments and flags are **data**, so `help`, validation and the TypeScript types all come from one place.

### Small: generate one

```bash
node strut make:command SendReports
```

**What you'll see:**

```text
  create app/console/commands/send-reports.command.ts
Next: register it in bootstrap/app.ts with .withCommands([sendReportsCommand]), then run node strut app:send-reports
```

The file it writes:

```ts title="app/console/commands/send-reports.command.ts"
import { defineCommand } from '@strutvane/framework/console'

/**
 * `node strut app:send-reports`: describe what it does here.
 *
 * Register it in bootstrap/app.ts: `.withCommands([sendReportsCommand])`.
 * Run it with `node strut app:send-reports`; `node strut help app:send-reports` shows its arguments and flags.
 */
export const sendReportsCommand = defineCommand({
  name: 'app:send-reports',
  description: 'Describe what app:send-reports does',
  args: {
    // recipient: { required: true, description: 'Who gets the report' },
  },
  flags: {
    // preview: { type: 'boolean', description: 'Print instead of sending' },
  },
  examples: ['node strut app:send-reports'],
  async run({ out }) {
    // ctx.args and ctx.flags are typed from the declarations above.
    out.success('app:send-reports finished.')
    return { data: {} }
  },
})
```

`--command=reports:send` picks another name to run it by. Register it in `bootstrap/app.ts`, Laravel's `routes/console.php`:

```ts title="bootstrap/app.ts"
import { dirname } from 'node:path'
import { Application } from '@strutvane/framework'
import { sendReportsCommand } from '../app/console/commands/send-reports.command.ts'
import api from '../routes/api.ts'
import web from '../routes/web.ts'

export default Application.configure({ basePath: dirname(import.meta.dirname) })
  .withRouting({ web, api, health: '/up' })
  .withCommands([sendReportsCommand])
  .create()
```

```bash
node strut app:send-reports
```

**What you'll see:**

```text
✔ app:send-reports finished.
```

### Typical: arguments, flags and output

```ts title="app/console/commands/posts-report.command.ts"
import { defineCommand } from '@strutvane/framework/console'

export const postsReportCommand = defineCommand({
  name: 'posts:report',
  description: 'Print a report for one author',
  args: {
    author: { required: true, description: 'The author to report on' },
  },
  flags: {
    format: { type: 'string', choices: ['text', 'csv'], default: 'text', description: 'How to print it' },
    preview: { type: 'boolean', short: 'p', description: 'Show what would be printed, print nothing' },
  },
  examples: ['node strut posts:report ada', 'node strut posts:report ada --format=csv'],
  run({ args, flags, out }) {
    if (flags.preview) {
      out.info(`Would print the ${flags.format} report for ${args.author}.`)
      return
    }
    out.table(['Author', 'Format'], [[args.author, flags.format]])
    out.success(`Report for ${args.author} printed.`)
    return { data: { author: args.author, format: flags.format } }
  },
})
```

Add it to `.withCommands([...])` as above, then:

```bash
node strut posts:report ada
```

**What you'll see:**

```text
Author  Format
ada     text
✔ Report for ada printed.
```

And with `--json`:

```json
{
  "schemaVersion": 1,
  "ok": true,
  "command": "posts:report",
  "exitCode": 0,
  "data": {
    "author": "ada",
    "format": "text"
  },
  "warnings": []
}
```

`node strut help posts:report` is built from the same declaration:

```text
posts:report

Print a report for one author

Usage: node strut posts:report <author> [flags]

Arguments:
  author  The author to report on

Flags:
  --format <value>  How to print it (one of: text, csv; default: text)
  -p, --preview     Show what would be printed, print nothing

Global flags: --json --dry-run --diff --yes --force --cwd <path> --no-color (node strut help)

Examples:
  node strut posts:report ada
  node strut posts:report ada --format=csv

Provided by bootstrap/app.ts
```

What a declaration can say:

| Field | What it does |
|---|---|
| `name` | The colon-separated name, lowercase (`posts:report`) |
| `description` | One line, shown in `node strut list` |
| `details` | Longer help, shown in `node strut help <name>` |
| `args` | Positional arguments by name: `{ required?, variadic?, description? }` |
| `flags` | Flags by name: `{ type: 'boolean' \| 'string', short?, default?, choices?, multiple?, description? }` |
| `examples` | Example lines for the help |
| `aliases` | Other names it answers to |
| `destructive` | `true` applies the production guard (`--force --i-understand` outside local and test environments) |
| `hidden` | `true` leaves it out of `node strut list` |

What `run` receives, among other things:

| You get | What it is |
|---|---|
| `args.author` | The argument's value, typed from `args`: `string` when `required`, `string \| undefined` otherwise, `string[]` when `variadic` |
| `flags.format`, `flags.preview` | The flags, typed from `flags` (`string`, `boolean`) |
| `out.line()`, `out.success()`, `out.info()`, `out.warn()`, `out.table()` | Output that respects `--quiet`, `--json` and `--no-color` |
| `prompt` | Questions to ask the user (see [Prompts](../prompts/)) |
| `appEnv` | `APP_ENV` as the app will see it |
| `guardDestructive()` | Apply the production guard in a command that is only sometimes destructive |
| `cwd`, `project` | The working folder and your project |

Return nothing for exit code `0`, or `{ data, exitCode }`: `data` becomes the `data` of the `--json` document, and `exitCode` sets the exit code when the command finished but needs attention (for example `3` for failed checks). A value that breaks a rule is refused before `run` starts:

```bash
node strut posts:report ada --format=xml
```

```text
error --format must be one of: text, csv (got "xml").
```

### Advanced: commands from a package

A package contributes commands by declaring a module in its `package.json`, the same way the framework adds `migrate`:

```json title="node_modules/@acme/billing/package.json (excerpt)"
{
  "name": "@acme/billing",
  "strutvane": {
    "commands": "./dist/commands.mjs",
    "compat": "^0.2.0-next.0"
  }
}
```

The module's default export is a command or a list of commands. They're loaded only from direct dependencies with an `@strutvane/` or `strutvane-plugin-` name; a package outside `@strutvane/` must declare `strutvane.compat`, and one whose range doesn't match your framework version is skipped (`node strut doctor` says why). One broken package never stops the other commands from working.

## Testing a command

:::caution[Coming in 0.2]
A console test helper is planned (Laravel's `expectsQuestion()`, `expectsOutput()`, `assertExitCode()`), as `strut('posts:report ada').expectsOutput('…').assertExitCode(0)`. Until then, run the command as a child process and check its output and exit code, as below. See [Console Tests](../console-tests/).
:::

```ts title="tests/console/posts-report.test.ts"
import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'

test('posts:report prints JSON for one author', () => {
  const stdout = execFileSync(process.execPath, ['strut', 'posts:report', 'ada', '--json'], { encoding: 'utf8' })
  const result = JSON.parse(stdout)

  expect(result.ok).toBe(true)
  expect(result.data).toEqual({ author: 'ada', format: 'text' })
})
```

**What you'll see** with `npm test`: the test passes. `--json` makes the output easy to check without depending on colours or wording.

## Coming next

:::caution[Coming in 0.2]
In the 0.2 plan (Laravel parity matrix), not built yet:
- **Prompts** in your commands: text, select, search, confirm, spinner, progress bar and table, with a fake for tests. See [Prompts](../prompts/).
- Commands a service provider registers with `app.addCommand()` in `register()`. Today only the app's own `.withCommands([...])` commands are in the CLI.
- `node strut lint` and `node strut format` run the Biome config every app ships with (Laravel's Pint).
- `node strut publish <package> --tag=config` (or `migrations`, `views`) copies a package's files into your app so you can change them (Laravel's `vendor:publish`).
:::

:::caution[Coming in 0.3]
**Isolated commands** (`isolated: true`): only one copy of the command runs at a time, guarded by a lock, so two cron jobs can't overlap. And handling **signals** (Ctrl+C, a container stop) in your own long-running commands, to finish cleanly.
:::

## Common mistakes

### "Cannot find module '…\strut'"

```text
Error: Cannot find module 'C:\Users\you\strut'
```

**Why:** `strut.js` is in your project folder, and you ran `node strut` from somewhere else.
**Fix:** `cd my-app` first.

### My command isn't in `node strut list`

**Why:** it isn't registered, or `bootstrap/app.ts` can't be imported (a syntax error, a missing file).
**Fix:** add it to `.withCommands([...])` in `bootstrap/app.ts`, then run `node strut list` again; an import error is printed there.

### "Missing required argument"

```text
error Missing required argument <author>.
hint: Usage: node strut posts:report <author> [flags]
```

**Why:** the declaration marks `author` as `required`, and the command line didn't give it.
**Fix:** pass it (`node strut posts:report ada`), or drop `required: true` and handle the missing value in `run`.

### `sv` or `strut` "is not recognized as a command"

**Why:** there's no global `strut` command; it's always `node strut` (or `npx strutvane`). `sv` was 0.1's name.
**Fix:** `node strut <command>`.

### PowerShell swallows my quotes

**Why:** PowerShell and bash quote differently, and some characters (`&`, `|`, `$`) mean something to the shell before Node sees them.
**Fix:** wrap such arguments in single quotes in PowerShell (`'a&b'`) and bash alike. `node strut` passes them on unchanged.

## Next steps

- [CLI Reference](../cli-reference/): every built-in command.
- [Prompts](../prompts/): asking questions in your commands.
- [Console Tests](../console-tests/): testing commands.
- [Task Scheduling](../scheduling/): running commands on a schedule.
