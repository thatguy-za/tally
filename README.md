# Tally

Tally is a lightweight, self-hosted, multi-user budgeting app. Import your bank transactions,
categorise them, and see where your money goes each month.

## Features

- **Multi-user** — each person has their own login, categories, budgets, rules, currency and data, isolated at the query layer. The first account to register becomes the admin.
- **CSV import** with a full **review table** — upload any bank export (columns in any order, comma/semicolon/tab delimited), then fix dates, amounts, descriptions and categories row-by-row before saving. Handles signed or debit/credit columns, many date and number formats, and flags likely **duplicates** (date + amount + description).
- **Manual entry**, inline editing, and **bulk categorise / bulk delete**.
- **Auto-categorisation rules** — "description contains X → category Y", applied on import, on manual entry, and re-runnable on demand.
- **AI categorisation (optional)** — an admin adds an Anthropic (Claude) API key and picks a model in **Server settings**; each user can then opt in and ask Claude to sort their uncategorised transactions into *their own* categories. Off by default; usage is billed to the admin's key.
- **Recurring transactions** (weekly / monthly / yearly) — confirm or skip each occurrence, or let them auto-post when due.
- **Budgets** — a monthly target per category, with target vs actual vs remaining and over-budget nudges.
- **Dashboard** — incoming vs outgoing for any month, 12-month trend, top spending, budget progress, and nudges for due recurring / uncategorised / over budget.
- **Reports** — spending and income by category (donut + numbers) for a month or all time.
- **Configurable currency** (display formatting only), default Euro (€).
- **Admin** — a **Server settings** page (in the account menu) for user management, the AI assistant key/model, and more; plus an offline `scripts/reset-password.mjs` for recovery.
- **Tiny footprint** — a single Node process, the built-in `node:sqlite` (no native deps), and one SQLite file. Idles well under 100 MB RAM.

## Tech

SvelteKit (Node adapter) · SQLite via the built-in `node:sqlite` (Node 24+) · Tailwind CSS. No external services, no native build step.

## Run with Docker

Images are built and published to GitHub Container Registry by the included GitHub Action
on every push to `main`.

```bash
docker run -d --name tally \
  -p 3000:3000 \
  -v tally-data:/data \
  ghcr.io/thatguy-za/tally:latest
```

Then open `http://<host>:3000` and create the first account (it becomes the admin).

Or use Docker Compose:

```bash
docker compose up -d
```

### Environment variables

| Variable             | Default               | Purpose                                                        |
|----------------------|-----------------------|---------------------------------------------------------------|
| `PORT`               | `3000`                | HTTP port                                                      |
| `DATABASE_PATH`      | `/data/tally.sqlite`  | SQLite file location (mount a volume here)                     |
| `ALLOW_REGISTRATION` | `true`                | Set to `false` once your accounts exist to lock signup        |
| `ORIGIN`             | –                     | Only for reverse-proxy setups: the public URL, e.g. `https://tally.example.com`. Direct `http://<host>:port` access needs nothing. |
| `BODY_SIZE_LIMIT`    | `8M`                  | Max request body (large CSV imports)                           |
| `ANTHROPIC_API_KEY`  | –                     | Optional. Enables AI categorisation. Can also be set in Server settings. |

Behind a proxy you can instead pass `X-Forwarded-Proto` and `X-Forwarded-Host`
and set the matching `PROTOCOL_HEADER` / `HOST_HEADER` env vars.

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

The database is created automatically at `DATABASE_PATH` (default `./data/tally.sqlite`).

## CSV import

Upload any bank export — the columns can be in any order. Tally detects the
delimiter (comma, semicolon, tab or pipe), guesses which column is which, and
drops you into a **review table** where every row is editable before anything is
saved:

- fix a mis-parsed date, amount or description inline
- set or change the category per row (unknown category names from the file can be
  created on import)
- tick rows in or out; rows with an unreadable date/amount and likely duplicates
  are flagged and pre-excluded
- one signed amount column *or* separate debit/credit columns; `dd/mm`, `mm/dd`,
  ISO, `1 Jan 2026` and `YYYYMMDD` dates; `1.234,56` and `1,234.56` decimals;
  `(123)` / `123 CR` / `123 DR` notations; a sign-flip toggle; "ignore N rows at
  the top" for exports with preamble

See [`static/sample-transactions.csv`](static/sample-transactions.csv) for a
plain example.

## Backups

Everything lives in the SQLite file. Back up the `/data` volume (or copy
`tally.sqlite`, `tally.sqlite-wal`, `tally.sqlite-shm` while the app is stopped).
