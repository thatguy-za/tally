<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatMoney, formatMonth } from '$lib/currency.js';
  import Donut from '$lib/components/Donut.svelte';
  import TrendChart from '$lib/components/TrendChart.svelte';
  import Money from '$lib/components/Money.svelte';
  import Icon from '$lib/components/Icon.svelte';
  let { data } = $props();

  function setScope(v) {
    const url = new URL($page.url);
    url.searchParams.set('month', v);
    goto(url, { keepFocus: true, noScroll: true });
  }
  let scopeLabel = $derived(data.scope === 'all' ? 'All time' : formatMonth(data.scope));
  let months = $derived([...new Set([data.scope, ...data.months])].filter((m) => m !== 'all').sort().reverse());

  const money = (n) => formatMoney(n, data.currency);

  /** "€57.00 more than usual" — the phrase under each headline figure. */
  function vsUsual(actual, usual, partial) {
    const by = partial ? ' by this point' : '';
    if (Math.abs(actual - usual) < 1) return `about the same as usual${by}`;
    return `${money(Math.abs(actual - usual))} ${actual > usual ? 'more' : 'less'} than usual${by}`;
  }

  // The summary is fetched after the page paints so a slow API call never
  // holds up the numbers, and it is cached server-side per month.
  let summary = $state(null);
  let summaryLoading = $state(false);
  let summaryError = $state(null);

  $effect(() => {
    const ins = data.insights;
    const month = data.aiSummary && ins && ins.reason !== 'empty' ? ins.month : null;
    if (!month) {
      summary = null;
      summaryError = null;
      return;
    }
    let cancelled = false;
    summary = null;
    summaryError = null;
    summaryLoading = true;
    fetch('/reports/summary', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ month })
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.message || 'the request failed');
        return body;
      })
      .then((b) => { if (!cancelled) summary = b.summary; })
      .catch((e) => { if (!cancelled) summaryError = e.message; })
      .finally(() => { if (!cancelled) summaryLoading = false; });
    return () => { cancelled = true; };
  });
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

{#if data.insights && data.insights.reason !== 'empty'}
  {@const ins = data.insights}
  <div class="mb-4 grid gap-4 sm:grid-cols-3 rise rise-1">
    <div class="card">
      <p class="kicker">Came in{ins.partial ? ' so far' : ''}</p>
      <span class="mt-2 block stat-value tnum text-[24px]" style="color:var(--positive)">{money(ins.earned)}</span>
      {#if ins.baseline?.earned != null}
        <p class="mt-1 text-xs text-[var(--ink-faint)]">{vsUsual(ins.earned, ins.baseline.earned, false)}</p>
      {/if}
    </div>
    <div class="card">
      <p class="kicker">Went out{ins.partial ? ' so far' : ''}</p>
      <span class="mt-2 block stat-value tnum text-[24px]">{money(ins.spent)}</span>
      {#if ins.baseline}
        <!-- deliberately not red: spending more than usual isn't automatically
             bad (a transfer to savings lands here too), so the number stays
             neutral and the breakdown below explains what moved -->
        <p class="mt-1 text-xs text-[var(--ink-faint)]">{vsUsual(ins.spent, ins.baseline.spent, ins.partial)}</p>
      {/if}
    </div>
    <div class="card">
      <p class="kicker">You kept</p>
      <span class="mt-2 block stat-value tnum text-[24px]"
        style="color:{ins.kept < 0 ? 'var(--negative)' : 'var(--positive)'}">{money(ins.kept)}</span>
      <p class="mt-1 text-xs text-[var(--ink-faint)]">
        {#if ins.kept < 0}
          you spent more than came in
        {:else if ins.rate != null}
          {ins.rate}% of what came in
        {:else}
          nothing came in this month
        {/if}
      </p>
    </div>
  </div>

  {#if data.aiSummary && (summaryLoading || summary || summaryError)}
    <div class="card mb-4 rise rise-1">
      <h2 class="mb-3 flex items-center gap-2 text-lg">
        <Icon name="sparkle" size={16} class="text-[var(--accent)]" />
        Your month in a nutshell
      </h2>
      {#if summaryLoading}
        <div class="space-y-2">
          <div class="ai-shimmer h-3 w-full rounded-full"></div>
          <div class="ai-shimmer h-3 w-[94%] rounded-full"></div>
          <div class="ai-shimmer h-3 w-[62%] rounded-full"></div>
        </div>
      {:else if summary}
        <p class="text-[14px] leading-relaxed text-[var(--ink-soft)]">{summary}</p>
      {:else}
        <p class="text-[13px] text-[var(--ink-faint)]">No summary just now — {summaryError}</p>
      {/if}
    </div>
  {/if}

  {#if ins.movers.length}
    <div class="card mb-4 rise rise-2">
      <div class="mb-1 flex items-baseline justify-between gap-3">
        <h2 class="text-lg">What changed</h2>
        <span class="text-xs text-[var(--ink-faint)]">biggest moves, not biggest totals</span>
      </div>
      <p class="mb-4 text-[13px] text-[var(--ink-faint)]">
        Against your own average over {ins.baseline.months} earlier month{ins.baseline.months === 1 ? '' : 's'}{ins.partial
          ? `, scaled to the ${Math.round(ins.share * 100)}% of ${formatMonth(ins.month)} gone so far`
          : ''}.
      </p>
      <ul class="space-y-2.5">
        {#each ins.movers as m}
          <li class="flex items-center justify-between gap-3 text-[13px]">
            <span class="flex min-w-0 items-center gap-2">
              <span class="dot shrink-0" style="background:{m.color}"></span>
              <span class="truncate">{m.name}</span>
            </span>
            <span class="flex shrink-0 items-baseline gap-3">
              <span class="hidden text-xs text-[var(--ink-faint)] sm:inline">usual {money(m.usual)}</span>
              <span class="tnum font-medium">{money(m.spent)}</span>
              <span class="tnum w-[96px] text-right font-semibold"
                style="color:{m.delta > 0 ? 'var(--ink)' : 'var(--ink-faint)'}">
                {m.delta > 0 ? '↑' : '↓'} {money(Math.abs(m.delta))}
              </span>
            </span>
          </li>
        {/each}
      </ul>
    </div>
  {:else if !ins.comparable}
    <div class="nudge mb-4 rise rise-2">
      <Icon name="sparkle" size={16} class="text-[var(--accent)]" />
      <span>
        {#if ins.reason === 'no-history'}
          Once you have a second month of data, Tally will show how this month compares to your usual.
        {:else}
          {formatMonth(ins.month)} has only just started — comparisons appear once the month is properly under way.
        {/if}
      </span>
    </div>
  {/if}
{/if}

<div class="grid gap-4 lg:grid-cols-2">
  <div class="card rise rise-3">
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
              <span class="flex shrink-0 items-baseline gap-2.5 text-right">
                <span class="tnum font-medium">{formatMoney(c.total, data.currency)}</span>
                <span class="w-9 text-xs text-[var(--ink-faint)]">
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

  <div class="card rise rise-4">
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

<div class="card mt-4 rise rise-5">
  <h2 class="mb-4 text-lg">Monthly trend</h2>
  {#if data.trend.length}
    <TrendChart data={data.trend} currency={data.currency} />
  {:else}
    <p class="py-12 text-center text-sm text-[var(--ink-faint)]">Not enough data yet.</p>
  {/if}
</div>
