<script>
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Icon from './Icon.svelte';
  import Confetti from './Confetti.svelte';
  import CategorySelect from './CategorySelect.svelte';
  import { parseCsv, parseAmount, parseDate, guessMapping, dupeKey, DATE_FORMATS } from '$lib/csv.js';

  /** @type {{ data: any, onClose: () => void }} */
  let { data, onClose } = $props();

  // local copy of the action result — kept outside the page's own `form` prop
  // so "Import another" can clear it and start over without a navigation
  let form = $state(undefined);

  // ---- upload dropzone ----------------------------------------------------
  let selectedFiles = $state([]); // File[] — one CSV or several from the same bank
  let dragOver = $state(false);
  let fileInputEl = $state();

  function onFileChange(e) {
    selectedFiles = Array.from(e.currentTarget.files || []);
  }
  function onDrop(e) {
    e.preventDefault();
    dragOver = false;
    const dropped = Array.from(e.dataTransfer?.files || []);
    if (!dropped.length || !fileInputEl) return;
    const dt = new DataTransfer();
    for (const f of dropped) dt.items.add(f);
    fileInputEl.files = dt.files;
    selectedFiles = dropped;
  }

  // ---- raw parse ----------------------------------------------------------
  // several files are assumed to share one layout (the same bank export,
  // several months) — header/column detection only looks at the first file;
  // every file's own leading skip+header rows are stripped before their body
  // rows are concatenated below
  let filesParsed = $derived((form?.files ?? []).map((f) => parseCsv(f.csv)));
  let allRows = $derived(filesParsed[0] ?? []);
  let existing = $derived(new Set(form?.existingKeys ?? []));

  let hasHeader = $state(true);
  let skipRows = $state(0);
  // set once in Settings — rarely changes, so the column mapping below only
  // needs one dropdown per field instead of a second one for date order
  let dateOrder = $derived(data.dateFormat || 'dmy');
  let invert = $state(false);
  let skipDuplicates = $state(true);
  let runRules = $state(true);
  let createCategories = $state(true);
  let mapping = $state({ date: '', description: '', amount: '', debit: '', credit: '', category: '' });

  let headerRow = $derived(hasHeader ? (allRows[skipRows] ?? []) : []);
  let bodyRows = $derived(filesParsed.flatMap((rows) => rows.slice(skipRows + (hasHeader ? 1 : 0))));
  let colCount = $derived(Math.max(0, ...allRows.map((r) => r.length)));
  let headers = $derived(
    Array.from({ length: colCount }, (_, i) => (hasHeader ? headerRow[i] : '') || `Column ${i + 1}`)
  );

  let autoKey = '';
  $effect(() => {
    const key = (form?.files?.[0]?.csv || '').slice(0, 400) + '|' + hasHeader + '|' + skipRows;
    if (key === autoKey || !allRows.length) return;
    autoKey = key;
    if (hasHeader) mapping = { ...mapping, ...guessMapping(headers) };
  });

  // ---- normalise --------------------------------------------------------
  const cellOf = (raw, i) => (i === '' || i == null ? '' : String(raw[+i] ?? '').trim());

  function compute(raw) {
    const date = parseDate(cellOf(raw, mapping.date), dateOrder);
    let amount = null;
    if (mapping.amount !== '') amount = parseAmount(cellOf(raw, mapping.amount));
    else if (mapping.debit !== '' || mapping.credit !== '') {
      const deb = parseAmount(cellOf(raw, mapping.debit)) || 0;
      const cred = parseAmount(cellOf(raw, mapping.credit)) || 0;
      amount = Math.abs(cred) - Math.abs(deb);
    }
    if (amount != null && invert) amount = -amount;
    return { date, amount, description: cellOf(raw, mapping.description), categoryName: cellOf(raw, mapping.category) };
  }

  let edits = $state(new Map());
  function edit(i, patch) {
    const next = new Map(edits);
    next.set(i, { ...(next.get(i) || {}), ...patch });
    edits = next;
  }

  let byName = $derived(new Map(data.categories.map((c) => [c.name.trim().toLowerCase(), c.id])));

  /**
   * Mirrors queries.js categoriseByRules(): the user's auto-categorisation
   * rules, highest priority first (as sent from the server), first match on a
   * case-insensitive substring of the description wins. Run against every row
   * during review — before anything reaches AI — so a rule match never costs
   * an API call.
   */
  function ruleMatch(description) {
    if (!description) return null;
    const d = description.toLowerCase();
    for (const r of data.rules) {
      if (d.includes(r.match_text.toLowerCase())) return r.category_id;
    }
    return null;
  }

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
      let byRule = false;
      if (catValue === undefined) {
        const hit = c.categoryName && byName.get(c.categoryName.toLowerCase());
        if (hit) catValue = String(hit);
        else if (c.categoryName) catValue = `new:${c.categoryName}`;
        else {
          const ruleId = ruleMatch(description);
          if (ruleId) { catValue = String(ruleId); byRule = true; }
          else catValue = '';
        }
      }
      const included = e.excluded !== undefined ? !e.excluded : !(error || duplicate);
      return { i, date, amount, description, catValue, byRule, error, duplicate, included };
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
    uncategorised: rows.filter((r) => r.included && !String(r.catValue)).length,
    byRule: rows.filter((r) => r.included && r.byRule).length,
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

  // ---- phases: upload → review → done ---------------------------------
  let phase = $derived(form?.imported !== undefined ? 'done' : form?.analyzed ? 'review' : 'upload');
  const STEPS = ['Upload', 'Review & approve', 'Done'];
  let stepIdx = $derived({ upload: 0, review: 1, done: 2 }[phase]);

  // ---- done: offer up anything still uncategorised, celebrate once clear ----
  // a row is hidden the moment its category is chosen (not after the server
  // round-trip resolves) by tracking handled ids in a Set, rather than
  // mutating a copy of the list — filtering by membership avoids any race
  // between overlapping requests that a "splice out of this array" approach
  // would have if two rows are picked in quick succession
  let handledIds = $state(new Set());
  let uncategorisedRows = $derived((form?.uncategorisedRows || []).filter((r) => !handledIds.has(r.id)));
  let celebrate = $derived(phase === 'done' && uncategorisedRows.length === 0);
  function markHandled(id) {
    handledIds = new Set(handledIds).add(id);
  }
  async function categoriseAfterImport(id, categoryId) {
    markHandled(id);
    const body = new FormData();
    body.set('id', String(id));
    body.set('category_id', categoryId || '');
    await fetch('/transactions?/categorise', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
  }

  // ---- AI categorisation — streams top-down, chunk by chunk -----------
  // bigger batches mean fewer requests, and the category list + system prompt
  // (a fixed cost every request) gets paid for fewer times per import
  const AI_CHUNK = 40;
  let aiState = $state({ running: false, error: '', done: 0, total: 0, count: 0, cost: 0, ran: false });
  let aiSuggested = $state(new Set()); // rows the AI set
  let aiPending = $state(new Set()); // rows currently being categorised
  let aiKick = '';

  $effect(() => {
    if (phase !== 'review' || !data.aiAvailable) return;
    const key = (form?.files ?? []).map((f) => f.filename).join(',');
    if (!key || key === aiKick) return;
    // wait until the auto-detect $effect has settled a usable mapping
    if (!rows.length || rows.every((r) => r.error)) return;
    aiKick = key;
    runAiSuggest();
  });

  async function runAiSuggest() {
    // rules already ran during review (see `rows`) — only send what is still
    // uncategorised, so a rule match never costs an AI call
    const targets = rows.filter((r) => !r.error && !r.catValue);
    if (!targets.length) {
      aiState = { running: false, error: '', done: 0, total: 0, count: 0, cost: 0, ran: true };
      return;
    }
    aiState = { running: true, error: '', done: 0, total: targets.length, count: 0, cost: 0, ran: true };
    aiSuggested = new Set();
    let cost = 0;
    let count = 0;

    for (let i = 0; i < targets.length; i += AI_CHUNK) {
      const chunk = targets.slice(i, i + AI_CHUNK);
      aiPending = new Set(chunk.map((r) => r.i));
      try {
        const res = await fetch('/transactions/import/suggest', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            rows: chunk.map((r) => ({ ref: String(r.i), date: r.date, description: r.description, amount: r.amount }))
          })
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);
        const next = new Map(edits);
        const suggested = new Set(aiSuggested);
        for (const [ref, name] of Object.entries(j.suggestions || {})) {
          const id = byName.get(String(name).trim().toLowerCase());
          if (id) {
            next.set(Number(ref), { ...(next.get(Number(ref)) || {}), category: String(id) });
            suggested.add(Number(ref));
            count++;
          }
        }
        edits = next;
        aiSuggested = suggested;
        cost += j.costUsd || 0;
      } catch (e) {
        aiPending = new Set();
        aiState = { ...aiState, running: false, error: e?.message || 'AI categorisation failed.', count, cost };
        return;
      }
      aiPending = new Set();
      aiState = { ...aiState, done: Math.min(targets.length, i + chunk.length), count, cost };
    }
    aiState = { ...aiState, running: false, count, cost };
  }

  let aiPct = $derived(aiState.total ? Math.round((aiState.done / aiState.total) * 100) : 0);

  // ---- amount column: single signed (common), or split debit/credit ----
  let splitMode = $state(false);
  let amountSplit = $derived(splitMode || (mapping.amount === '' && (mapping.debit !== '' || mapping.credit !== '')));
  function useSplit() {
    const g = guessMapping(headers);
    splitMode = true;
    mapping = { ...mapping, amount: '', debit: mapping.debit || g.debit || '', credit: mapping.credit || g.credit || '' };
  }
  function useSingle() {
    splitMode = false;
    mapping = { ...mapping, debit: '', credit: '' };
  }
  function submitAnalyze() {
    return async ({ result }) => {
      if (result.type === 'success' || result.type === 'failure') form = result.data;
      else if (result.type === 'error') form = { error: result.error?.message || 'Could not read that file.' };
    };
  }

  function submitImport() {
    return async ({ result }) => {
      if (result.type === 'success') {
        form = result.data;
        await invalidateAll();
      } else if (result.type === 'failure') {
        form = result.data;
      } else if (result.type === 'error') {
        form = { error: result.error?.message || 'Import failed.' };
      }
    };
  }
</script>

<div class="mb-4 flex flex-wrap items-center gap-2 text-[13px]">
  {#each STEPS as name, i}
    <span class="flex items-center gap-2">
      <span class="grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold
        {stepIdx > i ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
          : stepIdx === i ? 'bg-[var(--ink)] text-[var(--paper)]'
          : 'bg-[var(--paper-sunk)] text-[var(--ink-faint)]'}">
        {stepIdx > i ? '✓' : i + 1}
      </span>
      <span class={stepIdx === i ? 'font-medium' : 'text-[var(--ink-faint)]'}>{name}</span>
    </span>
    {#if i < STEPS.length - 1}<span class="h-px w-5 bg-[var(--border)]"></span>{/if}
  {/each}
</div>

{#if form?.error}
  <p class="mb-4 rounded-[var(--radius-sm)] px-3 py-2 text-sm" style="background:var(--negative-wash);color:var(--negative)">{form.error}</p>
{/if}

{#if phase === 'done'}
  {#if celebrate}
    <Confetti />
    <div class="card text-center" style="border-color:var(--accent);background:var(--accent-wash)">
      <p class="text-lg font-semibold" style="color:var(--accent-strong)">🎉 Import complete!</p>
      <p class="mt-1.5 text-[13px]" style="color:var(--accent-strong)">
        Imported {form.imported} transaction{form.imported === 1 ? '' : 's'}
        {#if form.duplicates}· {form.duplicates} duplicate{form.duplicates === 1 ? '' : 's'} skipped{/if}
        — everything's categorised.
      </p>
      <a href="/insights" class="btn btn-primary mt-4 inline-flex">View my spending insights</a>
    </div>
  {:else}
    <div class="card" style="border-color:var(--accent);background:var(--accent-wash)">
      <p class="font-semibold" style="color:var(--accent-strong)">
        Imported {form.imported} transaction{form.imported === 1 ? '' : 's'}.
      </p>
      <ul class="mt-1.5 space-y-0.5 text-[13px]" style="color:var(--accent-strong)">
        {#if form.duplicates}<li>· {form.duplicates} duplicate(s) skipped.</li>{/if}
        {#if form.invalid}<li>· {form.invalid} row(s) skipped as invalid.</li>{/if}
        {#if form.categorisedByRules}<li>· {form.categorisedByRules} auto-categorised by your rules.</li>{/if}
      </ul>
    </div>

    <div class="card mt-3">
      <h3 class="text-[15px] font-medium">Give these a category</h3>
      <p class="mt-1 text-[13px] text-[var(--ink-faint)]">
        {uncategorisedRows.length} transaction{uncategorisedRows.length === 1 ? '' : 's'} still need one.
      </p>
      <ul class="mt-3 divide-y divide-[var(--border)]">
        {#each uncategorisedRows as row (row.id)}
          <li class="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
            <span class="flex min-w-0 items-center gap-2">
              <span class="tnum shrink-0 text-[var(--ink-faint)]">{row.date}</span>
              <span class="truncate">{row.description}</span>
            </span>
            <span class="flex shrink-0 items-center gap-2">
              <span class="tnum" style={row.amount > 0 ? 'color:var(--positive)' : ''}>{row.amount.toFixed(2)}</span>
              <CategorySelect categories={data.categories} value=""
                onChange={(v) => categoriseAfterImport(row.id, v)}
                onCreated={() => invalidateAll()} />
            </span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

{:else if phase === 'upload'}
  <form method="POST" action="/transactions/import?/analyze" enctype="multipart/form-data"
    use:enhance={submitAnalyze} class="max-w-lg">
    <label
      for="file"
      class="flex flex-col items-center gap-3 rounded-[var(--radius)] border-2 border-dashed px-6 py-12 text-center transition-colors cursor-pointer"
      style="border-color:{dragOver ? 'var(--accent)' : 'var(--border)'}; background:{dragOver ? 'var(--accent-wash)' : 'var(--paper-sunk)'}"
      ondragover={(e) => { e.preventDefault(); dragOver = true; }}
      ondragleave={() => (dragOver = false)}
      ondrop={onDrop}
    >
      <span class="grid h-12 w-12 place-items-center rounded-full" style="background:var(--paper);color:var(--ink-faint)">
        <Icon name="upload" size={20} />
      </span>
      {#if selectedFiles.length}
        <p class="font-medium">
          {selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} files selected`}
        </p>
        <p class="text-xs text-[var(--ink-faint)]">Click or drop to choose different files</p>
      {:else}
        <p class="font-medium">Drop your CSV here, or click to browse</p>
        <p class="max-w-xs text-xs text-[var(--ink-faint)]">
          Any bank export — comma, semicolon or tab separated, columns in any order. Max 8 MB each.
          Select several files from the same bank to import them all at once.
        </p>
      {/if}
    </label>
    <input
      bind:this={fileInputEl}
      class="sr-only"
      id="file"
      name="file"
      type="file"
      accept=".csv,.tsv,.txt,text/csv"
      multiple
      required
      onchange={onFileChange}
    />
    {#if selectedFiles.length > 1}
      <ul class="mt-2 space-y-0.5 text-xs text-[var(--ink-faint)]">
        {#each selectedFiles as f}
          <li class="truncate">{f.name}</li>
        {/each}
      </ul>
    {/if}

    {#if data.aiAvailable}
      <p class="mt-3 flex items-center gap-1.5 text-xs text-[var(--ink-faint)]">
        <Icon name="sparkle" size={12} class="text-[var(--accent)]" />
        Your rules run first; the AI categorises whatever they miss.
      </p>
    {/if}

    <div class="mt-4 flex gap-2">
      <button class="btn btn-primary" disabled={!selectedFiles.length}>Continue</button>
      <button type="button" class="btn btn-ghost" onclick={onClose}>Cancel</button>
    </div>
  </form>

{:else}
  <form method="POST" action="/transactions/import?/import" use:enhance={submitImport}>
    <input type="hidden" name="payload" value={payload} />

    <!-- status strip -->
    <div class="card mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
      <span><b class="tnum">{stats.included}</b> of {stats.total} will import</span>
      {#if stats.errors}
        <button type="button" class="rounded px-1.5 py-0.5" style="background:var(--negative-wash);color:var(--negative)"
          onclick={() => excludeWhere((r) => r.error)}>exclude {stats.errors} with errors</button>
      {/if}
      {#if stats.dupes}
        <button type="button" class="rounded px-1.5 py-0.5" style="background:var(--warning-wash);color:var(--warning)"
          onclick={() => excludeWhere((r) => r.duplicate)}>exclude {stats.dupes} duplicate{stats.dupes === 1 ? '' : 's'}</button>
      {/if}
      {#if stats.byRule}
        <span class="rounded px-1.5 py-0.5" style="background:var(--accent-wash);color:var(--accent-strong)"
          title="Matched by your auto-categorisation rules — skipped by AI">
          {stats.byRule} by rule{stats.byRule === 1 ? '' : 's'}
        </span>
      {/if}
      <span class="tnum ml-auto text-[var(--ink-faint)]">+{stats.incoming.toFixed(2)} / −{stats.outgoing.toFixed(2)}</span>
    </div>

    {#if data.aiAvailable}
      {@const costTxt = aiState.cost ? ` · ${aiState.cost < 0.01 ? '<$0.01' : '~$' + aiState.cost.toFixed(2)}` : ''}
      <div class="card mb-3 text-[13px]">
        <div class="flex flex-wrap items-center gap-2">
          <Icon name="sparkle" size={14} class="text-[var(--accent)]" />
          {#if aiState.running}
            <span>The AI is categorising… <b class="tnum">{aiPct}%</b>
              <span class="text-[var(--ink-faint)]">({aiState.done}/{aiState.total})</span></span>
          {:else if aiState.error}
            <span style="color:var(--negative)">
              Couldn't finish — {aiState.error}{#if aiState.count} {aiState.count} row(s) were done first.{/if}
            </span>
          {:else if aiState.ran && aiState.total === 0}
            <span>Every row was already categorised by your rules — nothing sent to the AI.</span>
          {:else if aiState.ran && aiState.count}
            <span>The AI categorised {aiState.count} of {aiState.total} row(s){costTxt}. Check the ✨ picks.</span>
          {:else if aiState.ran}
            <span>The AI didn't find confident matches — set the categories below.</span>
          {/if}
          <button type="button" class="btn btn-ghost btn-sm ml-auto" disabled={aiState.running} onclick={runAiSuggest}>
            {aiState.running ? 'Working…' : aiState.ran ? 'Re-run' : 'Categorise'}
          </button>
        </div>
        {#if aiState.running || (aiState.total && aiState.done < aiState.total && !aiState.error)}
          <div class="mt-2 h-1 overflow-hidden rounded-full" style="background:var(--paper-sunk)">
            <div class="h-full rounded-full transition-[width] duration-300"
              style="width:{aiPct}%;background:var(--accent)"></div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- thin format line -->
    <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs text-[var(--ink-faint)]">
      <label class="flex items-center gap-1.5"><input type="checkbox" bind:checked={hasHeader} /> First row is a header</label>
      <label class="flex items-center gap-1.5">
        Ignore <input class="tnum w-12 rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-center"
          type="number" min="0" max="20" bind:value={skipRows} /> rows at top
      </label>
      <label class="flex items-center gap-1.5"><input type="checkbox" bind:checked={invert} /> Flip signs</label>
    </div>

    <!-- the table (its header row maps the columns) -->
    <div class="card card-flush">
      <div class="overflow-x-auto">
        <table class="w-full text-[13px]">
          <thead>
            <tr class="border-b border-[var(--border)] text-left">
              <th class="w-9 py-2 pl-4"><input type="checkbox" checked={allChecked} onchange={toggleAll} /></th>
              <th class="th px-2 pt-3">Date <span style="color:var(--negative)">*</span></th>
              <th class="th px-2 pt-3">Description</th>
              <th class="th px-2 pt-3">Amount</th>
              <th class="th px-2 pt-3">Category</th>
            </tr>
            <tr class="border-b border-[var(--border)] text-left align-middle">
              <th class="pb-2 pl-4"></th>
              <th class="px-2 pb-2">
                <select class="head-sel min-w-[110px] {mapping.date === '' ? '!border-[var(--negative)]' : ''}" bind:value={mapping.date}>
                  {#if mapping.date === ''}
                    <option value="">Date ({DATE_FORMATS.find((d) => d.value === dateOrder)?.label ?? dateOrder})</option>
                  {/if}
                  {#each headers as h, i}<option value={String(i)}>{h}</option>{/each}
                </select>
              </th>
              <th class="px-2 pb-2">
                <select class="head-sel min-w-[130px]" bind:value={mapping.description}>
                  <option value="">— column —</option>
                  {#each headers as h, i}<option value={String(i)}>{h}</option>{/each}
                </select>
              </th>
              <th class="px-2 pb-2">
                {#if amountSplit}
                  <div class="flex flex-col gap-1">
                    <div class="flex gap-1">
                      <select class="head-sel" bind:value={mapping.debit}>
                        <option value="">money out…</option>
                        {#each headers as h, i}<option value={String(i)}>{h}</option>{/each}
                      </select>
                      <select class="head-sel" bind:value={mapping.credit}>
                        <option value="">money in…</option>
                        {#each headers as h, i}<option value={String(i)}>{h}</option>{/each}
                      </select>
                    </div>
                    <button type="button" class="self-start text-[11px] text-[var(--ink-faint)] hover:underline"
                      onclick={useSingle}>← one signed column</button>
                  </div>
                {:else}
                  <div class="flex flex-col gap-0.5">
                    <select class="head-sel min-w-[110px]" bind:value={mapping.amount}>
                      <option value="">— column —</option>
                      {#each headers as h, i}<option value={String(i)}>{h}</option>{/each}
                    </select>
                    <button type="button" class="self-start text-[11px] text-[var(--ink-faint)] hover:underline"
                      onclick={useSplit}>separate debit / credit?</button>
                  </div>
                {/if}
              </th>
              <th class="px-2 pb-2">
                <select class="head-sel min-w-[120px]" bind:value={mapping.category}>
                  <option value="">— none —</option>
                  {#each headers as h, i}<option value={String(i)}>{h}</option>{/each}
                </select>
              </th>
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
                  {#if aiPending.has(r.i)}
                    <span class="ai-shimmer flex h-[26px] min-w-[140px] items-center gap-1.5 rounded-md px-2 text-[12px] text-[var(--ink-faint)]">
                      <span class="ai-dot"></span> AI…
                    </span>
                  {:else}
                    <div class="flex items-center gap-1">
                      {#if aiSuggested.has(r.i)}
                        <span title="Suggested by AI"><Icon name="sparkle" size={12} class="shrink-0 text-[var(--accent)]" /></span>
                      {:else if r.byRule}
                        <span title="Matched by one of your rules"><Icon name="repeat" size={12} class="shrink-0 text-[var(--ink-faint)]" /></span>
                      {/if}
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
                  {/if}
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

    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <button class="btn btn-primary" disabled={stats.included === 0 || aiState.running}>
        Import {stats.included} row{stats.included === 1 ? '' : 's'}
      </button>
      <button type="button" class="btn btn-ghost" onclick={onClose}>Cancel</button>
      <span class="flex items-center gap-1.5">
        <select class="input !py-1 text-xs" bind:value={bulkCat}>
          <option value="__none">Set all to…</option>
          <option value="">Uncategorised</option>
          {#each data.categories as c}<option value={String(c.id)}>{c.name}</option>{/each}
        </select>
        <button type="button" class="btn btn-ghost btn-sm" onclick={applyBulkCat} disabled={bulkCat === '__none'}>Apply</button>
      </span>
      <span class="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-faint)]">
        <label class="flex items-center gap-1.5"><input type="checkbox" bind:checked={skipDuplicates} /> Skip duplicates</label>
        <label class="flex items-center gap-1.5"><input type="checkbox" bind:checked={runRules} /> Run rules</label>
        <label class="flex items-center gap-1.5"><input type="checkbox" bind:checked={createCategories} /> Create categories</label>
      </span>
    </div>
  </form>
{/if}
