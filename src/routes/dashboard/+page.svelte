<script>
  import { formatMoney, formatMonth } from '$lib/currency.js';
  import MonthBars from '$lib/components/MonthBars.svelte';
  import MonthPicker from '$lib/components/MonthPicker.svelte';
  let { data } = $props();

  let net = $derived(data.monthTotals.incoming - data.monthTotals.outgoing);
  let topSpend = $derived(
    [...data.breakdown].sort((a, b) => a.total - b.total).slice(0, 5)
  );
  let spendMax = $derived(Math.max(1, ...topSpend.map((c) => Math.abs(c.total))));
</script>

<svelte:head><title>Dashboard · Budget</title></svelte:head>

<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h1 class="text-2xl font-bold">Dashboard</h1>
    <p class="text-sm text-slate-500">{formatMonth(data.month)}</p>
  </div>
  <MonthPicker months={data.months} selected={data.month} />
</div>

<div class="mb-6 space-y-2">
  {#if data.due.length}
    <a href="/recurring" class="flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800 ring-1 ring-brand-200">
      <span>🔁 {data.due.length} recurring transaction{data.due.length === 1 ? '' : 's'} due to confirm</span>
      <span class="font-semibold">Review →</span>
    </a>
  {/if}
  {#if data.uncategorised > 0}
    <a href="/transactions?category=none" class="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
      <span>⚠️ {data.uncategorised} transaction{data.uncategorised === 1 ? '' : 's'} still need{data.uncategorised === 1 ? 's' : ''} a category</span>
      <span class="font-semibold">Review →</span>
    </a>
  {/if}
  {#if data.budgets.over > 0}
    <a href="/budgets" class="flex items-center justify-between rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
      <span>🎯 {data.budgets.over} categor{data.budgets.over === 1 ? 'y is' : 'ies are'} over budget this month</span>
      <span class="font-semibold">Review →</span>
    </a>
  {/if}
</div>

<div class="grid gap-4 sm:grid-cols-3">
  <div class="card">
    <p class="text-sm font-medium text-slate-500">Incoming</p>
    <p class="mt-1 text-2xl font-bold text-emerald-600">{formatMoney(data.monthTotals.incoming, data.currency)}</p>
  </div>
  <div class="card">
    <p class="text-sm font-medium text-slate-500">Outgoing</p>
    <p class="mt-1 text-2xl font-bold text-rose-600">{formatMoney(data.monthTotals.outgoing, data.currency)}</p>
  </div>
  <div class="card">
    <p class="text-sm font-medium text-slate-500">Net</p>
    <p class="mt-1 text-2xl font-bold {net >= 0 ? 'text-slate-900' : 'text-rose-600'}">
      {formatMoney(net, data.currency)}
    </p>
  </div>
</div>

<div class="mt-4 grid gap-4 lg:grid-cols-5">
  <div class="card lg:col-span-3">
    <h2 class="mb-4 font-semibold">Last 12 months</h2>
    {#if data.totals.length}
      <MonthBars data={data.totals} currency={data.currency} />
    {:else}
      <p class="py-8 text-center text-sm text-slate-400">No transactions yet.</p>
    {/if}
  </div>

  <div class="card lg:col-span-2">
    <h2 class="mb-4 font-semibold">Top spending</h2>
    {#if topSpend.length}
      <ul class="space-y-3">
        {#each topSpend as c}
          <li>
            <div class="mb-1 flex justify-between text-sm">
              <span class="flex items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-full" style="background:{c.color}"></span>{c.name}
              </span>
              <span class="font-medium">{formatMoney(Math.abs(c.total), data.currency)}</span>
            </div>
            <div class="h-1.5 rounded-full bg-slate-100">
              <div class="h-1.5 rounded-full" style="width:{(Math.abs(c.total) / spendMax) * 100}%;background:{c.color}"></div>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="py-8 text-center text-sm text-slate-400">No spending this month.</p>
    {/if}
  </div>
</div>

{#if data.budgets.count > 0}
  <a href="/budgets" class="card mt-4 block hover:ring-slate-300">
    <div class="mb-2 flex items-center justify-between">
      <h2 class="font-semibold">Budget this month</h2>
      <span class="text-sm text-slate-500">
        {formatMoney(data.budgets.actual, data.currency)} / {formatMoney(data.budgets.target, data.currency)}
      </span>
    </div>
    <div class="h-2 rounded-full bg-slate-100">
      <div class="h-2 rounded-full {data.budgets.actual > data.budgets.target ? 'bg-rose-500' : 'bg-emerald-500'}"
        style="width:{Math.min(100, (data.budgets.actual / (data.budgets.target || 1)) * 100)}%"></div>
    </div>
  </a>
{/if}

<div class="card mt-4">
  <div class="mb-4 flex items-center justify-between">
    <h2 class="font-semibold">Recent transactions</h2>
    <a href="/transactions" class="text-sm font-semibold text-brand-600 hover:underline">View all</a>
  </div>
  {#if data.recent.length}
    <ul class="divide-y divide-slate-100">
      {#each data.recent as t}
        <li class="flex items-center justify-between py-2.5 text-sm">
          <div class="min-w-0">
            <p class="truncate font-medium">{t.description || '—'}</p>
            <p class="text-xs text-slate-400">
              {t.date}
              {#if t.category_name}· <span style="color:{t.category_color}">{t.category_name}</span>{/if}
            </p>
          </div>
          <span class="shrink-0 font-semibold {t.amount >= 0 ? 'text-emerald-600' : 'text-slate-700'}">
            {formatMoney(t.amount, data.currency)}
          </span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="py-8 text-center text-sm text-slate-400">
      Nothing here yet. <a href="/transactions" class="font-semibold text-brand-600">Add a transaction</a>.
    </p>
  {/if}
</div>
