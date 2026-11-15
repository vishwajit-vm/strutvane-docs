/**
 * Friendly build errors.
 *
 * Every problem the docs build can detect (a page missing from the navigation, a broken
 * version list, a git branch that does not exist…) is thrown as a {@link DocsBuildError}:
 * a plain-words message that says what is wrong, plus a hint that says how to fix it.
 * The command-line scripts print both and exit with code 1, instead of a stack trace.
 */

/**
 * An error the person running the build can fix themselves.
 *
 * Why a dedicated class: scripts catch it and print `message` + `hint` nicely, while any
 * other error (a real bug) still shows its full stack trace.
 *
 * @example
 * ```ts
 * throw new DocsBuildError(
 *   'Version "0.3" has no navigation.json.',
 *   'Create versions/0.3.x/navigation.json (copy the one from versions/0.2.x to start).',
 * )
 * ```
 */
export class DocsBuildError extends Error {
  /** What to do about it, in one or two sentences. */
  readonly hint: string

  constructor(message: string, hint: string) {
    super(message)
    this.name = 'DocsBuildError'
    this.hint = hint
  }
}

/**
 * Turns any thrown value into text for the terminal.
 *
 * Why: a {@link DocsBuildError} is expected and gets a short, friendly layout; anything else
 * is unexpected, so we keep the stack trace to make the bug easy to find.
 *
 * @example
 * ```ts
 * try { build() } catch (error) { console.error(describeError(error)); process.exitCode = 1 }
 * ```
 */
export function describeError(error: unknown): string {
  if (error instanceof DocsBuildError) {
    return `\n✘ ${error.message}\n  → ${error.hint}\n`
  }
  if (error instanceof Error) {
    return `\n✘ Unexpected error (this is probably a bug in the docs scripts):\n${error.stack ?? error.message}\n`
  }
  return `\n✘ Unexpected error: ${String(error)}\n`
}
