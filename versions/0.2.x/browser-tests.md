---
title: "Browser Tests"
description: "Test your app the way people use it, in a real browser with Playwright: set it up, sign in, click through the generated screens, run headless in CI, and fix the usual failures (browsers not installed, the app not running, flaky waits)."
---

A **browser test** opens your app in a real browser (Chromium, Firefox or WebKit), clicks buttons, fills forms and checks what appears on screen. It tests everything at once: the React UI, the API, the database and the sign-in. Browser tests are slower than [HTTP tests](../http-tests/) (seconds instead of milliseconds), so keep a handful for the journeys that must never break: signing in, creating a post, the checkout.

Strutvane uses **Playwright**, a free, open-source browser-testing tool from Microsoft. It runs **headless** (without a visible window) by default, which is what CI needs, and can open a visible browser when you want to watch.

:::tip[Coming from Laravel?]
This is the job of Laravel Dusk. `php artisan dusk` → `npm run test:e2e`, `$browser->visit('/login')->type('email', …)->press('Sign in')` → `await page.goto('/login')`, `await page.getByLabel('Email').fill(…)`, `await page.getByRole('button', { name: 'Sign in' }).click()`.

What's different: Playwright drives the browser directly (no ChromeDriver to keep in sync), waits for elements on its own, and runs Chromium, Firefox and WebKit.
:::

:::caution[What exists, and when]
- **Planned after 0.3:** `@strutvane/browser-testing` (phase 7) adds ready-made **page objects** for the generated screens (the posts list, the create form, the sidebar), sign-in helpers and test data set-up.
- **Proven in the installer prototype (spike 13):** choosing "Vitest + Playwright" (installer question 23) adds an `npm run test:e2e` script (`playwright test`), a `tests/browser/` folder, and the Playwright extension in the recommended VS Code extensions. Because that answer brings `@strutvane/browser-testing`, the installer only offers it once that package is published.
- **Works today, without Strutvane's package:** plain Playwright, set up by hand as below. Nothing on this page needs code from Strutvane.
:::

## The smallest example

1. Add Playwright to your app and download a browser (once per computer):

   ```bash
   npm install --save-dev @playwright/test
   npx playwright install chromium
   ```

2. Tell Playwright where your app runs:

   ```ts title="playwright.config.ts"
   import { defineConfig } from '@playwright/test'

   export default defineConfig({
     testDir: 'tests/browser',
     use: { baseURL: process.env.APP_URL ?? 'http://localhost:3000' },
     webServer: { command: 'npm run dev', url: 'http://localhost:3000/up', reuseExistingServer: true },
   })
   ```

3. Write a test:

   ```ts title="tests/browser/home.spec.ts"
   import { expect, test } from '@playwright/test'

   test('the sign-in page loads', async ({ page }) => {
     await page.goto('/login')
     await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
   })
   ```

4. Add the script (the installer adds it when you pick Playwright) and run it:

   ```json title="package.json"
   { "scripts": { "test:e2e": "playwright test" } }
   ```

   ```bash
   npm run test:e2e
   ```

**What you'll see** (something like this):

```text
Running 1 test using 1 worker
  ✓  1 tests/browser/home.spec.ts:3:1 › the sign-in page loads (812ms)

  1 passed (3.1s)
```

`webServer` starts `npm run dev` if your app isn't already running, waits until `/up` answers, and stops it at the end. With `reuseExistingServer: true`, an app you already started is used as is.

## A typical test: sign in and create a post

```ts title="tests/browser/posts.spec.ts"
import { expect, test } from '@playwright/test'

test('an author creates a post from the admin screens', async ({ page }) => {
  // Sign in
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@my-app.test')
  await page.getByLabel('Password').fill(process.env.E2E_ADMIN_PASSWORD ?? '')
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Open Posts from the sidebar and create one
  await page.getByRole('link', { name: 'Posts' }).click()
  await page.getByRole('button', { name: 'New post' }).click()
  await page.getByLabel('Title').fill('Written by a robot')
  await page.getByRole('button', { name: 'Save' }).click()

  // It's in the list, with its slug
  await expect(page.getByText('Written by a robot')).toBeVisible()
  await expect(page).toHaveURL(/\/posts\/written-by-a-robot/)
})
```

**What you'll see:** `✓ … an author creates a post from the admin screens (2.4s)`.

Labels and button names here are those of the generated screens as designed; they can differ slightly in your design or language. Finding elements **by role and label** (`getByRole`, `getByLabel`) instead of CSS classes keeps tests working when the design changes, and checks that the screens are accessible at the same time.

:::caution[Coming in 0.2]
The generated admin screens (sign-in, the posts list and form, the sidebar) are designed for 0.2; the exact labels aren't final. The first admin's password is shown once by the installer and must be changed at first sign-in, so give browser tests their own test user (below) instead of the admin.
:::

## Test data and the test database

Browser tests talk to a **running app**, so they can't use the per-test transaction that feature tests use. Keep them predictable:

1. Point the app at the **test database** while browser tests run (`DB_DATABASE` set to your `DB_TEST_DATABASE` value).
2. Before the run, reset it and seed a known user:

   ```bash
   node strut migrate:fresh --seed
   ```

3. Give each test its own data (a unique title such as `Written by a robot ${Date.now()}`), so tests don't trip over each other.

Never run browser tests against your development or production data: they create and delete records.

## Watching, debugging and recording

| Command | What it does |
|---|---|
| `npx playwright test --headed` | opens a visible browser window |
| `npx playwright test --ui` | Playwright's UI mode: pick tests, watch them step by step, time-travel through each action |
| `npx playwright test --debug` | pauses at each step with an inspector |
| `npx playwright show-report` | opens the HTML report of the last run, with screenshots of failures |
| `npx playwright codegen http://localhost:3000` | records your clicks and writes the test code for you |

Turn on traces for failures, so a CI failure comes with a replay:

```ts title="playwright.config.ts"
use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
```

## More browsers and phones

```ts title="playwright.config.ts"
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/browser',
  use: { baseURL: 'http://localhost:3000' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'phone', use: { ...devices['iPhone 13'] } },
  ],
  webServer: { command: 'npm run dev', url: 'http://localhost:3000/up', reuseExistingServer: true },
})
```

Install the extra browsers once: `npx playwright install firefox webkit`. The designs promise no horizontal scrolling at 375 px wide, which a phone project is a good way to check.

## In CI

The generated GitHub Actions workflow runs `npm test`. For browser tests, add a job that installs the browser with its system libraries and runs headless:

```yaml title=".github/workflows/e2e.yml"
name: Browser tests
on: [push]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm ci --ignore-scripts
      - run: npx playwright install --with-deps chromium
      - run: node strut migrate:fresh --seed --force
      - run: npm run test:e2e
        env: { E2E_ADMIN_PASSWORD: '${{ secrets.E2E_ADMIN_PASSWORD }}' }
```

Pin the actions to commit SHAs in a real project, as Strutvane's own repositories do.

## Platform and Docker differences

- **Windows, macOS, Linux:** Playwright runs on all three. On Linux, `npx playwright install --with-deps` also installs the system libraries the browsers need (it may ask for `sudo`).
- **With Docker:** run Playwright **on your computer**, not in the `app` container. The app container has no browsers, and the app is reachable from your computer at `http://localhost:3000`. Use `reuseExistingServer: true` and start the app with `npm run dev` first.
- **WSL2 on Windows:** run Playwright inside WSL (where your project lives) for speed; headed mode needs WSLg (Windows 11).

## Common mistakes

### "Executable doesn't exist" when the tests start

```text
Error: browserType.launch: Executable doesn't exist at …/ms-playwright/chromium-…/chrome-linux/chrome
╔════════════════════════════════════════════════════════════╗
║ Looks like Playwright was just installed or updated.       ║
║ Please run the following command to download new browsers: ║
║     npx playwright install                                 ║
╚════════════════════════════════════════════════════════════╝
```

**Why:** the browsers are downloaded separately from the npm package, once per computer (and again after a Playwright upgrade).
**Fix:**

```bash
npx playwright install chromium
```

### "connect ECONNREFUSED 127.0.0.1:3000"

**Why:** the app isn't running and `webServer` isn't configured, or it started on another port (the installer picks a free port).
**Fix:** add `webServer` to the config, and use the port from `APP_URL` in `.env`.

### A test passes locally and fails in CI with a timeout

**Why:** a fixed wait (`page.waitForTimeout(1000)`) that's long enough on your laptop and too short on a busy CI machine.
**Fix:** wait for what you expect to see instead; Playwright retries until it appears:

```ts
await expect(page.getByText('Saved')).toBeVisible()
```

### The test signs in but lands on "Change your password"

**Why:** it signed in as the installer's first admin, whose generated password must be changed at first sign-in.
**Fix:** seed a dedicated test user for browser tests and sign in as that user.

### Tests change my development data

**Why:** the running app uses the development database.
**Fix:** start the app for browser tests with `DB_DATABASE` set to the test database, and reset it before each run.

## Next steps

- [Testing](../testing/): which kind of test to write for what.
- [HTTP Tests](../http-tests/): fast tests for everything the browser test doesn't need to cover.
- [Browser testing package](../packages/browser-testing/): page objects for generated screens, later.
- [Deployment](../deployment/): the `/up` health route `webServer` waits for.
