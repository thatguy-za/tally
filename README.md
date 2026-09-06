# Tally

Tally is a lightweight, self-hosted, multi-user budgeting app. Import your bank transactions,
categorise them, and see where your money goes each month.

## Features

- **Multi-user** — each person has their own login, categories, budgets, rules, currency and data, isolated at the query layer. The first account to register becomes the admin.
- **CSV import** with a column-mapping step that handles most bank exports (single signed amount column, or separate debit/credit columns, day- or month-first dates, sign flipping) and **duplicate detection** (date + amount + description).
- **Manual entry**, inline editing, and **bulk categorise / bulk delete**.
- **Auto-categorisation rules** — "description contains X → category Y", applied on import, on manual entry, and re-runnable on demand.
- **Recurring transactions** (weekly / monthly / yearly) — confirm or skip each occurrence, or let them auto-post when due.
- **Budgets** — a monthly target per category, with target vs actual vs remaining and over-budget nudges.
- **Dashboard** — incoming vs outgoing for any month, 12-month trend, top spending, budget progress, and nudges for due recurring / uncategorised / over budget.
- **Reports** — spending and income by category (donut + numbers) for a month or all time.
- **Configurable currency** (display formatting only), default Euro (€).
- **Admin** — user list, grant/revoke admin, password reset, delete account; plus an offline `scripts/reset-password.mjs` for recovery.
- **Tiny footprint** — a single Node process, the built-in `node:sqlite` (no native deps), and one SQLite file. Idles well under 100 MB RAM.

## Tech

SvelteKit (Node adapter) · SQLite via the built-in `node:sqlite` (Node 24+) · Tailwind CSS. No external services, no native build step.

## Run with Docker

Images are built and published to GitHub Container Registry by the included GitHub Action
on every push to `main`.

```bash
docker run -d --name tally \
  -p 3000:3000 \
  -e ORIGIN=http://localhost:3000 \
  -v tally-data:/data \
  ghcr.io/tally-app/tally:latest
```

Then open http://localhost:3000 and create the first account.

Or use Docker Compose (edit the image / `ORIGIN` first):

```bash
docker compose up -d
```

### Environment variables

| Variable             | Default                  | Purpose                                              |
|----------------------|--------------------------|-----------------------------------------------------|
| `PORT`               | `3000`                   | HTTP port                                            |
| `DATABASE_PATH`      | `/data/tally.sqlite`    | SQLite file location (mount a volume here)           |
| `ORIGIN`             | –                        | Public URL, required by SvelteKit for form POSTs    |
| `ALLOW_REGISTRATION` | `true`                   | Set to `false` once your accounts exist to lock signup |

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

The database is created automatically at `DATABASE_PATH` (default `./data/tally.sqlite`).

## CSV format

Any CSV with a date, an amount and (optionally) a description and category works —
you map the columns after uploading. See [`static/sample-transactions.csv`](static/sample-transactions.csv)
for an example. Amounts can be a single signed column (income positive, spending negative)
or separate debit/credit columns.

## Backups

Everything lives in the SQLite file. Back up the `/data` volume (or copy
`tally.sqlite`, `tally.sqlite-wal`, `tally.sqlite-shm` while the app is stopped).
