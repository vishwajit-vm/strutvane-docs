---
title: Designs
description: Pick the look of your admin UI when you create the app (Crisp or Vivid), restyle it with your own brand colour, font and corners, switch to another design later, or take full control by ejecting it.
---

Your app's screens (lists, forms, detail pages, the sidebar) come from `@strutvane/ui`. How they **look** comes from a separate **design package**. You pick one when you create the app, adjust it in one small file you own, and can swap it for another design later without touching a single screen.

:::tip[Coming from Laravel?]
Think of Laravel's starter kits, which each come with their own look, but with the look split out into its own package. Picking a design is like choosing between starter-kit styles; `node strut design:use vivid` swaps it later, which Laravel can't do once a kit is installed. Your overrides live in `resources/ui/theme.css`, like the Tailwind theme you'd edit in `resources/css/app.css`.
:::

:::caution[Coming in 0.2]
The two designs exist today as **clickable mockups** (spike 19 for Crisp, spike 17 for Vivid), not as packages. The installer prompt, `config/ui.ts` and `theme.css` are proven in the installer prototype (spike 13). `node strut design:use`, `node strut design:eject`, `defineDesign()` and `designConformance()` are designed, not built yet.
:::

## What a design is

A Strutvane admin is split into two parts:

| Part | Package | What it holds |
|---|---|---|
| **Behaviour** | `@strutvane/ui` | The auto CRUD screens, tables, forms, filters, the sidebar, the command palette, keyboard shortcuts and accessibility. No colours or layout chrome of its own. |
| **Look** | a **design package**, such as `@strutvane/design-crisp` | **Tokens** (named values for colour, type, spacing, radius, shadow and density, in light and dark), fonts, the **shell** (sidebar, top bar and the sign-in layout), component skins, the chart palette, empty-state illustrations, and its own `DESIGN.md`. |

Charts are a separate package, `@strutvane/charts`, not part of `@strutvane/ui`. When it's installed, it takes its palette from the design.

A **token** is a named setting, written as a CSS variable such as `--radius`, that every component reads instead of a hard-coded value. Change the token and every button, card and input follows.

Why the split: the screens never mention a colour, so a design can change everything you see without changing what any screen does. That is also why switching designs later is one command.

## The two designs

Each design is named with one short word describing its feel, so you choose by look:

| Design | Package | Feel | Good for |
|---|---|---|---|
| **Crisp** (default) | `@strutvane/design-crisp` | Clean and minimal, quiet colours, dense readable tables, business first | Back office, ERP, finance, B2B SaaS admin |
| **Vivid** | `@strutvane/design-vivid` | Colourful, soft-shadow cards, gradient charts, roomier spacing | Analytics, customer-facing dashboards, product consoles |

Both have a light and a dark mode and an accent colour of their own.

## Choosing a design when you create the app

The smallest example: create an app and press <kbd>Enter</kbd> on the design question.

```bash
npm create strutvane@latest my-app
```

**What you'll see** (the design is one of the Recommended questions, asked for full apps only):

```text
? Which design should your app use?
❯ Crisp   Clean, minimal and business-first (recommended)
  Vivid   Colourful, modern dashboards
```

The review screen lists your pick as `Design  crisp (@strutvane/design-crisp)`, and the final "Ready" box gains two lines:

```text
   Design       crisp (@strutvane/design-crisp)
   Restyle:     resources/ui/theme.css, or switch: node strut design:use vivid
```

### Choosing without questions

Every question has a flag. `--design` takes `crisp` or `vivid`; `--yes` (and CI, or no terminal) picks **Crisp**:

```bash
npm create strutvane@latest my-app -- --design vivid --yes
```

Remember the `--` before the installer's options: without it, npm keeps the flags for itself. See [Installation](../installation/).

### API-only apps have no design

The design question is asked only when you build a **full app** (API plus admin UI). An API-only project has no screens to style, so `--design` with `--stack api` is refused:

```text
These options do not work together:
  - an API-only project has no UI to style: drop --design, or use --stack full

Run with --help to see every option.
```

## What the installer writes

Two files, each with one job.

**`config/ui.ts`** says which design package styles the UI, plus the other UI answers:

```ts title="config/ui.ts"
// The look of the React UI. The screens come from @strutvane/ui (behaviour only); the design
// package @strutvane/design-crisp gives them their colours, fonts, layout shell and component styles.
//
// Switch to another design later with one command (it swaps the package and updates this file):
//   node strut design:use vivid
// Designs available: crisp, vivid.
//
// Your own brand colour, font or corner radius? Do not edit the design package: put your overrides
// in resources/ui/theme.css. That file is yours, so it stays when you switch or upgrade the design.
export default {
  design: 'crisp',
  // Light, dark, or follow the system setting (each user can still switch in the app).
  appearance: "system",
  // UI languages; add more any time (translations live in resources/ui/lang).
  languages: ["en"],
  // Installable app (PWA): home-screen icon and an offline page.
  pwa: false,
  // Live updates: tables refresh when someone else changes the data.
  liveUpdates: false,
}
```

**`resources/ui/theme.css`** is your own override file. Every line in it starts commented out, so a new app looks exactly like the design you picked. The installer also adds the design package to `dependencies` in `package.json`.

Why two files: switching design rewrites one line in `config/ui.ts`, so a brand colour you set in `theme.css` survives every switch and every design upgrade.

## Restyling with `theme.css`

`theme.css` loads **after** the design, so whatever you set there wins. Uncomment a line and change its value.

You restyle through four **public override tokens**, the same in every design:

| Token | What it changes |
|---|---|
| `--brand-hue` | The brand colour (buttons, links, focus rings, the active menu item) |
| `--font-sans` | The font of the whole UI |
| `--radius` | How round the corners of cards, inputs and buttons are |
| `--density` | How much room tables, forms and menus take |

Each design maps these four onto its own internal tokens. Crisp, for example, maps them onto its `--accent*`, `--font-ui` and `--shape-*` tokens. Set the public token, never a design's internal one, and your override works in every design.

:::caution[Coming in 0.2]
The four public tokens are decided as part of the design contract, and the conformance kit will check that setting each one really changes the rendering. The installer prototype (spike 13) writes `--brand-hue`, `--font-sans` and `--radius` into `theme.css` today, not `--density` yet. The Crisp and Vivid mockups don't map the public tokens yet (Crisp still reads its own `--accent`, `--font-ui` and `--shape-*` directly), and the values `--density` takes aren't final.
:::

### Your brand colour

The brand colour drives buttons, links, focus rings and the active menu item. It is a **hue**: a position on the colour wheel from 0 to 360 (250 is blue, 150 green, 25 red). The design derives every shade from it and keeps text readable for any hue.

```css title="resources/ui/theme.css"
:root {
  --brand-hue: 150;
}
```

**What you'll see:** after the page reloads, buttons, links and the active sidebar item turn green, in light and dark mode.

### Font and corners

A typical override sets the brand, a font and rounder corners together:

```css title="resources/ui/theme.css"
:root {
  --brand-hue: 25;
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --radius: 0.75rem;
}
```

**What you'll see:** red accents, Inter everywhere, and softer corners on cards, inputs and buttons. A web font must be loaded first, in `resources/ui/index.html`, or be installed on the computer.

### Different values in dark mode

The dark theme is switched on with a `dark` class on the page, so dark-only overrides go under `.dark`:

```css title="resources/ui/theme.css"
:root {
  --brand-hue: 250;
}

.dark {
  --brand-hue: 270;
}
```

**What you'll see:** blue accents in light mode and violet in dark mode.

## Light, dark or the system setting

Installer question 31 ("Default appearance?") sets the starting mode: **follow the system** (default), light or dark. It's saved in `config/ui.ts` as `appearance`. Each user can still switch in the app, and their choice is remembered in their browser.

```bash
npm create strutvane@latest my-app -- --appearance dark --yes
```

## Switching to another design

```bash
node strut design:use vivid
```

**What it will do:** install `@strutvane/design-vivid` with npm, and change `design: 'crisp'` to `design: 'vivid'` in `config/ui.ts`. Your screens don't change, because they only use `@strutvane/ui` components, and your `theme.css` stays as it is.

With Docker, type the command on your computer as usual: it runs inside the app container, like every `node strut` command. See [Docker](../docker/).

:::caution[Coming in 0.2]
`design:use` is designed, not built yet. The installer prototype already prints it in the Ready box and in `config/ui.ts`.
:::

## Taking full control: ejecting

When overrides aren't enough (a different sidebar layout, your own sign-in page), copy the whole design into your project:

```bash
node strut design:eject
```

**What it will do:** copy the design's source into `resources/ui/design/`. From then on that code is yours (Strutvane calls this **level L3**: you own the files and edit them freely), and design upgrades no longer reach it.

:::caution[Coming in 0.2]
`design:eject` is designed, not built yet. Eject only when you need to: an ejected design stops getting fixes from the package.
:::

## The design contract

Every design, first-party or from the community, is built with `defineDesign()` from `@strutvane/ui` and must pass its test kit, `designConformance()`:

- every **slot** (a named place a design fills, such as the sidebar or the sign-in layout) is provided;
- every public override token (`--brand-hue`, `--font-sans`, `--radius`, `--density`) is mapped, and setting it really changes the rendering;
- every token pair meets **WCAG AA** contrast (the accessibility standard for readable text) in both themes;
- there are no hard-coded colours;
- **axe** (an automatic accessibility checker) finds 0 violations on the reference screens;
- there is no sideways scrolling on a 375-pixel-wide phone screen.

:::caution[Coming in 0.2]
`defineDesign()` and `designConformance()` are designed, not built yet. The mockups already run the same kinds of checks (below).
:::

### What the mockups proved

These are mockups (clickable prototypes with sample data), not the released packages:

| | Crisp mockup (spike 19) | Vivid mockup (spike 17) |
|---|---|---|
| Screens and states | 17, light and dark | 19, light and dark |
| Tests | 162 | 63 |
| Contrast | 32 text pairs ≥ 4.5:1 and 5 non-text pairs ≥ 3:1, per theme, computed from the tokens | 31 text pairs per theme, at every accent hue in 15° steps |
| axe | 0 violations on dashboard, list and form, both themes | 0 violations on dashboard, list and form, both themes |
| Phone width | no horizontal overflow at 375 px on every route | no horizontal overflow at 375 px on every route |
| Hard-coded colours | none (tested) | none (tested) |

One known gap in Crisp: input outlines are below 3:1 against the page, a deliberate quiet-UI trade-off. Inputs are identified by their label, fill and focus ring.

## More designs later

- First-party designs are named `@strutvane/design-<name>`; community designs `strutvane-design-<name>`.
- A design appears in the installer once it is published and passes `designConformance()`. The installer reads the list from data, so a new design needs no installer change.
- The shelved **Glass** direction (spike 18) is the first candidate.

## Common mistakes

### My change to the design package disappeared

**Why:** you edited a file under `node_modules/@strutvane/design-crisp/`. That folder belongs to npm: `npm install`, an upgrade or `design:use` replaces it.

**Fix:** put the override in your own file instead:

```css title="resources/ui/theme.css"
:root {
  --brand-hue: 150;
}
```

### My override in `theme.css` does nothing

**Why:** usually one of two things. The line is still commented out (`/* --brand-hue: 250; */`), or you set a token that isn't one of the four public override tokens, such as Crisp's internal `--accent`.

**Fix:** remove the `/*` and `*/` around the line, use `--brand-hue`, `--font-sans`, `--radius` or `--density`, and reload the page. See [Restyling with `theme.css`](#restyling-with-themecss).

### The installer refuses `--design`

```text
These options do not work together:
  - an API-only project has no UI to style: drop --design, or use --stack full

Run with --help to see every option.
```

**Why:** you asked for an API-only project, which has no screens.

**Fix:** drop `--design`, or build a full app:

```bash
npm create strutvane@latest my-app -- --stack full --design vivid --yes
```

### `--design` gets "is not a choice"

```text
The command line has problems:
  - --design "glass" is not a choice. Use one of: crisp, vivid

Run with --help to see every option.
```

**Why:** only published designs that pass conformance are offered. Glass is shelved.

**Fix:** pick `crisp` or `vivid`.

### My dark-mode colour also changed light mode

**Why:** you put the dark value under `:root`, which applies to both themes.

**Fix:** put dark-only values under `.dark`:

```css title="resources/ui/theme.css"
.dark {
  --brand-hue: 270;
}
```

## Next steps

- [Frontend](../frontend/): how the React UI is organised.
- [Auto CRUD & UI](../crud/): the screens a design styles.
- [Charts](../charts/): charts take their palette from the design's tokens.
- [Installation](../installation/): every installer question, including the design.
