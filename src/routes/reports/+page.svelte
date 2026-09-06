<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatMoney, formatMonth } from '$lib/currency.js';
  import Donut from '$lib/components/Donut.svelte';
  import TrendChart from '$lib/components/TrendChart.svelte';
  import Money from '$lib/components/Money.svelte';
  let { data } = $props();

  function setScope(v) {
    const url = new URL($page.url);
    url.searchParams.set('month', v);
    goto(url, { keepFocus: true, noScroll: true });
  }
  let scopeLabel = $derived(data.scope === 'all' ? 'All time' : formatMonth(data.scope));
  let months = $derived([...new Set([data.scope, ...data.months])].filter((m) => m !== 'all').sort().reverse());
</script>

<svelte:head><title>Reports · Tally</title></svelte:head>

<div class="mb-7 flex flex-wrap items-end justify-between gap-3 rise">
  <div>
    <p class="kicker mb-2">Reports · {scopeLabel}</p>
    <h1 class="text-3xl" style="font-family:var(--font-display)">Where the money moves</h1>
  </div>
  <select class="input max-w-[220px]" value={data.scope} onchange={(e) => setScope(e.currentTarget.value)}>
    <option value="all">All time</option>
    {#each months as m}<option value={m}>{formatMonth(m)}</option>{/each}
  </select>
</div>

<div class="grid gap-4 lg:grid-cols-2">
  <div class="card rise rise-1">
    <div class="mb-4 flex items-baseline justify-between">
      <h2 class="text-lg">Spending by category</h2>
      <Money value={data.expenseTotal} currency={data.currency} colour="ink" class="font-semibold" />
    </div>
    {#if data.expense.length}
      <div class="flex flex-col items-center gap-6 sm:flex-row">
        <Donut segments={data.expense} currency={data.currency} label="Spent" />
        <ul class="w-full space-y-2.5">
          {#each data.expense as c}
            <li class="flex items-center justify-between gap-3 text-[13px]">
              <span class="flex min-w-0 items-center gap-2">
                <span class="dot" style="background:{c.color}"></span>
                <span class="truncate">{c.name}</span>
                <span class="text-xs text-[var(--ink-faint)]">×{c.count}</span>
              </span>
              <span class="shrink-0 text-right">
                <span class="tnum font-medium">{formatMoney(c.total, data.currency)}</span>
                <span class="ml-1.5 text-xs text-[var(--ink-faint)]">
                  {Math.round((c.total / (data.expenseTotal || 1)) * 100)}%
                </span>
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {:else}
      <p class="py-12 text-center text-sm text-[var(--ink-faint)]">No spending in this period.</p>
    {/if}
  </div>

  <div class="card rise rise-2">
    <div class="mb-4 flex items-baseline justify-between">
      <h2 class="text-lg">Income by category</h2>
      <Money value={data.incomeTotal} currency={data.currency} colour="positive" class="font-semibold" />
    </div>
    {#if data.income.length}
      <ul class="space-y-2.5">
        {#each data.income as c}
          <li class="flex items-center justify-between text-[13px]">
            <span class="flex items-center gap-2">
              <span class="dot" style="background:{c.color}"></span>{c.name}
            </span>
            <span class="tnum font-medium">{formatMoney(c.total, data.currency)}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="py-12 text-center text-sm text-[var(--ink-faint)]">No income in this period.</p>
    {/if}
  </div>
</div>

<div class="card mt-4 rise rise-3">
  <h2 class="mb-4 text-lg">Monthly trend</h2>
  {#if data.trend.length}
    <TrendChart data={data.trend} currency={data.currency} />
  {:else}
    <p class="py-12 text-center text-sm text-[var(--ink-faint)]">Not enough data yet.</p>
  {/if}
</div>
