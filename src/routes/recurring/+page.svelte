<script>
  import { enhance } from '$app/forms';
  import { formatMoney } from '$lib/currency.js';
  let { data, form } = $props();

  let showAdd = $state(false);
  let editingId = $state(null);

  const freqLabel = (r) =>
    r.interval_n > 1 ? `every ${r.interval_n} ${r.frequency.replace('ly', 's')}` : r.frequency;

  $effect(() => {
    if (form?.created) showAdd = false;
    if (form?.updated) editingId = null;
  });
</script>

<svelte:head><title>Recurring · Budget</title></svelte:head>

<div class="mb-6 flex items-center justify-between">
  <div>
    <h1 class="text-2xl font-bold">Recurring transactions</h1>
    <p class="text-sm text-slate-500">Rent, salary, subscriptions — defined once, confirmed in a click.</p>
  </div>
  <button class="btn-primary" onclick={() => (showAdd = !showAdd)}>New</button>
</div>

{#snippet fields(r)}
  <div class="sm:col-span-2">
    <span class="label">Description</span>
    <input class="input" name="description" value={r?.description ?? ''} placeholder="e.g. Netflix" />
  </div>
  <div>
    <span class="label">Amount</span>
    <input class="input" name="amount" inputmode="decimal" value={r ? Math.abs(r.amount) : ''} required />
  </div>
  <div>
    <span class="label">Type</span>
    <select class="input" name="direction" value={r && r.amount >= 0 ? 'in' : 'out'}>
      <option value="out">Outgoing</option>
      <option value="in">Incoming</option>
    </select>
  </div>
  <div>
    <span class="label">Category</span>
    <select class="input" name="category_id" value={r?.category_id ?? ''}>
      <option value="">Uncategorised</option>
      {#each data.categories as c}<option value={c.id}>{c.name}</option>{/each}
    </select>
  </div>
  <div>
    <span class="label">Frequency</span>
    <select class="input" name="frequency" value={r?.frequency ?? 'monthly'}>
      <option value="weekly">Weekly</option>
      <option value="monthly">Monthly</option>
      <option value="yearly">Yearly</option>
    </select>
  </div>
  <div>
    <span class="label">Repeat every</span>
    <input class="input" name="interval_n" type="number" min="1" value={r?.interval_n ?? 1} />
  </div>
  <div>
    <span class="label">{r ? 'Next date' : 'First date'}</span>
    <input class="input" name="next_date" type="date" value={r?.next_date ?? data.today} required />
  </div>
  <div>
    <span class="label">End date (optional)</span>
    <input class="input" name="end_date" type="date" value={r?.end_date ?? ''} />
  </div>
  <label class="flex items-center gap-2 text-sm sm:col-span-2">
    <input type="checkbox" name="auto_post" checked={r?.auto_post === 1} />
    Post automatically when due (otherwise it waits for your confirmation)
  </label>
{/snippet}

{#if showAdd}
  <form method="POST" action="?/create" use:enhance class="card mb-4 grid gap-3 sm:grid-cols-4">
    {@render fields(null)}
    <div class="flex gap-2 sm:col-span-4">
      <button class="btn-primary">Create</button>
      <button type="button" class="btn-ghost" onclick={() => (showAdd = false)}>Cancel</button>
      {#if form?.error}<span class="self-center text-sm text-rose-600">{form.error}</span>{/if}
    </div>
  </form>
{/if}

{#if data.due.length}
  <div class="card mb-4 ring-amber-200">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="font-semibold">Due now ({data.due.length})</h2>
      <form method="POST" action="?/postAll" use:enhance>
        <button class="btn-primary !py-1.5">Confirm all</button>
      </form>
    </div>
    <ul class="divide-y divide-slate-100">
      {#each data.due as r}
        <li class="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
          <div>
            <p class="font-medium">{r.description || '—'}</p>
            <p class="text-xs text-slate-400">{r.next_date} · {r.category_name ?? 'Uncategorised'}</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="font-semibold {r.amount >= 0 ? 'text-emerald-600' : 'text-slate-700'}">
              {formatMoney(r.amount, data.currency)}
            </span>
            <form method="POST" action="?/post" use:enhance>
              <input type="hidden" name="id" value={r.id} />
              <button class="btn-primary !px-3 !py-1 text-xs">Confirm</button>
            </form>
            <form method="POST" action="?/skip" use:enhance>
              <input type="hidden" name="id" value={r.id} />
              <button class="btn-ghost !px-3 !py-1 text-xs">Skip</button>
            </form>
          </div>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<div class="card">
  <h2 class="mb-3 font-semibold">All schedules</h2>
  {#if data.recurring.length}
    <ul class="divide-y divide-slate-100">
      {#each data.recurring as r (r.id)}
        {#if editingId === r.id}
          <li class="py-3">
            <form method="POST" action="?/update" use:enhance class="grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="id" value={r.id} />
              {@render fields(r)}
              <div class="flex gap-2 sm:col-span-4">
                <button class="btn-primary !py-1.5">Save</button>
                <button type="button" class="btn-ghost !py-1.5" onclick={() => (editingId = null)}>Cancel</button>
              </div>
            </form>
          </li>
        {:else}
          <li class="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm {r.active ? '' : 'opacity-50'}">
            <div>
              <p class="font-medium">
                {r.description || '—'}
                <span class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{freqLabel(r)}</span>
                {#if r.auto_post}<span class="ml-1 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">auto</span>{/if}
              </p>
              <p class="text-xs text-slate-400">
                Next {r.next_date} · {r.category_name ?? 'Uncategorised'}{r.end_date ? ` · ends ${r.end_date}` : ''}
              </p>
            </div>
            <div class="flex items-center gap-3">
              <span class="font-semibold {r.amount >= 0 ? 'text-emerald-600' : 'text-slate-700'}">
                {formatMoney(r.amount, data.currency)}
              </span>
              <button class="text-slate-400 hover:text-slate-700" onclick={() => (editingId = r.id)}>✏️</button>
              <form method="POST" action="?/toggle" use:enhance>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="active" value={r.active ? '0' : '1'} />
                <button class="text-xs text-slate-500 hover:underline">{r.active ? 'Pause' : 'Resume'}</button>
              </form>
              <form method="POST" action="?/delete" use:enhance
                onsubmit={(e) => { if (!confirm('Delete this schedule?')) e.preventDefault(); }}>
                <input type="hidden" name="id" value={r.id} />
                <button class="text-slate-400 hover:text-rose-600">🗑️</button>
              </form>
            </div>
          </li>
        {/if}
      {/each}
    </ul>
  {:else}
    <p class="py-8 text-center text-sm text-slate-400">No recurring transactions yet.</p>
  {/if}
</div>
