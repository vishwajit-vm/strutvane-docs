---
title: Frontend
description: How the React UI is served next to your API on one port, where its files live, how to restyle it, how to add your own pages and components, how it talks to the API safely, and how to build it for production.
---

A full-stack Strutvane app has two halves in one project: the **API** (your routes and controllers, answering JSON under `/api`) and the **UI** (a React app that runs in the browser and calls that API). `npm run dev` serves both on **one port**, with hot reload, so you never juggle two servers.

The UI is built with **React 19**, **Vite** (the tool that serves and bundles the browser code), **Tailwind CSS 4** (styling with utility classes) and **shadcn-style components**: component files that are copied into your project, so you own and can change every one of them.

:::tip[Coming from Laravel?]
There's no Blade and no `resources/views`. The closest Laravel setup is a React starter kit with Inertia, except there's no Inertia layer: the React app calls your JSON API directly, and the admin screens Filament would give you are generated for you.

Vite works like `laravel-vite-plugin`, but you don't run `npm run dev` *and* `php artisan serve`: one `npm run dev` serves everything on one port.
:::

:::caution[Coming in 0.2]
The generated screens, sidebar, command palette and conveniences are **proven in a prototype** (spike 14: 133 tests, axe accessibility checks on 11 screens). In that prototype the UI runs on its own Vite server with a mock API; serving it inside `npm run dev` on the API's port, the generated API client (`.strutvane/client.gen.ts`) and owned page overrides are designed, not built yet.
:::

## The smallest example

Create a full-stack app (the installer's default) and start it:

```bash
npm create strutvane@latest my-app
cd my-app
npm run dev
```

**What you'll see** in the terminal:

```text
  My App  development
  App + API   http://localhost:3000
  Press Ctrl+C to stop
```

Open [http://localhost:3000](http://localhost:3000): the sign-in page, then the dashboard with the sidebar. Now open `resources/ui/theme.css`, uncomment one line and save:

```css title="resources/ui/theme.css"
:root {
  --brand-hue: 150;
}
```

**What you'll see:** without reloading, buttons, links, focus rings and the active menu item turn green. That's hot reload: Vite swaps the changed file in the open page.

## How one port serves both

```text
Browser ── http://localhost:3000 ──┐
                                   │
                    ┌──────────────┴──────────────┐
                    │  your Strutvane app          │
                    │                              │
  /api/…  ───────►  │  routes/api.ts → JSON        │
  /up     ───────►  │  health check                │
  /…      ───────►  │  routes/web.ts → React app   │  ◄── Vite (development: hot reload)
                    └──────────────────────────────┘      build/ (production: built files)
```

- Requests to **`/api/…`** go to your API routes and answer JSON.
- Every other page address (`/`, `/posts`, `/posts/hello-world`) goes to `routes/web.ts`, which answers with the React app's HTML shell. React then reads the address and shows the right screen in the browser.
- In **development**, Vite serves the browser code with hot reload. In **production**, `npm run build` writes the bundled files to `build/` and the server serves those.

Because the page and the API share one origin (same scheme, host and port), the browser sends the session cookie to the API by itself, and there's no CORS setup to get wrong. See [CSRF Protection](../csrf/) for how unsafe requests stay safe.

### The web route that serves the shell

You rarely touch it, but here is what a web route serving the React app looks like (this is the one from the application core prototype):

```ts title="app/http/controllers/spa.controller.ts"
import { Controller, config, type HttpContext } from '@strutvane/framework'

/** The web side is a React app (resources/ui): web routes return its HTML shell. */
export class SpaController extends Controller {
  show(ctx: HttpContext): Response {
    // The app name goes into HTML, so strip characters that could break out of the title.
    const title = config('app.name').replace(/[<>&"]/g, '')
    return ctx.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><script type="module" src="/build/app.js"></script></head><body><div id="root"></div></body></html>`)
  }
}
```

```ts title="routes/web.ts"
import { defineRoutes, Route } from '@strutvane/framework'
import { SpaController } from '../app/http/controllers/spa.controller.ts'

export default defineRoutes([
  Route.get('/', [SpaController, 'show']).name('home'),
  Route.get('/posts/{post:slug}', [SpaController, 'show']).name('posts.page'),
])
```

## Where the UI files live

```text
resources/ui/
├─ index.html        the page shell: <div id="root"> and the script tag
├─ main.tsx          the React entry point
├─ theme.css         your brand colour, font and corner radius (yours)
├─ posts.ui.ts       one per table: columns, form, filters, sidebar entry (yours)
├─ pages/            your own screens
├─ components/       your own components, and the shadcn-style ones you copied
└─ lang/             UI translations (one file per language you picked)
config/ui.ts         which design, light/dark, languages, PWA, live updates
```

| File | Written by | Overwritten later? |
|---|---|---|
| `index.html`, `main.tsx` | the installer | Never |
| `theme.css` | the installer, every line commented out | Never |
| `<table>.ui.ts` | `node strut migrate`, the first time a table appears | Never |
| `config/ui.ts` | the installer; `node strut design:use` changes the `design` line | Only that line, by that command |
| `.strutvane/ui.gen.ts` | `node strut migrate` | Every migrate (don't edit) |

## Restyling: `theme.css`

The look comes from a **design package** (Crisp or Vivid, chosen in the installer). Your own changes go in `resources/ui/theme.css`, which loads after the design, so whatever you set wins. Every line starts commented out, so a new app looks exactly like the design.

### Small: one brand colour

```css title="resources/ui/theme.css"
:root {
  /* An OKLCH hue from 0 to 360: 250 = blue, 150 = green, 25 = red. */
  --brand-hue: 25;
}
```

**What you'll see:** every accent turns red. The design derives every shade from the hue and keeps text readable (WCAG AA contrast) for **any** hue, in light and dark mode. That's tested by checking every hue in 15° steps.

### Typical: brand colour, font and corners

```css title="resources/ui/theme.css"
:root {
  --brand-hue: 280;
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --radius: 0.75rem;
}
```

Load the font in `resources/ui/index.html` first (or pick one every computer has). `--radius: 0` gives square corners.

### Density

`--density` makes tables and forms more compact or roomier, for every screen at once. It is one of the four public override tokens (`--brand-hue`, `--font-sans`, `--radius`, `--density`) that every design must honour; the values it accepts are set by the design contract.

### Advanced: a whole new look

Switch to the other design with one command; your `theme.css` stays:

```bash
node strut design:use vivid
```

**What you'll see:** the package is installed, `design: 'vivid'` is written in `config/ui.ts`, and the screens keep working, because they only use `@strutvane/ui` components. To take full control of every colour and layout piece, `node strut design:eject` copies the design's source into `resources/ui/design/`. See [Designs](../designs/).

:::caution[Coming in 0.2]
`design:use` and `design:eject` are designed; the installer prototype writes `config/ui.ts` and `theme.css`, and the two designs are being built.
:::

## Light and dark mode

`config/ui.ts` sets the starting appearance: `'system'` (follow the computer's setting, the default), `'light'` or `'dark'`. Each user can still switch in the app's top bar, and their choice is remembered in their browser.

```ts title="config/ui.ts"
export default {
  design: 'crisp',
  appearance: 'system',
  languages: ['en'],
  pwa: false,
  liveUpdates: false,
}
```

## Your own pages

Generated screens cover lists, forms and detail pages. For anything else (a report, a wizard, a kanban board), write a React component in `resources/ui/pages/`:

```tsx title="resources/ui/pages/reports/index.tsx"
export default function ReportsPage() {
  return (
    <section>
      <h1>Reports</h1>
      <p>Your monthly numbers will be here.</p>
    </section>
  )
}
```

Build custom screens from the same pieces the generated ones use: a page header with breadcrumbs, cards, and the shadcn-style components (button, input, select, switch, badge, alert, dialog, dropdown menu, toast, skeleton). Then they look and behave like the rest of the app, in both themes and in both designs. Never hard-code colours (`#ff0000`, `bg-red-500`): use the tokens (`bg-primary`, `text-muted-foreground`), so dark mode and every design keep working.

To put the page in the sidebar, register an entry from a service provider. See [Sidebar](../crud-sidebar/).

:::caution[Coming in 0.2]
The routing of owned pages (which file answers which address) and owned overrides of a generated screen are designed, not prototyped yet. The component set and the design rules are proven in spike 14.
:::

## Talking to the API

The generated screens use a typed API client: `node strut migrate` writes `.strutvane/client.gen.ts` from your routes, so a call to a route that doesn't exist, or with the wrong fields, is a compile error in the browser code too.

What the UI does for you on every request:

- sends the session cookie (same origin) and the **CSRF token**: the framework sets an `XSRF-TOKEN` cookie that JavaScript can read, and the client copies it into an `X-XSRF-TOKEN` header, so your forms pass the CSRF check with no code;
- turns a `422` problem into messages under the right fields, and focuses the first one;
- retries reads twice when the network drops or the server answers 5xx (never writes, never 4xx);
- shows a friendly error with **Retry** when the answer isn't JSON (a proxy's 502 page, for example).

For a plain `fetch` in your own page, read the token from the `XSRF-TOKEN` cookie and send it back as the `X-XSRF-TOKEN` header:

```tsx title="resources/ui/pages/reports/publish-button.tsx"
export function PublishButton({ slug, token }: { slug: string; token: string }) {
  async function publish(): Promise<void> {
    const response = await fetch(`/api/posts/${encodeURIComponent(slug)}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-xsrf-token': token },
      body: '{}',
    })
    if (!response.ok) throw new Error(`Publishing failed with ${response.status}`)
  }
  return <button onClick={() => void publish()}>Publish</button>
}
```

**What you'll see:** `200` and the published post, or a problem+json body such as `403 forbidden` if the policy says no.

:::caution[Coming in 0.2]
`.strutvane/client.gen.ts` (the typed client) and the "Zod schema per table" for live form validation are designed. In the prototype the UI uses a small transport-injected client with defensive problem+json parsing. See [Precognition](../precognition/) for live validation.
:::

## Hiding what people may not do

The sidebar hides a resource the user may not `viewAny`, and screens hide buttons the policy wouldn't allow (a viewer sees no Edit or Delete). **Hiding is not security**: the API refuses the same actions with `401`, `403` or `404`, whatever the browser shows. A UI `can()` hook that asks the same policies is planned, so your own pages can hide buttons the same way. See [Authorization](../authorization/).

## Security in the browser

- **React escapes everything** you render, so a post title like `<script>` shows as text.
- **Content-Security-Policy:** pages are served with a CSP that blocks inline scripts without the per-request **nonce** (a random value for one response). A server-rendered page puts `ctx.nonce` on its inline `<script>` and `<style>` tags.
- **CSRF:** the React app sends the token header itself. A plain HTML form rendered by the server uses `csrf_field(ctx)` (a hidden `_token` input), and `csrf_meta(ctx)` adds `<meta name="csrf-token">` to a page's head. See [CSRF Protection](../csrf/).
- **Secret columns** (passwords, tokens, keys) never reach the browser: they're never serialised by the API, so no screen can show them.

```ts title="app/http/controllers/plain-form.controller.ts"
import { Controller, csrf_field, csrf_meta, type HttpContext } from '@strutvane/framework'

export class PlainFormController extends Controller {
  show(ctx: HttpContext): Response {
    return ctx.html(`<!doctype html><html><head>${csrf_meta(ctx)}<script nonce="${ctx.nonce}">console.log('allowed')</script></head>
<body><form method="post" action="/newsletter">${csrf_field(ctx)}<input name="email"><button>Join</button></form></body></html>`)
  }
}
```

## Building for production

```bash
npm run build      # bundles the UI and compiles the app into build/
npm start          # runs build/server.js
```

**What you'll see:** Vite prints the bundles it wrote (JavaScript, CSS, fonts) with their sizes, then the server starts. In production there's no Vite server and no hot reload: the server sends the built files from `build/`. See [Deployment](../deployment/) and [Optimization](../optimization/).

## With Docker or without

| | With Docker | Without Docker |
|---|---|---|
| Where Vite runs | Inside the `app` container, started by `npm run dev` | On your computer |
| Hot reload | Works on Windows and macOS through the shared folder; on Windows, keeping the project inside WSL2 makes file watching faster | Native file watching |
| Adding a UI package | `node strut npm install <package>` (runs npm in the container) | `npm install <package>` |

Ports are published on `127.0.0.1` only, so the dev server isn't reachable from your network.

## API only? Adding the UI later

If you picked **API only**, there's no `resources/ui/`. Add the UI later with one command:

```bash
node strut install:ui
```

It installs `@strutvane/ui` and a design, writes `resources/ui/`, `config/ui.ts` and `theme.css`, and generates screens for the tables you already have. See [Starter Kits](../starter-kits/).

:::caution[Coming in 0.2]
`install:<name>` is designed (the same installer protocol as `npm create`), not built yet.
:::

## What isn't included

| Laravel feature | In Strutvane |
|---|---|
| Blade views | Not included: React owns the pages. Emails will use React components as templates. |
| Inertia, Livewire | Not included: the React app calls the JSON API directly. |
| Folio (file-based pages) | Not for now: your React app owns its routes. It may come back if people ask. |
| Vue, Svelte starters | Not in 0.2 (React only); other stacks may come later. |

## Common mistakes

### My colour change in `theme.css` does nothing

**Why:** the line is still inside a comment (`/* … */`), or it's outside the `:root { … }` block.
**Fix:** remove the `/*` and `*/` around the line, keep it inside `:root`, and save.

### I edited a design package in `node_modules/` and lost my change

**Why:** `node_modules/` is replaced on every install and upgrade.
**Fix:** put overrides in `resources/ui/theme.css`, or run `node strut design:eject` to own the design's source.

### A button colour looks wrong in dark mode

**Why:** a hard-coded colour (`#2563eb`, `bg-blue-600`, `text-white`) doesn't change with the theme.
**Fix:** use tokens: `bg-primary text-primary-foreground`. The design defines both themes for every token.

### The browser blocks my inline script

```text
Refused to execute inline script because it violates the following Content Security Policy directive: "script-src 'nonce-…'"
```

**Why:** the CSP allows inline scripts only with this response's nonce.
**Fix:** add `nonce="${ctx.nonce}"` to the tag in server-rendered HTML, or move the code into the React app.

### My `fetch` POST gets 419 "Page expired"

**Why:** an unsafe request with the session cookie didn't prove it came from your pages (no CSRF token, wrong `Origin`).
**Fix:** use the generated client, or send the `X-XSRF-TOKEN` header as above. See [CSRF Protection](../csrf/).

### I opened http://localhost:5173 and the API calls fail

**Why:** that's Vite's own port. Your app (API and UI together) is on the port `npm run dev` prints, usually 3000.
**Fix:** open [http://localhost:3000](http://localhost:3000).

## Next steps

- [Designs](../designs/): Crisp and Vivid, and how to switch.
- [Resources](../crud/): the generated screens.
- [Customising Screens](../crud-customising/): change columns, forms and filters.
- [Starter Kits](../starter-kits/): full app, API only, or a blank React app.
