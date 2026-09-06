<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatMoney, formatMonth } from '$lib/currency.js';
  import Donut from '$lib/components/Donut.svelte';
  import MonthBars from '$lib/components/MonthBars.svelte';
  let { data } = $props();

  function setScope(v) {
    const url = new URL($page.url);
    url.searchParams.set('month', v);
    goto(url, { keepFocus: true, noScroll: true });
  }
  let scopeLabel = $derived(data.scope === 'all' ? 'All time' : formatMonth(data.scope));
</script>

<svelte:head><title>Reports · Budget</title></svelte:head>

<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h1 class="text-2xl font-bold">Reports</h1>
    <p class="text-sm text-slate-500">{scopeLabel}</p>
  </div>
  <select class="input max-w-[220px]" value={data.scope} onchange={(e) => setScope(e.currentTarget.value)}>
    <option value="all">All time</option>
    {#each data.months as m}<option value={m}>{formatMonth(m)}</option>{/each}
  </select>
</div>

<div class="grid gap-4 lg:grid-cols-2">
  <div class="card">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="font-semibold">Spending by category</h2>
      <span class="font-bold text-rose-600">{formatMoney(data.expenseTotal, data.currency)}</span>
    </div>
    {#if data.expense.length}
      <div class="flex flex-col items-center gap-5 sm:flex-row">
        <Donut segments={data.expense} />
        <ul class="w-full space-y-2">
          {#each data.expense as c}
            <li class="flex items-center justify-between text-sm">
              <span class="flex items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-full" style="background:{c.color}"></span>{c.name}
                <span class="text-xs text-slate-400">({c.count})</span>
              </span>
              <span class="text-right">
                <span class="font-medium">{formatMoney(c.total, data.currency)}</span>
                <span class="ml-1 text-xs text-slate-400">
                  {Math.round((c.total / (data.expenseTotal || 1)) * 100)}%
                </span>
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {:else}
      <p class="py-8 text-center text-sm text-slate-400">No spending in this period.</p>
    {/if}
  </div>

  <div class="card">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="font-semibold">Income by category</h2>
      <span class="font-bold text-emerald-600">{formatMoney(data.incomeTotal, data.currency)}</span>
    </div>
    {#if data.income.length}
      <ul class="space-y-2">
        {#each data.income as c}
          <li class="flex items-center justify-between text-sm">
            <span class="flex items-center gap-2">
              <span class="h-2.5 w-2.5 rounded-full" style="background:{c.color}"></span>{c.name}
            </span>
            <span class="font-medium">{formatMoney(c.total, data.currency)}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="py-8 text-center text-sm text-slate-400">No income in this period.</p>
    {/if}
  </div>
</div>

<div class="card mt-4">
  <h2 class="mb-4 font-semibold">Monthly trend</h2>
  {#if data.trend.length}
    <MonthBars data={data.trend} currency={data.currency} />
  {:else}
    <p class="py-8 text-center text-sm text-slate-400">Not enough data yet.</p>
  {/if}
</div>
