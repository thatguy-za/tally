<script>
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatMoney, formatMonth } from '$lib/currency.js';
  let { data, form } = $props();

  let budgeted = $derived(data.expenses.filter((e) => e.target != null));
  let totalTarget = $derived(budgeted.reduce((s, e) => s + e.target, 0));
  let totalActual = $derived(budgeted.reduce((s, e) => s + e.actual, 0));

  function setMonth(v) {
    const url = new URL($page.url);
    url.searchParams.set('month', v);
    goto(url, { keepFocus: true, noScroll: true });
  }
  const barColor = (pct) => (pct == null ? '' : pct > 100 ? '#e11d48' : pct > 85 ? '#f59e0b' : '#10b981');
</script>

<svelte:head><title>Budgets · Budget</title></svelte:head>

<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h1 class="text-2xl font-bold">Budgets</h1>
    <p class="text-sm text-slate-500">Monthly targets per category — {formatMonth(data.month)}</p>
  </div>
  <select class="input max-w-[220px]" value={data.month} onchange={(e) => setMonth(e.currentTarget.value)}>
    {#each [...new Set([data.month, ...data.months])].sort().reverse() as m}
      <option value={m}>{formatMonth(m)}</option>
    {/each}
  </select>
</div>

{#if budgeted.length}
  <div class="card mb-4 grid gap-4 sm:grid-cols-3">
    <div><p class="text-sm text-slate-500">Budgeted</p><p class="text-xl font-bold">{formatMoney(totalTarget, data.currency)}</p></div>
    <div><p class="text-sm text-slate-500">Spent</p><p class="text-xl font-bold">{formatMoney(totalActual, data.currency)}</p></div>
    <div>
      <p class="text-sm text-slate-500">Remaining</p>
      <p class="text-xl font-bold {totalTarget - totalActual < 0 ? 'text-rose-600' : 'text-emerald-600'}">
        {formatMoney(totalTarget - totalActual, data.currency)}
      </p>
    </div>
  </div>
{/if}

<div class="card">
  <p class="mb-4 text-sm text-slate-500">
    Set a target to track it. Leave blank to remove. Spending is matched to the selected month.
  </p>
  <ul class="space-y-4">
    {#each data.expenses as c}
      <li>
        <div class="mb-1.5 flex items-center justify-between gap-3 text-sm">
          <span class="flex items-center gap-2 font-medium">
            <span class="h-2.5 w-2.5 rounded-full" style="background:{c.color}"></span>{c.name}
          </span>
          <span class="flex items-center gap-3">
            <span class="text-slate-500">
              {formatMoney(c.actual, data.currency)}
              {#if c.target != null}/ {formatMoney(c.target, data.currency)}{/if}
            </span>
            <form method="POST" action="?/set" use:enhance class="flex items-center gap-1">
              <input type="hidden" name="category_id" value={c.id} />
              <input class="input w-28 !py-1 text-right" name="amount" inputmode="decimal"
                placeholder="No target" value={c.target ?? ''} />
              <button class="btn-ghost !px-2 !py-1 text-xs">Save</button>
            </form>
          </span>
        </div>
        {#if c.target != null}
          <div class="h-2 rounded-full bg-slate-100">
            <div class="h-2 rounded-full transition-all"
              style="width:{Math.min(100, c.pct)}%;background:{barColor(c.pct)}"></div>
          </div>
          <p class="mt-1 text-xs {c.remaining < 0 ? 'text-rose-600' : 'text-slate-400'}">
            {c.remaining < 0
              ? `${formatMoney(-c.remaining, data.currency)} over budget`
              : `${formatMoney(c.remaining, data.currency)} left · ${c.pct}%`}
          </p>
        {/if}
      </li>
    {/each}
  </ul>
</div>
