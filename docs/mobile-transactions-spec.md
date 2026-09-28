# Spec — mobile transaction tables

Give every table that lists transactions a phone layout. Desktop is **unchanged everywhere**.

There are five surfaces. They share one row component and one interaction so they can't drift
apart.

| # | Surface | File | Priority |
|---|---|---|---|
| 1 | Transactions list | `src/routes/transactions/+page.svelte` | first |
| 2 | Category popup (Insights) | `src/lib/components/CategoryTransactionsModal.svelte` | first |
| 3 | Rule re-run preview | `src/lib/components/RulesSection.svelte` (~line 220) | second |
| 4 | CSV import review | `src/lib/components/TransactionImportPanel.svelte` (~line 545) | third |
| 5 | Manual add grid | `src/lib/components/ManualAddPanel.svelte` (~line 57) | third |

Out of scope: the categories table (`src/routes/categories/+page.svelte`) and the rules
list itself (`RulesSection.svelte` ~line 120) — neither lists transactions.

---

## 1. The problem

Every one of these is a wide table inside `overflow-x-auto`, with no mobile branch at all.
On the transactions page the table is a fixed `min-width:900px`, so at 390px **the amount —
the field people actually look for — is entirely off-screen**. The category popup measures
578px of table inside a 311px box. The other three rely on min-width'd cells and overflow
the same way.

Horizontal scrolling inside a vertically scrolling page is the thing to eliminate.

---

## 2. The shared row — build this first

Create `src/lib/components/TransactionRow.svelte`. Surfaces 1 and 2 render it; 3–5 match its
visual language without using it (see §5–§7).

### Collapsed row

Two lines, ~76px tall.

```
┌──────────────────────────────────────────┐
│ ☐  [logo]  Lidl                  −€46.61 │
│            20 Sep · ● Groceries        ✎ │
└──────────────────────────────────────────┘
```

- **Line 1** — description (`truncate`, `font-medium`, 14px) left; amount right
  (`tnum`, `font-semibold`, 14px, `shrink-0`).
- **Line 2** — 12px `var(--ink-faint)`: short date, `·`, category dot + name, then
  `· <notes>` in italics when notes exist. All `truncate`.
- **Affordance** — a 12px `edit` (pencil) icon pinned right on line 2 via `ml-auto`.
  It costs no horizontal space because line 2 has room. When the row is open it turns
  `text-[var(--accent)]`; otherwise it inherits the muted line-2 colour.
- **Expanded row** gets `background:var(--paper-sunk)`; **selected row** gets
  `background:var(--accent-wash)`.

### Expanded panel

Slides open under the row (`transition:slide={{ duration: 160 }}`), ~326px tall:

- Description — full width
- Date + Amount — side by side, `flex gap-3`
- Category + Notes — side by side, `flex gap-3`
- Footer — actions, right-aligned

Use the existing `.label` and `.input` classes. Pairing the four short fields two-up is what
keeps this under ~330px; don't stack them all full-width.

**One row open at a time** — opening a row closes the previous one.

### Props

```js
let {
  t,                      // the transaction
  expanded, onToggleExpand,
  selectable = false,     // renders the leading checkbox
  selected = false, onToggle,
  showCategory = true,    // false when every row shares one category
  showRule = false,       // renders "Save as rule" in the expanded footer
  onEdit,                 // field committer — see below
  onCategoryChange,
  onDelete,
  onSaveRule,
  categories,             // for the category <select>
  currency
} = $props();
```

The component owns **no** persistence. Each surface passes its own handlers, because they
post to different places (§4 in particular). Keep it presentational.

### Non-negotiables

- **Amounts must use `formatMoney(t.amount, currency)` from `$lib/privacy.svelte.js`.**
  Not a local formatter — that import is what blanks amounts under "hide numbers", and a
  hand-rolled one silently breaks the feature. It already renders the sign, so spending
  shows as `−€46.61`. Colour positive amounts `var(--positive)`.
- **Short date**: `new Date(t.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })`.
  Not `formatMonth` — that takes `YYYY-MM`.
- **`MerchantLogo`** at `size={30}`, `color={categoryColour}`, and **no `onEdit` prop** —
  passing `onEdit` makes it render a `<button>`, and nesting that inside the row's own
  button is invalid HTML. Logo editing stays desktop-only for now.
- The row's tappable area is one `<button type="button">` with `aria-expanded`. The
  checkbox sits outside it. No other nested interactive elements.
- Tap targets ≥ 44px.

---

## 3. Surface 1 — transactions list

`src/routes/transactions/+page.svelte`.

- Wrap the existing `<div class="overflow-x-auto">` (~line 484) in `hidden sm:block`.
- Add a sibling `<div class="sm:hidden">` rendering `TransactionRow` from `sortedRows`.
- Pass `selectable`, `showRule`, and `showCategory` (categories differ here).

Wire the handlers to the helpers already in the file — **do not write a new save path**:

| Prop | Wire to |
|---|---|
| `onEdit` | `fieldOnChange(t, key)` → `commitField` → `?/update` |
| `onCategoryChange` | `categoriseViaPicker(t, value)` → `?/categorise` |
| `onDelete` | the existing `?/delete` form + `deleteSubmit(id)` |
| `onSaveRule` | sets `rulingId` / `ruleCategoryId` / `ruleMatchText` |
| selection | `selected`, `toggle(id)` |
| display values | `fieldVal(t, key)` — respects unsaved optimistic edits |
| in-flight | `savingIds`, `pendingCat` → `opacity-50` |

**"Doesn't need a category"** moves from the row into the expanded footer, shown when
`!currentCat(t)`, posting to `?/dismissUncategorised` as it does today.

**Save-as-rule form**: currently renders as a table row (~line 508) and so is invisible on
mobile. Render it as a card above the list when `rulingId` is set. Same `?/saveRule` post.

**Header strip** above the mobile list, since `<thead>` is gone:

- left: `Select all` checkbox → `allChecked` / `toggleAll()`
- right: a sort `<select>` driving the existing `setSort(key, dir)`:

```
Newest first    → setSort('date', 'desc')      // also the sortKey === null default
Oldest first    → setSort('date', 'asc')
Largest amount  → setSort('amount', 'asc')     // spending is negative, so 'asc' is biggest spend
Smallest amount → setSort('amount', 'desc')
A–Z             → setSort('description', 'asc')
Category        → setSort('category', 'asc')
```

---

## 4. Surface 2 — category popup

`src/lib/components/CategoryTransactionsModal.svelte`.

Same row, expanded in place. **Nothing opens on top of the popup** — no sheet, no second
overlay, no drill-in view.

- `showCategory={false}` when `categoryId` is a real id (every row shares that category, so
  repeating it seven times wastes the line). Pass `showCategory` **true** for the `'other'`
  and `'none'` buckets, where categories genuinely differ.
- No `selectable` — there is no bulk select here.
- No `showRule`.
- Keep the `N transactions · total` footer.
- Desktop keeps the table: wrap it `hidden sm:block`, add the `sm:hidden` list beside it.

Handlers post through this component's **own** `updateRow(row, patch)`, which hits
`/transactions?/update` with an absolute path — not the page-relative `?/update` that
surface 1 uses. Keep that as-is; just route the row's `onEdit` into it.

### Two server-side gaps to close

**Logos.** `logo_domain` is *not* a column on `transactions`. The transactions page adds it
in its `load` via `getLogoDomains(descriptions)` (`+page.server.js:60`). The popup's rows
come from `/insights/category-transactions`, which returns raw `listTransactions` rows with
no logo. Without a fix the same merchant shows a logo in one surface and a plain dot in the
other. Add the same two lines to `src/routes/insights/category-transactions/+server.js`:

```js
const logoDomains = getLogoDomains(transactions.map((t) => t.description));
for (const t of transactions) t.logo_domain = logoDomains.get(t.description) ?? null;
```

**Amount display.** Popup rows currently render raw input values — `-64.7`, no symbol, no
trailing zero — while the footer shows a formatted `-€490.57`. In the collapsed row show
`formatMoney`; the raw editable value belongs in the expanded panel only.

---

## 5. Surface 3 — rule re-run preview

`src/lib/components/RulesSection.svelte`, the modal at ~line 220. Columns today: accept
checkbox, Date, Description, Amount, From, To.

This is a **diff, not an editable transaction**, so it does not use `TransactionRow`. Match
its visual language instead:

```
☐  [logo]  Lidl                      −€46.61
           20 Sep · Uncategorised → ● Groceries
```

- Same logo size, type scale and two-line rhythm.
- Line 2 carries the `From → To` change in place of the category, with the arrow and the
  destination category's dot.
- The accept checkbox keeps its leading position.
- No expansion — there is nothing to edit here.
- Keep the desktop table behind `hidden sm:block`.

---

## 6. Surface 4 — CSV import review

`src/lib/components/TransactionImportPanel.svelte`, table at ~line 545.

The hardest one, because the header row holds the **column-mapping selects** (which CSV
column is the date, the description, the amount…) and those have no meaning in a card layout.

On mobile:

- Move the mapping selects **above** the list, into their own labelled block: `Date column`,
  `Description column`, `Amount column`, `Category column`, `Notes column`. Keep the
  `one signed column` / debit-credit toggle and `First row is a header` / `Flip signs` with
  them.
- Render each parsed row as a card in the shared visual language: include-checkbox, parsed
  description, parsed amount, parsed date, chosen category.
- Keep the existing per-row states clearly visible: **excluded** rows dimmed, **duplicate**
  rows flagged, rows with an unreadable date or amount marked with the same warning colour
  they use today.
- The row's fields stay editable — expand in place, same as §2, since fixing a mis-parsed
  row before import is the whole point of this screen.
- Keep the summary bar (`5 of 7 will import`, the duplicate and rules chips, totals) and the
  `Import N rows` / `Cancel` footer; both already wrap acceptably.

Desktop table unchanged behind `hidden sm:block`.

---

## 7. Surface 5 — manual add grid

`src/lib/components/ManualAddPanel.svelte`, table at ~line 57. Columns: Date\*, Description,
Amount\*, Type, Category, Notes, remove.

This is a **data-entry grid of blank rows**, not a list, so there is nothing to collapse.
On mobile render each pending row as a card of stacked field groups in the same order, with
the remove button in the card's top-right and required markers kept on Date and Amount.
Date + Amount side by side; Type + Category side by side; Description and Notes full width.

`Add another row` stays at the bottom. The form still posts `payload` to `?/addMany`
unchanged.

---

## 8. Out of scope

- Any desktop table.
- Filters, filter chips, search, the Add/Import overlay shell.
- Logo editing on mobile (see §2).
- Swipe gestures.
- Schema changes. The only server change is the two-line logo fix in §4.

---

## 9. Acceptance criteria

At **390 × 844**, light **and** dark:

1. No horizontal scrolling on any of the five surfaces; nothing overflows the viewport.
2. Every transaction row shows description, amount, date and category without interaction
   (except the popup, where category is intentionally suppressed — §4).
3. Amounts are signed, spending negative, positives green.
4. **Hide numbers** (account menu) blanks amounts on all five surfaces. This is the check
   that catches a hand-rolled formatter.
5. Tapping a row expands it; editing each field persists after a reload; opening a second
   row closes the first.
6. The pencil is present on every collapsed row and accent-coloured while open.
7. Transactions page: ticking two rows shows the bulk bar; bulk categorise and delete work.
8. Transactions page: all six sort options reorder the list.
9. Popup: the same merchant shows the **same logo** as on the transactions page (§4).
10. Popup: opening a row does not open a second overlay.
11. Import review: a CSV with columns in an unexpected order can still be remapped, and
    duplicates and unparseable rows are still visibly flagged.
12. Manual add: a two-row entry still saves both rows.
13. At **≥ 640px** every surface is pixel-identical to `main` — diff a screenshot.
14. `npm run check` clean, `npm test` green.

Verify in a browser at 390px, not by reasoning about CSS. Seed a throwaway database — point
`DATABASE_PATH` at a temp file, never `data/tally.sqlite`.

Long descriptions are what break these layouts. Test with
`POS 88213 AMZN Mktp DE*2H4KL9 AMAZON.DE` and `SEPA DD Laya Healthcare Ltd REF 9270490`.

---

## 10. Reference prototype

A working mockup of the row and both primary surfaces is at `src/routes/proto/`
(`+page.svelte` and `TxRow.svelte`) — uncommitted and throwaway, **delete it when done**.

It has correct markup and sizing for the collapsed row, the expanded panel and the popup,
but deliberately uses static data and a local `money()` helper. The real component must take
handlers as props (§2) and use `formatMoney` (§2).

Suggested order: §2 + §3 together, then §4, then §5, then §6 and §7. The shared row has to
settle before the other surfaces copy it.
