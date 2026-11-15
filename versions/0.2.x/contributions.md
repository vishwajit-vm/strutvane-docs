---
title: "Contribution Guide"
description: "Help improve Strutvane: report a bug, fix one, improve these docs, propose a feature, or report a security issue privately, with the right branch, commit format, tests and sign-off for each."
---

Strutvane is MIT-licensed and built in the open. Every kind of help counts: a clear bug report, a one-word docs fix, a failing test, a new feature, a review. This page tells you **where** each kind of change goes and **what** a pull request needs to be merged quickly.

You don't need to be a TypeScript expert to contribute. Fixing a confusing sentence on this site is a real contribution, and it starts from the **Edit this page** link at the bottom of every page.

:::tip[Coming from Laravel?]
The rules are Laravel's:
- **bug fixes** go to the oldest supported line that has the bug (`0.2.x`), and are merged up into newer lines;
- **compatible features** go to the current line;
- **breaking changes** go to `main`;
- **docs** live in their own repository with one branch per version, like `laravel/docs`.

Two additions: commits are **signed off** (`git commit -s`, the Developer Certificate of Origin), and changes to public APIs start with an **RFC**.
:::

:::caution[Before 0.2 is released]
Strutvane is between lines: 0.1 is published as previews, and 0.2 is being built (see [Release Notes](../releases/)). Until 0.2 ships, almost all work happens on `main`, and the `0.2.x` branches don't exist yet. The repositories are also being reorganised (the framework absorbs core, contracts, CLI and devkit), so some paths below describe the layout 0.2 will have.
:::

## The smallest contribution: fix a docs typo

1. Scroll to the bottom of the page with the typo and click **Edit this page**.
2. GitHub opens the page's Markdown file on the right branch (for this page, `0.2.x` of `strutvane-docs`). Click the pencil, fix the typo.
3. Click **Propose changes**, then **Create pull request**. GitHub makes a fork and a branch for you.
4. In the commit message, keep the `Signed-off-by:` line GitHub's web editor can add for you (tick "Sign off and propose changes" if offered), or add it yourself:

   ```text
   docs: fix a typo in the mail page

   Signed-off-by: Your Name <you@example.com>
   ```

**What you'll see:** a pull request with your change. A maintainer reviews it, the docs site's checks run (links, writing guide, build), and once it's merged the site rebuilds.

## Which repository?

| You want to change | Repository | npm package |
|---|---|---|
| the framework: routing, ORM, migrations, CLI, validation, mail, cache, queues… | `strutvane-framework` | `@strutvane/framework` |
| sign-in, tokens, teams, two-factor | `strutvane-auth` | `@strutvane/auth` |
| the admin UI's behaviour | `strutvane-ui` | `@strutvane/ui` |
| a design's look | `strutvane-design-crisp`, `strutvane-design-vivid` | `@strutvane/design-*` |
| the installer | `create-strutvane` | `create-strutvane` |
| the app template | `strutvane-skeleton` | — |
| these docs | `strutvane-docs` | — |
| decisions, RFCs, the roadmap | `strutvane` (the hub) | — |
| an add-on (files, redis, log-viewer…) | `strutvane-<name>` | `@strutvane/<name>` |

All repositories are in the `vishwajit-vm` GitHub organisation.

## Which branch?

Strutvane follows Laravel's branch model (ADR-0020):

| Your change | Target branch | Example |
|---|---|---|
| A bug fix | the **oldest supported line** that has the bug | `0.2.x` |
| A security fix | **don't open a PR**: report it privately (below) | — |
| A new feature that breaks nothing | the **current line** | `0.2.x` while 0.2 is current |
| A breaking change | `main` | renaming a public method |
| A docs fix for 0.2 | `0.2.x` in `strutvane-docs` | a typo on this page |
| Docs for an unreleased feature | `main` in `strutvane-docs` | a page for 0.3's queues |

After each release, CI opens a pull request that **merges the release up** into every newer line and `main`, so a fix made on `0.2.x` reaches `0.3.x` and `main` without anyone remembering to copy it. A cherry-picked backport (the `backport <branch>` label) is the exception.

End-of-life lines are locked and get no changes; their docs stay online, frozen, with a banner.

## Reporting a bug

Open an issue in the repository closest to the problem, with:

1. **What you did:** the smallest steps that show the bug. A fresh app (`npm create strutvane@latest bug-demo -- --yes`) with one migration is ideal.
2. **What you expected,** and **what happened instead**: the exact error, copied as text (the error page's **Copy as Markdown** button works well).
3. **Versions:** the output of `node strut about --json` (it leaves secrets out), your OS, and whether you use Docker mode.

A failing test in a pull request is the best bug report of all.

## Fixing a bug or adding a feature

1. **Set up** the repository:

   ```bash
   git clone https://github.com/vishwajit-vm/strutvane-framework.git
   cd strutvane-framework
   npm install
   npm run ci            # the full quality gate: lint, types, tests with coverage, build
   ```

   It must be green before you change anything, so you know any failure later is yours.

2. **Branch** from the target branch (see the table above):

   ```bash
   git switch 0.2.x
   git switch -c fix/slug-suffix-on-restore
   ```

3. **Change the code, with tests and docs.** Every behaviour has a test; data logic is tested on real database engines (no mocks for SQL); public types get type-level tests that prove misuse doesn't compile. A user-visible change updates its docs page in `strutvane-docs` in the same effort.

4. **Add a changeset** (it becomes the release note):

   ```bash
   npx changeset
   ```

5. **Run the gate again** and commit with a conventional message, signed off:

   ```bash
   npm run ci
   git commit -s -m "fix(orm): keep the slug suffix when a soft-deleted post is restored"
   ```

6. **Push and open a pull request** against the target branch. Describe the problem, the fix, and how you tested it.

### Changing several repositories at once

Some changes touch the framework and a package together. Clone the hub and run the workspace script: it clones the sibling repositories next to each other and links them with npm workspaces, for local development only (it's never committed):

```bash
git clone https://github.com/vishwajit-vm/strutvane.git
cd strutvane
node scripts/setup-workspace.mjs
```

Committed code always depends on the **published** `@strutvane/framework`, never on local links.

## What a pull request needs

- [ ] It targets the right branch.
- [ ] `npm run ci` passes: Biome lint, strict TypeScript, tests with coverage (90% lines, 90% functions, 85% branches, 90% statements), build.
- [ ] New behaviour has tests, including the failure cases; a security fix has a regression test for the whole class of bug.
- [ ] Public exports have a friendly TSDoc block (what, why, an example).
- [ ] No `any`, no non-null assertions (`!`), no decorators, no `console.*` in package code (use the logger).
- [ ] A changeset, for published packages.
- [ ] Commits follow conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`) and are signed off.
- [ ] Docs are updated, or a docs pull request is linked.

### Signing off (DCO)

The `Signed-off-by:` line certifies that you wrote the change or have the right to submit it under the project's MIT license (the [Developer Certificate of Origin](https://developercertificate.org/)). There's no contributor license agreement, so the project can never be relicensed against contributors' will.

`git commit -s` adds the line from your Git name and email. Forgot it on the last commit?

```bash
git commit --amend -s --no-edit
git push --force-with-lease
```

For several commits on your branch: `git rebase --signoff 0.2.x`, then push with `--force-with-lease`.

## Proposing a bigger change: RFCs

A change to a **public API**, a shared contract, the installer protocol, or a **new package** starts with an **RFC** (request for comments): a short document in the hub's `docs/rfcs/` that explains the problem, the proposed design and the alternatives. The core team accepts it after at least 7 days of review. Architecture, security and process decisions are recorded as **ADRs** (`docs/adr/`) after at least 3 days. Writing code before the RFC is accepted is fine for a prototype, but expect the design to change.

## Improving the docs

The docs site has its own rules, in `docs/WRITING-GUIDE.md` of the docs repository, and tests check the parts a machine can check. In short:

- plain words, second person, short sentences; explain every new term the first time;
- a "Coming from Laravel?" box, a complete smallest example with **What you'll see**, then small → typical → advanced;
- a **Common mistakes** section with the exact error text and the fix;
- **npm only** in commands, `node strut …` for the CLI;
- anything not built yet is marked "Coming in 0.2" (or the line it's planned for). Never document an API that isn't in a release, the blueprint or a prototype.

Check your change locally:

```bash
npm install
npm run dev        # live preview at http://localhost:4321/strutvane-docs/docs/0.2.x/introduction/
npm run verify     # build every version, check every link, run the tests
```

## Reporting a security issue

**Never open a public issue for a security problem.** Use GitHub's **private vulnerability reporting**: the "Report a vulnerability" button on the repository's **Security** tab.

What happens next:

- an acknowledgement within **48 hours**;
- an assessment within **5 business days**;
- a fix for high and critical issues within **14 days** where feasible, made privately on the oldest affected line and merged up;
- coordinated disclosure, with credit to you.

## Platform notes

- **Windows:** contributions from Windows are welcome, and the framework's CI runs on Windows, macOS and Linux. Use Git's `core.autocrlf=input` (or the repo's `.gitattributes`) so line endings stay LF.
- **Node:** use Node 24.3 or newer.
- **Docker:** Strutvane's own repositories never commit Docker files. Run databases for tests however you like locally; the test suites start what they need.
- **npm only:** the repositories use npm and npm workspaces. Don't commit a `pnpm-lock.yaml` or `yarn.lock`.

## Code of conduct

Everyone in Strutvane spaces follows the Code of Conduct (Contributor Covenant 2.1): be kind, assume good intent, and help newcomers.

## Common mistakes

### The DCO check fails on my pull request

```text
DCO: 1 commit is missing a Signed-off-by line
```

**Why:** a commit doesn't have the `Signed-off-by:` line.
**Fix:** sign off and force-push your branch:

```bash
git commit --amend -s --no-edit
git push --force-with-lease
```

### My bug fix was asked to move to another branch

**Why:** it targeted `main`, but bug fixes go to the oldest supported line that has the bug, so every user gets the fix.
**Fix:** rebase onto that branch and change the pull request's base:

```bash
git rebase --onto 0.2.x main fix/slug-suffix-on-restore
git push --force-with-lease
```

### CI fails on coverage

**Why:** new code isn't covered by tests (the gate needs 90/90/85/90).
**Fix:** add tests for the new branches, especially the failure paths, and run `npm run ci` locally.

### The docs check says "needs a Common mistakes section"

**Why:** a full docs page must have `## Common mistakes`, a code example and a "Coming from Laravel?" box.
**Fix:** add the missing section, following the writing guide.

## Next steps

- [Release Notes](../releases/): the support table and what's in each line.
- [Upgrade Guide](../upgrade/): what changes between lines.
- [Introduction](../introduction/): what Strutvane is.
