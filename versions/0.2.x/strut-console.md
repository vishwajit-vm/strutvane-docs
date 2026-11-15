---
title: Strut Console
description: How `node strut` works (listing, help, typo hints, exit codes, Docker forwarding), and how to write, register and test your own commands with typed arguments and options.
---

`node strut` is your app's command line: Strutvane's `php artisan`. You use it to create files (`make:migration`), change the database (`migrate`), look inside the app (`route:list`, `about`) and run your own commands. This page explains how it works and how to add commands of your own. Every built-in command is listed in the [CLI Reference](../cli-reference/).

:::tip[Coming from Laravel?]
`php artisan <command>` is `node strut <command>`. `php artisan list` is `node strut list`, and commands are namespaced with a colon (`make:controller`, `route:list`) as in artisan.

The differences: a command is a plain object made with `defineCommand()`, not a class with a `$signature` string, so its arguments and options are **typed**; and inspection commands accept `--json` for scripts and AI agents.
:::

## The smallest example

From your project folder:

```bash
node strut list
```

**What you'll see** (shortened):

```text
Strutvane console. Usage: node strut <command> [arguments] [options]

Available commands:
  about            Show the app name, environment, database, routes and providers
  serve            Serve the application on the local HTTP server
 make
  make:controller  Create a new controller class
  make:migration   Create a migration (and the model, for create_*_table)
 model
  model:show       Show a model's columns, casts and API behaviour
 route
  route:list       List every registered route

Run `node strut help <command>` for details.
```

`node strut` with no command does the same as `node strut list`, and `help` is an alias for it.

## How `node strut` works

`strut.js` is a small file in your project's root folder:

```js title="strut.js"
// The project's command line, like Laravel's `artisan`. Run it from this folder:
//
//   node strut                     list every command
//   node strut route:list          show the routes
//   node strut help make:controller
//
// It is a plain .js file so `node strut` works the same in PowerShell, cmd and bash.
import { runConsole } from '@strutvane/framework/console'
import app from './bootstrap/app.ts'

process.exitCode = await runConsole(app, process.argv.slice(2))
```

Why a plain `.js` file run with `node`? It works the same in **PowerShell, cmd, bash and zsh**: there's no `.cmd` or `.ps1` wrapper, no PowerShell execution-policy prompt, no `--` rule, and no clash with a shell alias (0.1's `sv` clashed with PowerShell's built-in `sv`). `npx strutvane <command>` does exactly the same.

What happens when you type a command:

1. `runConsole` finds the command (core commands, then your app's and your packages', which may replace a core one with the same name).
2. It checks the arguments and options against the command's declaration.
3. It **boots** the app, the same boot a request gets: `.env` and config checked, providers run, routes compiled. Commands that only write files (`make:*`) skip this step, so they work before `.env` exists.
4. It runs the command inside the app, so `config()`, `route()` and models work.
5. It exits with the command's exit code.

## Getting help

```bash
node strut help make:controller
node strut make:controller --help     # the same
```

**What you'll see:**

```text
Create a new controller class

Usage: node strut make:controller <name> [options]

Arguments:
  name                The class name, ending in Controller (PostController) (required)

Options:
  -r, --resource      Write all 7 resource actions (index, create, store, show, edit, update, destroy)
  --api               Write the 5 API actions (no create/edit form pages)
  -m, --model=<value> Inherit the API actions from ResourceController for this model
  --force             Overwrite the file if it exists

Examples:
  node strut make:controller ReportController
  node strut make:controller PostController --resource
  node strut make:controller PostController --api
  node strut make:controller PostController --model=Post
```

Options with a value are written `--model=Post` or `--model Post`; short forms are `-m Post`.

## Typos and mistakes

Strutvane never answers a typo with a stack trace:

```bash
node strut rout:list
```

```text
  ✖ There is no "rout:list" command.
  → Did you mean `node strut route:list`?
```

Every developer mistake prints **what happened** (`✖`) and **how to fix it** (`→`):

```text
  ✖ make:controller has no --resouce option.
  → Did you mean --resource?
```

```text
  ✖ make:migration needs <name>.
  → Example: node strut make:migration <name>  (more: node strut help make:migration)
```

## Exit codes

| Code | Means |
|---|---|
| `0` | Success |
| `1` | A mistake you can fix (unknown command, bad option, a friendly error) |
| `3` | `migrate` couldn't reach the database (so the installer can offer Retry) |
| anything else | What your own command returned |

Scripts and CI can check them: `node strut route:list || echo "the app doesn't boot"`.

## Machine-readable output: `--json`

Inspection commands print JSON for scripts and AI agents:

```bash
node strut route:list --json
node strut about --json
node strut model:show Post --json
```

**What you'll see** (for `about --json`, shortened):

```json
{
  "application": { "name": "My App", "environment": "local", "debug": true, "url": "http://localhost:3000" },
  "runtime": { "node": "v24.21.0", "platform": "linux" },
  "http": { "routes": 15, "namedRoutes": 14 }
}
```

`about` never prints secrets: no keys, no passwords, no full database URLs, so it's safe to paste into a bug report.

## With Docker or without

| | With Docker | Without Docker |
|---|---|---|
| `node strut migrate` | Forwarded into the `app` container for you | Runs on your computer |
| `node strut shell` | A shell inside the app container (bash, or sh) | Not needed |
| `node strut npm install x` | npm **inside** the container (also `npx` and `node`) | Use `npm install x` |
| Arguments | Passed through exactly, with no shell (`a&b`, `$(…)`, `%PATH%` arrive as typed) | The same |
| Exit codes | Passed back from the container | — |

The forwarder in `strut.js` needs Node on your computer; nothing else does. See [Docker](../docker/).

## Writing your own command

A command is an object made with `defineCommand()`. Arguments and options are **data**, so `help`, validation and the option types all come from one place.

### Small: a command with no input

```ts title="app/console/inspire.command.ts"
import { defineCommand } from '@strutvane/framework/console'

export const inspire = defineCommand({
  name: 'inspire',
  description: 'Print a quote',
  run({ output }) {
    output.line('Simplicity is the soul of efficiency.')
  },
})
```

Register it in `bootstrap/app.ts` (Laravel's `routes/console.php`):

```ts title="bootstrap/app.ts"
import { inspire } from '../app/console/inspire.command.ts'

export default Application.configure({ basePath: dirname(import.meta.dirname) })
  // …the rest of your chain…
  .withCommands([inspire])
  .create()
```

```bash
node strut inspire
```

**What you'll see:**

```text
Simplicity is the soul of efficiency.
```

### Typical: arguments, options and the app

```ts title="app/console/posts-publish.command.ts"
import { defineCommand } from '@strutvane/framework/console'
import { Post } from '../models/post.ts'

export const publishPost = defineCommand({
  name: 'posts:publish',
  description: 'Publish a post by its slug',
  arguments: [{ name: 'slug', description: 'The post to publish (its slug)', required: true }],
  options: {
    dryRun: { type: 'boolean', short: 'd', description: 'Show what would change, change nothing' },
    note: { type: 'string', description: 'A note for the log' },
  },
  help: ['Examples:', '  node strut posts:publish hello-world', '  node strut posts:publish hello-world --dryRun'],
  async run({ args, options, output, now }) {
    const post = await Post.query().where('slug', args[0] ?? '').first()
    if (post === undefined) {
      output.error(`  ✖ No post has the slug "${args[0] ?? ''}".`)
      return 1
    }
    if (options.dryRun) {
      output.line(`  Would publish "${post.title}".`)
      return 0
    }
    await post.update({ status: 'published' })
    output.line(`  at ${now().toISOString()}`)
    output.line(`  Published "${post.title}"${options.note === undefined ? '' : ` (${options.note})`}.`)
    return 0
  },
})
```

Inside `run`:

| You get | Type |
|---|---|
| `args` | The positional arguments, as strings |
| `options.dryRun` | `boolean` (a boolean option) |
| `options.note` | `string \| undefined` (a string option) |
| `output.line(text)` / `output.error(text)` | Write to stdout / stderr |
| `now()` | The current time (fixed in tests) |
| `app` | The booted application |

The option types come from the declaration, so `options.nope` doesn't compile. Return a number to set the exit code; returning nothing means `0`.

```bash
node strut posts:publish hello-world --note "launch day"
```

**What you'll see:**

```text
  at 2026-11-14T10:00:00.000Z
  Published "Hello World" (launch day).
```

### Commands that only write files

Set `needsBoot: false` when the command doesn't need the app booted (it only writes files). It then runs even when `.env` is incomplete, like the `make:*` commands.

### Advanced: a command from a package

A package adds its commands from its service provider:

```ts title="node_modules/@acme/billing/src/billing.provider.ts"
import { ServiceProvider, type Application } from '@strutvane/framework'
import { billingSync } from './billing-sync.command.ts'

export class BillingServiceProvider extends ServiceProvider {
  override register(app: Application): void {
    app.addCommand(billingSync)
  }
}
```

An app or package command with the same name as a core command **replaces** it, on purpose. See [Service Providers](../providers/).

## Testing a command

`runConsole` returns the exit code instead of exiting, and takes an output buffer and a fixed clock:

```ts title="tests/console/inspire.test.ts"
import { expect, test } from 'vitest'
import { runConsole } from '@strutvane/framework/console'
import { createApp } from '../../bootstrap/app.ts'

test('inspire prints a quote', async () => {
  const lines: string[] = []
  const output = { line: (text = '') => lines.push(text), error: (text: string) => lines.push(text) }
  const app = createApp({ APP_ENV: 'testing', APP_KEY: 'test-key', DB_CONNECTION: 'sqlite' })

  const code = await runConsole(app, ['inspire'], { output, now: () => new Date('2026-11-14T10:00:00Z') })

  expect(code).toBe(0)
  expect(lines).toEqual(['Simplicity is the soul of efficiency.'])
})
```

**What you'll see** with `npm test`: the test passes.

:::caution[Coming in 0.2]
A friendlier console test API is planned (Laravel's `expectsQuestion()`, `expectsOutput()`, `assertExitCode()`), as `strut('posts:publish hello-world').expectsOutput('…').assertExitCode(0)`. Today, use `runConsole` as above.
:::

## Coming next

:::caution[Coming in 0.2]
In the 0.2 plan (Laravel parity matrix), not built yet:
- `node strut make:command PostsPublish` writes a command file for you.
- **Prompts** in your commands: text, select, search, confirm, spinner, progress bar and table, with a fake for tests. See [Prompts](../prompts/).
- `node strut lint` and `node strut format` run the Biome config every app ships with (Laravel's Pint).
- `node strut publish <package> --tag=config` (or `migrations`, `views`) copies a package's files into your app so you can change them (Laravel's `vendor:publish`).
- Run with no arguments, `make:*` commands ask their questions interactively.
:::

:::caution[Coming in 0.3]
**Isolated commands** (`isolated: true`): only one copy of the command runs at a time, guarded by a lock, so two cron jobs can't overlap. And handling **signals** (Ctrl+C, a container stop) in your own long-running commands, to finish cleanly.
:::

## Speed

In the prototype, a cold `node strut route:list` takes 0.75 to 1.0 seconds, most of it loading TypeScript files. Loading command modules only when they run, and shipping the framework as compiled JavaScript, are the planned fixes; the target is under 300 ms *(unverified until built)*. See [Optimization](../optimization/).

## Common mistakes

### "Cannot find module '…\strut'"

```text
Error: Cannot find module 'C:\Users\you\strut'
```

**Why:** `strut.js` is in your project folder, and you ran `node strut` from somewhere else.
**Fix:** `cd my-app` first.

### My command isn't in `node strut list`

**Why:** it isn't registered.
**Fix:** add it to `.withCommands([...])` in `bootstrap/app.ts` (or `app.addCommand()` in a provider's `register()`).

### My command fails with environment errors, but it only writes a file

```text
  ✖ The app can't start: 1 environment variable needs attention.
  - APP_KEY is required (a text value); add it to .env (read in config/app.ts)
  → Fix the values in .env (see .env.example for every key) and start again.
```

**Why:** commands boot the app by default, and boot checks `.env`.
**Fix:** add `needsBoot: false` to a command that doesn't need the app.

### `sv` or `strut` "is not recognized as a command"

**Why:** there's no global `strut` command; it's always `node strut` (or `npx strutvane`). `sv` was 0.1's name.
**Fix:** `node strut <command>`.

### PowerShell swallows my quotes

**Why:** PowerShell and bash quote differently, and some characters (`&`, `|`, `$`) mean something to the shell before Node sees them.
**Fix:** wrap such arguments in single quotes in PowerShell (`'a&b'`) and bash alike. `node strut` passes them on unchanged, also into Docker.

## Next steps

- [CLI Reference](../cli-reference/): every built-in command.
- [Prompts](../prompts/): asking questions in your commands.
- [Service Providers](../providers/): commands from packages.
- [Task Scheduling](../scheduling/): running commands on a schedule.
