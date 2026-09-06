<script>
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { fly, slide } from 'svelte/transition';
  import Money from '$lib/components/Money.svelte';
  import Icon from '$lib/components/Icon.svelte';
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

  let activeFilterCount = $derived(Object.entries(data.filters).filter(([, v]) => v).length);

  $effect(() => {
    if (form?.added) showAdd = false;
    if (form?.updated) editingId = null;
    if (form?.bulk) selected = new Set();
  });
</script>

<svelte:head><title>Transactions · Tally</title></svelte:head>

<div class="mb-7 flex flex-wrap items-end justify-between gap-3 rise">
  <div>
    <p class="kicker mb-2">Activity</p>
    <h1 class="text-3xl" style="font-family:var(--font-display)">Transactions</h1>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick={() => (showFilters = !showFilters)}>
      <Icon name="filter" size={14} /> Filters{activeFilterCount ? ` · ${activeFilterCount}` : ''}
    </button>
    <a href="/transactions/import" class="btn btn-ghost"><Icon name="upload" size={14} /> Import</a>
    <button class="btn btn-primary" onclick={() => (showAdd = !showAdd)}>
      <Icon name="plus" size={14} /> Add
    </button>
  </div>
</div>

{#if form?.bulk}
  <p transition:slide class="mb-4 rounded-[9px] px-3 py-2 text-sm"
    style="background:var(--accent-wash);color:var(--accent-strong)">{form.bulk}</p>
{/if}

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
    <div class="sm:col-span-3">
      <label class="label" for="a-cat">Category</label>
      <select class="input" id="a-cat" name="category_id">
        <option value="">Auto (rules) / uncategorised</option>
        {#each data.categories as c}<option value={c.id}>{c.name}</option>{/each}
      </select>
    </div>
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
        class="rounded-md border-0 bg-white/15 px-2 py-1 text-[13px]" style="color:var(--paper)">
        <option value="" style="color:#000">Uncategorised</option>
        {#each data.categories as c}<option value={c.id} style="color:#000">{c.name}</option>{/each}
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

<div class="card card-flush rise rise-2">
  {#if data.transactions.length}
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-[var(--border)] text-left">
          <th class="w-10 py-2.5 pl-4"><input type="checkbox" checked={allChecked} onchange={toggleAll} /></th>
          <th class="th py-2.5">Date</th>
          <th class="th py-2.5">Description</th>
          <th class="th py-2.5">Category</th>
          <th class="th py-2.5 pr-4 text-right">Amount</th>
          <th class="w-16"></th>
        </tr>
      </thead>
      <tbody>
        {#each data.transactions as t (t.id)}
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
                  <div class="flex gap-2">
                    <button class="btn btn-primary btn-sm">Save</button>
                    <button type="button" class="btn btn-ghost btn-sm" onclick={() => (editingId = null)}>Cancel</button>
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
              <td class="py-2.5 pr-3 font-medium">{t.description || '—'}</td>
              <td class="py-2.5 pr-3">
                <form method="POST" action="?/categorise" use:enhance>
                  <input type="hidden" name="id" value={t.id} />
                  <div class="flex items-center gap-1.5">
                    <span class="dot" style="background:{t.category_color || 'var(--border-strong)'}"></span>
                    <select name="category_id"
                      class="max-w-[150px] rounded-md border-0 bg-transparent py-1 pr-5 text-[13px] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                      value={t.category_id ?? ''} onchange={(e) => e.currentTarget.form.requestSubmit()}>
                      <option value="">Uncategorised</option>
                      {#each data.categories as c}<option value={c.id}>{c.name}</option>{/each}
                    </select>
                  </div>
                </form>
              </td>
              <td class="py-2.5 pr-4 text-right">
                <Money value={t.amount} currency={data.currency} colour="auto" class="font-medium" />
              </td>
              <td class="py-2.5 pr-3">
                <div class="flex justify-end gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button class="rounded p-1 text-[var(--ink-faint)] hover:text-[var(--ink)]" title="Edit"
                    onclick={() => (editingId = t.id)}><Icon name="edit" size={14} /></button>
                  <form method="POST" action="?/delete" use:enhance>
                    <input type="hidden" name="id" value={t.id} />
                    <button class="rounded p-1 text-[var(--ink-faint)] hover:text-[var(--negative)]" title="Delete">
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
    <p class="px-5 py-14 text-center text-sm text-[var(--ink-faint)]">No transactions match these filters.</p>
  {/if}
</div>
