---
title: "Database: Getting Started"
description: "Connect your app to MySQL, MariaDB, PostgreSQL or SQLite, on your own server (XAMPP, WAMP, MAMP, Laragon, Postgres.app, a local install, the cloud) or in Docker, run safe raw SQL, watch every query, and know which database commands exist."
---

Almost every app keeps its data in a **database**: a program that stores tables of rows and answers questions about them. Strutvane talks to four of them: **MySQL 8.4+** (the default), **MariaDB**, **PostgreSQL** and **SQLite**, on your own server or in Docker. This page shows how to connect, how to pick one, how to run your own SQL safely, and which database commands you have.

Most of the time you won't write SQL at all: [migrations](../migrations/) create your tables and [models](../orm/) read and write rows. This page is about the layer underneath.

:::tip[Coming from Laravel?]
It's `.env` again: `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` keep their names, as do `DB_URL`, `DB_SOCKET` and `DB_SSLMODE`, and `DB_CONNECTION` takes `mysql`, `mariadb`, `pgsql` or `sqlite`. Like Laravel, any server works: XAMPP, WAMP, MAMP, Laragon, Postgres.app, a normal install or the cloud; Docker is optional. `DB::select('… where id = ?', [1])` becomes ``defaultConnection().run(sql`… WHERE id = ${1}`)``: the `sql` tag binds values for you, and there's deliberately no way to pass a plain string. `DB::transaction` becomes `transaction()`, and `DB::listen` becomes `onQuery()`.
:::

## The smallest working setup

For SQLite, the whole configuration is two lines in `.env`:

```bash title=".env"
DB_CONNECTION=sqlite
DB_DATABASE=database/database.sqlite
```

SQLite is built into Node.js 24 (`node:sqlite`), so there's nothing to install. The file is created the first time Strutvane opens it; its folder (`database/`) must exist.

Check that it works:

```bash
node strut migrate:status
```

**What you'll see:** the connection Strutvane used (never the password), then one row per migration:

```text
Database: sqlite:C:\code\my-app\database\database.sqlite
Migration                              Status
2026_11_15_093000_create_posts_table   pending
```

After `node strut migrate`, the status says `ran (batch 1)`. If the database can't be reached, you'll see the error instead (see [Common mistakes](#common-mistakes)).

## Which database should I use?

| | MySQL 8.4+ | MariaDB | PostgreSQL | SQLite |
|---|---|---|---|---|
| **Pick it when** | You want the default, the most hosting choices, or you know MySQL | You already have it (XAMPP, WAMP and many Linux systems ship MariaDB) | You have **teams**: PostgreSQL adds a second wall between teams' data (row-level security) | You want zero setup: a demo, a prototype, a tiny internal tool |
| **`DB_CONNECTION`** | `mysql` | `mariadb` | `pgsql` | `sqlite` |
| **Driver to install** | `npm install mysql2` | `npm install mysql2` | `npm install pg` | none (built into Node.js) |
| **Runs as** | A server: your own, or Docker | A server: your own, or Docker | A server: your own, or Docker | A single file in your project |
| **Production** | Yes | Yes | Yes | Small, single-server apps only |
| **Failed migration** | Earlier statements of that migration stay applied; the next `migrate` resumes after them | Same as MySQL | Rolled back completely | Rolled back completely |

The drivers are **optional peer dependencies** of `@strutvane/framework`: you install the one for your database, and the others never land in your `node_modules`.

Your migrations, models and queries are the same on all of them; Strutvane smooths over the differences (booleans, decimals, dates, text length). Switching later means changing `.env` and running `node strut migrate` on the new database.

**Docker is optional.** Every server database works with a server you already have (XAMPP, WAMP, MAMP, Laragon, Postgres.app, a normal install, or a cloud database) or with a database container. Pick whichever you like; nothing else in your app changes.

## Connection settings

The settings live in `.env`. The database commands (`migrate`, `migrate:*`, `db:seed`) load `.env` from your project folder; a variable that is already set in your shell or your server's environment **wins** over the file, and `--env staging` loads `.env.staging` too. See [Configuration](../configuration/) for how `.env` works.

| Key | What it is | Default when empty | Example |
|---|---|---|---|
| `DB_CONNECTION` | Which database: `mysql`, `mariadb`, `pgsql` or `sqlite` (`postgres` and `postgresql` are accepted as other names for `pgsql`) | `mysql`, or the engine `DB_URL` names | `mysql` |
| `DB_HOST` | Where the server is: `127.0.0.1` for a server on your computer, the service name with Docker, a host name for a remote server | `127.0.0.1` | `127.0.0.1` |
| `DB_PORT` | The server's port | `3306` (MySQL, MariaDB), `5432` (PostgreSQL) | `8889` (MAMP) |
| `DB_DATABASE` | The database's name, or the file for SQLite (relative to your project folder, or `:memory:`) | `strutvane`; for SQLite `database/database.sqlite` | `my_app` |
| `DB_USERNAME` | The user the app signs in as | `root` (MySQL, MariaDB), `postgres` (PostgreSQL) | `my_app` |
| `DB_PASSWORD` | Its password. Leave it empty for a local server without one (XAMPP, Laragon) | none | |
| `DB_URL` | Everything above in one **connection string** (`mysql://`, `mariadb://`, `postgres://` or `postgresql://`); wins over the separate keys | none | `mysql://my_app:secret@db.example.com:3306/my_app` |
| `DB_SOCKET` | A Unix **socket** instead of host and port: the MySQL/MariaDB socket file, or PostgreSQL's socket folder (macOS and Linux) | none | `/Applications/MAMP/tmp/mysql/mysql.sock` |
| `DB_SSLMODE` | Whether to encrypt the connection: `disable`, `prefer`, `require`, `verify-ca` or `verify-full` (see [the table below](#a-remote-or-cloud-database-with-ssl)) | no encryption | `verify-full` |
| `DB_SSL_CA` | The path to the server's certificate authority file, for `verify-ca` and `verify-full` (relative to your project folder) | none | `storage/certs/ca.pem` |
| `DB_MIGRATION_LOCK_TIMEOUT` | PostgreSQL: how long one schema change in a migration may wait for a table that live traffic is using, before it fails instead of queueing every request behind it: `10s`, `30000` (milliseconds) or `2min`; `0` waits forever | `10s` | `30s` |

A **socket** is a file the database server listens on when the app runs on the same machine; it skips the network. A **connection string** is the address of a database written as one line, the way cloud providers hand it to you. In a connection string, characters like `@`, `:` or `/` inside the password must be written in percent form (`@` is `%40`).

**Strutvane checks these settings before connecting** and lists **every** problem at once, naming the key but never printing a value. For example, with `DB_PORT=abc` and `DB_SSLMODE=on`:

```text
error Invalid environment: 2 problems.
  - DB_PORT: must be a port number from 1 to 65535
  - DB_SSLMODE: must be disable, prefer, require, verify-ca or verify-full
hint: Fix: set these keys in your .env file (see .env.example for every key and its meaning), then run the command again. `node strut env:check` compares the two.
```

The command stops with exit code **3** (a configuration problem), before anything touches the database.

:::caution[Coming in 0.2]
These keys are read by the database commands on framework `main` today. Still to come with 0.2: the installer's connection test with plain-language errors, `DB_TEST_DATABASE` (a separate database for `npm test`), and `DB_MIGRATION_USERNAME` / `DB_MIGRATION_PASSWORD` (see [PostgreSQL: two database users](#postgresql-two-database-users)). Until then, the framework does not read those three keys.
:::

## Using your own database server (no Docker)

This is the most common setup on a laptop: you already have a database server, and Strutvane uses it.

The general recipe, whatever your server:

1. **Start the server** (each tool below says how).
2. **Find its port, user and password.** The sections below list each tool's usual defaults; your install may differ.
3. **Create the database** (and a test database, if you want one).
4. **Install the driver** (`npm install mysql2` for MySQL and MariaDB, `npm install pg` for PostgreSQL) and **fill in `.env`**.
5. **Check it:** `node strut migrate:status`, then `node strut migrate`.

### XAMPP (Windows, macOS, Linux)

XAMPP ships **MariaDB** (shown as "MySQL" in its control panel).

1. Open the **XAMPP Control Panel** and click **Start** next to **MySQL**. The row turns green.
2. The usual defaults: user `root`, **empty password**, port `3306`.
3. Create the databases in phpMyAdmin (`http://localhost/phpmyadmin`, the **SQL** tab):

   ```sql
   CREATE DATABASE my_app CHARACTER SET utf8mb4;
   CREATE DATABASE my_app_test CHARACTER SET utf8mb4;
   ```

4. Install the driver and fill in `.env`:

   ```bash
   npm install mysql2
   ```

   ```bash title=".env"
   DB_CONNECTION=mariadb
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_DATABASE=my_app
   DB_USERNAME=root
   DB_PASSWORD=
   ```

**What you'll see** on `node strut migrate`: `Database: mariadb://root@127.0.0.1:3306/my_app`, then one `✔ Migrated …` line per migration. An empty password is fine on your own computer; never on a server.

`DB_CONNECTION=mysql` works too: when Strutvane connects, it asks the server for its version (`SELECT VERSION()`), notices it's MariaDB and uses MariaDB's SQL. XAMPP's MariaDB 10.4 works; MariaDB 10.5 and newer also give Strutvane `INSERT … RETURNING`, which saves one query per new row.

### WAMP (Windows)

WampServer can run **MySQL and MariaDB side by side**, each on its own port.

1. Start WampServer and wait for its tray icon to turn **green**.
2. Left-click the tray icon, open **MySQL** or **MariaDB**, and note the **port** it shows (each engine has its own). The user is `root`, usually with an empty password.
3. Create the databases in phpMyAdmin (`http://localhost/phpmyadmin`) with the same SQL as XAMPP.
4. Fill in `.env` with `DB_CONNECTION=mysql` or `mariadb`, the port you noted, `DB_USERNAME=root` and an empty `DB_PASSWORD`.

If both engines run, make sure `DB_PORT` points at the one you mean: the wrong one answers with "Unknown database".

### MAMP (macOS, Windows)

MAMP's MySQL listens on port **8889** by default, not 3306, and its user is `root` with the password `root`.

1. Open MAMP and click **Start**.
2. Create the databases in phpMyAdmin (from MAMP's start page) with the same SQL as XAMPP.
3. Fill in `.env`:

   ```bash title=".env"
   DB_CONNECTION=mysql
   DB_HOST=127.0.0.1
   DB_PORT=8889
   DB_DATABASE=my_app
   DB_USERNAME=root
   DB_PASSWORD=root
   ```

On macOS you can use MAMP's socket instead of the port: `DB_SOCKET=/Applications/MAMP/tmp/mysql/mysql.sock` (then `DB_HOST` and `DB_PORT` are ignored).

### Laragon (Windows)

1. Open Laragon and click **Start All**.
2. The usual defaults: MySQL on port `3306`, user `root`, **empty password**. Laragon's **Database** button opens a client where you can run the `CREATE DATABASE` lines.
3. Fill in `.env` like XAMPP's, with `DB_CONNECTION=mysql`.

### A normal MySQL or MariaDB install

**Windows:** the MySQL Installer (or the MariaDB `.msi`) asks for a root password and installs a Windows service that starts with the computer. **macOS:** `brew install mysql` (or `mariadb`), then `brew services start mysql`. **Linux:** your package manager (`sudo apt install mysql-server` or `mariadb-server`), then `sudo systemctl start mysql` (or `mariadb`).

Don't use `root` for your app. Create a user that can only reach its own databases:

```sql
CREATE DATABASE my_app CHARACTER SET utf8mb4;
CREATE DATABASE my_app_test CHARACTER SET utf8mb4;
CREATE USER 'my_app'@'localhost' IDENTIFIED BY 'a-long-random-password';
GRANT ALL PRIVILEGES ON my_app.* TO 'my_app'@'localhost';
GRANT ALL PRIVILEGES ON my_app_test.* TO 'my_app'@'localhost';
```

Run it in the `mysql` shell (`mysql -u root -p`; on Ubuntu `sudo mysql`, because root signs in through the system account there), then:

```bash title=".env"
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=my_app
DB_USERNAME=my_app
DB_PASSWORD=a-long-random-password
```

`localhost` in `CREATE USER` matches connections from the same computer. If the app runs elsewhere, use its address, or `'%'` for any host (only behind a firewall).

### A normal PostgreSQL install

**Windows:** the PostgreSQL installer asks for a password for the `postgres` user and installs a service. **macOS:** `brew install postgresql@17`, then `brew services start postgresql@17`. **Linux:** `sudo apt install postgresql`, then `sudo -u postgres psql` opens a shell as the `postgres` user.

Install the driver with `npm install pg`, then create the roles and the databases, as in [PostgreSQL: two database users](#postgresql-two-database-users) below. **Don't connect the app as `postgres`**: it's a superuser, and a superuser switches off the protection between teams.

### Postgres.app (macOS)

1. Open Postgres.app and click **Initialize** (the first time), then **Start**.
2. It listens on port `5432`, and its first user has **your macOS user name** and no password.
3. Open a shell with `psql` (Postgres.app's "Open psql" button, or after adding its `bin` folder to your `PATH`) and create the roles and databases below.

That first user is a **superuser**. Use it only to create the roles; the app connects as the app role.

### A remote or cloud database (with SSL)

Cloud providers (AWS RDS, Azure, Google Cloud SQL, DigitalOcean, Neon, PlanetScale and others) give you a host name, a port, a user, a password, and often a certificate. Their connections should be **encrypted**, so set an SSL mode:

```bash title=".env"
DB_CONNECTION=pgsql
DB_HOST=my-app.abc123.eu-west-1.rds.amazonaws.com
DB_PORT=5432
DB_DATABASE=my_app
DB_USERNAME=my_app_app
DB_PASSWORD=the-password-from-your-provider
DB_SSLMODE=verify-full
DB_SSL_CA=storage/certs/rds-ca.pem
```

Or, if your provider gives you one connection string:

```bash title=".env"
DB_URL=postgresql://my_app_app:the-password@my-app.abc123.eu-west-1.rds.amazonaws.com:5432/my_app
DB_SSLMODE=verify-full
DB_SSL_CA=storage/certs/rds-ca.pem
```

| `DB_SSLMODE` | Encrypted | Checks the server is who it says | Use it for |
|---|---|---|---|
| `disable` (or empty) | No | No | A server on your own computer |
| `prefer` | **No** (see below) | No | Local servers; treat it like `disable` |
| `require` | Yes | No | A private network you trust |
| `verify-ca` | Yes | Yes: the certificate is signed by `DB_SSL_CA`, **and** the host name matches | Cloud databases |
| `verify-full` | Yes | Yes: the same checks as `verify-ca` | Cloud databases (best) |

Two details differ from PostgreSQL's own tools, because Node.js drivers work differently. `prefer` connects **without** encryption (a Node.js driver can't try encryption first and fall back to plain text), so use `require` or `verify-full` for anything that crosses a network you don't own. And `verify-ca` behaves exactly like `verify-full`: Node.js always checks the host name too. The same modes apply to MySQL and MariaDB.

Keep the certificate file out of git if your provider says it's private (most CA files are public). Allow your computer's IP address in the provider's firewall or "trusted sources", or the connection times out.

## Creating the databases by hand

Strutvane connects to a database that exists; it doesn't create one on a server. Here is the SQL for each engine.

**MySQL and MariaDB:**

```sql
CREATE DATABASE my_app CHARACTER SET utf8mb4;
CREATE DATABASE my_app_test CHARACTER SET utf8mb4;
```

**PostgreSQL** (with the owner role from the next section):

```sql
CREATE DATABASE my_app OWNER my_app_owner;
CREATE DATABASE my_app_test OWNER my_app_owner;
```

**SQLite:** nothing to create. The file is created the first time Strutvane opens it, as long as its folder exists.

`utf8mb4` is full Unicode, so emoji and every alphabet are stored correctly; older MySQL defaults (`utf8`, `latin1`) can't store them.

### PostgreSQL: two database users

On PostgreSQL, Strutvane is designed to use two database **roles** (users):

- **migrations** run as the **owner** role, which may create and change tables;
- **the app** connects as a plain role that can read and write rows but can't change tables or switch off row-level security.

**Why it matters.** Row-level security (RLS) is the database rule that hides other teams' rows (see [Multi-tenancy](../tenancy/)); `node strut migrate` turns it on for every table with a `t.tenant()` column. PostgreSQL **always skips** that rule for a **superuser** (like `postgres`, or Postgres.app's first user) and for a role with `BYPASSRLS`, and a table's **owner** can switch it off. So if the app connected as one of those, the second wall between teams would silently be gone. Run this SQL as a superuser:

```sql
-- 1. The two roles. Replace the passwords with long random ones.
CREATE ROLE my_app_owner LOGIN PASSWORD 'owner-password';
CREATE ROLE my_app_app LOGIN PASSWORD 'app-password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- 2. The databases belong to the owner.
CREATE DATABASE my_app OWNER my_app_owner;
CREATE DATABASE my_app_test OWNER my_app_owner;

-- 3. In each database (\c my_app, then again after \c my_app_test):
--    the app role may use the tables the owner creates, and nothing more.
GRANT CONNECT ON DATABASE my_app TO my_app_app;
GRANT USAGE ON SCHEMA public TO my_app_app;
ALTER DEFAULT PRIVILEGES FOR ROLE my_app_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO my_app_app;
ALTER DEFAULT PRIVILEGES FOR ROLE my_app_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO my_app_app;
```

(In the test database, write `GRANT CONNECT ON DATABASE my_app_test`.)

Until the separate migration keys arrive, run `migrate` as the **owner** and give the app the plain role where it runs. Because a variable set in the environment wins over `.env`, a deploy script can pass the owner to the one command that needs it:

```bash
DB_USERNAME=my_app_owner DB_PASSWORD="$OWNER_PASSWORD" node strut migrate --force
```

(In PowerShell: `$env:DB_USERNAME='my_app_owner'; $env:DB_PASSWORD=$env:OWNER_PASSWORD; node strut migrate --force`.)

:::caution[Coming in 0.2]
`DB_MIGRATION_USERNAME` and `DB_MIGRATION_PASSWORD` (migrations as the owner, the app as the plain role, from one `.env`), the installer creating both roles, and a `security:check` warning when the app connects as a superuser or a `BYPASSRLS` role are decided (2026-11-15) but not on framework `main` yet. The two-role rule itself is ADR-0007.
:::

## MariaDB and MySQL: the differences

MariaDB started as a copy of MySQL and is still very close, so the same migrations and queries work on both. Strutvane asks the server for its version when it connects and adapts its SQL, whatever `DB_CONNECTION` says. The differences you might notice:

| | MySQL 8.4 | MariaDB |
|---|---|---|
| Reading back a new row | No `RETURNING`: Strutvane reads the row again by its id | `RETURNING` on inserts from 10.5 (one query fewer); 10.4 reads the row again, like MySQL |
| `t.json()` columns | A real `JSON` type | `LONGTEXT` with a `CHECK (JSON_VALID(…))`; works the same through Strutvane |
| Enum columns | Native `ENUM(…)` | Native `ENUM(…)` |
| Slugs, UUIDs and identifier-like text columns (`email`, `username`, `token`, `…_email`, `…_token`) | Compared byte for byte (`utf8mb4_0900_bin`) | Compared byte for byte (`utf8mb4_nopad_bin`) |
| Tools that ship it | MySQL Installer, Homebrew, Laragon, MAMP | XAMPP, WAMP (optional), many Linux distributions |

Comparing identifier columns byte for byte means `JOHN@example.com` and `john@example.com` are two different values, as they are on PostgreSQL and SQLite. The servers' default rules would treat them as equal, which can let one person's lookup find another person's row.

In both, schema changes can't be rolled back, so a migration that fails halfway can leave some statements applied; the next `node strut migrate` resumes after them (see [Migrations](../migrations/#when-a-migration-fails)).

## With Docker

If you'd rather not install a database at all, run it in a container. `DB_HOST` is then the container's service name (for example `db`), and the rest of `.env` stays the same.

| | With Docker | Your own server |
|---|---|---|
| Where the database runs | In a container | XAMPP, WAMP, MAMP, Laragon, Postgres.app, a normal install, or the cloud |
| `DB_HOST` | The service name, for example `db` | `127.0.0.1`, a socket, or the remote host |
| Start it | Docker Compose | The tool's control panel, or the system service |
| Connect a GUI client | `127.0.0.1` and the port the container publishes | `DB_HOST` and `DB_PORT` |

See [Docker](../docker/) for the containers themselves.

:::caution[Coming in 0.2]
The installer's Docker option (a database container with generated passwords), `node strut services:up` / `services:down` / `services:status` / `services:logs`, `FORWARD_DB_PORT`, and `node strut` forwarding each command into the app container are designed but not on framework `main` yet.
:::

## Windows, macOS and Linux

`.env`, the commands and the paths are the same on every system. SQLite paths in `.env` use forward slashes (`database/database.sqlite`) on Windows too. `DB_SOCKET` only exists on macOS and Linux; on Windows, use host and port. A database service must be **running** before `node strut migrate`: on Windows check the Services app (or the tool's control panel), on macOS `brew services list`, on Linux `systemctl status mysql` (or `mariadb`, `postgresql`).

## MySQL and MariaDB: strict and UTC

Every MySQL or MariaDB connection Strutvane opens is set up the same way, so they behave like the other databases, whatever your server's own settings say:

- a **strict mode** (`STRICT_ALL_TABLES` and friends): a value that doesn't fit (text too long, a bad date) is an error, never silently cut;
- **UTC** as the time zone, so dates mean the same thing on every server;
- full Unicode (`utf8mb4`);
- exact numbers: `DECIMAL` values come back as strings (`'12.50'`), and big `BIGINT` values are never rounded.

You don't configure any of this, and nothing needs changing on your server.

## How Strutvane talks to the database

The [ORM](../orm/) uses one **connection** (a pool of sessions to the database, shared by every query). Every model, query and command uses it. Importing a model never opens a database; the connection is used only when a query runs.

Queries go through three layers, like Laravel's:

1. the **query builder** turns `Post.query().where('status', 'draft')` into a plain description of the query;
2. a **grammar** (one per database) turns it into SQL with placeholders (`?` on MySQL, MariaDB and SQLite, `$1` on PostgreSQL);
3. the **connection** sends the SQL and the values **separately**.

Because values never become part of the SQL text, **SQL injection is impossible by construction**. Before any SQL runs, a check also makes sure no query can reach another team's rows (see [Multi-tenancy](../tenancy/)).

On PostgreSQL the pool keeps up to 10 sessions, and each statement may run for at most 5 seconds by default, so one runaway query can't hold the database. `migrate` and its friends use their own single connection without that limit.

### Who opens the connection

`node strut db:seed`, and `migrate`, `migrate:refresh` and `migrate:fresh` with `--seed`, open the connection from `.env` and connect your models to it, so seeders and factories just work.

:::caution[Coming in 0.2]
Opening the connection when the HTTP app boots (`node strut dev`, `node strut start`), so models work in routes and controllers without any code of yours, arrives with 0.2. On framework `main` today, code outside the database commands connects the models itself, as below.
:::

A stand-alone script (a one-off import, a report) connects the models like this. It's what `db:seed` does for you:

```ts title="scripts/report.ts"
import { readFileSync } from 'node:fs'
import { databaseSettings, openDatabase, registerSchema, useConnection } from '@strutvane/framework/database'
import { Post } from '../app/models/post.ts'

// The table shapes `node strut migrate` wrote, and a connection from the DB_* variables.
registerSchema(JSON.parse(readFileSync('.strutvane/schema.json', 'utf8')))
const connection = await openDatabase(databaseSettings(process.env, process.cwd()))
useConnection(connection)

try {
  console.log(await Post.query().count())
} finally {
  await connection.close()
}
```

Run it from your project folder with the `DB_*` variables set (`node --env-file=.env scripts/report.ts`). **What you'll see:** the number of posts, for example `12`. *(This recipe is read from the framework's code; it isn't covered by a test of its own yet.)*

## Running your own SQL

Use the ORM for everyday work. For the rare query it can't express (a report with a window function, a database-specific feature), write SQL with the `sql` tag:

```ts title="app/reports/post-stats.ts"
import { defaultConnection, sql } from '@strutvane/framework/database'

const since = new Date('2026-11-01T00:00:00Z')
const { rows } = await defaultConnection().run(
  sql`SELECT ${sql.id('status')}, COUNT(*) AS total FROM ${sql.id('posts')} WHERE ${sql.id('created_at')} >= ${since} GROUP BY ${sql.id('status')}`,
)
console.log(rows)
```

**What you'll see** (on MySQL; PostgreSQL returns `COUNT(*)` as text, `'3'`):

```text
[ { status: 'draft', total: 3 }, { status: 'published', total: 12 } ]
```

How the `sql` tag works:

| You write | It becomes | Why |
|---|---|---|
| `${value}` | a placeholder, with the value sent separately | Values can never become SQL |
| `${sql.id('title')}` | a quoted name: `` `title` `` on MySQL, `"title"` elsewhere | Names are checked (letters, digits, `_`, starting with a letter, at most 63 characters) and quoted for your database |
| `${otherFragment}` | that fragment's SQL, spliced in | Fragments compose |
| `sql.join([a, b], ' AND ')` | `a AND b` | Build lists of conditions |

There is **no** way to pass a plain string: `sql('SELECT 1')` and `run('SELECT 1')` are refused. That's on purpose; it's the one rule that makes injection impossible.

### Conditions inside a model query

To add one hand-written condition to an ORM query, use `whereRaw` with the same tag:

```ts title="app/reports/long-titles.ts"
import { sql } from '@strutvane/framework/database'
import { Post } from '../models/post.ts'

const longTitles = await Post.query()
  .whereRaw(sql`length(${sql.id('title')}) > ${60}`)
  .get()
```

See [Query Builder](../queries/) for everything else the builder can do.

### Raw SQL and teams

If your app has teams, hand-written SQL that names a team's table is **refused** inside a request, because Strutvane can't check it for the team condition:

```text
TenantScopeMissingError: Refusing to run SQL on "projects": hand-written SQL that names a tenant table cannot be checked for a tenant condition. Tenant data may only be read or written for the active tenant. If this really must cross tenants (a maintenance job), use unsafeWithoutTenancy(reason) or unsafeRaw(reason, …): both are audited.
```

Use the ORM for team tables, or, for a deliberate cross-team job, the audited escape hatch described in [ORM: Tenancy](../orm-tenancy/).

## Transactions

A **transaction** groups several changes so they're saved all together or not at all:

```ts title="app/actions/publish-post.ts"
import { transaction } from '@strutvane/framework/database'
import { Post } from '../models/post.ts'

await transaction(async () => {
  const post = await Post.findOrFail(1)
  post.status = 'published'
  await post.save()
  await Post.forceCreate({ title: 'Launch notes', status: 'draft', author_id: post.author_id })
})
```

If anything inside throws, every change inside is undone. Nested `transaction()` calls become **savepoints** (an inner transaction that can be undone on its own). The full guide is [Transactions](../orm-transactions/).

## Seeing every query

To see each query with its time, for example while hunting a slow page, listen on the connection:

```ts title="scripts/report.ts (excerpt)"
import { defaultConnection } from '@strutvane/framework/database'

const stop = defaultConnection().onQuery((event) => {
  console.log(`${event.durationMs.toFixed(1)} ms  ${event.sql}`)
})
// later, to stop listening:
stop()
```

**What you'll see:**

```text
0.4 ms  SELECT `posts`.* FROM `posts` WHERE `posts`.`deleted_at` IS NULL ORDER BY `posts`.`created_at` DESC LIMIT ?
```

`event.params` holds the values too. In a real app, write them through the logger, which hides secrets (see [Logging](../logging/)), never with `console.log` in production.

## Database commands

| Command | What it does | Status |
|---|---|---|
| `node strut migrate` and friends | Run, check and undo migrations | Available; see [Migrations](../migrations/#the-commands-at-a-glance) |
| `node strut db:seed` | Run the seeders | Available; see [Seeding](../seeding/) |
| `node strut sync` | Regenerate `.strutvane/` (types, metadata, SQL) from the migrations, without a database | Available |
| `node strut db:shell` | Open the database's own shell (`mysql`, `psql` or `sqlite3`), signed in with your `.env` settings | Listed by `node strut list`, not built yet (coming in 0.2) |
| `node strut db:wipe` | Drop every table, view and type | Listed, not built yet |
| `node strut db:pull` | Read an existing database into migration files | Listed, not built yet |
| `node strut db:backup` / `db:restore` | Dump the local database to a file and back | Listed, not built yet |
| `node strut db:studio` | A local browser database explorer | Listed, not built yet |
| `node strut services:up` / `services:down` / `services:status` / `services:logs` | Start, stop, check and read the logs of the Docker database | Coming in 0.2 |
| `node strut db:show` | The database, its size, connections and tables | Coming in 0.3 |
| `node strut db:table posts` | One table's columns, indexes and foreign keys | Coming in 0.3 |
| `node strut db:monitor` | Warn when open connections pass a limit | Coming in 0.3 |

A command that is listed but not built yet stops with:

```text
error The installed @strutvane/framework does not provide `node strut db:shell`.
hint: Run `node strut doctor` to see why its commands were not loaded (e.g. a version mismatch), then `node strut upgrade`.
```

## Coming later

| Feature | Status |
|---|---|
| Several named connections (for example a second, read-only reporting database), and a model choosing its connection | Coming in 0.2 (designed; `main` has one connection) |
| Automatic retry of a transaction that hit a deadlock | Coming in 0.2 |
| Read and write hosts (`read` / `write`, `sticky: true`) | Coming before 1.0 |
| Redis | The `@strutvane/redis` package, coming in 0.3 |
| MongoDB and other non-SQL databases | Not planned: Strutvane focuses on relational databases |

## Common mistakes

### Connection errors at a glance

The wording comes from the database driver, after `error Unexpected error:` (see the next section). These are the messages you'll meet most, and what each one means.

| You see | It means | Fix |
|---|---|---|
| `connect ECONNREFUSED 127.0.0.1:3306` | Nothing is listening there: the server isn't running, or it's on another port | Start the server (XAMPP/WAMP/MAMP/Laragon control panel, the system service, or the Docker container); check `DB_PORT` (MAMP uses `8889`) |
| `Access denied for user 'root'@'localhost'` (MySQL, MariaDB) | Wrong user name or password, or the user may not connect from this host | Fix `DB_USERNAME` / `DB_PASSWORD`; XAMPP and Laragon use `root` with an **empty** password, MAMP `root` / `root` |
| `password authentication failed for user "my_app_app"` (PostgreSQL) | Wrong password, or the role doesn't exist | Fix `DB_PASSWORD`, or create the role (see [two database users](#postgresql-two-database-users)) |
| `Unknown database 'my_app'` / `database "my_app" does not exist` | The server is fine, the database isn't there | Create it (see [Creating the databases by hand](#creating-the-databases-by-hand)); with WAMP, check you're on the right engine's port |
| `getaddrinfo ENOTFOUND db.example.com` | The host name doesn't exist (a typo, or a Docker service name used outside Docker) | Fix `DB_HOST`; a service name like `db` only works inside Docker |
| `ETIMEDOUT` | A firewall drops the connection (typical for cloud databases) | Allow your IP in the provider's firewall or "trusted sources" |
| `Host '192.168.1.20' is not allowed to connect to this MySQL server` | The user exists only for `localhost` | `CREATE USER 'my_app'@'%' …` or the app's exact address, then `GRANT` again |
| `no pg_hba.conf entry for host … no encryption` / "SSL connection is required" | The server only accepts encrypted connections | Set `DB_SSLMODE=require` (or `verify-full` with `DB_SSL_CA`) |
| `self-signed certificate in certificate chain` / `unable to verify the first certificate` | Encryption is on, but the server's certificate can't be checked | Download your provider's CA file and set `DB_SSL_CA`; use `require` only on a network you trust |
| `The server does not support SSL connections` | You asked for SSL on a server without it (most local servers) | `DB_SSLMODE=disable` for local servers |
| `connect ENOENT /Applications/MAMP/tmp/mysql/mysql.sock` | The socket file isn't there (server stopped, or another path) | Start the server, or remove `DB_SOCKET` and use host and port |
| `Cannot find package 'mysql2'` / `Cannot find package 'pg'` | The driver for your engine isn't installed | `npm install mysql2` (MySQL, MariaDB) or `npm install pg` (PostgreSQL) |
| `unable to open database file` (SQLite) | The folder in `DB_DATABASE` doesn't exist, or it names a folder | Create the folder, or point `DB_DATABASE` at a file such as `database/database.sqlite` |

### "Unexpected error: connect ECONNREFUSED …"

```text
Database: mysql://root@127.0.0.1:3306/my_app
error Unexpected error: connect ECONNREFUSED 127.0.0.1:3306
hint: Run again with --verbose for the stack trace, and report the bug.
```

**Why:** the database server isn't running, or `DB_HOST` / `DB_PORT` point at the wrong place. The first line shows exactly where Strutvane tried to connect. The command exits with code **1**. (The "report the bug" hint is generic: a friendlier message for connection failures is planned.)
**Fix:** start your MySQL, MariaDB or PostgreSQL service (or its container), then check `DB_HOST` and `DB_PORT` in `.env`.

### "Invalid environment" naming a `DB_` key

```text
error Invalid environment: 1 problem.
  - DB_CONNECTION: must be mysql, mariadb, pgsql (or postgres) or sqlite, not "postgre"
hint: Fix: set these keys in your .env file (see .env.example for every key and its meaning), then run the command again. `node strut env:check` compares the two.
```

**Why:** a value Strutvane can't use. Other messages you may see: `DB_URL: is a PostgreSQL URL but DB_CONNECTION is mysql`, `DB_URL: must start with mysql://, mariadb://, postgres:// or postgresql://`, `DB_SSL_CA: cannot read the CA certificate file storage/certs/ca.pem`.
**Fix:** correct the key the line names. With `DB_URL`, you may leave `DB_CONNECTION` empty: the URL says which engine it is.

### `DB_HOST=db` works in the app but not in my GUI client

**Why:** `db` is the container's name, which only other containers know. Your computer reaches the database through a published port.
**Fix:** in TablePlus or DBeaver, use host `127.0.0.1` and the port the container publishes.

### "No database connection is set yet"

```text
OrmUsageError: No database connection is set yet. Call useConnection(connection) at boot (the framework does this for you).
```

**Why:** a model was used before anything connected the ORM: from a stand-alone script, or (on framework `main`, until 0.2) from a route or controller of the HTTP app.
**Fix:** put database work in a seeder (`node strut db:seed` connects for you), or connect the models yourself as in [Who opens the connection](#who-opens-the-connection).

### "sql must be used as a tagged template"

```text
OrmUsageError: sql must be used as a tagged template (sql`...`), never called with a string. Put values in ${…} so they are bound.
```

**Why:** you called `` sql('SELECT …') `` or built the SQL with `+`. Strings could let user input become SQL.
**Fix:** write ``sql`SELECT … WHERE id = ${id}` ``, with every value inside `${…}`.

## Next steps

- [Migrations](../migrations/): create your tables.
- [Query Builder](../queries/): every way to build a query.
- [ORM: Getting Started](../orm/): read and write rows with models.
- [Multi-tenancy](../tenancy/): keep each team's data apart.
