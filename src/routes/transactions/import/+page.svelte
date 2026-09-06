<script>
  import { enhance } from '$app/forms';
  import Icon from '$lib/components/Icon.svelte';
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

<svelte:head><title>Import · Tally</title></svelte:head>

<div class="mb-7 flex items-center gap-3 rise">
  <a href="/transactions" class="text-[var(--ink-faint)] hover:text-[var(--ink)]"><Icon name="arrowRight" size={18} class="rotate-180" /></a>
  <div>
    <p class="kicker mb-1">Transactions</p>
    <h1 class="text-3xl" style="font-family:var(--font-display)">Import from CSV</h1>
  </div>
</div>

{#if form?.imported !== undefined}
  <div class="card mb-4" style="border-color:var(--accent);background:var(--accent-wash)">
    <p class="font-semibold" style="color:var(--accent-strong)">
      Imported {form.imported} transaction{form.imported === 1 ? '' : 's'}.
    </p>
    <ul class="mt-1.5 space-y-0.5 text-[13px]" style="color:var(--accent-strong)">
      {#if form.duplicates}<li>· {form.duplicates} duplicate row(s) skipped (same date, amount &amp; description).</li>{/if}
      {#if form.skipped}<li>· {form.skipped} row(s) skipped (unparseable date or amount).</li>{/if}
      {#if form.categorisedByRules}<li>· {form.categorisedByRules} auto-categorised by your rules.</li>{/if}
      {#if form.uncategorised}<li>· {form.uncategorised} transaction(s) still uncategorised.</li>{/if}
    </ul>
    <div class="mt-3 flex gap-2">
      <a href="/transactions" class="btn btn-primary">View transactions</a>
      <a href="/transactions/import" class="btn btn-ghost">Import another</a>
    </div>
  </div>
{/if}

{#if form?.error}
  <p class="mb-4 rounded-[9px] px-3 py-2 text-sm" style="background:var(--negative-wash);color:var(--negative)">{form.error}</p>
{/if}

{#if !form?.analyzed && form?.imported === undefined}
  <form method="POST" action="?/analyze" enctype="multipart/form-data" use:enhance class="card space-y-4">
    <div>
      <label class="label" for="file">CSV file</label>
      <input class="input" id="file" name="file" type="file" accept=".csv,text/csv" required />
      <p class="mt-1.5 text-xs text-[var(--ink-faint)]">
        Most bank exports work. You'll map the columns on the next step. Max 5 MB.
      </p>
    </div>
    <button class="btn btn-primary">Continue</button>
  </form>
{/if}

{#if form?.analyzed}
  <form method="POST" action="?/import" use:enhance class="space-y-4">
    <input type="hidden" name="csv" value={form.csv} />

    <div class="card">
      <h2 class="text-lg">Map columns</h2>
      <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">{form.rowCount} data rows found.</p>
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

      <div class="mt-4 space-y-2.5 text-[13px]">
        <label class="flex items-center gap-2">
          <input type="checkbox" name="invert" /> Flip signs (my export lists spending as positive)
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" name="skip_duplicates" checked value="on" />
          Skip rows that duplicate an existing transaction (same date, amount &amp; description)
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" name="run_rules" checked /> Apply my auto-categorisation rules after import
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" name="auto_create" checked /> Create categories found in the file that don't exist yet
        </label>
      </div>
    </div>

    <div class="card card-flush">
      <h2 class="px-5 pb-3 pt-4 text-lg">Preview</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="border-y border-[var(--border)] text-left">
              {#each headers as h, i}<th class="th whitespace-nowrap px-3 py-2">{h || `Col ${i + 1}`}</th>{/each}
            </tr>
          </thead>
          <tbody>
            {#each form.preview as row}
              <tr class="border-b border-[var(--border)] last:border-0">
                {#each headers as _, i}<td class="tnum whitespace-nowrap px-3 py-1.5">{row[i] ?? ''}</td>{/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <div class="flex gap-2">
      <button class="btn btn-primary">Import {form.rowCount} rows</button>
      <a href="/transactions/import" class="btn btn-ghost">Start over</a>
    </div>
  </form>
{/if}
