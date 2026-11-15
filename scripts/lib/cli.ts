/**
 * Small helpers shared by the command-line scripts (`build`, `dev`, `preview`, `check:links`).
 */
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { DocsBuildError, describeError } from './errors.ts'

/**
 * Runs a script's main function and turns any error into a friendly message and exit code 1.
 *
 * Why: every script then fails the same way, and a {@link DocsBuildError} shows its hint
 * instead of a stack trace.
 *
 * @example
 * ```ts
 * runMain(async () => { await build() })
 * ```
 */
export function runMain(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    console.error(describeError(error))
    process.exitCode = 1
  })
}

/**
 * Runs the Astro CLI from this project's `node_modules`, with extra environment variables.
 *
 * Why spawn instead of Astro's JavaScript API: each version is built in a fresh process, so
 * nothing (module caches, Vite plugins, the content store) can leak from one version's build
 * into the next. That also mirrors the real setup, where each branch builds on its own.
 * No shell is involved, so paths with spaces and Windows both just work.
 *
 * @example
 * ```ts
 * await runAstro(root, ['build'], { DOCS_VERSION: '0.1.x' })
 * ```
 */
export function runAstro(root: string, args: readonly string[], env: Readonly<Record<string, string>>): Promise<void> {
  const astro = join(root, 'node_modules', 'astro', 'bin', 'astro.mjs')
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [astro, ...args], { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolve()
      else {
        reject(new DocsBuildError(
          `astro ${args.join(' ')} failed for docs version "${env['DOCS_VERSION'] ?? 'current'}" (${signal ?? `exit code ${code}`}).`,
          'Read the Astro error printed above; it names the page and line. Then run the command again.',
        ))
      }
    })
  })
}

/**
 * Reads `--name value` (or `--name=value`) from the command line.
 *
 * @example
 * ```ts
 * // node scripts/dev.ts --version 0.1.x
 * readFlag(process.argv.slice(2), 'version') // '0.1.x'
 * ```
 */
export function readFlag(args: readonly string[], name: string): string | undefined {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === `--${name}`) return args[index + 1]
    if (arg?.startsWith(`--${name}=`)) return arg.slice(name.length + 3)
  }
  return undefined
}
