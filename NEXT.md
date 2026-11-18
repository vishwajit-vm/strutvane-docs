# docs/framework-0.2: bring the 0.2.x pages in line with @strutvane/framework 0.2.0-next.0

Branch of the docs repo. Source of truth for behaviour: framework `main` 6dfc239 (0.2.0-next.0).
Not pushed to `main` (push = deploy).

## Done
- Audited against the framework code (imports, API names, flags, env keys, error codes and texts,
  command output from real runs in a scratch app):
  - database: database, migrations, seeding, queries, pagination (cd5d04a)
  - ORM: orm and every orm-* page (1cfdadb)
  - HTTP: routing, controllers, middleware, csrf, requests, validation, responses, urls, errors,
    session, lifecycle, rate-limiting (8febd45)
  - setup, security, ops: installation, configuration, structure, security, encryption,
    http-client, maintenance-mode, cache, facades, optimization, helpers, logging (still
    "Coming in 0.2", ADR-0022), providers (3e1ce02)
  - framework-facing pages: authorization, console-tests, container, context, contracts,
    database-testing, deployment, events, first-crud, frontend, hashing, http-tests,
    introduction, mocking, storage, testing (2c9b4a1, WIP at the stop; build-checked afterwards)
  - boot-time database connection no longer presented as missing (a framework fix is on its
    way); first-crud and tenancy imports (5196b90)
  - CLI reference rewritten from the command declarations, Strut Console, Deprecations (now a
    real page: uppercase codes, model-first planning, v1 route builders), Upgrade Guide (lowercase
    codes, `field`, seeders, tenancy, 0.1 apps keep working), Release Notes
- Every "Coming in 0.2" box kept only where the feature is not on framework `main`.

## Next
1. **Port to the hub.** This repo is a deploy mirror: the next `npm run sync` overwrites
   `versions/0.2.x/` from hub `spikes/15-versioned-docs-site/`. Apply this branch's diff there
   (`git diff main -- versions/0.2.x` applies under `spikes/15-versioned-docs-site/`), commit in
   the hub, then sync here.
2. When the framework's compat fix and boot-time database connection land, re-check
   database.md "Who opens the connection" and orm.md "Where the ORM gets its connection".
3. When `v2/logging` merges, turn logging.md, context.md and the CLI reference's Logging
   section from "Coming in 0.2" into the real API.
4. Open decisions to settle (docs follow whichever wins): `node strut upgrade` and
   `registry:build`/`registry:watch` still ship although the catalogue lists the
   "upgrade-merge" and "registry-compiler" features as retired.

## How to verify
```bash
npm ci
npm run verify    # build every version + link check + type check + tests; run it 3x
```
