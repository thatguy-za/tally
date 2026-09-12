<script>
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { fly, slide } from 'svelte/transition';
  import Money from '$lib/components/Money.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { toast } from '$lib/toast.svelte.js';
  let { data, form } = $props();

  let showAdd = $state($page.url.searchParams.has('new'));
  let showFilters = $state(false);
  let editingId = $state(null);
  let rulingId = $state(null);
  let selected = $state(new Set());
  const today = new Date().toISOString().slice(0, 10);

  // optimistic UI state
  let catOverride = $state(new Map()); // id -> categoryId string ('' = uncategorised)
  let pendingCat = $state(new Set());
  let removed = $state(new Set());
  let visibleRows = $derived(data.transactions.filter((t) => !removed.has(t.id)));

  // client-side column sort (null = keep server order: date desc)
  let sortKey = $state(null);
  let sortDir = $state('asc');
  function setSort(key, dir) {
    if (sortKey === key && sortDir === dir) { sortKey = null; return; }
    sortKey = key;
    sortDir = dir;
  }
  const sortVal = {
    date: (t) => t.date,
    description: (t) => (t.description || '').toLowerCase(),
    category: (t) => (t.category_name || '').toLowerCase(),
    amount: (t) => t.amount
  };
  let sortedRows = $derived.by(() => {
    if (!sortKey) return visibleRows;
    const f = sortVal[sortKey];
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...visibleRows].sort((a, b) => {
      const av = f(a);
      const bv = f(b);
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
  });

  let allChecked = $derived(
    visibleRows.length > 0 && visibleRows.every((t) => selected.has(t.id))
  );
  function toggle(id) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    selected = next;
  }
  function toggleAll() {
    selected = allChecked ? new Set() : new Set(visibleRows.map((t) => t.id));
  }
  function setParam(key, value) {
    const url = new URL($page.url);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    goto(url, { keepFocus: true, noScroll: true });
  }

  let activeFilterCount = $derived(Object.entries(data.filters).filter(([, v]) => v).length);

  const catColor = (id) =>
    data.categories.find((c) => String(c.id) === String(id))?.color || 'var(--border-strong)';
  const currentCat = (t) =>
    catOverride.has(t.id) ? catOverride.get(t.id) : String(t.category_id ?? '');

  function categoriseSubmit(t, newValue, prevValue) {
    catOverride.set(t.id, newValue);
    catOverride = new Map(catOverride);
    pendingCat.add(t.id);
    pendingCat = new Set(pendingCat);
    return async ({ result }) => {
      pendingCat.delete(t.id);
      pendingCat = new Set(pendingCat);
      if (result.type === 'failure' || result.type === 'error') {
        catOverride.set(t.id, prevValue);
        catOverride = new Map(catOverride);
        toast('Could not update category', { type: 'info' });
      }
      // success: keep the optimistic value, skip invalidateAll
    };
  }

  function deleteSubmit(id) {
    removed.add(id);
    removed = new Set(removed);
    return async ({ result, update }) => {
      if (result.type === 'failure' || result.type === 'error') {
        removed.delete(id);
        removed = new Set(removed);
        toast('Could not delete', { type: 'info' });
      } else {
        await update();
      }
    };
  }

  let seenForm;
  $effect(() => {
    if (form === seenForm) return;
    seenForm = form;
    if (form?.added) { showAdd = false; toast('Transaction added'); }
    if (form?.updated) { editingId = null; toast('Transaction updated'); }
    if (form?.ruleSaved) {
      rulingId = null;
      toast(form.applied ? `Rule saved · ${form.applied} categorised` : 'Auto-categorisation rule saved');
    }
    if (form?.deleted) toast('Transaction deleted');
    if (form?.bulk) { selected = new Set(); catOverride = new Map(); toast(form.bulk); }
    else if (form?.error) toast(form.error, { type: 'info' });
  });
</script>

<svelte:head><title>Transactions · Tally</title></svelte:head>

<div class="mb-7 flex flex-wrap items-end justify-between gap-3 rise">
  <div>
    <p class="kicker mb-2">Activity</p>
    <h1 class="text-3xl" style="font-family:var(--font-display)">Transactions</h1>
  </div>
  <div class="flex flex-wrap gap-2">
    <button class="btn btn-ghost" onclick={() => (showFilters = !showFilters)}>
      <Icon name="filter" size={14} /> Filters{activeFilterCount ? ` · ${activeFilterCount}` : ''}
    </button>
    <a href="/transactions/import" class="btn btn-ghost"><Icon name="upload" size={14} /> Import</a>
    <button class="btn btn-primary" onclick={() => (showAdd = !showAdd)}>
      <Icon name="plus" size={14} /> Add
    </button>
  </div>
</div>

{#if showAdd}
  <form transition:slide method="POST" action="?/add" use:enhance
    class="card mb-4 grid gap-3 sm:grid-cols-6">
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
    <div class="{data.accounts.length > 1 ? 'sm:col-span-2' : 'sm:col-span-3'}">
      <label class="label" for="a-cat">Category</label>
      <select class="input" id="a-cat" name="category_id">
        <option value="">Auto (rules) / uncategorised</option>
        {#each data.categories as c}<option value={String(c.id)}>{c.name}</option>{/each}
      </select>
    </div>
    {#if data.accounts.length > 1}
      <div class="sm:col-span-1">
        <label class="label" for="a-acct">Account</label>
        <select class="input" id="a-acct" name="account_id">
          {#each data.accounts as a}<option value={String(a.id)}>{a.name}</option>{/each}
        </select>
      </div>
    {/if}
    <div class="flex items-end gap-2 sm:col-span-3">
      <button class="btn btn-primary">Save</button>
      <button type="button" class="btn btn-ghost" onclick={() => (showAdd = false)}>Cancel</button>
      {#if form?.error}<span class="self-center text-sm" style="color:var(--negative)">{form.error}</span>{/if}
    </div>
  </form>
{/if}

{#if showFilters}
  <div transition:slide class="card mb-4 grid gap-3 sm:grid-cols-4">
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
        {#each data.categories as c}<option value={String(c.id)}>{c.name}</option>{/each}
      </select>
    </div>
    {#if data.accounts.length > 1}
      <div>
        <label class="label" for="f-acct">Account</label>
        <select class="input" id="f-acct" value={data.filters.account}
          onchange={(e) => setParam('account', e.currentTarget.value)}>
          <option value="">Any</option>
          <option value="none">No account</option>
          {#each data.accounts as a}<option value={String(a.id)}>{a.name}</option>{/each}
        </select>
      </div>
    {/if}
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
      <a class="btn btn-ghost w-full" href="/transactions">Clear all</a>
    </div>
  </div>
{/if}

<div class="card mb-4 flex flex-wrap items-center gap-3 rise rise-1">
  <div class="relative min-w-[200px] flex-1">
    <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]">
      <Icon name="search" size={15} />
    </span>
    <input class="input pl-9" placeholder="Search description…" value={data.filters.search}
      onchange={(e) => setParam('q', e.currentTarget.value)} />
  </div>
  <div class="ml-auto flex items-center gap-4 text-[13px]">
    <span>In <Money value={data.sum.incoming} currency={data.currency} colour="positive" class="font-medium" /></span>
    <span>Out <Money value={data.sum.outgoing} currency={data.currency} colour="ink" class="font-medium" /></span>
    <span class="text-[var(--ink-faint)]">·</span>
    <span>Net <Money value={data.sum.incoming - data.sum.outgoing} currency={data.currency} colour="auto" class="font-semibold" /></span>
  </div>
</div>

{#if selected.size > 0}
  <div transition:fly={{ y: -8, duration: 160 }}
    class="sticky top-[68px] z-20 mb-3 flex flex-wrap items-center gap-3 rounded-[11px] px-4 py-2.5 text-[13px] shadow-[var(--shadow-lg)]"
    style="background:var(--ink);color:var(--paper)">
    <span class="font-semibold">{selected.size} selected</span>
    <form method="POST" action="?/bulkCategorise" use:enhance class="flex items-center gap-2">
      {#each [...selected] as id}<input type="hidden" name="id" value={id} />{/each}
      <select name="category_id"
        class="rounded-md border-0 bg-white/15 px-2 py-1 pr-6 text-[13px]"
        style="color:var(--paper); appearance:none; background-image:url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round'%3E%3Cpath d='M3 5.5l4 4 4-4'/%3E%3C/svg%3E&quot;); background-repeat:no-repeat; background-position:right 0.4rem center">
        <option value="">Uncategorised</option>
        {#each data.categories as c}<option value={String(c.id)}>{c.name}</option>{/each}
      </select>
      <button class="rounded-md bg-white/15 px-2.5 py-1 font-medium hover:bg-white/25">Apply</button>
    </form>
    <form method="POST" action="?/bulkDelete" use:enhance
      onsubmit={(e) => { if (!confirm(`Delete ${selected.size} transactions?`)) e.preventDefault(); }}>
      {#each [...selected] as id}<input type="hidden" name="id" value={id} />{/each}
      <button class="rounded-md bg-white/15 px-2.5 py-1 font-medium hover:bg-white/25">Delete</button>
    </form>
    <button class="ml-auto underline opacity-80 hover:opacity-100" onclick={() => (selected = new Set())}>Clear</button>
  </div>
{/if}

{#snippet sortable(key, label, thClass, alignEnd = false)}
  <th class={thClass}>
    <span class="inline-flex items-center gap-1.5 {alignEnd ? 'w-full justify-end' : ''}">
      <span>{label}</span>
      <span class="inline-flex flex-col">
        <button type="button" aria-label={`Sort by ${label}, ascending`}
          class="block text-[8px] leading-[7px] {sortKey === key && sortDir === 'asc' ? 'text-[var(--accent)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink)]'}"
          onclick={() => setSort(key, 'asc')}>▲</button>
        <button type="button" aria-label={`Sort by ${label}, descending`}
          class="block text-[8px] leading-[7px] {sortKey === key && sortDir === 'desc' ? 'text-[var(--accent)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink)]'}"
          onclick={() => setSort(key, 'desc')}>▼</button>
      </span>
    </span>
  </th>
{/snippet}

<div class="card card-flush rise rise-2">
  {#if data.transactions.length}
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-[var(--border)] text-left">
          <th class="w-10 py-2.5 pl-4"><input type="checkbox" checked={allChecked} onchange={toggleAll} /></th>
          {@render sortable('date', 'Date', 'th py-2.5')}
          {@render sortable('description', 'Description', 'th py-2.5')}
          {@render sortable('category', 'Category', 'th py-2.5')}
          {@render sortable('amount', 'Amount', 'th py-2.5 pr-4 text-right', true)}
          <th class="w-16"></th>
        </tr>
      </thead>
      <tbody>
        {#each sortedRows as t (t.id)}
          {#if editingId === t.id}
            <tr class="border-b border-[var(--border)]">
              <td colspan="6" class="p-3" style="background:var(--paper-sunk)">
                <form method="POST" action="?/update" use:enhance class="grid gap-2 sm:grid-cols-6">
                  <input type="hidden" name="id" value={t.id} />
                  <input class="input" name="date" type="date" value={t.date} required />
                  <input class="input sm:col-span-2" name="description" value={t.description} />
                  <input class="input" name="amount" value={Math.abs(t.amount)} inputmode="decimal" required />
                  <select class="input" name="direction" value={t.amount >= 0 ? 'in' : 'out'}>
                    <option value="out">Outgoing</option>
                    <option value="in">Incoming</option>
                  </select>
                  {#if data.accounts.length > 1}
                    <select class="input" name="account_id" value={String(t.account_id ?? '')}>
                      <option value="">No account</option>
                      {#each data.accounts as a}<option value={String(a.id)}>{a.name}</option>{/each}
                    </select>
                  {/if}
                  <div class="flex gap-2 sm:col-span-6">
                    <button class="btn btn-primary btn-sm">Save</button>
                    <button type="button" class="btn btn-ghost btn-sm" onclick={() => (editingId = null)}>Cancel</button>
                  </div>
                </form>
              </td>
            </tr>
          {:else if rulingId === t.id}
            <tr class="border-b border-[var(--border)]">
              <td colspan="6" class="p-3" style="background:var(--paper-sunk)">
                <form method="POST" action="?/saveRule" use:enhance class="grid gap-2 sm:grid-cols-6">
                  <div class="sm:col-span-3">
                    <label class="label" for="rule-match-{t.id}">When description contains</label>
                    <input class="input" id="rule-match-{t.id}" name="match_text" value={t.description} required />
                  </div>
                  <div class="sm:col-span-2">
                    <label class="label" for="rule-cat-{t.id}">Category</label>
                    <select class="input" id="rule-cat-{t.id}" name="category_id" value={String(t.category_id ?? '')} required>
                      <option value="">Choose…</option>
                      {#each data.categories as c}<option value={String(c.id)}>{c.name}</option>{/each}
                    </select>
                  </div>
                  <div>
                    <label class="label" for="rule-pri-{t.id}">Priority</label>
                    <input class="input tnum" id="rule-pri-{t.id}" name="priority" type="number" value="0" />
                  </div>
                  <div class="flex items-center gap-2 sm:col-span-6">
                    <button class="btn btn-primary btn-sm">Save rule</button>
                    <button type="button" class="btn btn-ghost btn-sm" onclick={() => (rulingId = null)}>Cancel</button>
                    <span class="text-[12px] text-[var(--ink-faint)]">Future imports and manual entries with this text get this category.</span>
                  </div>
                </form>
              </td>
            </tr>
          {:else}
            <tr class="group border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--paper-sunk)]/60"
              style={selected.has(t.id) ? 'background:var(--accent-wash)' : ''}>
              <td class="py-2.5 pl-4">
                <input type="checkbox" checked={selected.has(t.id)} onchange={() => toggle(t.id)} />
              </td>
              <td class="tnum whitespace-nowrap py-2.5 pr-3 text-[var(--ink-faint)]">{t.date}</td>
              <td class="py-2.5 pr-3">
                <div class="font-medium">{t.description || '—'}</div>
                {#if data.accounts.length > 1}
                  <div class="text-xs text-[var(--ink-faint)]">{t.account_name || 'No account'}</div>
                {/if}
              </td>
              <td class="py-2.5 pr-3">
                <form method="POST" action="?/categorise"
                  use:enhance={({ formData }) =>
                    categoriseSubmit(t, String(formData.get('category_id') ?? ''), currentCat(t))}>
                  <input type="hidden" name="id" value={t.id} />
                  <div class="flex items-center gap-1.5 transition-opacity {pendingCat.has(t.id) ? 'opacity-50' : ''}">
                    <span class="dot shrink-0 transition-colors" style="background:{catColor(currentCat(t))}"></span>
                    <select name="category_id" class="cell max-w-[160px] text-[13px]"
                      value={currentCat(t)} onchange={(e) => e.currentTarget.form.requestSubmit()}>
                      <option value="">Uncategorised</option>
                      {#each data.categories as c}<option value={String(c.id)}>{c.name}</option>{/each}
                    </select>
                  </div>
                </form>
              </td>
              <td class="py-2.5 pr-4 text-right">
                <Money value={t.amount} currency={data.currency} colour="auto" class="font-medium" />
              </td>
              <td class="py-2.5 pr-3">
                <div class="flex justify-end gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button class="tip rounded p-1 text-[var(--ink-faint)] hover:text-[var(--accent)]"
                    data-tip="Save as rule" aria-label="Save as auto-categorisation rule"
                    onclick={() => { rulingId = t.id; editingId = null; }}><Icon name="repeat" size={14} /></button>
                  <button class="tip rounded p-1 text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    data-tip="Edit" aria-label="Edit transaction"
                    onclick={() => { editingId = t.id; rulingId = null; }}><Icon name="edit" size={14} /></button>
                  <form method="POST" action="?/delete" use:enhance={() => deleteSubmit(t.id)}>
                    <input type="hidden" name="id" value={t.id} />
                    <button class="tip rounded p-1 text-[var(--ink-faint)] hover:text-[var(--negative)]"
                      data-tip="Delete" aria-label="Delete transaction">
                      <Icon name="trash" size={14} />
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {:else}
    <EmptyState
      icon="transactions"
      title={activeFilterCount ? 'Nothing matches those filters' : 'No transactions yet'}
      hint={activeFilterCount
        ? 'Try widening the date range or clearing a filter.'
        : 'Add one by hand, or import a CSV from your bank.'}
      cta={activeFilterCount ? { href: '/transactions', label: 'Clear filters' } : { href: '/transactions/import', label: 'Import CSV' }}
    />
  {/if}
</div>
