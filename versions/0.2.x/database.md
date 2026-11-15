---
title: "Database: Getting Started"
description: "Connect your app to MySQL, MariaDB, PostgreSQL or SQLite, on your own server (XAMPP, WAMP, MAMP, Laragon, Postgres.app, a local install, the cloud) or in Docker, run safe raw SQL, watch every query, and know which database commands exist."
---

Almost every app keeps its data in a **database**: a program that stores tables of rows and answers questions about them. Strutvane talks to four of them: **MySQL 8.4+** (the default), **MariaDB**, **PostgreSQL** and **SQLite**, on your own server or in Docker. This page shows how to connect, how to pick one, how to run your own SQL safely, and which database commands you have.

Most of the time you won't write SQL at all: [migrations](../migrations/) create your tables and [models](../orm/) read and write rows. This page is about the layer underneath.

:::tip[Coming from Laravel?]
It's `config/database.php` and `.env` again: `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` keep their names, as do `DB_URL`, `DB_SOCKET` and `DB_SSLMODE`, and `DB_CONNECTION` takes `mysql`, `mariadb`, `pgsql` or `sqlite`. Like Laravel, any server works: XAMPP, WAMP, MAMP, Laragon, Postgres.app, a normal install or the cloud; Docker (Strutvane's Sail) is optional. `DB::select('… where id = ?', [1])` becomes ``defaultConnection().run(sql`… WHERE id = ${1}`)``: the `sql` tag binds values for you, and there's deliberately no way to pass a plain string. `DB::transaction` becomes `transaction()`, and `DB::listen` becomes `onQuery()`.
:::

## The smallest working setup

A new app is already connected: the installer asked which database you want and wrote `.env` for you. For SQLite, the whole configuration is two lines:

```bash title=".env"
DB_CONNECTION=sqlite
DB_DATABASE=database/database.sqlite
```

Check that it works:

```bash
node strut migrate:status
```

**What you'll see:** a list of your migrations with "Ran" or "Pending". If the database can't be reached, you'll see what to fix instead (see [Common mistakes](#common-mistakes)).

## Which database should I use?

| | MySQL 8.4+ | MariaDB 11+ | PostgreSQL | SQLite |
|---|---|---|---|---|
| **Pick it when** | You want the default, the most hosting choices, or you know MySQL | You already have it (XAMPP, WAMP and many Linux systems ship MariaDB) | You have **teams**: PostgreSQL adds a second wall between teams' data (row-level security) | You want zero setup: a demo, a prototype, a tiny internal tool |
| **`DB_CONNECTION`** | `mysql` | `mariadb` | `pgsql` | `sqlite` |
| **Runs as** | A server: your own, or Docker | A server: your own, or Docker | A server: your own, or Docker | A single file in your project |
| **Production** | Yes | Yes | Yes | Small, single-server apps only |
| **Failed migration** | May leave earlier steps of that migration applied | Same as MySQL | Rolled back completely | Rolled back completely |

Your migrations, models and queries are the same on all of them; Strutvane smooths over the differences (booleans, decimals, dates, text length). Switching later means changing `.env` and running `node strut migrate` on the new database.

**Docker is optional.** Every server database works with a server you already have (XAMPP, WAMP, MAMP, Laragon, Postgres.app, a normal install, or a cloud database) or with the Docker container the installer can set up for you. Pick whichever you like; nothing else in your app changes.

## Connection settings

The settings live in `.env`, and `config/database.ts` reads them with typed defaults. See [Configuration](../configuration/) for how `.env` and `config/*.ts` work together.

| Key | What it is | Example |
|---|---|---|
| `DB_CONNECTION` | Which database: `mysql`, `mariadb`, `pgsql` or `sqlite` (`postgres` is accepted as another name for `pgsql`) | `mysql` |
| `DB_HOST` | Where the server is: `127.0.0.1` for a server on your computer, `db` with Docker, a host name for a remote server | `127.0.0.1` |
| `DB_PORT` | The server's port | `3306` (MySQL, MariaDB), `5432` (PostgreSQL), `8889` (MAMP) |
| `DB_DATABASE` | The database's name, or the file for SQLite | `my_app`, `database/database.sqlite` |
| `DB_USERNAME`, `DB_PASSWORD` | How the app signs in. An empty password is allowed for a server on your own computer, with a warning | `root` and an empty password (XAMPP) |
| `DB_URL` | Everything above in one **connection string**; wins over the separate keys when set | `mysql://my_app:secret@db.example.com:3306/my_app` |
| `DB_SOCKET` | A Unix **socket** file instead of host and port (macOS and Linux only) | `/Applications/MAMP/tmp/mysql/mysql.sock` |
| `DB_SSLMODE` | Whether to encrypt the connection: `disable`, `prefer`, `require`, `verify-ca` or `verify-full` | `verify-full` for a cloud database |
| `DB_SSL_CA` | The path to the server's certificate authority file, for `verify-ca` and `verify-full` | `storage/certs/ca.pem` |
| `DB_TEST_DATABASE` | A separate database for `npm test`, so tests never touch your local data | `my_app_test` |
| `DB_MIGRATION_USERNAME`, `DB_MIGRATION_PASSWORD` | PostgreSQL only: the **owner** role migrations run as (see [PostgreSQL: two database users](#postgresql-two-database-users)) | `my_app_owner` |
| `FORWARD_DB_PORT` | Docker only: the port on **your computer** for a database client like TablePlus | `3306` |

A **socket** is a file the database server listens on when the app runs on the same machine; it skips the network. A **connection string** is the address of a database written as one line, the way cloud providers hand it to you. In a connection string, letters like `@`, `:` or `/` inside the password must be written in percent form (`@` is `%40`).

```ts title="config/database.ts"
import { defineConfig } from '@strutvane/framework'

/** Database connections. MySQL is the default, as in Laravel. */
export default defineConfig((env) => {
  // Shared by MySQL and MariaDB: same keys, same defaults for a local server.
  const mysqlLike = {
    url: env.optional('DB_URL'),
    host: env.string('DB_HOST', '127.0.0.1'),
    port: env.integer('DB_PORT', 3306),
    socket: env.optional('DB_SOCKET'),
    database: env.string('DB_DATABASE', 'my_app'),
    username: env.string('DB_USERNAME', 'root'),
    password: env.optional('DB_PASSWORD'),
    sslMode: env.optional('DB_SSLMODE'),
    sslCa: env.optional('DB_SSL_CA'),
  }
  return {
    default: env.oneOf('DB_CONNECTION', ['mysql', 'mariadb', 'pgsql', 'sqlite'], 'mysql'),
    connections: {
      mysql: { driver: 'mysql', ...mysqlLike },
      mariadb: { driver: 'mariadb', ...mysqlLike },
      pgsql: {
        driver: 'postgres',
        url: env.optional('DB_URL'),
        host: env.string('DB_HOST', '127.0.0.1'),
        port: env.integer('DB_PORT', 5432),
        database: env.string('DB_DATABASE', 'my_app'),
        username: env.string('DB_USERNAME', 'postgres'),
        password: env.optional('DB_PASSWORD'),
        sslMode: env.optional('DB_SSLMODE'),
        sslCa: env.optional('DB_SSL_CA'),
      },
      sqlite: {
        driver: 'sqlite',
        database: env.string('DB_DATABASE', 'database/database.sqlite'),
      },
    },
  }
})
```

When the app starts, Strutvane checks these settings and lists **every** problem at once (a missing password, a port that isn't a number), before any request is served.

:::caution[Coming in 0.2]
The application-core prototype reads `DB_CONNECTION` (`mysql`, `pgsql`, `sqlite`), `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME` and `DB_PASSWORD`. These arrive with 0.2, as decided on 2026-11-15:

- `mariadb` as its own value;
- `DB_URL`, `DB_SOCKET`, `DB_SSLMODE` and `DB_SSL_CA`;
- the installer's connection test, with plain-language errors.

Two prototype details also change to what's shown above: the installer writes `DB_CONNECTION=postgres` (0.2 writes `pgsql` and keeps `postgres` as an alias), and the application core's SQLite default is `storage/database.sqlite` (0.2 uses `database/database.sqlite`). The exact accepted `DB_SSLMODE` values may still change.
:::

## Using your own database server (no Docker)

This is the most common setup on a laptop: you already have a database server, and Strutvane uses it. The installer asks for the connection details, tests them, and creates the database if it's missing. You can also do every step by hand, as shown below.

The general recipe, whatever your server:

1. **Start the server** (each tool below says how).
2. **Find its port, user and password.** The tables below list each tool's usual defaults; your install may differ.
3. **Create the database** and the test database (or let the installer do it).
4. **Fill in `.env`** with the values.
5. **Check it:** `node strut migrate:status`, then `node strut migrate`.

### XAMPP (Windows, macOS, Linux)

XAMPP ships **MariaDB** (shown as "MySQL" in its control panel).

1. Open the **XAMPP Control Panel** and click **Start** next to **MySQL**. The row turns green.
2. The usual defaults: user `root`, **empty password**, port `3306`.
3. Create the databases in phpMyAdmin (`http://localhost/phpmyadmin`, the **SQL** tab) or let the installer do it:

   ```sql
   CREATE DATABASE my_app CHARACTER SET utf8mb4;
   CREATE DATABASE my_app_test CHARACTER SET utf8mb4;
   ```

4. Fill in `.env`:

   ```bash title=".env"
   DB_CONNECTION=mariadb
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_DATABASE=my_app
   DB_TEST_DATABASE=my_app_test
   DB_USERNAME=root
   DB_PASSWORD=
   ```

**What you'll see** on `node strut migrate`: the migration lines, plus a warning that the password is empty. That's fine on your own computer; never on a server.

`DB_CONNECTION=mysql` works too: Strutvane notices from the server's version that it's MariaDB and adapts.

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
   DB_TEST_DATABASE=my_app_test
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
DB_TEST_DATABASE=my_app_test
DB_USERNAME=my_app
DB_PASSWORD=a-long-random-password
```

`localhost` in `CREATE USER` matches connections from the same computer. If the app runs elsewhere, use its address, or `'%'` for any host (only behind a firewall).

### A normal PostgreSQL install

**Windows:** the PostgreSQL installer asks for a password for the `postgres` user and installs a service. **macOS:** `brew install postgresql@17`, then `brew services start postgresql@17`. **Linux:** `sudo apt install postgresql`, then `sudo -u postgres psql` opens a shell as the `postgres` user.

Then create the two roles and the databases, as in [PostgreSQL: two database users](#postgresql-two-database-users) below. **Don't connect the app as `postgres`**: it's a superuser, and a superuser switches off the protection between teams.

### Postgres.app (macOS)

1. Open Postgres.app and click **Initialize** (the first time), then **Start**.
2. It listens on port `5432`, and its first user has **your macOS user name** and no password.
3. Open a shell with `psql` (Postgres.app's "Open psql" button, or after adding its `bin` folder to your `PATH`) and create the two roles and databases below.

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
DB_URL=postgresql://my_app_app:the-password@my-app.abc123.eu-west-1.rds.amazonaws.com:5432/my_app?sslmode=verify-full
DB_SSL_CA=storage/certs/rds-ca.pem
```

| `DB_SSLMODE` | Encrypted | Checks the server is who it says | Use it for |
|---|---|---|---|
| `disable` | No | No | A server on your own computer |
| `prefer` | If the server offers it | No | Local servers that may or may not have SSL |
| `require` | Yes | No | A private network you trust |
| `verify-ca` | Yes | The certificate is signed by `DB_SSL_CA` | Cloud databases |
| `verify-full` | Yes | `verify-ca`, plus the host name matches | Cloud databases (best) |

Keep the certificate file out of git if your provider says it's private (most CA files are public). Allow your computer's IP address in the provider's firewall or "trusted sources", or the connection times out.

## Creating the databases by hand

The installer creates the development database and the **test database** (`DB_TEST_DATABASE`, used by `npm test` so tests never touch your local data) if your user has the rights. If it hasn't, it prints the SQL for you to run. Here it is for each engine.

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

**SQLite:** nothing to create. `npm run setup` creates the files (`database/database.sqlite` and the test file).

`utf8mb4` is full Unicode, so emoji and every alphabet are stored correctly; older MySQL defaults (`utf8`, `latin1`) can't store them.

### PostgreSQL: two database users

On PostgreSQL, Strutvane uses two database **roles** (users):

- **migrations** run as the **owner** role (`DB_MIGRATION_USERNAME`), which may create and change tables;
- **the app** connects as a plain role (`DB_USERNAME`) that can read and write rows but can't change tables or switch off row-level security.

**Why it matters.** Row-level security (RLS) is the database rule that hides other teams' rows (see [Multi-tenancy](../tenancy/)). PostgreSQL **always skips** that rule for a **superuser** (like `postgres`, or Postgres.app's first user) and for a role with `BYPASSRLS`, and a table's **owner** can switch it off. So if the app connected as one of those, the second wall between teams would silently be gone. With Docker, the installer creates both roles and generates both passwords. Without Docker, it creates them when your account may create roles; otherwise it prints this SQL for you to run as a superuser:

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

(In the test database, write `GRANT CONNECT ON DATABASE my_app_test`.) Then:

```bash title=".env"
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=my_app
DB_TEST_DATABASE=my_app_test
DB_USERNAME=my_app_app
DB_PASSWORD=app-password
DB_MIGRATION_USERNAME=my_app_owner
DB_MIGRATION_PASSWORD=owner-password
```

**What you'll see** if the app still connects as a superuser (something like this; the wording isn't final): `node strut security:check` reports that row-level security is bypassed because `DB_USERNAME` is a superuser, and keeps reporting it until you switch to the app role.

:::caution[Coming in 0.2]
Creating the roles from the installer without Docker, the printed SQL and the `security:check` warning are decided (2026-11-15) and arrive with 0.2. The two-role rule itself is ADR-0007 and is proven with Docker in the installer prototype.
:::

## MariaDB and MySQL: the differences

MariaDB started as a copy of MySQL and is still very close, so the same migrations and queries work on both. Strutvane detects which one it's talking to from the server's version and adapts its SQL. The differences you might notice:

| | MySQL 8.4 | MariaDB 11 |
|---|---|---|
| Reading back a new row | No `RETURNING`: Strutvane reads the row again by its id | `RETURNING` on inserts: one query fewer |
| `t.json()` columns | A real `JSON` type | Stored as text with a JSON check; works the same through Strutvane |
| Enum `CHECK` constraints | Enforced (8.0.16+) | Enforced |
| Default sorting rules for text (collations) | `utf8mb4_0900_ai_ci` | Different names; Strutvane picks the right ones in the tables it creates |
| Tools that ship it | MySQL Installer, Homebrew, Laragon, MAMP | XAMPP, WAMP (optional), many Linux distributions |

In both, schema changes can't be rolled back, so a migration that fails halfway can leave some steps applied (see [Migrations](../migrations/#when-a-migration-fails)).

:::caution[Coming in 0.2]
MariaDB as its own engine (`DB_CONNECTION=mariadb`, auto-detection, `RETURNING`, tests on MariaDB 11) is decided (2026-11-15). The ORM prototype is tested on MySQL 8.4, PostgreSQL and SQLite; MariaDB support arrives with 0.2. The table above describes MariaDB 11 in general terms (2026-11); check your version's notes for details.
:::

## With Docker

If you'd rather not install a database at all, answer **with Docker** in the installer. It adds a database container, generates its passwords, and sets `DB_HOST=db`.

| | With Docker | Your own server |
|---|---|---|
| Where the database runs | In a `db` container | XAMPP, WAMP, MAMP, Laragon, Postgres.app, a normal install, or the cloud |
| `DB_HOST` | `db` | `127.0.0.1`, a socket, or the remote host |
| Passwords | **Generated** by the installer, stored only in `.env` | Yours (empty is allowed locally, with a warning) |
| Start it | `node strut services:up` | The tool's control panel, or the system service |
| Connect a GUI client | `127.0.0.1` and `FORWARD_DB_PORT` | `DB_HOST` and `DB_PORT` |
| Where `node strut migrate` runs | Inside the app container | On your computer |

See [Docker](../docker/) for the containers themselves. If Docker isn't installed or isn't running, the installer offers, in this order: use your own database server, start Docker, or SQLite.

## Windows, macOS and Linux

`.env`, the commands and the paths are the same on every system. SQLite paths in `.env` use forward slashes (`database/database.sqlite`) on Windows too. `DB_SOCKET` only exists on macOS and Linux; on Windows, use host and port. A database service must be **running** before `node strut migrate`: on Windows check the Services app (or the tool's control panel), on macOS `brew services list`, on Linux `systemctl status mysql` (or `mariadb`, `postgresql`).

## MySQL and MariaDB: strict and UTC

Every MySQL or MariaDB connection Strutvane opens is set up the same way, so they behave like the other databases:

- a **strict mode**: a value that doesn't fit (text too long, a bad date) is an error, never silently cut;
- **UTC** as the time zone, so dates mean the same thing on every server;
- full Unicode (`utf8mb4`).

You don't configure any of this, and nothing needs changing on your server.

## How Strutvane talks to the database

When your app starts, the framework opens one **connection** (a pool of sessions to the database, shared by all requests) from `config/database.ts` and hands it to the ORM. Every model, query and command uses it. Importing a model never opens a database; the connection is used only when a query runs.

Queries go through three layers, like Laravel's:

1. the **query builder** turns `Post.query().where('status', 'draft')` into a plain description of the query;
2. a **grammar** (one per database) turns it into SQL with placeholders (`?` on MySQL and SQLite, `$1` on PostgreSQL);
3. the **connection** sends the SQL and the values **separately**.

Because values never become part of the SQL text, **SQL injection is impossible by construction**. Before any SQL runs, a check also makes sure no query can reach another team's rows (see [Multi-tenancy](../tenancy/)).

## Running your own SQL

Use the ORM for everyday work. For the rare query it can't express (a report with a window function, a database-specific feature), write SQL with the `sql` tag:

```ts title="app/http/controllers/stats.controller.ts (excerpt)"
import { defaultConnection, sql } from '@strutvane/framework'

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
| `${sql.id('title')}` | a quoted name: `` `title` `` on MySQL, `"title"` elsewhere | Names are checked (letters, digits, `_`) and quoted for your database |
| `${otherFragment}` | that fragment's SQL, spliced in | Fragments compose |
| `sql.join([a, b], ' AND ')` | `a AND b` | Build lists of conditions |

There is **no** way to pass a plain string: `sql('SELECT 1')` and `run('SELECT 1')` are refused. That's on purpose; it's the one rule that makes injection impossible.

### Conditions inside a model query

To add one hand-written condition to an ORM query, use `whereRaw` with the same tag:

```ts
import { sql } from '@strutvane/framework'
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

```ts
import { transaction } from '@strutvane/framework'

await transaction(async () => {
  const post = await Post.forceCreate({ title: 'Launch', author_id: author.id })
  await post.tags().attach([news.id])
})
```

If anything inside throws, every change inside is undone. Nested `transaction()` calls become **savepoints** (an inner transaction that can be undone on its own). The full guide is [Transactions](../orm-transactions/).

## Seeing every query

To see each query with its time, for example while hunting a slow page, listen on the connection:

```ts title="app/providers/app.provider.ts (excerpt)"
import { defaultConnection } from '@strutvane/framework'

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

`event.params` holds the values too. In a real app, log them through the logger, which hides secrets (see [Logging](../logging/)), never with `console.log` in production.

## Database commands

| Command | What it does | Status |
|---|---|---|
| `node strut migrate` and friends | Run, check and undo migrations | See [Migrations](../migrations/#the-commands-at-a-glance) |
| `node strut db:seed` | Run the seeders | See [Seeding](../seeding/) |
| `node strut db:shell` | Open the database's own shell (`mysql`, `psql` or `sqlite3`), signed in with your `.env` settings; in the container with Docker | Coming in 0.2 |
| `node strut services:up` / `services:down` / `services:status` / `services:logs` | Start, stop, check and read the logs of the Docker database (and other services) | Coming in 0.2 |
| `node strut model:show Post` | A model's table, columns, relations and API settings, from `resources.json` (`--json` for tools) | Prototype |
| `node strut db:show` | The database, its size, connections and tables | Coming in 0.3 |
| `node strut db:table posts` | One table's columns, indexes and foreign keys | Coming in 0.3 |
| `node strut db:monitor` | Warn when open connections pass a limit | Coming in 0.3 |

`services:down --volumes` **deletes the database's data**, so it asks you to confirm first.

## Coming later

| Feature | Status |
|---|---|
| Several named connections (for example a second, read-only reporting database), and a model choosing its connection | Coming in 0.2 (designed; the prototype has one connection) |
| Automatic retry of a transaction that hit a deadlock | Coming in 0.2 |
| Read and write hosts (`read` / `write` in `config/database.ts`, `sticky: true`) | Coming before 1.0 |
| Redis | The `@strutvane/redis` package, coming in 0.3 |
| MongoDB and other non-SQL databases | Not planned: Strutvane focuses on relational databases |

## Common mistakes

### Connection errors at a glance

The exact wording comes from the database driver; these are the messages you'll meet most, and what each one means.

| You see | It means | Fix |
|---|---|---|
| `ECONNREFUSED` / "Cannot reach MySQL at 127.0.0.1:3306" | Nothing is listening there: the server isn't running, or it's on another port | Start the server (XAMPP/WAMP/MAMP/Laragon control panel, the system service, or `node strut services:up` with Docker); check `DB_PORT` (MAMP uses `8889`) |
| `Access denied for user 'root'@'localhost'` (MySQL, MariaDB) | Wrong user name or password, or the user may not connect from this host | Fix `DB_USERNAME` / `DB_PASSWORD`; XAMPP and Laragon use `root` with an **empty** password, MAMP `root` / `root` |
| `password authentication failed for user "my_app_app"` (PostgreSQL) | Wrong password, or the role doesn't exist | Fix `DB_PASSWORD`, or create the role (see [two database users](#postgresql-two-database-users)) |
| `Unknown database 'my_app'` / `database "my_app" does not exist` | The server is fine, the database isn't there | Create it (see [Creating the databases by hand](#creating-the-databases-by-hand)) or let `npm run setup` do it; with WAMP, check you're on the right engine's port |
| `getaddrinfo ENOTFOUND db.example.com` | The host name doesn't exist (a typo, or `db` outside Docker) | Fix `DB_HOST`; `db` only works inside Docker |
| `ETIMEDOUT` | A firewall drops the connection (typical for cloud databases) | Allow your IP in the provider's firewall or "trusted sources" |
| `Host '192.168.1.20' is not allowed to connect to this MySQL server` | The user exists only for `localhost` | `CREATE USER 'my_app'@'%' …` or the app's exact address, then `GRANT` again |
| `no pg_hba.conf entry for host … no encryption` / "SSL connection is required" | The server only accepts encrypted connections | Set `DB_SSLMODE=require` (or `verify-full` with `DB_SSL_CA`) |
| `self-signed certificate in certificate chain` / `unable to verify the first certificate` | Encryption is on, but the server's certificate can't be checked | Download your provider's CA file and set `DB_SSL_CA`; use `require` only on a network you trust |
| `The server does not support SSL connections` | You asked for SSL on a server without it (most local servers) | `DB_SSLMODE=disable` or `prefer` for local servers |
| `connect ENOENT /Applications/MAMP/tmp/mysql/mysql.sock` | The socket file isn't there (server stopped, or another path) | Start the server, or remove `DB_SOCKET` and use host and port |
| "row-level security is bypassed" from `security:check` | PostgreSQL: the app connects as a superuser or a `BYPASSRLS` role | Connect as the app role (see [two database users](#postgresql-two-database-users)) |

### "Cannot reach MySQL at …"

```text
Cannot reach MySQL at 127.0.0.1:3306 (ECONNREFUSED). Start the database (Docker: node strut services:up), check DB_* in .env, then run: npm run setup
```

**Why:** the database server isn't running, or `DB_HOST` / `DB_PORT` point at the wrong place. The command exits with code **3**.
**Fix:** with Docker, `node strut services:up`. Without Docker, start your MySQL or PostgreSQL service, then check `DB_HOST` and `DB_PORT` in `.env`.

### "… refused the connection: … Check DB_USERNAME and DB_PASSWORD"

```text
MySQL refused the connection: Access denied for user 'my_app'@'localhost' (using password: YES). Check DB_USERNAME and DB_PASSWORD in .env.
```

**Why:** the server is running, but the user name or password is wrong, or the user may not use that database.
**Fix:** correct `DB_USERNAME` / `DB_PASSWORD`, or grant the user access to `DB_DATABASE` on your server.

### "The SQLite file … does not exist"

```text
The SQLite file C:\code\my-app\database\database.sqlite does not exist. Run: npm run setup
```

**Why:** the file was deleted, or `DB_DATABASE` points somewhere else.
**Fix:** run `npm run setup`, which creates it, or fix the path in `.env` (relative paths start from your project folder).

### `DB_HOST=db` works in the app but not in my GUI client

**Why:** `db` is the container's name, which only other containers know. Your computer reaches the database through a forwarded port.
**Fix:** in TablePlus or DBeaver, use host `127.0.0.1` and the port in `FORWARD_DB_PORT`.

### "No database connection is set yet"

```text
OrmUsageError: No database connection is set yet. Call useConnection(connection) at boot (the framework does this for you).
```

**Why:** a model was used before the app booted, for example from a stand-alone script that imports a model directly.
**Fix:** run scripts as `node strut` commands, which boot the app first, instead of `node my-script.ts`.

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
