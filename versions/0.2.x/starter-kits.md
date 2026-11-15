---
title: Starter Kits
description: The kinds of app `npm create strutvane@latest` can set up (a full app with generated admin screens, a full app with a blank React UI, or an API only), with the look, the sign-in screens, the flags for each, and how to change your mind later.
---

A **starter kit** is the shape your new app starts in: which parts exist (API, UI), which screens you get, and how they look. In Strutvane you don't install a starter kit separately: the installer asks a few questions and writes the kit you picked into your project, as files you own.

There are three starting shapes:

| Kit | You get | Pick it when |
|---|---|---|
| **Full app, admin screens** (default) | API + React UI + screens generated from your tables + sign-in screens | You're building a back office, CRM, portal or internal tool |
| **Full app, blank React app** | API + an empty React app + sign-in screens, no generated screens | You want to design every screen yourself |
| **API only** | API, sign-in endpoints and tokens, no UI | Another app (mobile, a separate frontend) is the UI |

:::tip[Coming from Laravel?]
Laravel's starter kits (React, Vue, Livewire, and Breeze and Jetstream before them) are installed into a new app and give you auth screens and a layout. Strutvane's kits are the same idea, with three differences: the auth screens come with the **design** you pick (Crisp or Vivid), the full kit adds Filament-style **admin screens generated from your migrations**, and there's one stack only, **React**, in 0.2.
:::

:::caution[Coming in 0.2]
The installer questions and the files each kit writes are **proven in a prototype** (spike 13), and the generated admin screens in spike 14. The two designs and the sign-in screens are being built for 0.2.
:::

## The smallest example

Take the defaults and you get the full kit with admin screens, in the Crisp design:

```bash
npm create strutvane@latest my-app -- --yes
```

**What you'll see** in the Ready box (shortened):

```text
── Ready ───────────────────────────────────────────────────────
   App          http://localhost:3000
   Design       crisp (@strutvane/design-crisp)
   Admin        admin@my-app.test
   Every day:   cd my-app; npm run dev
   Restyle:     resources/ui/theme.css, or switch: node strut design:use vivid
```

The `--` passes the flags to the installer instead of to npm, and `--yes` takes every default without asking.

## Choosing a kit

Three installer questions decide the kit. In Recommended mode you're asked the first and the third; the second is in Custom mode (or a flag).

| Question | Choices (default **bold**) | Flag |
|---|---|---|
| What are you building? | **Full app (API + admin UI)**, API only | `--stack full\|api` |
| Which React UI starter? (full app only) | **Admin screens from your models**, blank React app | `--ui admin\|blank` |
| Which design should your app use? (full app only) | **Crisp**, Vivid | `--design crisp\|vivid` |

### Full app with admin screens

```bash
npm create strutvane@latest acme -- --stack full --ui admin --design crisp --yes
```

What's in it:

- the **API** under `/api`, with a CRUD resource for every table you migrate;
- the **React UI**: sign-in, a dashboard with a welcome checklist, a sidebar, and list, create, edit and detail screens for every table, with search, filters, pagination, the command palette (Ctrl/Cmd+K) and keyboard shortcuts;
- **sample data** for the screens to show (on by default for this kit; `--no-sample-data` to skip);
- the files: `resources/ui/index.html`, `main.tsx`, `theme.css`, `config/ui.ts`, plus one `resources/ui/<table>.ui.ts` per table after each migrate.

**What you'll see** after `npm run dev`: sign in, and the dashboard shows **Users** in the sidebar. Every table you add with `make:migration` + `migrate` joins it. See [Your First CRUD](../first-crud/).

### Full app with a blank React app

```bash
npm create strutvane@latest acme -- --stack full --ui blank --yes
```

You still get the API, sign-in screens, the design and the app shell, but no generated resource screens: `resources/ui/main.tsx` starts empty and every page is yours to write. The API is still generated for every table, so your pages have endpoints to call from day one. See [Frontend](../frontend/).

### API only

```bash
npm create strutvane@latest acme-api -- --stack api --yes
```

You get routes, controllers, models, migrations, the generated CRUD API under `/api`, sign-in endpoints (`/login`, `/forgot-password`…) and **personal access tokens** for other apps. There's no `resources/ui/` and no design question.

**What you'll see** when you call the health route:

```bash
curl http://localhost:3000/up
```

```json
{ "status": "ok" }
```

The API lives under `/api`, as in Laravel. Want versioned URLs such as `/api/v1/posts`? That's opt-in: wrap your routes in a group with a prefix ([Routing](../routing/)).

:::caution[Coming in 0.2]
The installer prototype's API-only home page still links to `/api/v1/health`. The decided layout is `/api` for the API and `/up` for health, with versioning opt-in.
:::

API clients authenticate with tokens: `Authorization: Bearer svp_…`. See [Authentication](../authentication/) and [API Tokens](../api-tokens/).

## The look: Crisp or Vivid

The full kits come in one of two **designs**. A design is a package that gives every screen its colours, fonts, layout and component styles; the screens themselves stay the same.

| Design | Feel | Good for |
|---|---|---|
| **Crisp** (default) | Clean, minimal, quiet colours, dense readable tables | Back office, ERP, finance, B2B SaaS admin |
| **Vivid** | Colourful, soft-shadow cards, gradient charts, roomier spacing | Analytics, customer-facing dashboards, product consoles |

Both have light and dark modes and pass the same accessibility checks. Switch any time with `node strut design:use vivid`; your own `theme.css` stays. See [Designs](../designs/).

## Sign-in screens

The sign-in screens depend on the sign-in question, not on the kit:

| Sign-in answer | Screens (full app) | Endpoints (every kit) |
|---|---|---|
| **Email and password** (default) | Sign in, forgot password, reset password, two-factor challenge, account settings; register only if you turn on public registration | `/login`, `/logout`, `/forgot-password`, `/reset-password`, `/register` (off by default) |
| Email link only | Sign in with a link, the "check your email" page, account settings | `/email-link` and the link page |
| No sign-in | None | None: the API requires an API token on every route |

The screens are **owned by your app**: once written, they're your files to change. Public registration is **off** by default, so only people you invite or create can sign in. See [Authentication](../authentication/).

## Kits side by side

| | Full, admin | Full, blank | API only |
|---|---|---|---|
| Generated CRUD API | yes | yes | yes |
| Generated list/form/detail screens | yes | no | no |
| Sidebar, command palette, shortcuts | yes | the shell only | no |
| Sign-in screens | yes | yes | no (endpoints only) |
| Design question | yes | yes | no |
| Sample data by default | yes | no | no |
| `resources/ui/` | yes | yes | no |
| Add the UI later | — | — | `node strut install:ui` |

## Changing your mind later

Nothing is final. Every kit is the same framework with more or fewer files:

| From → to | Do this |
|---|---|
| API only → full app | `node strut install:ui` adds `@strutvane/ui`, a design, `resources/ui/` and screens for the tables you have |
| Crisp → Vivid | `node strut design:use vivid` |
| Full app → API only | Delete `resources/ui/` and `config/ui.ts`, and remove `@strutvane/ui` and the design from `package.json`. The API keeps working. |
| Turn on registration, 2FA, passkeys | Change the `features` list in `config/auth.ts` ([Authentication](../authentication/)) |

:::caution[Coming in 0.2]
`install:ui` and `design:use` are designed (the same installer protocol as `npm create`), not built yet. Switching between the admin and blank UI starters after install isn't designed in detail yet.
:::

## With Docker or without

The kit doesn't change anything about Docker. With Docker, the UI's dev server (Vite) runs inside the `app` container next to the API, still on one port. See [Docker](../docker/).

## Not included in 0.2

- **Vue, Svelte or Livewire-style kits:** 0.2 is React only (decided by the project lead). Other stacks may come later.
- **A "UI only" kit** (a React app without the API): the screens need the API's metadata, so the UI always comes with it.
- **Social login, SSO and an OAuth server** in the kits: they're installer choices that bring add-on packages. Social login is coming in 0.3; SSO and the OAuth server are coming after 1.0. Until each is published, its question isn't shown.

## Common mistakes

### The installer ignored my `--stack api` flag

```text
npm kept these options for itself, so the installer never received them: --stack api
With npm create, options go after "--". Run this instead:

  npm create strutvane@latest acme -- --stack api

Or without the "--" rule:  npx create-strutvane@latest acme --stack api
```

**Why:** without `--`, npm keeps the flags for itself (npm warns "Unknown cli config" and stores them as its own settings). The installer notices this and prints the corrected command.
**Fix:** put `--` before the installer's flags:

```bash
npm create strutvane@latest acme -- --stack api
```

### I picked API only and there's no design question

**Why:** a design styles the UI, and an API-only app has none.
**Fix:** nothing to fix. If you add the UI later with `node strut install:ui`, you're asked then.

### My generated screens are gone after switching to the blank starter

**Why:** the blank starter has no generated resource screens; it's for apps where you write every page.
**Fix:** use the admin starter (`--ui admin`) and customise screens through `resources/ui/<table>.ui.ts` instead ([Customising Screens](../crud-customising/)).

### Nobody can register

**Why:** public registration is off by default, on purpose.
**Fix:** invite or create users (`node strut user:create`), or turn on `registration` in `config/auth.ts` if your app is meant to be public.

## Next steps

- [Installation](../installation/): every question and flag.
- [Frontend](../frontend/): how the React app works.
- [Designs](../designs/): Crisp and Vivid in detail.
- [Authentication](../authentication/): sign-in features and screens.
