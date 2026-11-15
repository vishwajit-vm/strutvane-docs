# Strutvane docs writing guide

This is how every Strutvane docs page is written. It applies to every "real" page (anything that isn't a short "Being written" stub). `test/content.test.ts` checks the parts a machine can check.

**The goal:** someone who has never used Strutvane, Laravel or even a framework can follow any page from top to bottom, copy every example, and get exactly the result the page shows.

## 1. Voice

- **Plain words.** Write as if you're explaining it to a friend at the next desk. Short sentences. One idea per sentence.
- **Second person, present tense.** "You run `node strut migrate`. Strutvane creates the table."
- **Explain every new word the first time it appears**, in the same sentence or the next one. "A **migration** is a small file that describes one change to your database." After that, use the word freely. Bold it the first time.
- **No "simply", "just", "obviously", "easy".** If it were obvious, nobody would read the page.
- **Say why.** Every rule gets a reason in one sentence: "Columns live only in migrations, so the types, the database and the screens can't drift apart."
- **Be honest about what exists.** Anything not built yet gets a `:::caution[Coming in 0.2]` box. Never document an API that isn't in the blueprint or a spike.

## 2. Page shape

Every real page uses this order. Leave out a section only when it truly doesn't apply.

1. **Front matter:** `title` and a one-sentence `description` that says what the reader will be able to do.
2. **Opening paragraph:** what this is, in two or three sentences, and when you'd use it.
3. **"Coming from Laravel?" box** (`:::tip[Coming from Laravel?]`): two to five lines mapping to the Laravel equivalent (`php artisan migrate` → `node strut migrate`) and calling out what's different.
4. **The smallest working example**, complete and copy-pasteable, with **"What you'll see"** right after it.
5. **Every way to use the feature**, each in its own `##` or `###` section, ordered **small → typical → advanced**. Each one has:
   - one sentence on when you'd want it;
   - a complete example (imports included, real file path as the code block's `title`);
   - what you'll see (output, response, or the resulting value).
6. **Platform and setup differences** where they matter: Windows / macOS / Linux (use `<Tabs syncKey="os">` in `.mdx`), and with Docker / without Docker.
7. **`## Common mistakes`**: each mistake as a `###` heading in the reader's words ("I get MASS_ASSIGNMENT when I save a form"), then:
   - the **exact error** in a `text` code block, copied from the code (spike source) when it exists;
   - **why** it happens, in one or two sentences;
   - **the fix**, as code.
8. **`## Next steps`:** two to four links to the pages people need next.

## 3. Examples

- **Complete and copy-pasteable.** Include the imports and the file path (` ```ts title="app/models/post.ts" `). No `…` inside code a reader is meant to copy; if you shorten something, say so in a comment (`// the rest of the file is unchanged`).
- **npm only.** Never show pnpm, yarn or bun. Commands are `npm …` and `node strut …`.
- **Real names, one story.** Use the same small app everywhere: `posts` (title, slug, body, status, author_id), `users`, `tags`, `projects`/`tasks` for tenancy. Readers recognise it from page to page.
- **Columns keep their migration names**: `created_at`, `author_id`, never `createdAt`.
- **Show the output.** After every command or call that produces something, add "What you'll see" with the terminal output, the JSON response, or the value (as a comment: `// → 'hello-world'`). If the exact wording isn't final, say "something like this".
- **Shell commands:** one per line, with a comment when it isn't self-explanatory. When PowerShell differs (setting an environment variable, quoting), show both in tabs.

## 4. Formatting

- `##` for the main sections, `###` inside them. Never skip a level. Headings are short and say what you'll learn ("Changing a table", not "Alter").
- **Tables** for options, flags and "which one should I use?" comparisons.
- **Asides:** `:::note` (useful extra), `:::tip` (a better way, or "Coming from Laravel?"), `:::caution` (easy to get wrong, or "Coming in 0.2"), `:::danger` (data loss or security).
- **Links:** relative within a version (`../migrations/`); to another version only through `/docs/latest/…`. Never hard-code a version number in a link.
- Keep paragraphs to four lines or fewer on a laptop screen.

## 5. Checklist before you commit a page

- [ ] Every new term is explained the first time.
- [ ] There's a "Coming from Laravel?" box.
- [ ] Every way to use the feature has a complete example plus "What you'll see".
- [ ] There are small, typical and advanced cases.
- [ ] `## Common mistakes` has the exact error text and the fix for each.
- [ ] OS and Docker differences are covered where they exist.
- [ ] Anything not built is marked "Coming in 0.2".
- [ ] `npm run verify` passes (build, links, tests).
