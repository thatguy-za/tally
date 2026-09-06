# Budget

A lightweight, self-hosted multi-user budgeting app. Import your bank transactions,
categorise them, and see where your money goes each month.

## Features

- **Multi-user** — each person has their own login, categories, currency and data. The first account to register becomes the admin.
- **CSV import** with a column-mapping step that handles most bank exports (single signed amount column, or separate debit/credit columns, day- or month-first dates, sign flipping).
- **Manual entry** and inline editing of transactions.
- **Per-transaction categorisation** straight from the transactions table.
- **Dashboard** — total incoming vs outgoing for any month, 12-month trend, top spending.
- **Reports** — spending and income broken down by category for a month or all time.
- **Configurable currency**, default Euro (€).
- **Tiny footprint** — a single Node process and a SQLite file. Idles at well under 100 MB RAM.

## Tech

SvelteKit (Node adapter) · SQLite via `better-sqlite3` · Tailwind CSS. No external services.

## Run with Docker

Images are built and published to GitHub Container Registry by the included GitHub Action
on every push to `main`.

```bash
docker run -d --name budget \
  -p 3000:3000 \
  -e ORIGIN=http://localhost:3000 \
  -v budget-data:/data \
  ghcr.io/OWNER/REPO:latest
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
| `DATABASE_PATH`      | `/data/budget.sqlite`    | SQLite file location (mount a volume here)           |
| `ORIGIN`             | –                        | Public URL, required by SvelteKit for form POSTs    |
| `ALLOW_REGISTRATION` | `true`                   | Set to `false` once your accounts exist to lock signup |

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

The database is created automatically at `DATABASE_PATH` (default `./data/budget.sqlite`).

## CSV format

Any CSV with a date, an amount and (optionally) a description and category works —
you map the columns after uploading. See [`static/sample-transactions.csv`](static/sample-transactions.csv)
for an example. Amounts can be a single signed column (income positive, spending negative)
or separate debit/credit columns.

## Backups

Everything lives in the SQLite file. Back up the `/data` volume (or copy
`budget.sqlite`, `budget.sqlite-wal`, `budget.sqlite-shm` while the app is stopped).
