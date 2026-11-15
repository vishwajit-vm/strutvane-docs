---
title: "Processes"
description: "Run other programs (git, a database dump, an image tool) from your app safely, with no shell in between, time limits, several at once or piped together, and a fake for tests."
---

Sometimes your app needs another program: `git` to show which version is deployed, `mysqldump` to export a database, an image tool to shrink an upload. Starting another program from yours creates a **process** (a running program with its own memory). The program you start is the **child process**; your app is the **parent**.

Strutvane's `Process` runs child processes the safe way: the program and each argument are passed **separately, with no shell in between**, so nothing a user typed can turn into a second command. Every run has a **time limit**, and in tests you swap in a **fake** that records what would have run.

:::tip[Coming from Laravel?]
It's Laravel's `Process` facade: `Process::run()`, results with `successful()`, `output()` and `exitCode()`, timeouts, `Process::pool()`, `Process::pipe()` and `Process::fake()`, all as `Process.…`.

The difference: **there is no shell**. Laravel's `Process::run('ls -la')` passes a string to a shell; Strutvane takes the program and its arguments as a list, `Process.run(['ls', '-la'])`. That removes shell injection completely and works the same in PowerShell, cmd, bash and zsh, the same reason `node strut` has no shell wrapper.
:::

:::caution[Coming in 0.3]
`Process` is in **phase 2 of the roadmap (0.3)**. The design states: `Process.run()` with no shell, timeouts, a pool and a fake (Laravel parity checklist). Nothing is built yet.

**Planned API (a sketch: names may change before 0.3).** The method names, the result's fields, the option names and the error names below follow Laravel's and aren't final. Every "What you'll see" is "something like this".
:::

## The smallest example

Show the git commit the server is running:

```ts title="app/console/commands/version.ts"
import { defineCommand, Process } from '@strutvane/framework'

export default defineCommand({
  name: 'app:version',
  description: 'Show the deployed git commit',
  async run({ output }) {
    const result = await Process.run(['git', 'rev-parse', '--short', 'HEAD'])
    output.line(`Running commit ${result.output().trim()}`)
  },
})
```

```bash
node strut app:version
```

**What you'll see:**

```text
Running commit 3f9c2a1
```

`Process.run()` starts the program, waits for it to finish, and gives you a **result**: what it printed, what it printed as errors, and its **exit code** (a number every program returns when it ends: `0` means success, anything else means something went wrong).

## The result

| Call | Gives you | Example |
|---|---|---|
| `result.successful()` | `true` when the exit code is `0` | `true` |
| `result.failed()` | the opposite | `false` |
| `result.exitCode()` | the exit code | `0` |
| `result.output()` | everything printed on standard output (`stdout`) | `'3f9c2a1\n'` |
| `result.errorOutput()` | everything printed on standard error (`stderr`) | `''` |
| `result.throw()` | the result, or throws `ProcessFailedError` when it failed | — |

A program that runs but **fails** doesn't throw by itself: you get a result with a non-zero exit code, so you decide what a failure means. Call `.throw()` when any failure should stop your code:

```ts title="app/services/git-info.ts"
import { Process } from '@strutvane/framework'

export async function currentBranch(): Promise<string> {
  const result = (await Process.run(['git', 'branch', '--show-current'])).throw()
  return result.output().trim()
}
```

**What you'll see** outside a git repository:

```text
ProcessFailedError: The process "git branch --show-current" failed with exit code 128.
fatal: not a git repository (or any of the parent directories): .git
```

## Why there is no shell

A **shell** is the program that reads a command line like `ls -la; rm -rf /` and splits it into commands. Passing user input to a shell is the classic **command injection**: a file name such as `photo.jpg; rm -rf ~` becomes two commands.

With `Process`, each list item is one argument, delivered to the program exactly as written:

```ts title="app/services/thumbnails.ts"
import { Process } from '@strutvane/framework'

/** Shrinks an uploaded image. `path` may contain spaces, quotes or semicolons: they stay part of the name. */
export async function makeThumbnail(path: string, target: string): Promise<void> {
  await (await Process.run(['magick', path, '-resize', '320x320', target], { timeout: 30 })).throw()
}
```

**What you'll see:** a file called `holiday; rm -rf ~.jpg` is resized like any other, and nothing else runs, because there's no shell to read the `;`.

The trade-off: shell features don't exist. There's no `|`, `>`, `&&`, `*` or `$HOME`. Use [`Process.pipe()`](#piping-one-into-the-next) instead of `|`, write files from your own code instead of `>`, and expand paths in TypeScript. It also means a command behaves **identically on Windows, macOS and Linux**: no quoting rules differ, because nothing is quoted.

## Options

```ts title="app/services/exports.ts"
import { Process } from '@strutvane/framework'

const result = await Process.run(['node', 'scripts/build-report.js', '--month=2026-10'], {
  cwd: 'storage/app/reports',          // the folder the program starts in
  timeout: 120,                        // seconds; then the process is stopped
  env: { REPORT_LOCALE: 'en' },        // extra environment variables for the child
  input: 'yes\n',                      // text sent to the program's standard input
})
```

| Option | Meaning | Default |
|---|---|---|
| `cwd` | the working folder, relative to your project root | the project root |
| `timeout` | seconds before the process is stopped | a framework default (not decided yet); never "forever" |
| `env` | extra environment variables, added to the app's | none |
| `input` | text written to the program's standard input | none |

### Time limits

Every run has a time limit, so a hung program can't hang a request or a worker forever. When it runs out:

```ts title="app/services/exports.ts"
import { Process, ProcessTimedOutError } from '@strutvane/framework'

try {
  await Process.run(['node', 'scripts/slow-report.js'], { timeout: 5 })
} catch (error) {
  if (error instanceof ProcessTimedOutError) {
    // tell the user the report is taking too long; maybe queue it instead
  }
  throw error
}
```

**What you'll see:**

```text
ProcessTimedOutError: The process "node scripts/slow-report.js" exceeded the timeout of 5 seconds.
```

The child process is stopped, so nothing keeps running in the background after the error.

### Secrets: environment, not arguments

Pass passwords and API keys in `env`, never as arguments. On most systems anyone on the server can list running processes **with their arguments**, and errors such as `ProcessFailedError` repeat the command line.

```ts title="app/services/database-dump.ts"
import { Process } from '@strutvane/framework'

export async function dumpDatabase(target: string): Promise<void> {
  const result = await Process.run(
    ['mysqldump', '--host', process.env.DB_HOST ?? '127.0.0.1', '--user', process.env.DB_USERNAME ?? 'root', '--result-file', target, process.env.DB_DATABASE ?? 'app'],
    {
      timeout: 600,
      env: { MYSQL_PWD: process.env.DB_PASSWORD ?? '' },   // the password never appears in the command line
    },
  )
  result.throw()
}
```

Strutvane's log redaction hides values under secret-looking keys (passwords, tokens, keys), but it can't know that the fourth argument of your command is a password. Keep secrets out of arguments.

## Running in the background and waiting later

`Process.start()` starts a program and returns at once, so you can do other work and wait later:

```ts title="app/console/commands/rebuild-search.ts"
import { defineCommand, Process } from '@strutvane/framework'

export default defineCommand({
  name: 'search:rebuild',
  description: 'Rebuild the search index with the external indexer',
  async run({ output }) {
    const running = Process.start(['node', 'scripts/indexer.js', '--all'], { timeout: 900 })
    output.line('Indexer started…')
    const result = await running.wait()
    output.line(result.successful() ? 'Index rebuilt.' : `Indexer failed: ${result.errorOutput()}`)
  },
})
```

## Several at once: the pool

A **pool** runs several processes at the same time and waits for all of them. Useful for independent work, like making three image sizes:

```ts title="app/services/thumbnails.ts"
import { Process } from '@strutvane/framework'

export async function makeAllSizes(path: string): Promise<void> {
  const results = await Process.pool([
    ['magick', path, '-resize', '160x160', `${path}.small.jpg`],
    ['magick', path, '-resize', '320x320', `${path}.medium.jpg`],
    ['magick', path, '-resize', '1280x1280', `${path}.large.jpg`],
  ], { timeout: 60 })

  const failed = results.filter((result) => result.failed())
  if (failed.length > 0) throw new Error(`${failed.length} of 3 sizes failed`)
}
```

**What you'll see:** the three run side by side, so the whole thing takes about as long as the slowest one, not the sum. One failure doesn't stop the others; you get every result and decide.

## Piping one into the next

A **pipe** sends one program's output into the next program's input, what `|` does in a shell, without a shell:

```ts title="app/services/database-dump.ts"
import { Process } from '@strutvane/framework'

/** mysqldump | gzip, written to a file by your own code. */
export async function compressedDump(): Promise<Buffer> {
  const result = await Process.pipe([
    ['mysqldump', '--single-transaction', process.env.DB_DATABASE ?? 'app'],
    ['gzip', '-9'],
  ], { timeout: 600, env: { MYSQL_PWD: process.env.DB_PASSWORD ?? '' } })
  return result.throw().outputBuffer()
}
```

**What you'll see:** the compressed dump as bytes. If any program in the pipe fails, the pipe's result fails, with that program's error output.

## Inside requests and jobs

Starting a program is slow compared to a normal request (often tens of milliseconds just to start, more for the work). Two guidelines:

- **In a request,** keep it short and give it a small `timeout`. For anything that may take seconds, dispatch a [queued job](../queues/) and run the process there.
- **In a job,** set the job's own `timeout` a little longer than the process's, so the process is stopped (cleanly) before the worker gives up on the job.

## With Docker or without Docker

The program you run must exist **where your app runs**:

- **With Docker,** your app runs inside the `app` container, so `Process.run(['mysqldump', …])` needs `mysqldump` **inside the container**, not on your computer. Try it with `node strut shell`, then `which mysqldump`.
- **Without Docker,** it needs the program on your computer's `PATH`.
- **In production containers,** the image the installer writes starts from a slim Node image. Add the tools your app runs to your `Dockerfile` (for example with `apt-get install` in the final stage), or run that work elsewhere.

**Windows:** many command-line tools are installed as `.cmd` or `.bat` files (`npm` and `npx` are). Since its April 2024 security releases (CVE-2024-27980), Node refuses to start `.cmd` and `.bat` files without a shell. How `Process.run()` will start such programs on Windows isn't decided yet; prefer calling the real program (`node`, `git`, a `.exe`) directly, for example `['node', 'node_modules/some-tool/bin/cli.js']` instead of `['npx', 'some-tool']`.

**macOS / Linux:** programs are found on `PATH` as usual. A program that works in your terminal may not be on the `PATH` of a cron job or a service; pass the full path (`/usr/bin/mysqldump`) when in doubt.

## Testing with the fake

In tests you don't want to really run `mysqldump`. `Process.fake()` records every call and answers with what you tell it:

```ts title="tests/unit/git-info.test.ts"
import { describe, expect, it } from 'vitest'
import { Process } from '@strutvane/framework'
import { currentBranch } from '../../app/services/git-info.ts'

describe('currentBranch', () => {
  it('reads the branch from git', async () => {
    const processes = Process.fake({
      'git branch --show-current': Process.result({ output: 'main\n' }),
    })

    expect(await currentBranch()).toBe('main')
    processes.assertRan(['git', 'branch', '--show-current'])
  })

  it('fails clearly outside a repository', async () => {
    Process.fake({ 'git branch --show-current': Process.result({ exitCode: 128, errorOutput: 'fatal: not a git repository' }) })
    await expect(currentBranch()).rejects.toThrow('exit code 128')
  })
})
```

**What you'll see:** both tests pass without git being involved. A process that isn't listed in the fake fails the test, so a test can't start a real program by accident. See [Mocking](../mocking/).

## Common mistakes

### "No such file or directory" for a command that works in my terminal

```text
ProcessFailedError: The process "pg_dump app" could not be started: spawn pg_dump ENOENT
```

**Why:** the program isn't on the `PATH` where the app runs: inside the Docker container, in a cron job, or in the production image.
**Fix:** install it there, or use its full path:

```ts
await Process.run(['/usr/bin/pg_dump', 'app'])
```

### My pipe or redirect does nothing

**Why:** `['ls', '|', 'grep', 'x']` passes `|` to `ls` as a file name. There's no shell to understand it.
**Fix:** use `Process.pipe()`, and write files from your own code:

```ts
await Process.pipe([['ls'], ['grep', 'report']])
```

### A request hangs until the browser gives up

**Why:** the program waits for input or never finishes, and the timeout is too long for a request.
**Fix:** give it a short timeout and `input` if it asks a question, or move it to a queued job:

```ts
await Process.run(['node', 'scripts/report.js'], { timeout: 10, input: 'y\n' })
```

### The database password showed up in an error message

**Why:** it was passed as an argument, and errors repeat the command line.
**Fix:** pass it through `env`:

```ts
await Process.run(['mysqldump', 'app'], { env: { MYSQL_PWD: process.env.DB_PASSWORD ?? '' } })
```

### `npx` works on macOS but fails on Windows

**Why:** `npx` is a `.cmd` file on Windows, and Node doesn't start `.cmd` files without a shell.
**Fix:** call `node` with the tool's script directly, which works everywhere:

```ts
await Process.run(['node', 'node_modules/some-tool/bin/cli.js', '--help'])
```

## Next steps

- [Concurrency](../concurrency/): run your own TypeScript functions in parallel, not other programs.
- [Queues](../queues/): run slow processes in the background.
- [Console Commands](../strut-console/): write the `node strut` commands that call them.
- [Mocking](../mocking/): every fake for tests.
