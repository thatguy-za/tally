<script>
  import { enhance } from '$app/forms';
  let { data, form } = $props();

  let headers = $derived(form?.headers ?? []);
  const colFields = [
    ['date', 'Date', true],
    ['description', 'Description', false],
    ['amount', 'Amount (single signed column)', false],
    ['debit', 'Debit / money out', false],
    ['credit', 'Credit / money in', false],
    ['category', 'Category name', false]
  ];
</script>

<svelte:head><title>Import CSV · Budget</title></svelte:head>

<div class="mb-6 flex items-center gap-3">
  <a href="/transactions" class="text-slate-400 hover:text-slate-700">←</a>
  <h1 class="text-2xl font-bold">Import transactions</h1>
</div>

{#if form?.imported !== undefined}
  <div class="card mb-4 bg-emerald-50 ring-emerald-200">
    <p class="font-semibold text-emerald-800">
      Imported {form.imported} transaction{form.imported === 1 ? '' : 's'}.
    </p>
    <ul class="mt-1 text-sm text-emerald-700">
      {#if form.duplicates}<li>{form.duplicates} duplicate row(s) skipped (same date, amount &amp; description).</li>{/if}
      {#if form.skipped}<li>{form.skipped} row(s) skipped (unparseable date or amount).</li>{/if}
      {#if form.categorisedByRules}<li>{form.categorisedByRules} auto-categorised by your rules.</li>{/if}
      {#if form.uncategorised}<li>{form.uncategorised} transaction(s) still uncategorised.</li>{/if}
    </ul>
    <div class="mt-3 flex gap-2">
      <a href="/transactions" class="btn-primary">View transactions</a>
      <a href="/transactions/import" class="btn-ghost">Import another file</a>
    </div>
  </div>
{/if}

{#if form?.error}
  <p class="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{form.error}</p>
{/if}

{#if !form?.analyzed && form?.imported === undefined}
  <form method="POST" action="?/analyze" enctype="multipart/form-data" use:enhance class="card space-y-4">
    <div>
      <label class="label" for="file">CSV file</label>
      <input class="input" id="file" name="file" type="file" accept=".csv,text/csv" required />
      <p class="mt-1.5 text-xs text-slate-400">
        Most bank exports work. You'll map the columns on the next step. Max 5 MB.
      </p>
    </div>
    <button class="btn-primary">Continue</button>
  </form>
{/if}

{#if form?.analyzed}
  <form method="POST" action="?/import" use:enhance class="space-y-4">
    <input type="hidden" name="csv" value={form.csv} />

    <div class="card">
      <h2 class="mb-1 font-semibold">Map columns</h2>
      <p class="mb-4 text-sm text-slate-500">{form.rowCount} data rows found.</p>
      <div class="grid gap-3 sm:grid-cols-2">
        {#each colFields as [key, label, required]}
          <div>
            <label class="label" for={`col_${key}`}>{label}{required ? ' *' : ''}</label>
            <select class="input" id={`col_${key}`} name={`col_${key}`} value={form.mapping[key] ?? ''}>
              <option value="">— none —</option>
              {#each headers as h, i}<option value={i}>{h || `Column ${i + 1}`}</option>{/each}
            </select>
          </div>
        {/each}
      </div>

      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label class="label" for="date_order">Date format</label>
          <select class="input" id="date_order" name="date_order">
            <option value="dmy">Day first (31/12/2026)</option>
            <option value="mdy">Month first (12/31/2026)</option>
          </select>
        </div>
        <div>
          <label class="label" for="default_category_id">Default category (optional)</label>
          <select class="input" id="default_category_id" name="default_category_id">
            <option value="">Leave uncategorised</option>
            {#each data.categories as c}<option value={c.id}>{c.name}</option>{/each}
          </select>
        </div>
      </div>

      <div class="mt-4 space-y-2 text-sm">
        <label class="flex items-center gap-2">
          <input type="checkbox" name="invert" class="rounded" />
          Flip signs (my export lists spending as positive)
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" name="skip_duplicates" class="rounded" checked value="on" />
          Skip rows that duplicate an existing transaction (same date, amount &amp; description)
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" name="run_rules" class="rounded" checked />
          Apply my auto-categorisation rules after import
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" name="auto_create" class="rounded" checked />
          Create categories found in the file that don't exist yet
        </label>
      </div>
    </div>

    <div class="card overflow-x-auto">
      <h2 class="mb-3 font-semibold">Preview</h2>
      <table class="w-full text-xs">
        <thead>
          <tr class="text-left text-slate-400">
            {#each headers as h, i}<th class="px-2 py-1">{h || `Col ${i + 1}`}</th>{/each}
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          {#each form.preview as row}
            <tr>{#each headers as _, i}<td class="whitespace-nowrap px-2 py-1">{row[i] ?? ''}</td>{/each}</tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="flex gap-2">
      <button class="btn-primary">Import {form.rowCount} rows</button>
      <a href="/transactions/import" class="btn-ghost">Start over</a>
    </div>
  </form>
{/if}
