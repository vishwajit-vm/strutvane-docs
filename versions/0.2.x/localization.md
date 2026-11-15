---
title: "Localization"
description: "Translate your app's messages into other languages: message catalogs, placeholders and plurals, picking each request's language, overriding built-in and package messages, finding missing translations, and what users see when a key is missing."
---

**Localization** (often shortened to **i18n**) means your app speaks your users' language: "Title is required." in English, "Le titre est obligatoire." in French. In Strutvane every message a user can see, from validation errors to the generated screens' labels, comes from a **message catalog**: a list of **keys** (`validation.required`) and their text in one language. Nothing user-facing is hard-coded, so everything can be translated.

You'd use this page to add a second language, to change a built-in message ("Title is required." → "Please give your post a title."), or to write your own messages with numbers that need plurals ("1 post", "5 posts").

:::tip[Coming from Laravel?]
It's Laravel's `lang/` folder and `__('key')`, with a few changes:
- catalogs are TypeScript files, `lang/<locale>/*.ts`, made with `defineMessages()`;
- placeholders are `{name}` instead of `:name`, and plurals use the ICU standard, `{count, plural, one {# post} other {# posts}}`, instead of `trans_choice` with `|`;
- the per-request language comes from `Accept-Language` (or the user's choice), like Laravel's `SetLocale` middleware patterns;
- `node strut lang:check` lists keys missing in each language.
:::

:::caution[Coming in 0.2]
Message catalogs, the formatter (placeholders and ICU plurals), locale fallback chains, override layers and `Accept-Language` negotiation are **built in 0.1** (`@strutvane/framework` core, with fuzz tests on the formatter) and being moved into 0.2. The short `t()` helper, the `lang/` folder convention, the installer's language question (question 30), the UI language switcher and `node strut lang:check` are designed for 0.2, not built. Their names may change.
:::

## The smallest example

1. Create a catalog for French:

   ```ts title="lang/fr/posts.ts"
   import { defineMessages } from '@strutvane/framework'

   export default defineMessages('fr', {
     'posts.published': 'Votre article « {title} » est publié.',
   })
   ```

2. Use the key in your code:

   ```ts title="app/http/controllers/post.controller.ts"
   import { t } from '@strutvane/framework'

   return ctx.json({ message: t('posts.published', { title: post.title }) })
   ```

**What you'll see** for a browser that prefers French (`Accept-Language: fr`):

```json
{ "message": "Votre article « Bonjour » est publié." }
```

and, with an English catalog defining the same key, `"Your post "Hello" is published."` for everyone else.

:::caution[Coming in 0.2]
**Planned API (a sketch: names may change).** `t()` (the parity checklist's name) reads the current request's language and the app's catalogs. Underneath it is the 0.1 `Messages.format(key, params, { locale })`, shown [below](#the-api-underneath-createmessages).
:::

## Catalogs and keys

A catalog is one language and a list of `key: text` pairs. Keys are dotted names, grouped by topic: `posts.published`, `validation.required`, `nav.posts`.

```ts title="lang/en/posts.ts"
import { defineMessages } from '@strutvane/framework'

export default defineMessages('en', {
  'posts.published': 'Your post "{title}" is published.',
  'posts.count': '{count, plural, =0 {No posts yet} one {# post} other {# posts}}',
  'posts.deleted_by': '{name} deleted this post.',
})
```

`defineMessages()` checks its input when the app starts:

- the locale must be a valid language tag (`en`, `fr`, `pt-BR`, `zh-Hant`), and is tidied (`en-us` → `en-US`);
- every value must be a string.

```text
RangeError: defineMessages: "english" is not a valid BCP 47 locale tag
TypeError: defineMessages: message "posts.count" must be a string
```

A **locale** (or language tag) is the code for a language, optionally with a region: `pt` is Portuguese, `pt-BR` Brazilian Portuguese.

## Placeholders

`{name}` is replaced by the value you pass:

```ts
t('posts.deleted_by', { name: 'Grace' })   // → 'Grace deleted this post.'
```

Numbers are formatted for the language: `{amount}` with `1250.5` shows `1,250.5` in English and `1 250,5` in French.

If you forget a value, the placeholder stays visible, so the mistake shows up on screen instead of producing half a sentence:

```ts
t('posts.deleted_by', {})   // → '{name} deleted this post.'
```

## Plurals

Languages count differently. English has "one" and "other"; Polish has four forms; Japanese has one. Plurals use the **ICU** syntax, which knows each language's rules:

```text
{count, plural, =0 {No posts yet} one {# post} other {# posts}}
```

- `=0` matches exactly zero (checked first);
- `one`, `few`, `many`, `other`… follow the language's rules (from the built-in `Intl.PluralRules`);
- `other` is required: it's the fallback;
- `#` is the number, formatted for the language.

```ts
t('posts.count', { count: 0 })   // → 'No posts yet'
t('posts.count', { count: 1 })   // → '1 post'
t('posts.count', { count: 1250 }) // → '1,250 posts'
```

A Polish catalog uses Polish forms:

```ts title="lang/pl/posts.ts"
import { defineMessages } from '@strutvane/framework'

export default defineMessages('pl', {
  'posts.count': '{count, plural, =0 {Brak wpisów} one {# wpis} few {# wpisy} many {# wpisów} other {# wpisu}}',
})
```

Branches may contain placeholders and other plurals, up to 8 levels deep.

### Broken templates never crash

Catalogs are often edited by translators, not developers. So the formatter **never throws and never runs code**: a malformed template is shown as plain text, and the problem is reported (in development) instead of breaking the page.

```ts
// a missing closing brace
'{count, plural, one {# post} other {# posts}'
// → shown literally, and marked malformed
```

## Which language a request gets

For each request, the language is chosen like this:

1. the language the signed-in user picked in the app (planned UI switcher);
2. otherwise the best match for the browser's `Accept-Language` header among the languages your app has;
3. otherwise the app's default language (`en`, or what you chose in installer question 21).

Matching `Accept-Language` (built in 0.1 as `negotiateLocale`):

| Header | Your app has | Chosen |
|---|---|---|
| `fr-CH, fr;q=0.9, en;q=0.8` | `en`, `fr` | `fr` (base language match for `fr-CH`) |
| `de, en;q=0.5` | `en`, `fr` | `en` |
| `pt-BR` | `en`, `pt` | `pt` |
| `*` or missing | `en`, `fr` | `en` (the default) |
| `fr;q=0` | `en`, `fr` | `en` (`q=0` means "not French") |

The header is attacker-controlled, so it's cut to 4 KB and 50 entries, and anything malformed falls back to the default.

## Fallbacks: what if a translation is missing?

Each lookup tries a **chain** of languages, most specific first. For `pt-BR` with English as the default:

```text
pt-BR → pt → en
```

So a Brazilian user sees the `pt-BR` text if it exists, else the general Portuguese text, else English. A key missing **everywhere** shows the key itself:

```ts
t('posts.archvied')   // → 'posts.archvied' (a typo: visible on screen, never empty)
```

## Changing built-in and package messages

Strutvane ships English messages for validation and errors (`validation.required`: `{attribute} is required.`), and packages ship their own. You override them without editing anyone's files, by defining the same key in your app. The **override chain**, most specific first:

1. **field**: an override for one field of one resource;
2. **resource**: for one resource;
3. **app**: your `lang/` catalogs;
4. **package**: catalogs shipped by installed packages;
5. **built-in**: the framework's English messages.

```ts title="lang/en/validation.ts"
import { defineMessages } from '@strutvane/framework'

export default defineMessages('en', {
  'validation.required': 'Please fill in {attribute}.',
})
```

**What you'll see:** every "required" error in the app now reads "Please fill in Title." Within each language, each layer is checked for that language and then for its language-neutral `*` dictionary, so a field-specific override written for **every** language beats your general app text.

The built-in keys follow two patterns:

| Keys | Used for |
|---|---|
| `validation.<issue code>` (`validation.too_short`, `validation.unique`…) | validation messages; `{attribute}` is the field's label |
| `errors.<CODE>.title`, `errors.<CODE>.detail` | the title and safe detail of error responses |

## Finding missing translations

```bash
node strut lang:check
```

**What you'll see** (something like this):

```text
fr: 3 keys missing
  posts.count
  posts.deleted_by
  validation.unique
pl: complete
```

A key counts as present if the language **or its base language** has it (`en-GB` is covered by `en`). Run it in CI to catch untranslated text before release.

:::caution[Coming in 0.2]
`lang:check` is designed on top of the 0.1 `missingKeys(locale)` function, which already computes this list. The command itself isn't built.
:::

## The API underneath: `createMessages()`

The 0.1 core API, which `t()` will wrap. Useful in tests and scripts:

```ts title="scripts/messages-demo.ts"
import { createMessages, defineMessages } from '@strutvane/framework'

const messages = createMessages({
  fallbackLocale: 'en',
  app: [
    defineMessages('en', { 'posts.count': '{count, plural, =0 {No posts yet} one {# post} other {# posts}}' }),
    defineMessages('fr', { 'posts.count': '{count, plural, =0 {Aucun article} one {# article} other {# articles}}' }),
  ],
})

console.log(messages.format('posts.count', { count: 3 }, { locale: 'fr' }))
console.log(messages.has('posts.count', { locale: 'de' }))
console.log(messages.missingKeys('fr'))
```

**What you'll see:**

```text
3 articles
true
[ ... every built-in key that has no French text yet ... ]
```

(`has()` is `true` for German because the chain falls back to English.)

| Method | What it does |
|---|---|
| `format(key, params?, { locale?, overrides? })` | the finished text; a missing key returns the key |
| `resolve(key, lookup?)` | the raw template, or `undefined` |
| `has(key, lookup?)` | whether any layer defines it, along the chain |
| `locales()` | every language that has a catalog |
| `missingKeys(locale)` | keys in the default language that `locale` lacks |

## Dates, numbers and money

Placeholders format plain numbers for the language. For dates and money, format with the browser-standard `Intl` objects, which every Node and browser has:

```ts
new Intl.NumberFormat('fr', { style: 'currency', currency: 'EUR' }).format(1250.5)   // → '1 250,50 €'
new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date('2026-11-15'))  // → '15 November 2026'
```

The installer's question 21 sets the app's default language, time zone and currency. The generated screens format dates, numbers and money in the user's language for you.

## The generated screens

The admin UI's labels (menu entries, column headers, buttons, empty states) come from catalogs too. Installer question 30 picks the UI languages (English by default; add any). Translating your own **data** (a post's title in three languages) is different: that's the job of the planned `@strutvane/translations` package.

## With Docker or without Docker

Localization behaves the same in both. One thing to check in a slim container image: Node must include full ICU data for every language you use. Official Node builds (including the `node:24-bookworm-slim` image the generated `Dockerfile` uses) ship full ICU, so `Intl` and plurals work for every language. Custom Node builds with "small ICU" format everything as English.

## Common mistakes

### The page shows `posts.published` instead of a sentence

**Why:** no catalog defines that key in any language of the chain: a typo, or the catalog file isn't loaded.
**Fix:** check the spelling, and that the file is in `lang/<locale>/` and exports `defineMessages(...)` as its default.

### The French catalog is ignored

**Why:** the request didn't ask for French (check the `Accept-Language` header your browser sends), or the catalog's locale is written wrong (`'FR'` is fine, `'french'` stops the app at start-up).
**Fix:** test with an explicit header:

```bash
curl -H "Accept-Language: fr" http://localhost:3000/api/posts
```

### My plural shows the whole `{count, plural, …}` text

**Why:** the template is malformed (a missing `}`, no `other` branch, or a misspelled selector like `ones`), so it's shown literally.
**Fix:** every plural needs an `other` branch and balanced braces:

```text
{count, plural, one {# post} other {# posts}}
```

### `{name}` appears in the sentence

**Why:** the code didn't pass `name`.
**Fix:** pass every placeholder the template uses: `t('posts.deleted_by', { name: user.name })`.

### Numbers show as `1,250` for French users

**Why:** the message was formatted without the request's language (for example in a queued job that ran later).
**Fix:** store the user's language with the job, and pass it when formatting.

## Next steps

- [Validation](../validation/): where `validation.*` messages appear.
- [Error Handling](../errors/): error titles and details from `errors.*` keys.
- [Configuration](../configuration/): the app's default language and time zone.
- [Mail](../mail/): sending mail in the recipient's language.
