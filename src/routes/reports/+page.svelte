<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatMoney, formatMonth } from '$lib/currency.js';
  import Icon from '$lib/components/Icon.svelte';
  import StackedMonths from '$lib/components/StackedMonths.svelte';
  let { data } = $props();

  const money = (n) => formatMoney(n, data.currency);
  const shortMonth = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  };

  let periodLabel = $derived(
    data.from === data.to ? formatMonth(data.from) : `${shortMonth(data.from)} – ${shortMonth(data.to)}`
  );
  // every month with data, plus whatever the URL asked for, newest first
  let monthOptions = $derived(
    [...new Set([data.from, data.to, ...data.months])].sort().reverse()
  );

  function setPeriod(key, value) {
    const url = new URL($page.url);
    url.searchParams.set('from', key === 'from' ? value : data.from);
    url.searchParams.set('to', key === 'to' ? value : data.to);
    goto(url, { keepFocus: true, noScroll: true });
  }

  /** "€57.00 more than usual" — the phrase under each headline figure. */
  function vsUsual(actual, usual, partial) {
    const by = partial ? ' by this point' : '';
    if (Math.abs(actual - usual) < 1) return `about the same as usual${by}`;
    return `${money(Math.abs(actual - usual))} ${actual > usual ? 'more' : 'less'} than usual${by}`;
  }
  /** Sub-line for a strip card: per-month average for a range, straight comparison for a month. */
  function sub(ins, key) {
    const usual = ins.baseline?.[key];
    if (ins.single) return usual != null ? vsUsual(ins[key], usual, ins.partial && key === 'spent') : '';
    const per = `${money(ins.avg[key])} a month`;
    return usual != null ? `${per} · ${vsUsual(ins.avg[key], usual, false)}` : per;
  }

  // The summary is fetched after the page paints so a slow API call never
  // holds up the numbers, and it is cached server-side per period.
  let summary = $state(null);
  let summaryLoading = $state(false);
  let summaryError = $state(null);

  $effect(() => {
    const ins = data.insights;
    const key = data.aiSummary && ins && ins.reason !== 'empty' ? `${data.from}:${data.to}` : null;
    if (!key) {
      summary = null;
      summaryError = null;
      return;
    }
    const [from, to] = key.split(':');
    let cancelled = false;
    summary = null;
    summaryError = null;
    summaryLoading = true;
    fetch('/reports/summary', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from, to })
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
    <p class="kicker mb-2">Reports · {periodLabel}</p>
    <h1 class="text-3xl" style="font-family:var(--font-display)">Where your money went</h1>
  </div>
  <div class="flex items-center gap-2">
    <label class="sr-only" for="p-from">From</label>
    <select class="input max-w-[170px]" id="p-from" value={data.from}
      onchange={(e) => setPeriod('from', e.currentTarget.value)}>
      {#each monthOptions as m}<option value={m}>{shortMonth(m)}</option>{/each}
    </select>
    <span class="text-[13px] text-[var(--ink-faint)]">to</span>
    <label class="sr-only" for="p-to">To</label>
    <select class="input max-w-[170px]" id="p-to" value={data.to}
      onchange={(e) => setPeriod('to', e.currentTarget.value)}>
      {#each monthOptions as m}<option value={m}>{shortMonth(m)}</option>{/each}
    </select>
  </div>
</div>

{#if data.insights && data.insights.reason !== 'empty'}
  {@const ins = data.insights}
  <div class="mb-4 grid gap-4 rise rise-1 {data.savings.configured ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}">
    <div class="card">
      <p class="kicker">Came in{ins.single && ins.partial ? ' so far' : ''}</p>
      <span class="mt-2 block stat-value tnum text-[24px]" style="color:var(--positive)">{money(ins.earned)}</span>
      <p class="mt-1 text-xs text-[var(--ink-faint)]">{sub(ins, 'earned')}</p>
    </div>
    <div class="card">
      <p class="kicker">Went out{ins.single && ins.partial ? ' so far' : ''}</p>
      <span class="mt-2 block stat-value tnum text-[24px]">{money(ins.spent)}</span>
      <!-- deliberately not red: spending more than usual isn't automatically
           bad, so the number stays neutral and the breakdown explains what moved -->
      <p class="mt-1 text-xs text-[var(--ink-faint)]">{sub(ins, 'spent')}</p>
    </div>
    {#if data.savings.configured}
      <div class="card">
        <p class="kicker">Saved{ins.single && ins.partial ? ' so far' : ''}</p>
        <span class="mt-2 block stat-value tnum text-[24px]"
          style="color:{ins.saved < 0 ? 'var(--ink)' : 'var(--positive)'}">{money(ins.saved)}</span>
        <p class="mt-1 text-xs text-[var(--ink-faint)]">
          {#if ins.saved < 0}
            taken out of savings
          {:else if sub(ins, 'saved')}
            {sub(ins, 'saved')}
          {:else}
            {money(data.savings.total)} saved in total
          {/if}
        </p>
      </div>
    {/if}
  </div>

  {@const showSummary = data.aiSummary && (summaryLoading || summary || summaryError)}
  {@const showMovers = ins.movers.length > 0}

  <!-- side by side when both are there, full width when only one is -->
  {#if showSummary || showMovers}
  <div class="mb-4 grid gap-4 {showSummary && showMovers ? 'lg:grid-cols-5' : ''}">
  {#if showSummary}
    <div class="card rise rise-1 {showMovers ? 'lg:col-span-2' : ''}">
      <h2 class="mb-3 flex items-center gap-2 text-lg">
        <Icon name="sparkle" size={16} class="text-[var(--accent)]" />
        In a nutshell
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

  {#if showMovers}
    <div class="card rise rise-2 {showSummary ? 'lg:col-span-3' : ''}">
      <div class="mb-1 flex items-baseline justify-between gap-3">
        <h2 class="text-lg">What changed</h2>
        <span class="text-xs text-[var(--ink-faint)]">biggest moves, not biggest totals</span>
      </div>
      <p class="mb-4 text-[13px] text-[var(--ink-faint)]">
        {#if ins.single}
          Against your own average over {ins.baseline.months} earlier month{ins.baseline.months === 1 ? '' : 's'}{ins.partial
            ? `, scaled to the ${Math.round(ins.share * 100)}% of ${formatMonth(ins.from)} gone so far`
            : ''}.
        {:else}
          Monthly averages for this period, against the {ins.baseline.months} month{ins.baseline.months === 1 ? '' : 's'} before it.
        {/if}
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
  {/if}
  </div>
  {/if}

  <!-- only worth saying for a single month; a range that covers all your data has nothing to compare to and that is obvious -->
  {#if ins.single && !showMovers && !ins.comparable}
    <div class="nudge mb-4 rise rise-2">
      <Icon name="sparkle" size={16} class="text-[var(--accent)]" />
      <span>
        {#if ins.reason === 'no-history'}
          Once you have a second month of data, Tally will show how this month compares to your usual.
        {:else}
          {formatMonth(ins.from)} has only just started — comparisons appear once the month is properly under way.
        {/if}
      </span>
    </div>
  {/if}
{/if}

<div class="card rise rise-3">
  {#if data.chart.income.length || data.chart.expense.length}
    <StackedMonths title="Your spending by month" months={data.chart.months} income={data.chart.income}
      expense={data.chart.expense} values={data.chart.values} currency={data.currency} />
  {:else}
    <h2 class="mb-4 text-lg">Your spending by month</h2>
    <p class="py-12 text-center text-sm text-[var(--ink-faint)]">Nothing in this period yet.</p>
  {/if}
</div>
