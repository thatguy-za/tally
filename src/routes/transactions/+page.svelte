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
  let recurringId = $state(null); // tx id whose recurring panel is open
  let selected = $state(new Set());
  const today = new Date().toISOString().slice(0, 10);

  const freqLabel = (t) =>
    t.rec_interval > 1
      ? `every ${t.rec_interval} ${t.rec_frequency?.replace('ly', 's')}`
      : t.rec_frequency;

  /** default "next" date: advance a date string by one period */
  function nextAfter(dateStr, frequency, n = 1) {
    const [y, m, d] = String(dateStr || today).split('-').map(Number);
    const base = new Date(Date.UTC(y, m - 1, d));
    if (frequency === 'weekly') base.setUTCDate(base.getUTCDate() + 7 * n);
    else if (frequency === 'yearly') base.setUTCFullYear(base.getUTCFullYear() + n);
    else base.setUTCMonth(base.getUTCMonth() + n);
    return base.toISOString().slice(0, 10);
  }

  // optimistic UI state
  let catOverride = $state(new Map()); // id -> categoryId string ('' = uncategorised)
  let pendingCat = $state(new Set());
  let removed = $state(new Set());
  let visibleRows = $derived(data.transactions.filter((t) => !removed.has(t.id)));

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

  let aiRunning = $state(false);

  let seenForm;
  $effect(() => {
    if (form === seenForm) return;
    seenForm = form;
    aiRunning = false;
    if (form?.added) { showAdd = false; toast('Transaction added'); }
    if (form?.updated) { editingId = null; toast('Transaction updated'); }
    if (form?.deleted) toast('Transaction deleted');
    if (form?.recurring) { recurringId = null; toast(form.recurring); }
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
    {#if data.aiCategorise}
      <form method="POST" action="?/aiCategorise"
        use:enhance={() => {
          aiRunning = true;
          return async ({ result, update }) => {
            aiRunning = false;
            if (result.type === 'error') { toast('AI categorisation failed.', { type: 'info' }); return; }
            await update();
          };
        }}>
        {#each [...selected] as id}<input type="hidden" name="id" value={id} />{/each}
        <button class="btn btn-ghost" disabled={aiRunning}>
          <Icon name="sparkle" size={14} class="text-[var(--accent)]" />
          {aiRunning ? 'Categorising…' : selected.size ? `AI categorise ${selected.size}` : 'AI categorise'}
        </button>
      </form>
    {/if}
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
    <div class="sm:col-span-3">
      <label class="label" for="a-cat">Category</label>
      <select class="input" id="a-cat" name="category_id">
        <option value="">Auto (rules) / uncategorised</option>
        {#each data.categories as c}<option value={String(c.id)}>{c.name}</option>{/each}
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
        {#each data.categories as c}<option value={String(c.id)}>{c.name}</option>{/each}
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
      <label class="label" for="f-rec">Recurring</label>
      <select class="input" id="f-rec" value={data.filters.recurring}
        onchange={(e) => setParam('recurring', e.currentTarget.value)}>
        <option value="">Any</option>
        <option value="yes">Recurring only</option>
        <option value="no">One-off only</option>
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
        {#each visibleRows as t (t.id)}
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
          {:else if recurringId === t.id}
            <tr class="border-b border-[var(--border)]">
              <td colspan="6" class="p-3" style="background:var(--paper-sunk)">
                {#if t.recurring_id}
                  <div class="flex flex-wrap items-center gap-3 text-[13px]">
                    <Icon name="recurring" size={15} class="text-[var(--accent)]" />
                    <span>
                      Repeats <b>{freqLabel(t)}</b> · next <span class="tnum">{t.rec_next}</span>
                      {#if !t.rec_active}<span class="chip ml-1">paused</span>{/if}
                    </span>
                    <span class="ml-auto flex gap-2">
                      <form method="POST" action="?/toggleRecurring" use:enhance>
                        <input type="hidden" name="id" value={t.id} />
                        <button class="btn btn-ghost btn-sm">{t.rec_active ? 'Pause' : 'Resume'}</button>
                      </form>
                      <form method="POST" action="?/removeRecurring" use:enhance
                        onsubmit={(e) => { if (!confirm('Remove this recurring schedule?')) e.preventDefault(); }}>
                        <input type="hidden" name="id" value={t.id} />
                        <button class="btn btn-ghost btn-sm" style="color:var(--negative)">Remove</button>
                      </form>
                      <button type="button" class="btn btn-ghost btn-sm" onclick={() => (recurringId = null)}>Close</button>
                    </span>
                  </div>
                {:else}
                  <form method="POST" action="?/makeRecurring" use:enhance class="flex flex-wrap items-end gap-3 text-[13px]">
                    <input type="hidden" name="id" value={t.id} />
                    <span class="flex items-center gap-1.5 font-medium">
                      <Icon name="recurring" size={15} class="text-[var(--accent)]" /> Make “{t.description || 'this'}” recurring
                    </span>
                    <label class="flex flex-col gap-1">
                      <span class="label !mb-0">Every</span>
                      <span class="flex gap-1">
                        <input class="input tnum w-14" name="interval_n" type="number" min="1" value="1"
                          oninput={(e) => { const fr = e.currentTarget.form.frequency.value; e.currentTarget.form.next_date.value = nextAfter(t.date, fr, +e.currentTarget.value || 1); }} />
                        <select class="input" name="frequency"
                          onchange={(e) => { e.currentTarget.form.next_date.value = nextAfter(t.date, e.currentTarget.value, +e.currentTarget.form.interval_n.value || 1); }}>
                          <option value="weekly">week(s)</option>
                          <option value="monthly" selected>month(s)</option>
                          <option value="yearly">year(s)</option>
                        </select>
                      </span>
                    </label>
                    <label class="flex flex-col gap-1">
                      <span class="label !mb-0">Next on</span>
                      <input class="input" name="next_date" type="date" value={nextAfter(t.date, 'monthly', 1)} required />
                    </label>
                    <label class="flex items-center gap-2 pb-2">
                      <input type="checkbox" name="auto_post" /> Post automatically
                    </label>
                    <div class="flex gap-2 pb-1">
                      <button class="btn btn-primary btn-sm">Make recurring</button>
                      <button type="button" class="btn btn-ghost btn-sm" onclick={() => (recurringId = null)}>Cancel</button>
                    </div>
                  </form>
                {/if}
              </td>
            </tr>
          {:else}
            <tr class="group border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--paper-sunk)]/60"
              style={selected.has(t.id) ? 'background:var(--accent-wash)' : ''}>
              <td class="py-2.5 pl-4">
                <input type="checkbox" checked={selected.has(t.id)} onchange={() => toggle(t.id)} />
              </td>
              <td class="tnum whitespace-nowrap py-2.5 pr-3 text-[var(--ink-faint)]">{t.date}</td>
              <td class="py-2.5 pr-3 font-medium">
                <span class="flex items-center gap-1.5">
                  {t.description || '—'}
                  {#if t.recurring_id}
                    <button type="button" title="Recurring — {freqLabel(t)}" onclick={() => (recurringId = t.id)}
                      class="text-[var(--accent)] {t.rec_active ? '' : 'opacity-40'}">
                      <Icon name="recurring" size={13} />
                    </button>
                  {/if}
                </span>
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
                  <button class="rounded p-1 {t.recurring_id ? 'text-[var(--accent)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink)]'}"
                    title={t.recurring_id ? 'Recurring schedule' : 'Make recurring'}
                    onclick={() => (recurringId = recurringId === t.id ? null : t.id)}>
                    <Icon name="recurring" size={14} />
                  </button>
                  <button class="rounded p-1 text-[var(--ink-faint)] hover:text-[var(--ink)]" title="Edit"
                    onclick={() => (editingId = t.id)}><Icon name="edit" size={14} /></button>
                  <form method="POST" action="?/delete" use:enhance={() => deleteSubmit(t.id)}>
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
