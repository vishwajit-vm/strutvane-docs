---
title: Validation
description: Check every request body before it reaches your database. Form requests with Zod schemas, automatic rules from your migrations, unknown fields refused, and the exact 422 problem+json response with one issue per field.
---

**Validation** means checking that the data a client sent is what you expect (a title that isn't empty, a status from the allowed list) **before** you use it. When something's wrong, the client gets one clear answer listing **every** problem at once, so a form can show all its errors together.

Strutvane gives you two ways to validate:

1. **Automatic:** a `ResourceController` derives the rules from your migrations and the model's `fillable` list. You write nothing.
2. **Form requests:** a small class with a schema, for when you want your own rules and messages.

:::tip[Coming from Laravel?]
Form requests are here: `StorePostRequest` with `rules()`, `authorize()` and `prepareForValidation()`. The rules are a schema from any [Standard Schema](https://standardschema.dev) library (the examples use Zod) instead of rule strings like `'required|max:200'`, and the validated output is **typed**.

One deliberate change: **unknown fields are refused** by default (Laravel's `#[FailOnUnknownFields]` is opt-in). Sending `is_admin: true` to an endpoint that doesn't accept it is a `422`, not silently ignored.
:::

## The smallest example

```ts title="app/http/requests/post.request.ts"
import { z } from 'zod'
import { FormRequest, type StandardSchema } from '@strutvane/framework'

const storeSchema = z.object({
  title: z.string({ error: 'Title is required.' }).trim().min(3, { error: 'Title must be at least 3 characters.' }),
})

/** Validation for POST /api/posts. */
export class StorePostRequest extends FormRequest<z.infer<typeof storeSchema>> {
  rules(): StandardSchema<z.infer<typeof storeSchema>> {
    return storeSchema
  }
}
```

Use it in an action:

```ts title="app/http/controllers/post.controller.ts"
async store(ctx: HttpContext): Promise<Response> {
  const input = await new StorePostRequest().validate(ctx)   // { title: string }, or a 422
  return ctx.json({ data: input }, 201)
}
```

Send a bad body:

```bash
curl -X POST http://localhost:3000/api/posts -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" -d '{"title":"Hi"}'
```

What you'll see:

```text
HTTP/1.1 422 Unprocessable Entity
content-type: application/problem+json
```

```json
{
  "type": "https://strutvane.dev/problems/validation_failed",
  "title": "Some fields need attention",
  "status": 422,
  "code": "validation_failed",
  "detail": "Fix the fields listed in `issues` and try again.",
  "issues": [
    { "field": "title", "code": "too_small", "message": "Title must be at least 3 characters." }
  ]
}
```

## The 422 response, field by field

Every validation failure has exactly this shape (an **RFC 9457 problem**, the standard error format every Strutvane API uses):

| Field | Meaning |
|---|---|
| `type` | A URL naming the kind of problem: `…/validation_failed` |
| `title` | `Some fields need attention` |
| `status` | `422` |
| `code` | `validation_failed`: stable, safe to match on in your client |
| `detail` | A sentence for a person |
| `issues` | One entry per problem: `field` (the path, like `title` or `tags.0`, or `""` for the whole body), `code`, `message` |

Show `message` next to the input named by `field`, and you have a working form.

## Form requests in depth

### A typical store and update pair

Create needs the required fields; update (`PATCH`) makes every field optional:

```ts title="app/http/requests/post.request.ts"
import { z } from 'zod'
import { FormRequest, type StandardSchema } from '@strutvane/framework'

/** The fields a client may send when writing a post. `author_id` is never one of them. */
const fields = {
  title: z.string({ error: 'Title is required.' }).trim()
    .min(3, { error: 'Title must be at least 3 characters.' })
    .max(200, { error: 'Title can be at most 200 characters.' }),
  slug: z.string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'Slug may only contain lower-case letters, digits and single dashes.' })
    .max(255),
  body: z.string().max(50_000, { error: 'Body can be at most 50,000 characters.' }).nullable(),
  status: z.enum(['draft', 'published'], { error: 'Status must be draft or published.' }),
}

const storeSchema = z.object({ title: fields.title, slug: fields.slug.optional(), body: fields.body.optional(), status: fields.status.default('draft') })
const updateSchema = z.object(fields).partial()

/** Validation for POST /api/posts. */
export class StorePostRequest extends FormRequest<z.infer<typeof storeSchema>> {
  rules(): StandardSchema<z.infer<typeof storeSchema>> {
    return storeSchema
  }
}

/** Validation for PATCH /api/posts/{post}. */
export class UpdatePostRequest extends FormRequest<z.infer<typeof updateSchema>> {
  rules(): StandardSchema<z.infer<typeof updateSchema>> {
    return updateSchema
  }
}
```

Hand them to a resource controller and it uses them for `store` and `update`:

```ts title="app/http/controllers/post.controller.ts"
protected override readonly storeRequest = new StorePostRequest()
protected override readonly updateRequest = new UpdatePostRequest()
```

What you'll see for `{"title": "", "slug": "Not A Slug", "status": "archived"}`: one `422` with **three** issues, for `title`, `slug` and `status`. Every problem is reported at once.

### Every problem at once

Validation never stops at the first error. A body with five mistakes gets five issues, so the person filling the form fixes everything in one go.

### Unknown fields are refused

Any field the schema doesn't accept is an issue of its own:

```bash
curl -X POST http://localhost:3000/api/posts -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" -d '{"title":"Hello","author_id":1}'
```

```json
{
  "status": 422,
  "code": "validation_failed",
  "issues": [
    { "field": "author_id", "code": "unknown_field", "message": "\"author_id\" is not a field you can send here. Remove it from the request body." }
  ]
}
```

**Why refuse instead of ignoring?** An ignored field hides two problems: a typo in your client (`titel`) that silently does nothing, and someone probing for fields they shouldn't set (`is_admin`).

### `authorize()`: a request-level permission check

```ts
export class PublishPostRequest extends FormRequest<{ note?: string }> {
  rules() {
    return z.object({ note: z.string().optional() })
  }

  /** Only signed-in users may send this request at all. */
  authorize(ctx: HttpContext): boolean {
    return ctx.user !== null
  }
}
```

Returning `false` answers `403` (`You are not allowed to send this request.`). The [policy](../authorization/) is still the main gate; use `authorize()` for checks about the request itself.

### `prepareForValidation()`: clean input first

Normalise values before the rules run, like trimming or lower-casing:

```ts
export class StoreAuthorRequest extends FormRequest<{ name: string; email: string }> {
  rules() {
    return z.object({ name: z.string().min(1), email: z.email() })
  }

  prepareForValidation(input: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...input, email: String(input['email'] ?? '').trim().toLowerCase() }
  }
}
```

`" Ada@Example.TEST "` is validated and returned as `"ada@example.test"`.

### The body must be a JSON object

Sending an array or a plain value is one clear issue:

```json
{ "status": 422, "code": "validation_failed", "issues": [{ "field": "", "code": "invalid_body", "message": "Send a JSON object, for example {\"title\": \"Hello\"}." }] }
```

## Automatic validation from your migrations

A `ResourceController` without `storeRequest`/`updateRequest` builds the rules from your tables:

| Column in the migration | Rule | Message when it fails |
|---|---|---|
| `t.string('title', 200)` (required) | text, trimmed, not empty, at most 200 | `Title can't be empty.` / `Title can be at most 200 characters.` |
| `t.enum('status', ['draft', 'published'])` | one of the list | `Status must be one of: draft, published.` |
| `t.integer('stock')` | a whole number | `Stock must be a whole number.` |
| `t.boolean('featured')` | `true` or `false` | `Featured must be true or false.` |
| `t.date('due_on')` | `2026-11-14` | `Due on must be a date such as 2026-11-14.` |
| `t.timestamp('starts_at')` | ISO date-time | `Starts at must be a date and time such as 2026-11-14T10:00:00Z.` |
| missing required column (create) | | `Name is required.` |

**Which columns may be written?** Exactly the model's `fillable` list ([mass assignment](../orm-mass-assignment/)). On create, required columns are required; on update, everything is optional.

Unique columns are checked too, before writing, so a duplicate is a friendly issue on the right field:

```json
{ "status": 422, "code": "validation_failed", "issues": [{ "field": "email", "code": "taken", "message": "That email is already taken." }] }
```

If two requests race past that check, the database's unique index catches it and you get `409 Conflict` instead.

## Validating the query string

`index` validates `?page`, `?perPage`, `?sort` and `?filter[…]` the same way, and reports every bad parameter at once:

```bash
curl "http://localhost:3000/api/posts?sort=secret&page=0&filter[status][gt]=a"
```

Something like this (the lists of allowed fields and operators come from your table):

```json
{
  "status": 422,
  "code": "validation_failed",
  "issues": [
    { "field": "page", "code": "invalid_integer", "message": "Page must be a whole number from 1 to 9007199254740991." },
    { "field": "sort", "code": "not_sortable", "message": "\"secret\" can't be sorted on. Sortable fields: id, title, status, created_at." },
    { "field": "filter[status][gt]", "code": "invalid_operator", "message": "\"gt\" doesn't work on Status. Try one of: eq, ne, in." }
  ]
}
```

## Common mistakes

### My form shows "is not a field you can send here"

```json
{ "field": "author_id", "code": "unknown_field", "message": "\"author_id\" is not a field you can send here. Remove it from the request body." }
```

**Why:** the client sends a field the schema (or `fillable`) doesn't accept.

**Fix:** remove it from the request. If the server should set it, do that in `prepareForStore()` (see [Controllers](../controllers/)). If clients really may send it, add it to the schema.

### Every field is "required" on PATCH

**Why:** the update request reuses the create schema.

**Fix:** make every field optional for updates: `z.object(fields).partial()`.

### The issue's `field` is empty

**Why:** the problem is with the body as a whole (for example, it's an array), not one field.

**Fix:** send a JSON object.

### Validation passes but my value is `undefined`

**Why:** a non-strict schema strips keys it doesn't know; you read a key that isn't in the schema.

**Fix:** add the key to the schema; read values only from the returned `input`, never from `ctx.body()` directly.

## Next steps

- [Controllers](../controllers/): `storeRequest`, `updateRequest` and `prepareForStore()`.
- [Responses](../responses/): the same problem+json shape for every error.
- [Mass Assignment](../orm-mass-assignment/): which columns may be written at all.
