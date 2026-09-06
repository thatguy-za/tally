<script>
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatMoney } from '$lib/currency.js';
  let { data, form } = $props();

  let showAdd = $state(false);
  let showFilters = $state(false);
  let editingId = $state(null);
  let selected = $state(new Set());
  const today = new Date().toISOString().slice(0, 10);

  let allChecked = $derived(
    data.transactions.length > 0 && data.transactions.every((t) => selected.has(t.id))
  );

  function toggle(id) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    selected = next;
  }
  function toggleAll() {
    selected = allChecked ? new Set() : new Set(data.transactions.map((t) => t.id));
  }

  function setParam(key, value) {
    const url = new URL($page.url);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    goto(url, { keepFocus: true, noScroll: true });
  }
  function clearFilters() {
    goto('/transactions', { noScroll: true });
  }

  let activeFilterCount = $derived(
    Object.entries(data.filters).filter(([, v]) => v).length
  );

  $effect(() => {
    if (form?.added) showAdd = false;
    if (form?.updated) editingId = null;
    if (form?.bulk) selected = new Set();
  });
</script>

<svelte:head><title>Transactions · Budget</title></svelte:head>

<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
  <h1 class="text-2xl font-bold">Transactions</h1>
  <div class="flex gap-2">
    <button class="btn-ghost" onclick={() => (showFilters = !showFilters)}>
      Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
    </button>
    <a href="/transactions/import" class="btn-ghost">Import CSV</a>
    <button class="btn-primary" onclick={() => (showAdd = !showAdd)}>Add</button>
  </div>
</div>

{#if form?.bulk}
  <p class="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{form.bulk}</p>
{/if}

{#if showAdd}
  <form method="POST" action="?/add" use:enhance class="card mb-4 grid gap-3 sm:grid-cols-6">
    <div class="sm:col-span-2">
      <label class="label" for="a-date">Date</label>
      <input class="input" id="a-date" name="date" type="date" value={today} required />
    </div>
    <div class="sm:col-span-2">
      <label class="label" for="a-desc">Description</label>
      <input class="input" id="a-desc" name="description" placeholder="e.g. Supermarket" />
    </div>
    <div>
      <label class="label" for="a-amount">Amount</label>
      <input class="input" id="a-amount" name="amount" inputmode="decimal" placeholder="0.00" required />
    </div>
    <div>
      <label class="label" for="a-dir">Type</label>
      <select class="input" id="a-dir" name="direction">
        <option value="out">Outgoing</option>
        <option value="in">Incoming</option>
      </select>
    </div>
    <div class="sm:col-span-3">
      <label class="label" for="a-cat">Category</label>
      <select class="input" id="a-cat" name="category_id">
        <option value="">Auto (rules) / uncategorised</option>
        {#each data.categories as c}<option value={c.id}>{c.name}</option>{/each}
      </select>
    </div>
    <div class="flex items-end gap-2 sm:col-span-3">
      <button class="btn-primary">Save</button>
      <button type="button" class="btn-ghost" onclick={() => (showAdd = false)}>Cancel</button>
      {#if form?.error}<span class="self-center text-sm text-rose-600">{form.error}</span>{/if}
    </div>
  </form>
{/if}

{#if showFilters}
  <div class="card mb-4 grid gap-3 sm:grid-cols-4">
    <div>
      <label class="label" for="f-month">Month</label>
      <select class="input" id="f-month" value={data.filters.month}
        onchange={(e) => setParam('month', e.currentTarget.value)}>
        <option value="">Any</option>
        {#each data.months as m}<option value={m}>{m}</option>{/each}
      </select>
    </div>
    <div>
      <label class="label" for="f-from">From</label>
      <input class="input" id="f-from" type="date" value={data.filters.dateFrom}
        onchange={(e) => setParam('from', e.currentTarget.value)} />
    </div>
    <div>
      <label class="label" for="f-to">To</label>
      <input class="input" id="f-to" type="date" value={data.filters.dateTo}
        onchange={(e) => setParam('to', e.currentTarget.value)} />
    </div>
    <div>
      <label class="label" for="f-cat">Category</label>
      <select class="input" id="f-cat" value={data.filters.category}
        onchange={(e) => setParam('category', e.currentTarget.value)}>
        <option value="">Any</option>
        <option value="none">Uncategorised</option>
        {#each data.categories as c}<option value={c.id}>{c.name}</option>{/each}
      </select>
    </div>
    <div>
      <label class="label" for="f-dir">Direction</label>
      <select class="input" id="f-dir" value={data.filters.direction}
        onchange={(e) => setParam('dir', e.currentTarget.value)}>
        <option value="">Any</option>
        <option value="in">Incoming</option>
        <option value="out">Outgoing</option>
      </select>
    </div>
    <div>
      <label class="label" for="f-min">Min amount</label>
      <input class="input" id="f-min" inputmode="decimal" value={data.filters.amountMin}
        onchange={(e) => setParam('min', e.currentTarget.value)} />
    </div>
    <div>
      <label class="label" for="f-max">Max amount</label>
      <input class="input" id="f-max" inputmode="decimal" value={data.filters.amountMax}
        onchange={(e) => setParam('max', e.currentTarget.value)} />
    </div>
    <div class="flex items-end">
      <button class="btn-ghost w-full" onclick={clearFilters}>Clear all</button>
    </div>
  </div>
{/if}

<div class="card mb-4 flex flex-wrap items-center gap-3">
  <input class="input max-w-xs flex-1" placeholder="Search description…" value={data.filters.search}
    onchange={(e) => setParam('q', e.currentTarget.value)} />
  <div class="ml-auto flex gap-4 text-sm">
    <span class="text-emerald-600">In {formatMoney(data.sum.incoming, data.currency)}</span>
    <span class="text-rose-600">Out {formatMoney(data.sum.outgoing, data.currency)}</span>
    <span class="font-semibold">Net {formatMoney(data.sum.incoming - data.sum.outgoing, data.currency)}</span>
  </div>
</div>

{#if selected.size > 0}
  <div class="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-brand-600 px-4 py-2.5 text-sm text-white shadow-lg">
    <span class="font-semibold">{selected.size} selected</span>
    <form method="POST" action="?/bulkCategorise" use:enhance class="flex items-center gap-2">
      {#each [...selected] as id}<input type="hidden" name="id" value={id} />{/each}
      <select name="category_id" class="rounded-md border-0 px-2 py-1 text-sm text-slate-900">
        <option value="">Uncategorised</option>
        {#each data.categories as c}<option value={c.id}>{c.name}</option>{/each}
      </select>
      <button class="rounded-md bg-white/20 px-2.5 py-1 font-medium hover:bg-white/30">Set category</button>
    </form>
    <form method="POST" action="?/bulkDelete" use:enhance
      onsubmit={(e) => { if (!confirm(`Delete ${selected.size} transactions?`)) e.preventDefault(); }}>
      {#each [...selected] as id}<input type="hidden" name="id" value={id} />{/each}
      <button class="rounded-md bg-white/20 px-2.5 py-1 font-medium hover:bg-white/30">Delete</button>
    </form>
    <button class="ml-auto underline" onclick={() => (selected = new Set())}>Clear</button>
  </div>
{/if}

<div class="card overflow-x-auto">
  {#if data.transactions.length}
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
          <th class="w-8 py-2"><input type="checkbox" checked={allChecked} onchange={toggleAll} /></th>
          <th class="py-2 pr-3">Date</th>
          <th class="py-2 pr-3">Description</th>
          <th class="py-2 pr-3">Category</th>
          <th class="py-2 pr-3 text-right">Amount</th>
          <th class="py-2"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        {#each data.transactions as t (t.id)}
          {#if editingId === t.id}
            <tr>
              <td colspan="6" class="py-2">
                <form method="POST" action="?/update" use:enhance class="grid gap-2 sm:grid-cols-6">
                  <input type="hidden" name="id" value={t.id} />
                  <input class="input" name="date" type="date" value={t.date} required />
                  <input class="input sm:col-span-2" name="description" value={t.description} />
                  <input class="input" name="amount" value={Math.abs(t.amount)} inputmode="decimal" required />
                  <select class="input" name="direction" value={t.amount >= 0 ? 'in' : 'out'}>
                    <option value="out">Outgoing</option>
                    <option value="in">Incoming</option>
                  </select>
                  <div class="flex gap-2">
                    <button class="btn-primary !py-1.5">Save</button>
                    <button type="button" class="btn-ghost !py-1.5" onclick={() => (editingId = null)}>Cancel</button>
                  </div>
                </form>
              </td>
            </tr>
          {:else}
            <tr class="group {selected.has(t.id) ? 'bg-brand-50/60' : ''}">
              <td class="py-2.5">
                <input type="checkbox" checked={selected.has(t.id)} onchange={() => toggle(t.id)} />
              </td>
              <td class="whitespace-nowrap py-2.5 pr-3 text-slate-500">{t.date}</td>
              <td class="py-2.5 pr-3 font-medium">{t.description || '—'}</td>
              <td class="py-2.5 pr-3">
                <form method="POST" action="?/categorise" use:enhance>
                  <input type="hidden" name="id" value={t.id} />
                  <select name="category_id"
                    class="rounded-md border-0 bg-slate-50 px-2 py-1 text-xs ring-1 ring-inset ring-slate-200"
                    value={t.category_id ?? ''} onchange={(e) => e.currentTarget.form.requestSubmit()}>
                    <option value="">Uncategorised</option>
                    {#each data.categories as c}<option value={c.id}>{c.name}</option>{/each}
                  </select>
                </form>
              </td>
              <td class="whitespace-nowrap py-2.5 pr-3 text-right font-semibold {t.amount >= 0 ? 'text-emerald-600' : 'text-slate-700'}">
                {formatMoney(t.amount, data.currency)}
              </td>
              <td class="py-2.5 text-right">
                <div class="flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                  <button class="rounded p-1 text-slate-400 hover:text-slate-700" title="Edit"
                    onclick={() => (editingId = t.id)}>✏️</button>
                  <form method="POST" action="?/delete" use:enhance>
                    <input type="hidden" name="id" value={t.id} />
                    <button class="rounded p-1 text-slate-400 hover:text-rose-600" title="Delete">🗑️</button>
                  </form>
                </div>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="py-10 text-center text-sm text-slate-400">No transactions match these filters.</p>
  {/if}
</div>
