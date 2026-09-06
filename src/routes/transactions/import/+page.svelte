<script>
  import { enhance } from '$app/forms';
  import Icon from '$lib/components/Icon.svelte';
  import { parseCsv, parseAmount, parseDate, guessMapping, dupeKey } from '$lib/csv.js';
  let { data, form } = $props();

  const FIELDS = [
    ['date', 'Date', true],
    ['description', 'Description', false],
    ['amount', 'Amount (one signed column)', false],
    ['debit', 'Money out', false],
    ['credit', 'Money in', false],
    ['category', 'Category', false]
  ];

  // ---- raw parse -------------------------------------------------------------
  let allRows = $derived(form?.csv ? parseCsv(form.csv) : []);
  let existing = $derived(new Set(form?.existingKeys ?? []));

  let hasHeader = $state(true);
  let skipRows = $state(0);
  let dateOrder = $state('dmy');
  let invert = $state(false);
  let skipDuplicates = $state(true);
  let runRules = $state(true);
  let createCategories = $state(true);
  let mapping = $state({ date: '', description: '', amount: '', debit: '', credit: '', category: '' });

  let headerRow = $derived(hasHeader ? (allRows[skipRows] ?? []) : []);
  let bodyRows = $derived(allRows.slice(skipRows + (hasHeader ? 1 : 0)));
  let colCount = $derived(Math.max(0, ...allRows.map((r) => r.length)));
  let headers = $derived(
    Array.from({ length: colCount }, (_, i) => (hasHeader ? headerRow[i] : '') || `Column ${i + 1}`)
  );

  // auto-detect once per file
  let autoKey = '';
  $effect(() => {
    const key = (form?.csv || '').slice(0, 400) + '|' + hasHeader + '|' + skipRows;
    if (key === autoKey || !allRows.length) return;
    autoKey = key;
    if (hasHeader) mapping = { ...mapping, ...guessMapping(headers) };
    dateOrder = detectDateOrder();
  });

  function detectDateOrder() {
    const idx = mapping.date !== '' ? +mapping.date : guessMapping(headers).date;
    if (idx === '' || idx == null) return 'dmy';
    const samples = bodyRows.slice(0, 40).map((r) => String(r[idx] ?? '').trim()).filter(Boolean);
    let dmyBad = false, mdyBad = false;
    for (const s of samples) {
      const m = s.match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})$/);
      if (!m) continue;
      if (m[1].length === 4) return 'ymd';
      if (+m[1] > 12) mdyBad = true;
      if (+m[2] > 12) dmyBad = true;
    }
    if (dmyBad && !mdyBad) return 'mdy';
    return 'dmy';
  }

  // ---- normalise -----------------------------------------------------------
  const cell = (raw, i) => (i === '' || i == null ? '' : String(raw[+i] ?? '').trim());

  function compute(raw) {
    const date = parseDate(cell(raw, mapping.date), dateOrder);
    let amount = null;
    if (mapping.amount !== '') amount = parseAmount(cell(raw, mapping.amount));
    else if (mapping.debit !== '' || mapping.credit !== '') {
      const deb = parseAmount(cell(raw, mapping.debit)) || 0;
      const cred = parseAmount(cell(raw, mapping.credit)) || 0;
      amount = Math.abs(cred) - Math.abs(deb);
    }
    if (amount != null && invert) amount = -amount;
    return {
      date,
      amount,
      description: cell(raw, mapping.description),
      categoryName: cell(raw, mapping.category)
    };
  }

  // per-row user edits, keyed by absolute body-row index
  let edits = $state(new Map());
  function edit(i, patch) {
    const next = new Map(edits);
    next.set(i, { ...(next.get(i) || {}), ...patch });
    edits = next;
  }

  let byName = $derived(
    new Map(data.categories.map((c) => [c.name.trim().toLowerCase(), c.id]))
  );

  let rows = $derived(
    bodyRows.map((raw, i) => {
      const c = compute(raw);
      const e = edits.get(i) || {};
      const date = e.date ?? c.date;
      const amount = e.amount !== undefined ? e.amount : c.amount;
      const description = e.description ?? c.description;
      const error = !date || amount == null || !Number.isFinite(amount);
      const key = error ? null : dupeKey(date, amount, description);
      const duplicate = key ? existing.has(key) : false;
      // default category value: matched id, or new:<name>, or ''
      let catValue = e.category;
      if (catValue === undefined) {
        const hit = c.categoryName && byName.get(c.categoryName.toLowerCase());
        catValue = hit ? String(hit) : c.categoryName ? `new:${c.categoryName}` : '';
      }
      const included =
        e.excluded !== undefined ? !e.excluded : !(error || duplicate);
      return { i, date, amount, description, catValue, categoryName: c.categoryName, error, duplicate, included };
    })
  );

  let newCatNames = $derived([
    ...new Set(
      rows
        .filter((r) => String(r.catValue).startsWith('new:'))
        .map((r) => String(r.catValue).slice(4))
    )
  ]);

  let stats = $derived({
    total: rows.length,
    included: rows.filter((r) => r.included).length,
    errors: rows.filter((r) => r.error).length,
    dupes: rows.filter((r) => r.duplicate).length,
    incoming: rows
      .filter((r) => r.included && Number.isFinite(r.amount) && r.amount > 0)
      .reduce((s, r) => s + r.amount, 0),
    outgoing: rows
      .filter((r) => r.included && Number.isFinite(r.amount) && r.amount < 0)
      .reduce((s, r) => s - r.amount, 0)
  });

  let allShownChecked = $derived(rows.length > 0 && rows.every((r) => r.included));
  function toggleAll() {
    const to = allShownChecked;
    const next = new Map(edits);
    for (const r of rows) next.set(r.i, { ...(next.get(r.i) || {}), excluded: to });
    edits = next;
  }
  function excludeWhere(pred) {
    const next = new Map(edits);
    for (const r of rows) if (pred(r)) next.set(r.i, { ...(next.get(r.i) || {}), excluded: true });
    edits = next;
  }
  let bulkCat = $state('');
  function applyBulkCat() {
    if (bulkCat === '') return;
    const next = new Map(edits);
    for (const r of rows) if (r.included) next.set(r.i, { ...(next.get(r.i) || {}), category: bulkCat });
    edits = next;
  }

  // ---- payload -----------------------------------------------------------
  let payload = $derived(
    JSON.stringify({
      options: { skipDuplicates, runRules, createCategories },
      rows: rows
        .filter((r) => r.included && !r.error)
        .map((r) => ({
          date: r.date,
          description: r.description,
          amount: r.amount,
          category_id: /^\d+$/.test(String(r.catValue)) ? Number(r.catValue) : null,
          category_name: String(r.catValue).startsWith('new:') ? String(r.catValue).slice(4) : null
        }))
    })
  );

  // ---- pagination for very large files --------------------------------------
  let pageSize = 200;
  let pageNo = $state(0);
  let pageCount = $derived(Math.max(1, Math.ceil(rows.length / pageSize)));
  let shown = $derived(rows.length > 300 ? rows.slice(pageNo * pageSize, pageNo * pageSize + pageSize) : rows);

  let step = $derived(form?.imported !== undefined ? 3 : form?.analyzed ? 2 : 1);
</script>

<svelte:head><title>Import · Tally</title></svelte:head>

<div class="mb-7 flex items-center gap-3 rise">
  <a href="/transactions" class="text-[var(--ink-faint)] hover:text-[var(--ink)]">
    <Icon name="arrowRight" size={18} class="rotate-180" />
  </a>
  <div>
    <p class="kicker mb-1">Transactions</p>
    <h1 class="text-3xl" style="font-family:var(--font-display)">Import from CSV</h1>
  </div>
</div>

<!-- step chips -->
<div class="mb-6 flex items-center gap-2 text-[13px]">
  {#each ['Upload', 'Review & edit', 'Done'] as label, i}
    <span class="flex items-center gap-2">
      <span class="grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold
        {step > i + 1 ? 'bg-[var(--accent)] text-[var(--accent-contrast)]' : step === i + 1 ? 'bg-[var(--ink)] text-[var(--paper)]' : 'bg-[var(--paper-sunk)] text-[var(--ink-faint)]'}">
        {step > i + 1 ? '✓' : i + 1}
      </span>
      <span class={step === i + 1 ? 'font-medium' : 'text-[var(--ink-faint)]'}>{label}</span>
    </span>
    {#if i < 2}<span class="h-px w-6 bg-[var(--border)]"></span>{/if}
  {/each}
</div>

{#if form?.error}
  <p class="mb-4 rounded-[9px] px-3 py-2 text-sm" style="background:var(--negative-wash);color:var(--negative)">{form.error}</p>
{/if}

<!-- STEP 3 : result -->
{#if step === 3}
  <div class="card" style="border-color:var(--accent);background:var(--accent-wash)">
    <p class="font-semibold" style="color:var(--accent-strong)">
      Imported {form.imported} transaction{form.imported === 1 ? '' : 's'}.
    </p>
    <ul class="mt-1.5 space-y-0.5 text-[13px]" style="color:var(--accent-strong)">
      {#if form.duplicates}<li>· {form.duplicates} duplicate(s) skipped.</li>{/if}
      {#if form.invalid}<li>· {form.invalid} row(s) skipped as invalid.</li>{/if}
      {#if form.categorisedByRules}<li>· {form.categorisedByRules} auto-categorised by your rules.</li>{/if}
      {#if form.uncategorised}<li>· {form.uncategorised} transaction(s) still uncategorised.</li>{/if}
    </ul>
    <div class="mt-3 flex gap-2">
      <a href="/transactions" class="btn btn-primary">View transactions</a>
      <a href="/transactions/import" class="btn btn-ghost">Import another</a>
    </div>
  </div>

<!-- STEP 1 : upload -->
{:else if step === 1}
  <form method="POST" action="?/analyze" enctype="multipart/form-data" use:enhance class="card max-w-lg space-y-4">
    <div>
      <label class="label" for="file">CSV file</label>
      <input class="input" id="file" name="file" type="file" accept=".csv,.tsv,.txt,text/csv" required />
      <p class="mt-1.5 text-xs text-[var(--ink-faint)]">
        Any bank export works — comma, semicolon or tab separated, columns in any order.
        You'll review and fix every row on the next screen. Max 8 MB.
      </p>
    </div>
    <button class="btn btn-primary">Continue</button>
  </form>

<!-- STEP 2 : review & edit -->
{:else}
  <form method="POST" action="?/import" use:enhance class="space-y-4">
    <input type="hidden" name="payload" value={payload} />

    <!-- mapping -->
    <div class="card">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg">Match your columns</h2>
        <span class="text-[13px] text-[var(--ink-faint)]">{bodyRows.length} rows{form.filename ? ` · ${form.filename}` : ''}</span>
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        {#each FIELDS as [key, label, req]}
          <div>
            <label class="label" for={`m-${key}`}>{label}{req ? ' *' : ''}</label>
            <select class="input" id={`m-${key}`} bind:value={mapping[key]}>
              <option value="">— none —</option>
              {#each headers as h, i}<option value={String(i)}>{h}</option>{/each}
            </select>
          </div>
        {/each}
      </div>

      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label class="label" for="dateorder">Date order</label>
          <select class="input" id="dateorder" bind:value={dateOrder}>
            <option value="dmy">Day / Month / Year</option>
            <option value="mdy">Month / Day / Year</option>
            <option value="ymd">Year / Month / Day</option>
          </select>
        </div>
        <div>
          <label class="label" for="skiprows">Ignore rows at top</label>
          <input class="input tnum" id="skiprows" type="number" min="0" max="20" bind:value={skipRows} />
        </div>
        <label class="flex items-end gap-2 pb-2 text-[13px]">
          <input type="checkbox" bind:checked={hasHeader} /> First row is a header
        </label>
      </div>

      <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
        <label class="flex items-center gap-2"><input type="checkbox" bind:checked={invert} /> Flip signs</label>
        <label class="flex items-center gap-2"><input type="checkbox" bind:checked={skipDuplicates} /> Skip duplicates</label>
        <label class="flex items-center gap-2"><input type="checkbox" bind:checked={runRules} /> Run rules after import</label>
        <label class="flex items-center gap-2"><input type="checkbox" bind:checked={createCategories} /> Create new categories</label>
      </div>
    </div>

    <!-- summary + bulk -->
    <div class="card flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
      <span><b class="tnum">{stats.included}</b> of {stats.total} will import</span>
      {#if stats.errors}<span style="color:var(--negative)">{stats.errors} with errors</span>{/if}
      {#if stats.dupes}<span style="color:var(--gold)">{stats.dupes} look like duplicates</span>{/if}
      <span class="tnum text-[var(--ink-faint)]">
        +{stats.incoming.toFixed(2)} / −{stats.outgoing.toFixed(2)}
      </span>
      <span class="ml-auto flex items-center gap-2">
        <select class="input !py-1 text-xs" bind:value={bulkCat}>
          <option value="">Set category…</option>
          <option value="">— Uncategorised</option>
          {#each data.categories as c}<option value={String(c.id)}>{c.name}</option>{/each}
        </select>
        <button type="button" class="btn btn-ghost btn-sm" onclick={applyBulkCat}>Apply to shown</button>
      </span>
    </div>

    <!-- table -->
    <div class="card card-flush">
      <div class="overflow-x-auto">
        <table class="w-full text-[13px]">
          <thead>
            <tr class="border-b border-[var(--border)] text-left">
              <th class="w-9 py-2 pl-4"><input type="checkbox" checked={allShownChecked} onchange={toggleAll} /></th>
              <th class="th py-2">Date</th>
              <th class="th py-2">Description</th>
              <th class="th py-2 text-right">Amount</th>
              <th class="th py-2">Category</th>
              <th class="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {#each shown as r (r.i)}
              <tr class="border-b border-[var(--border)] last:border-0 {r.included ? '' : 'opacity-40'}"
                style={r.error ? 'box-shadow: inset 3px 0 0 var(--negative)' : r.duplicate ? 'box-shadow: inset 3px 0 0 var(--gold)' : ''}>
                <td class="py-1.5 pl-4">
                  <input type="checkbox" checked={r.included}
                    onchange={(e) => edit(r.i, { excluded: !e.currentTarget.checked })} />
                </td>
                <td class="py-1.5 pr-2">
                  <input class="w-[130px] rounded-md border border-[var(--border)] bg-transparent px-1.5 py-1 tnum
                    {!r.date ? 'border-[var(--negative)]' : ''}"
                    type="date" value={r.date ?? ''}
                    onchange={(e) => edit(r.i, { date: e.currentTarget.value || null })} />
                </td>
                <td class="py-1.5 pr-2">
                  <input class="w-full min-w-[140px] rounded-md border border-[var(--border)] bg-transparent px-1.5 py-1"
                    value={r.description}
                    onchange={(e) => edit(r.i, { description: e.currentTarget.value })} />
                </td>
                <td class="py-1.5 pr-2 text-right">
                  <input class="w-[96px] rounded-md border border-[var(--border)] bg-transparent px-1.5 py-1 text-right tnum
                    {r.amount == null || !Number.isFinite(r.amount) ? 'border-[var(--negative)]' : ''}
                    {r.amount > 0 ? 'text-[var(--positive)]' : ''}"
                    inputmode="decimal" value={r.amount ?? ''}
                    onchange={(e) => {
                      const v = parseAmount(e.currentTarget.value);
                      edit(r.i, { amount: v == null ? e.currentTarget.value : v });
                    }} />
                </td>
                <td class="py-1.5 pr-2">
                  <select class="w-full min-w-[130px] rounded-md border border-[var(--border)] bg-transparent px-1.5 py-1"
                    value={r.catValue}
                    onchange={(e) => edit(r.i, { category: e.currentTarget.value })}>
                    <option value="">Uncategorised</option>
                    {#each data.categories as c}<option value={String(c.id)}>{c.name}</option>{/each}
                    {#if newCatNames.length}
                      <optgroup label="New from file">
                        {#each newCatNames as n}<option value={`new:${n}`}>{n}</option>{/each}
                      </optgroup>
                    {/if}
                  </select>
                </td>
                <td class="py-1.5 pr-3 text-right">
                  <button type="button" class="text-[var(--ink-faint)] hover:text-[var(--negative)]"
                    title="Exclude row" onclick={() => edit(r.i, { excluded: true })}>
                    <Icon name="x" size={13} />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if rows.length > 300}
        <div class="flex items-center justify-between border-t border-[var(--border)] px-4 py-2 text-[13px]">
          <span class="text-[var(--ink-faint)]">
            Rows {pageNo * pageSize + 1}–{Math.min(rows.length, (pageNo + 1) * pageSize)} of {rows.length}
          </span>
          <span class="flex gap-1">
            <button type="button" class="btn btn-ghost btn-sm" disabled={pageNo === 0}
              onclick={() => (pageNo = Math.max(0, pageNo - 1))}>Prev</button>
            <button type="button" class="btn btn-ghost btn-sm" disabled={pageNo >= pageCount - 1}
              onclick={() => (pageNo = Math.min(pageCount - 1, pageNo + 1))}>Next</button>
          </span>
        </div>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button class="btn btn-primary" disabled={stats.included === 0}>
        Import {stats.included} row{stats.included === 1 ? '' : 's'}
      </button>
      {#if stats.errors}
        <button type="button" class="btn btn-ghost" onclick={() => excludeWhere((r) => r.error)}>
          Exclude {stats.errors} with errors
        </button>
      {/if}
      {#if stats.dupes}
        <button type="button" class="btn btn-ghost" onclick={() => excludeWhere((r) => r.duplicate)}>
          Exclude {stats.dupes} duplicates
        </button>
      {/if}
      <a href="/transactions/import" class="btn btn-ghost">Start over</a>
    </div>
  </form>
{/if}
