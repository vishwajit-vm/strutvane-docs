---
title: Precognition
description: Live form validation that uses your server's own rules. What works today (server 422s mapped to fields, client checks from the metadata), and what 0.2 adds (one Zod schema per table shared by server and browser, and a `Precognition` request that checks database rules like unique without saving).
---

**Live validation** means a form tells you what's wrong while you fill it in, not only after you press Save. The hard part is keeping the browser's checks and the server's checks the same: write them twice and they drift apart, and the server must check anyway, because the browser can be bypassed.

**Precognition** solves this the way Laravel does: the browser asks the **server** "would this be valid?" without saving anything, so the rules exist once. Strutvane adds a second layer: most rules come from your migrations as a schema that runs in both places, so the browser can check them instantly, and only the rules that need the database ask the server.

:::tip[Coming from Laravel?]
It's Laravel Precognition: a request with a `Precognition: true` header runs validation and stops before your controller saves. The difference: in Strutvane most checks (required, max length, allowed values) don't even need the request, because the same Zod schema, generated from your migration, runs in the browser. Only database rules (`unique`, `exists`) go to the server.
:::

:::caution[Coming in 0.2]
The shared schema and the `Precognition` request are **gaps found on 2026-11-15**, added to the 0.2 plan (Laravel parity matrix and blueprint §5 "Typed end to end"). They're not built yet. What the generated screens do **today** (spike 14) is described first; the rest of the page is a preview that may change.
:::

## What works today

The generated forms (proven in spike 14) already give quick feedback in two ways:

1. **Client checks from the metadata.** The UI reads `.strutvane/resources.json` (what `migrate` writes) and checks the same simple rules the server applies: required fields, maximum lengths, allowed values for an enum, numbers in number fields. A failed check focuses the first wrong field, with `aria-invalid` and a description screen readers read out.
2. **Server answers mapped to fields.** When you press Save and the server says `422`, every issue lands on its field and the first one gets focus:

```json
{
  "status": 422,
  "code": "validation_failed",
  "issues": [{ "field": "slug", "code": "taken", "message": "Slug \"engineering\" is already taken." }]
}
```

**What you'll see:** the message under the Slug field, the field focused, nothing else lost from the form.

What today's forms can't do: tell you "that slug is taken" **before** you press Save, and use rules you wrote yourself in a form request. That's what the rest of this page adds.

## One schema, two places (preview)

`node strut migrate` will generate a **Zod schema** per table (Zod is the validation library Strutvane uses) next to the types. The server's default validation uses it, and the browser imports the very same schema:

```ts title="resources/ui/pages/posts/quick-form.tsx"
import { postSchemas } from '../../../../.strutvane/schemas.gen.ts'

const result = postSchemas.create.safeParse({ title: '', status: 'archived' })
// result.success === false
// result.error.issues → title: "Title is required.", status: "Status must be one of: draft, published."
```

Change the migration (make `title` 300 characters), run `migrate`, and both sides change together. Nothing to keep in sync by hand.

## Asking the server without saving (preview)

Some rules need the database: "is this slug free?", "does this author exist?". For those, the form sends the same request it would send on Save, plus one header:

```bash
curl -X POST http://localhost:3000/api/posts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Precognition: true" \
  -d '{"title":"Engineering","slug":"engineering"}'
```

**What you'll see** (something like this):

| Situation | Answer |
|---|---|
| Everything valid | `204 No Content` with `Precognition-Success: true`. **Nothing was saved.** |
| Something invalid | `422` with the usual `issues`, exactly as a real save would answer |

Only the `Precognition` header itself is in the plan; `Precognition-Success` and `Precognition-Validate-Only` (below) are Laravel's names, shown as a sketch of how Strutvane will likely answer.

The request goes through the same middleware (auth, CSRF, rate limits) and the same form request as a real save, then stops **before** your controller writes anything. Only validation runs: no `prepareForStore`, no database writes, no events.

### Checking only some fields

While someone types in one field, the form asks about that field only:

```bash
curl -X POST http://localhost:3000/api/posts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Precognition: true" -H "Precognition-Validate-Only: slug" \
  -d '{"slug":"engineering"}'
```

Other fields' errors (like a missing title) are left out, so the form doesn't shout about fields the person hasn't reached yet.

### In the generated forms

You write nothing: the generated create and edit forms will use the schema for instant checks, and send a debounced precognition request when a field with a database rule (`unique`, `exists`) changes. Your own pages will get the same through the generated API client.

### With your own form request

A form request's rules run in precognition requests too. Database rules will be async and tenant-scoped (with teams on, "unique" means unique within the team):

```ts title="app/http/requests/post.request.ts"
import { z } from 'zod'
import { exists, FormRequest, unique, type StandardSchema } from '@strutvane/framework'

const schema = z.object({
  title: z.string().trim().min(3).max(200),
  slug: z.string().pipe(unique('posts', 'slug')),
  author_id: z.number().int().pipe(exists('users', 'id')),
})

export class StorePostRequest extends FormRequest<z.infer<typeof schema>> {
  rules(): StandardSchema<z.infer<typeof schema>> {
    return schema
  }
}
```

The `unique()` and `exists()` helpers shown here are a sketch: they're planned with `make:rule` in 0.2. See [Validation](../validation/).

## Safety

- **Precognition never saves.** A precognition request that reached your controller's write code would be a bug; the framework stops it before.
- **It's checked like a real request.** Auth, CSRF and rate limits apply, so it can't be used to probe data you couldn't save. A `unique` answer tells you only that a value is taken in a table you may write to.
- **Rate limits count it.** Debounced field checks are cheap, but a script hammering "is this email taken?" hits the same limit as real saves.

## Common mistakes

### My field check says "Title is required" while I'm typing the slug

**Why:** the request validated every field.
**Fix:** send `Precognition-Validate-Only: slug` with the field you're checking.

### A precognition request saved a record

**Why:** it can't with the planned design, so the request probably didn't carry the `Precognition: true` header (a typo in the header name sends a normal save).
**Fix:** check the header name and value exactly: `Precognition: true`.

### The browser accepts a value the server refuses

**Why:** the rule needs the database (`unique`, `exists`), or it lives only in your form request, so the browser schema can't know it.
**Fix:** that's what the precognition request is for; the server's answer always wins.

## Next steps

- [Validation](../validation/): rules and form requests.
- [Requests](../requests/): the body and its limits.
- [Customising Screens](../crud-customising/): the generated forms.
- [Frontend](../frontend/): how the UI talks to the API.
