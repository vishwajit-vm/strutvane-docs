---
title: "Slugs"
description: "Readable URLs like `/posts/hello-world` in the generated API and screens: how the form fills the slug from the title, what the server does with taken slugs, editing a slug, binding routes by slug, and the mistakes to avoid."
---

A **slug** is the readable part of an address: `hello-world` in `/posts/hello-world`. It's made from a title by dropping accents and punctuation and joining the words with dashes. Slugs make links easy to read and share, and they don't reveal how many records you have (an id like `/posts/1042` does).

This page is about slugs in the **generated API and screens**. How a model makes and stores slugs (uniqueness, the random suffix, changing a slug) is on [ORM: Slugs](../orm-slugs/).

:::tip[Coming from Laravel?]
It's spatie/laravel-sluggable plus Laravel's `{post:slug}` route binding, switched on by one line in the migration: `t.slug('slug').from('title')`. The generated screens and API use the slug everywhere a record has one.
:::

:::caution[Coming in 0.2]
**Proven in prototypes:** slug generation and by-slug lookup in spike 10, `{post:slug}` binding in spike 12, the form's slug field in spike 14. Refusing reserved words such as `new` is designed, not built.
:::

## The smallest example

One line in the migration:

```ts title="database/migrations/2026_11_14_093000_create_posts_table.ts"
t.string('title', 200)
t.slug('slug').from('title')
```

After `node strut migrate`, create a post called "Héllo, World!" in the UI.

**What you'll see:** while you type the title, the Slug field fills in `hello-world`, with a preview of the address underneath (`/posts/hello-world`). Save, and you land on `/posts/hello-world`. The API answers at `/api/posts/hello-world` too.

## How the slug is made

| Title | Slug |
|---|---|
| `Hello World` | `hello-world` |
| `Héllo, World!` | `hello-world` (accents dropped) |
| `Crème brûlée, again!` | `creme-brulee-again` |
| `  Spaces   everywhere  ` | `spaces-everywhere` |
| `日本` | *(empty)*: nothing usable, so the server asks you to type a slug |

The browser and the server use **the same rule**, so the preview shows exactly what will be stored.

## The slug field in the form

**Typical case: let it follow the title.** On the create form, the slug follows the title as you type, **until you edit the slug yourself**. From then on it's yours.

**The one rule that matters:** if you never touched the slug field, the form **doesn't send it**. The server makes the same slug and, if it's taken, picks a free one. So you never get a "slug already taken" error for a slug you didn't type.

**If you typed a slug** and it's taken, the server refuses it, and the message lands on the Slug field, which gets focus:

```json
{
  "status": 422,
  "code": "validation_failed",
  "issues": [{ "field": "slug", "code": "taken", "message": "Slug \"engineering\" is already taken." }]
}
```

**On the edit form,** the slug doesn't follow the title: changing a title never changes the address, so shared links keep working. Change the slug field itself if you really want a new address (old links will then 404).

## When the slug is taken

Two posts called "Launch" can't both be `/posts/launch`. When you didn't type a slug, the server adds a short random suffix:

```text
/posts/launch
/posts/launch-k3f9
```

The suffix is random, not `-2`, `-3`, because a counter would tell visitors how many other posts (including hidden drafts) share the title. Soft-deleted posts keep their slug reserved, so restoring one never clashes. With teams, slugs are unique **per team**. Details on [ORM: Slugs](../orm-slugs/).

## Slugs in the API and in routes

Generated resources for a table with a slug use it as the route key:

```bash
curl http://localhost:3000/api/posts/hello-world -H "Authorization: Bearer $TOKEN"
```

**What you'll see:** the post, `200`. An unknown slug answers `404` with `"detail": "No post matches \"hello-wrld\"."`.

In your own routes, bind by slug with `{post:slug}` or `bindBy: 'slug'`:

```ts title="routes/api.ts"
Route.apiResource('posts', PostController, { bindBy: 'slug' }),          // /posts/{post:slug}
Route.post('/posts/{post:slug}/publish', [PostController, 'publish']).name('posts.publish'),
```

And `route('posts.show', { post })` builds `/api/posts/hello-world` from the model, using the field the route binds by. See [Routing](../routing/).

:::note[By id or by slug]
The schema prototype (spike 10) also answered at `/api/posts/by-slug/hello-world` next to `/api/posts/1`; the application core (spike 12) uses the bound field directly (`/api/posts/hello-world`). These docs follow the application core.
:::

## Tables without a slug

They use the id: `/categories/7`. Detail pages, links and the command palette work the same way.

## Reserved words

:::caution[Coming in 0.2]
A post whose slug is `new` would collide with the create form's address (`/posts/new`). Refusing reserved words (`new`, `edit`, `create`…) and id-like values (`123`) as slugs is designed, not built yet. Until then, avoid titles that slug to those words, or set the slug by hand.
:::

## Common mistakes

### "Slug … is already taken" on a slug I didn't type

**Why:** it can't happen through the generated form (an untouched slug isn't sent). It happens when your own client sends the slug it computed.
**Fix:** leave `slug` out of the request and let the server pick a free one.

### Changing the title didn't change the address

**Why:** slugs are set when the record is created and stay stable, so links don't break.
**Fix:** edit the slug field itself if you really want a new address.

### "Couldn't build a slug" for a non-Latin title

**Why:** the title has no letters or digits the slug rule keeps (`日本` becomes empty).
**Fix:** type a slug yourself, such as `japan`.

### My route 404s for a slug that exists

**Why:** the route binds by id (`{post}`), so `hello-world` is looked up as an id.
**Fix:** bind by slug: `{post:slug}`, or `bindBy: 'slug'` on the resource.

## Next steps

- [ORM: Slugs](../orm-slugs/): the model side.
- [Routing](../routing/): binding by slug.
- [Customising Screens](../crud-customising/): the form's field order.
