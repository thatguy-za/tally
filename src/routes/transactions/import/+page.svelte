<script>
  import { enhance } from '$app/forms';
  import Icon from '$lib/components/Icon.svelte';
  import { parseCsv, parseAmount, parseDate, guessMapping, dupeKey } from '$lib/csv.js';
  let { data, form } = $props();

  const FIELDS = [
    ['date', 'Date', true],
    ['description', 'Description', false],
    ['amount', 'Amount', false],
    ['debit', 'Money out', false],
    ['credit', 'Money in', false],
    ['category', 'Category', false]
  ];

  // ---- raw parse ----------------------------------------------------------
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
  let method = $state('manual'); // 'manual' | 'ai'

  let headerRow = $derived(hasHeader ? (allRows[skipRows] ?? []) : []);
  let bodyRows = $derived(allRows.slice(skipRows + (hasHeader ? 1 : 0)));
  let colCount = $derived(Math.max(0, ...allRows.map((r) => r.length)));
  let headers = $derived(
    Array.from({ length: colCount }, (_, i) => (hasHeader ? headerRow[i] : '') || `Column ${i + 1}`)
  );

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

  // ---- normalise --------------------------------------------------------
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
    return { date, amount, description: cell(raw, mapping.description), categoryName: cell(raw, mapping.category) };
  }

  let edits = $state(new Map());
  function edit(i, patch) {
    const next = new Map(edits);
    next.set(i, { ...(next.get(i) || {}), ...patch });
    edits = next;
  }

  let byName = $derived(new Map(data.categories.map((c) => [c.name.trim().toLowerCase(), c.id])));

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
      let catValue = e.category;
      if (catValue === undefined) {
        const hit = c.categoryName && byName.get(c.categoryName.toLowerCase());
        catValue = hit ? String(hit) : c.categoryName ? `new:${c.categoryName}` : '';
      }
      const included = e.excluded !== undefined ? !e.excluded : !(error || duplicate);
      return { i, date, amount, description, catValue, error, duplicate, included };
    })
  );

  let newCatNames = $derived([
    ...new Set(rows.filter((r) => String(r.catValue).startsWith('new:')).map((r) => String(r.catValue).slice(4)))
  ]);

  let stats = $derived({
    total: rows.length,
    included: rows.filter((r) => r.included).length,
    errors: rows.filter((r) => r.error).length,
    dupes: rows.filter((r) => r.duplicate).length,
    incoming: rows.filter((r) => r.included && Number.isFinite(r.amount) && r.amount > 0).reduce((s, r) => s + r.amount, 0),
    outgoing: rows.filter((r) => r.included && Number.isFinite(r.amount) && r.amount < 0).reduce((s, r) => s - r.amount, 0)
  });

  let shown = $derived(rows.length > 400 ? rows.slice(0, 400) : rows);
  let allChecked = $derived(rows.length > 0 && rows.every((r) => r.included));
  function toggleAll() {
    const to = allChecked;
    const next = new Map(edits);
    for (const r of rows) next.set(r.i, { ...(next.get(r.i) || {}), excluded: to });
    edits = next;
  }
  function excludeWhere(pred) {
    const next = new Map(edits);
    for (const r of rows) if (pred(r)) next.set(r.i, { ...(next.get(r.i) || {}), excluded: true });
    edits = next;
  }
  let bulkCat = $state('__none');
  function applyBulkCat() {
    const v = bulkCat === '__none' ? '' : bulkCat;
    const next = new Map(edits);
    for (const r of rows) if (r.included) next.set(r.i, { ...(next.get(r.i) || {}), category: v });
    edits = next;
  }

  // ---- payload --------------------------------------------------------
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

  // ---- phases --------------------------------------------------------
  let localPhase = $state(null);
  let phase = $derived(
    form?.imported !== undefined ? 'done' : !form?.analyzed ? 'upload' : (localPhase ?? 'setup')
  );
  const STEPS = ['Upload', 'Set up', 'Review', 'Done'];
  let stepIdx = $derived({ upload: 0, setup: 1, review: 2, done: 3 }[phase]);

  // ---- AI suggestions --------------------------------------------------
  let aiState = $state({ loading: false, error: '', count: 0, cost: 0 });
  let aiSuggested = $state(new Set());

  async function runAiSuggest() {
    const toSuggest = rows.filter((r) => !r.error && !/^\d+$/.test(String(r.catValue)));
    if (!toSuggest.length) { aiState = { loading: false, error: '', count: 0, cost: 0 }; return; }
    aiState = { loading: true, error: '', count: 0, cost: 0 };
    try {
      const res = await fetch('/transactions/import/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rows: toSuggest.map((r) => ({ ref: String(r.i), date: r.date, description: r.description, amount: r.amount }))
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);
      const next = new Map(edits);
      const suggested = new Set();
      let n = 0;
      for (const [ref, name] of Object.entries(j.suggestions || {})) {
        const id = byName.get(String(name).trim().toLowerCase());
        if (id) {
          next.set(Number(ref), { ...(next.get(Number(ref)) || {}), category: String(id) });
          suggested.add(Number(ref));
          n++;
        }
      }
      edits = next;
      aiSuggested = suggested;
      aiState = { loading: false, error: '', count: n, cost: j.costUsd || 0 };
    } catch (e) {
      aiState = { loading: false, error: e?.message || 'AI suggestions failed.', count: 0, cost: 0 };
    }
  }

  function toReview() {
    localPhase = 'review';
    if (method === 'ai') runAiSuggest();
  }

  let costHint = $derived.by(() => {
    if (!data.aiPrice) return null;
    const n = Math.min(300, bodyRows.length || 1);
    const inTok = n * 55 + 400;
    const outTok = n * 14;
    const usd = (inTok / 1e6) * data.aiPrice.input + (outTok / 1e6) * data.aiPrice.output;
    return usd < 0.01 ? '<$0.01' : `~$${usd.toFixed(2)}`;
  });
</script>

<svelte:head><title>Import · Tally</title></svelte:head>

<div class="mb-6 flex items-center gap-3 rise">
  <a href="/transactions" class="text-[var(--ink-faint)] hover:text-[var(--ink)]">
    <Icon name="arrowRight" size={18} class="rotate-180" />
  </a>
  <div>
    <p class="kicker mb-1">Transactions</p>
    <h1 class="text-3xl" style="font-family:var(--font-display)">Import from CSV</h1>
  </div>
</div>

<!-- stepper -->
<div class="mb-6 flex flex-wrap items-center gap-2 text-[13px]">
  {#each STEPS as label, i}
    <span class="flex items-center gap-2">
      <span class="grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold
        {stepIdx > i ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
          : stepIdx === i ? 'bg-[var(--ink)] text-[var(--paper)]'
          : 'bg-[var(--paper-sunk)] text-[var(--ink-faint)]'}">
        {stepIdx > i ? '✓' : i + 1}
      </span>
      <span class={stepIdx === i ? 'font-medium' : 'text-[var(--ink-faint)]'}>{label}</span>
    </span>
    {#if i < STEPS.length - 1}<span class="h-px w-5 bg-[var(--border)]"></span>{/if}
  {/each}
</div>

{#if form?.error}
  <p class="mb-4 rounded-[9px] px-3 py-2 text-sm" style="background:var(--negative-wash);color:var(--negative)">{form.error}</p>
{/if}

<!-- DONE -->
{#if phase === 'done'}
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

<!-- UPLOAD -->
{:else if phase === 'upload'}
  <form method="POST" action="?/analyze" enctype="multipart/form-data" use:enhance class="card max-w-lg space-y-4">
    <div>
      <label class="label" for="file">CSV file</label>
      <input class="input" id="file" name="file" type="file" accept=".csv,.tsv,.txt,text/csv" required />
      <p class="mt-1.5 text-xs text-[var(--ink-faint)]">
        Any bank export — comma, semicolon or tab separated, columns in any order. Max 8 MB.
      </p>
    </div>
    <button class="btn btn-primary">Continue</button>
  </form>

<!-- SET UP -->
{:else if phase === 'setup'}
  <div class="space-y-4">
    <div class="card">
      <div class="mb-4 flex items-baseline justify-between">
        <h2 class="text-lg">Match the columns</h2>
        <span class="text-[13px] text-[var(--ink-faint)]">
          {bodyRows.length} rows{form.filename ? ` · ${form.filename}` : ''}
        </span>
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
      <p class="mt-2 text-xs text-[var(--ink-faint)]">
        Use <b>Amount</b> for one signed column, or <b>Money out</b> / <b>Money in</b> for two.
      </p>

      <div class="my-4 border-t border-[var(--border)]"></div>

      <div class="grid gap-3 sm:grid-cols-3">
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
        <label class="flex items-center gap-2"><input type="checkbox" bind:checked={runRules} /> Run my rules</label>
        <label class="flex items-center gap-2"><input type="checkbox" bind:checked={createCategories} /> Create new categories</label>
      </div>
    </div>

    <div class="card">
      <h2 class="text-lg">Categorising</h2>
      {#if data.aiAvailable}
        <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">Choose how the transactions get their categories. You can adjust every row afterwards.</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <button type="button" onclick={() => (method = 'manual')}
            class="rounded-[11px] border p-4 text-left transition-colors"
            style={method === 'manual' ? 'border-color:var(--accent);background:var(--accent-wash)' : 'border-color:var(--border)'}>
            <p class="font-medium">Do it myself</p>
            <p class="mt-0.5 text-[13px] text-[var(--ink-faint)]">Use the file's category column and your rules; set the rest by hand.</p>
          </button>
          <button type="button" onclick={() => (method = 'ai')}
            class="rounded-[11px] border p-4 text-left transition-colors"
            style={method === 'ai' ? 'border-color:var(--accent);background:var(--accent-wash)' : 'border-color:var(--border)'}>
            <p class="flex items-center gap-1.5 font-medium">
              <Icon name="sparkle" size={14} class="text-[var(--accent)]" /> Let Claude categorise
            </p>
            <p class="mt-0.5 text-[13px] text-[var(--ink-faint)]">
              {data.aiModelLabel?.split(' — ')[0] ?? 'Claude'} picks from your categories for anything unmatched{costHint ? ` · est. ${costHint}` : ''}.
            </p>
          </button>
        </div>
      {:else}
        <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">
          You'll set categories on the next step — from the file's category column, your rules, and by hand.
          {#if data.categories.length}(AI categorisation can be enabled in Settings.){/if}
        </p>
      {/if}
      <div class="mt-4 flex gap-2">
        <button type="button" class="btn btn-primary" onclick={toReview}>Continue</button>
        <a href="/transactions/import" class="btn btn-ghost">Start over</a>
      </div>
    </div>
  </div>

<!-- REVIEW -->
{:else}
  <form method="POST" action="?/import" use:enhance>
    <input type="hidden" name="payload" value={payload} />

    <div class="card mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
      <button type="button" class="text-[var(--ink-faint)] hover:text-[var(--ink)]" onclick={() => (localPhase = 'setup')}>
        ‹ Set up
      </button>
      <span class="h-3.5 w-px bg-[var(--border)]"></span>
      <span><b class="tnum">{stats.included}</b> of {stats.total} will import</span>
      {#if stats.errors}
        <button type="button" class="rounded px-1.5 py-0.5" style="background:var(--negative-wash);color:var(--negative)"
          onclick={() => excludeWhere((r) => r.error)}>exclude {stats.errors} with errors</button>
      {/if}
      {#if stats.dupes}
        <button type="button" class="rounded px-1.5 py-0.5" style="background:var(--warning-wash);color:var(--warning)"
          onclick={() => excludeWhere((r) => r.duplicate)}>exclude {stats.dupes} duplicate{stats.dupes === 1 ? '' : 's'}</button>
      {/if}
      <span class="tnum ml-auto text-[var(--ink-faint)]">+{stats.incoming.toFixed(2)} / −{stats.outgoing.toFixed(2)}</span>
    </div>

    {#if method === 'ai'}
      <div class="card mb-3 flex flex-wrap items-center gap-2 text-[13px]">
        <Icon name="sparkle" size={14} class="text-[var(--accent)]" />
        {#if aiState.loading}
          <span>Claude is reading your transactions…</span>
        {:else if aiState.error}
          <span style="color:var(--negative)">{aiState.error}</span>
        {:else if aiState.count}
          <span>Claude suggested {aiState.count} categor{aiState.count === 1 ? 'y' : 'ies'}{aiState.cost ? ` · ${aiState.cost < 0.01 ? '<$0.01' : '~$' + aiState.cost.toFixed(2)}` : ''}. Check them below.</span>
        {:else}
          <span>Nothing needed a suggestion — everything already had a category.</span>
        {/if}
        <button type="button" class="btn btn-ghost btn-sm ml-auto" disabled={aiState.loading} onclick={runAiSuggest}>
          {aiState.loading ? 'Working…' : 'Re-run'}
        </button>
      </div>
    {/if}

    <div class="card card-flush">
      <div class="overflow-x-auto">
        <table class="w-full text-[13px]">
          <thead>
            <tr class="border-b border-[var(--border)] text-left">
              <th class="w-9 py-2 pl-4"><input type="checkbox" checked={allChecked} onchange={toggleAll} /></th>
              <th class="th py-2">Date</th>
              <th class="th py-2">Description</th>
              <th class="th py-2 text-right">Amount</th>
              <th class="th py-2 pl-1">Category</th>
            </tr>
          </thead>
          <tbody>
            {#each shown as r (r.i)}
              <tr class="border-b border-[var(--border)] last:border-0 {r.included ? '' : 'opacity-40'}"
                style={r.error ? 'box-shadow: inset 3px 0 0 var(--negative)' : r.duplicate ? 'box-shadow: inset 3px 0 0 var(--warning)' : ''}>
                <td class="py-1 pl-4">
                  <input type="checkbox" checked={r.included}
                    onchange={(e) => edit(r.i, { excluded: !e.currentTarget.checked })} />
                </td>
                <td class="py-1 pr-2">
                  <input class="cell tnum w-[128px] {!r.date ? 'bad' : ''}" type="date" value={r.date ?? ''}
                    onchange={(e) => edit(r.i, { date: e.currentTarget.value || null })} />
                </td>
                <td class="py-1 pr-2">
                  <input class="cell min-w-[150px]" value={r.description}
                    onchange={(e) => edit(r.i, { description: e.currentTarget.value })} />
                </td>
                <td class="py-1 pr-2">
                  <input class="cell tnum w-[92px] text-right {r.amount == null || !Number.isFinite(r.amount) ? 'bad' : ''}"
                    style={Number(r.amount) > 0 ? 'color:var(--positive)' : ''}
                    inputmode="decimal" value={r.amount ?? ''}
                    onchange={(e) => { const v = parseAmount(e.currentTarget.value); edit(r.i, { amount: v == null ? e.currentTarget.value : v }); }} />
                </td>
                <td class="py-1 pr-3">
                  <div class="flex items-center gap-1" title={aiSuggested.has(r.i) ? 'Suggested by Claude' : ''}>
                    {#if aiSuggested.has(r.i)}<Icon name="sparkle" size={12} class="shrink-0 text-[var(--accent)]" />{/if}
                    <select class="cell min-w-[140px]" value={r.catValue}
                      onchange={(e) => { aiSuggested = new Set([...aiSuggested].filter((x) => x !== r.i)); edit(r.i, { category: e.currentTarget.value }); }}>
                      <option value="">Uncategorised</option>
                      {#each data.categories as c}<option value={String(c.id)}>{c.name}</option>{/each}
                      {#if newCatNames.length}
                        <optgroup label="New from file">
                          {#each newCatNames as n}<option value={`new:${n}`}>{n}</option>{/each}
                        </optgroup>
                      {/if}
                    </select>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if rows.length > shown.length}
        <p class="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--ink-faint)]">
          Showing the first {shown.length} of {rows.length} rows. All {stats.included} valid rows will still be imported.
        </p>
      {/if}
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <button class="btn btn-primary" disabled={stats.included === 0 || aiState.loading}>
        Import {stats.included} row{stats.included === 1 ? '' : 's'}
      </button>
      <span class="flex items-center gap-1.5">
        <select class="input !py-1 text-xs" bind:value={bulkCat}>
          <option value="__none">Set all to…</option>
          <option value="">Uncategorised</option>
          {#each data.categories as c}<option value={String(c.id)}>{c.name}</option>{/each}
        </select>
        <button type="button" class="btn btn-ghost btn-sm" onclick={applyBulkCat} disabled={bulkCat === '__none'}>Apply</button>
      </span>
    </div>
  </form>
{/if}
