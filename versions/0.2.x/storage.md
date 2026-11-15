---
title: "File Storage"
description: "Save, read, list and delete files on named disks, accept uploads safely, keep each team's files apart, share private files with expiring links, and know what happens when a file is missing, too big or the wrong type."
---

Apps keep files: avatars, invoice PDFs, CSV exports, attachments. **File storage** gives you one small API for all of them. Files live on a **disk**: a named place such as a folder on your server (`local`) or, later, a cloud bucket (S3, Azure). Your code talks to the disk, never to paths, so moving from a folder to the cloud needs no code change.

:::tip[Coming from Laravel?]
It's Laravel's filesystem: `config/filesystems.ts` with named disks and a `default`, `Storage::disk('local')->put()` becomes `Storage.disk('local').put()`, `temporaryUrl()` gives expiring links, `visibility` is `private` or `public`, and `php artisan storage:link` becomes `node strut storage:link`.

What's different:
- **Files are private by default**, and a stored file's name is never the name the user uploaded (a random id is used instead).
- Uploads are checked by their **bytes** (magic numbers), not by the extension or the browser's claim.
- `forTenant(teamId)` gives a disk that can only see one team's files.
:::

:::caution[What exists, and when]
- **Coming in 0.2:** the local and memory disks, `config/filesystems.ts`, streaming uploads with limits, `UploadedFile`, expiring signed links and the tenant-confined disk. These are **built in 0.1** (`@strutvane/framework`, with path-traversal, atomic-write and upload attack tests) and being moved into 0.2. The `Storage` accessor is new in 0.2 (in 0.1 you get the disks from the container with `StorageManagerToken`). `storage:link` and `storage:prune-temp` are designed, not built.
- **Coming before 1.0:** S3, Azure Blob and Google Cloud disks, image fields and a virus-scan hook come with `@strutvane/files` (phase 3, which ends with 1.0). A media library is a separate package, coming after 1.0.
:::

## The smallest example

Save a text file and read it back:

```ts title="app/http/controllers/report.controller.ts"
import { Storage, type HttpContext } from '@strutvane/framework'

export class ReportController {
  async store(ctx: HttpContext): Promise<Response> {
    const disk = Storage.disk()   // the default disk, "local"
    const file = await disk.put('reports/2026-11.txt', 'Posts published this month: 128')
    return ctx.json({ data: file }, 201)
  }
}
```

**What you'll see:**

```json
{
  "data": {
    "disk": "local",
    "key": "reports/2026-11.txt",
    "size": 31,
    "contentType": "text/plain",
    "sha256": "9f2c1e7a0b4d6f8e1a3c5b7d9e0f2a4c6b8d0e1f2a3b4c5d6e7f8091a2b3c4d5",
    "visibility": "private",
    "createdAt": "2026-11-15T10:22:01.123Z"
  }
}
```

The file is now at `storage/app/reports/2026-11.txt` in your project. You can read it with `disk.get(key)` (a stream) and check it with `disk.exists(key)`.

## Disks

A new app has one private disk called `local`, at `storage/app/`. You don't need a config file for that. To add more, create `config/filesystems.ts`:

```ts title="config/filesystems.ts"
import { defineConfig } from '@strutvane/framework'

export default defineConfig({
  default: 'local',
  disks: {
    local: { driver: 'local', root: 'storage/app' },
    exports: { driver: 'local', root: 'storage/exports' },
    public: { driver: 'local', root: 'storage/public', visibility: 'public', url: '/files' },
    scratch: { driver: 'memory' },
  },
})
```

| Option | Meaning | Default |
|---|---|---|
| `driver` | `local` (a folder) or `memory` (RAM, for tests). Cloud drivers come from `@strutvane/files` | — |
| `root` | the folder, relative to the **project root** (never the current directory) | `storage/<disk name>` (`storage/app` for `local`) |
| `visibility` | the default for new files: `private` or `public` | `private` |
| `url` | the URL prefix for public files | — |
| `signingSecret` | the secret for expiring links (32+ bytes) | `APP_KEY` |

The config is checked at start-up, and the app refuses to start when something is wrong:

```text
config/filesystems.ts: disk "uploads" has unknown driver "s3" (built in: local, memory; cloud drivers come from @strutvane/files)
config/filesystems.ts: default disk "files" is not configured
config/filesystems.ts: the signing secret (signingSecret, app.key or APP_KEY) must be at least 32 bytes
```

## Everything a disk can do

| Method | What it does | Gives back |
|---|---|---|
| `put(key, body, options?)` | writes a file (string, bytes or a stream) | `StoredFile` |
| `get(key)` | reads a file as a stream | `ReadableStream`; throws "File not found: …" if missing |
| `exists(key)` | is it there? | `boolean` |
| `stat(key)` | size, type, checksum, visibility, time | `StoredFile` or `undefined` |
| `delete(key)` | deletes; deleting a missing file is **not** an error | nothing |
| `list(prefix, { cursor?, limit? })` | one page of files under a folder | `{ items, nextCursor? }` |
| `url(key)` | a permanent URL, for **public** files only | `string` |
| `temporaryUrl(key, { expiresInSeconds? })` | a signed link that expires (default 5 minutes) | `string` |

`put()` options: `contentType`, `visibility` (`private` or `public`) and `metadata` (a few small, non-secret strings).

### Keys, not paths

A **key** is a file's name on the disk, with `/` for folders: `exports/posts-2026-11.csv`. Keys are checked before anything touches the disk, so no key can escape the disk's folder:

| Refused key | Why |
|---|---|
| `../.env` | `..` would leave the folder |
| `/etc/passwd` | a leading `/` |
| `reports\2026.txt` | backslashes (Windows path tricks) |
| `.secret/x` | segments starting with a dot (reserved for the disk's own metadata) |
| a key with control characters, or longer than 1024 characters | |

A refused key throws `UnsafeKeyError` with a message such as `unsafe key segment in "../.env"`. On top of that, the local disk checks that the final path is still inside its root, on every operating system.

### Reading a file in a response

```ts title="app/http/controllers/report.controller.ts"
async show(ctx: HttpContext): Promise<Response> {
  const disk = Storage.disk('exports')
  const info = await disk.stat('posts-2026-11.csv')
  if (info === undefined) return ctx.json({ message: 'No export yet' }, 404)
  return new Response(await disk.get('posts-2026-11.csv'), {
    headers: { 'content-type': info.contentType, 'content-disposition': 'attachment; filename="posts.csv"' },
  })
}
```

The file is **streamed**: a 2 GB export never sits in memory.

### Listing a folder

```ts
let cursor: string | undefined
do {
  const page = await Storage.disk('exports').list('2026/', { limit: 100, ...(cursor ? { cursor } : {}) })
  for (const file of page.items) console.log(file.key, file.size)
  cursor = page.nextCursor
} while (cursor !== undefined)
```

## Uploads

When a form sends files (`multipart/form-data`), Strutvane reads them **as a stream**, with limits checked while the bytes arrive, into temporary files. The moment a limit is crossed, it stops reading.

| Limit | Default |
|---|---|
| bytes per file | 25 MB |
| files per request | 10 |
| bytes across all files | 100 MB |
| ordinary fields | 100, each up to 64 KB |
| parts (files + fields) | 200 |
| the whole upload | 120 seconds; 30 seconds without any data |

Each file arrives as an **`UploadedFile`**:

| Property | What it is |
|---|---|
| `fieldName` | the form field it came in |
| `clientName` | the user's file name, cleaned, **for display only** |
| `clientMime` | what the browser claimed: **never trusted** |
| `detectedMime` | what the bytes really are: this is what's checked and stored |
| `size`, `sha256` | measured while streaming |

### Validating and storing an upload

```ts title="app/http/controllers/post-attachment.controller.ts"
import { authorize, Storage, ValidationError, type HttpContext } from '@strutvane/framework'
import { uuidv7 } from '@strutvane/framework/support'
import { Post } from '../../models/post.ts'
import { PostPolicy } from '../../policies/post.policy.ts'

export class PostAttachmentController {
  readonly policy = new PostPolicy()

  async store(ctx: HttpContext): Promise<Response> {
    const post = ctx.model(Post)
    await authorize(this.policy, 'update', ctx.user, post, 'post')
    const upload = await ctx.file('attachment')   // Planned: how a controller reads uploads in 0.2 isn't final

    const issues = upload.validate({ accept: ['image/png', 'image/jpeg', 'application/pdf'], maxSize: 10 * 1024 * 1024 })
    if (issues.length > 0) throw new ValidationError(issues)

    const stored = await upload.store(`posts/${post.id}`, { storage: Storage, id: uuidv7 })
    return ctx.json({ data: stored }, 201)
  }
}
```

**What you'll see** for a good upload:

```json
{ "data": { "disk": "local", "key": "posts/42/0193a1f0-7c2d-7b4e-9a1f-2b3c4d5e6f70.pdf", "size": 48211, "contentType": "application/pdf", "originalName": "Q4 report.pdf", "visibility": "private" } }
```

The stored key is `<folder>/<random id>.<extension from the real type>`. The user's name `Q4 report.pdf` is kept only as `originalName`, for display. So a file called `../../index.html` or `invoice.pdf.exe` can't do anything.

**What you'll see** for bad uploads (a 422 with one issue per problem):

| Upload | Issue code |
|---|---|
| an empty file | `file_empty` |
| 12 MB with `maxSize` 10 MB | `file_too_large` (with `max: "10 MB"`) |
| an `.exe` renamed to `.png` | `file_type_not_allowed` (with the accepted list) |
| an SVG with `accept: ['image/*']` | `file_type_not_allowed`: wildcards never match "active" types (SVG, HTML, XML, JavaScript), which can carry script. Name `image/svg+xml` explicitly if you really want SVGs |

A file over the **request** limits (25 MB per file by default) is cut off while streaming and answered with `413`; see [Security Features](../security/).

:::caution[Coming in 0.2]
`UploadedFile`, `validate()`, `store()` and the streaming parser are built in 0.1. How a v2 controller receives uploads (`ctx.file()` above) and how upload rules join form requests are designed with the 0.2 request work, not final.
:::

### Temporary files

Uploads wait in temporary files until you `store()` them. Call `upload.discard()` for files you don't keep. `node strut storage:prune-temp` (designed) cleans up uploads left behind by crashed requests.

## Private files and expiring links

Files are **private** by default: they have no URL. To let someone download one, give them a **temporary signed link**:

```ts
const link = await Storage.disk().temporaryUrl('posts/42/0193a1f0-….pdf', { expiresInSeconds: 600 })
// → '/storage/local/posts/42/0193a1f0-….pdf?expires=1763202121&signature=Qm0z…'
```

The app serves these links itself at `/storage/<disk>/…`, checking the signature on every request. In 0.2 the signature comes from the framework's **one signer** (the same one that signs routes and auth links): an HMAC over the path, the sorted query, the expiry and a purpose, so a link can't be extended or moved to another file. Links last from 1 second to 7 days, and are served for `GET` and `HEAD` only. (0.1's storage signer, which also covered the method, is being replaced by the one signer.)

What a visitor sees:

| Link | Answer |
|---|---|
| valid | `200` with the file, `Cache-Control: private, no-store` |
| any character changed | `403` with code `invalid_signature` |
| expired | `403` with code `signature_expired` |
| the file was deleted since | `404` |
| a `POST` to the link | `405` |

Files that browsers could run as a page (HTML, SVG, XML, JavaScript) are always sent as a **download** (`application/octet-stream`, `attachment`), with `nosniff` and a sandboxing CSP, so an uploaded SVG can't run script on your domain.

Always check your policy **before** you hand out a link: anyone who has the link can download until it expires.

## Public files

For files everyone may see (a logo, published images), use a public disk with a `url`:

```ts
const file = await Storage.disk('public').put('logos/acme.png', bytes, { visibility: 'public', contentType: 'image/png' })
await Storage.disk('public').url(file.key)   // → '/files/logos/acme.png'
```

`url()` on a private file throws `"logos/acme.png" has no public URL`. Serving the public folder at `/files` is the job of `node strut storage:link` (designed, Laravel's command) or your web server.

## Keeping each team's files apart

With teams, store every team's files under that team. `forTenant()` gives a disk that **can only see one team's prefix**:

```ts
const disk = Storage.forTenant(ctx.tenant.id)   // keys live under tenants/<id>/
await disk.put('exports/posts.csv', csv)
await disk.list('')                             // only this team's files, never another's
```

`upload.store()` does the same when you pass `tenantId`. Use it for every tenant-owned file: then a bug in your own key building can't reach another customer's files.

## Tests: the memory disk

A `memory` disk keeps files in RAM and disappears when the test ends:

```ts title="config/filesystems.ts"
export default defineConfig({
  default: process.env.APP_ENV === 'testing' ? 'scratch' : 'local',
  disks: { local: { driver: 'local' }, scratch: { driver: 'memory' } },
})
```

The planned `Storage.fake()` swaps a disk for a temporary one inside one test; see [Mocking](../mocking/).

## How the local disk keeps files safe

- **Atomic writes:** a file is written under a temporary name, then renamed into place. Readers never see half a file; a failed write leaves nothing behind.
- **Metadata** (type, checksum, visibility, time) is kept next to the file in a hidden `.strutvane-meta/` folder that no key can reach.
- **Checksums:** every `StoredFile` has a SHA-256 for integrity checks.

## When things go wrong

| Situation | What happens |
|---|---|
| reading a missing file with `get()` | `FileNotFoundError: File not found: reports/x.txt` (a `404` when served) |
| `stat()` or `exists()` on a missing file | `undefined` / `false`, no error |
| deleting a missing file | nothing: delete is safe to retry |
| an unknown disk name | `Unknown storage disk "s3" (configured: local, exports, public)` |
| the disk is full or not writable | the write fails, the temporary file is removed, and the original file (if any) is untouched |
| `temporaryUrl()` on a disk without a secret | `Disk "exports" has no signing secret for temporary URLs` |
| a link valid for more than 7 days | `RangeError: expiresInSeconds must be between 1 second and 7 days` |

## With Docker or without Docker

- **Without Docker,** `storage/` is a normal folder in your project; open it in Explorer, Finder or your editor.
- **With Docker,** the project folder is shared with the `app` container, so files written in the container appear in `storage/` on your computer too.
- `storage/` is **git-ignored**, and the production `Dockerfile`'s `.dockerignore` leaves it out of the image. In a container, local files disappear when the container is replaced: mount a volume at `storage/`, or use a cloud disk (`@strutvane/files`, planned) for anything you must keep.
- On **Windows**, keys always use `/`; the disk turns them into the right path for you.

## Common mistakes

### "File not found" right after uploading

**Why:** you read the user's file name (`Q4 report.pdf`), but the file was stored under a random key.
**Fix:** save the returned `key` on your record and read with that:

```ts
await post.update({ attachment_key: stored.key })
```

### My PNG upload is refused as `file_type_not_allowed`

**Why:** the bytes aren't a PNG (a renamed file, or a WebP saved with `.png`). The check reads the bytes, not the name.
**Fix:** accept the real type (`image/webp`), or ask for a real PNG.

### `url()` throws "has no public URL"

**Why:** the file is private (the default), or the disk has no `url` option.
**Fix:** for private files, use `temporaryUrl()`. For truly public files, store them on a public disk with `visibility: 'public'`.

### Files vanish after every deploy

**Why:** the app runs in a container, and `storage/` lives inside it.
**Fix:** mount a persistent volume at `storage/`, or keep files on a cloud disk. See [Deployment](../deployment/).

### UnsafeKeyError for a key built from user input

```text
UnsafeKeyError: unsafe key segment in "../../etc/passwd"
```

**Why:** part of the key came from the request, and someone tried path traversal. The disk refused it, as designed.
**Fix:** never build keys from user text. Use ids you generated (`posts/${post.id}/${uuidv7()}.pdf`).

## Next steps

- [Validation](../validation/): how upload issues reach your forms.
- [Security Features](../security/): body limits, uploads and downloads.
- [Teams & Tenancy](../tenancy/): what else is kept apart per team.
- [Files package](../packages/files/): cloud disks and media, later.
