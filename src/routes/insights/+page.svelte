<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatMonth, currentMonth } from '$lib/currency.js';
  import { formatMoney, privacy } from '$lib/privacy.svelte.js';
  import Icon from '$lib/components/Icon.svelte';
  import { invalidateAll } from '$app/navigation';
  import StackedMonths from '$lib/components/StackedMonths.svelte';
  import SpendingDoughnut from '$lib/components/SpendingDoughnut.svelte';
  import SpendingSankey from '$lib/components/SpendingSankey.svelte';
  import PeriodPicker from '$lib/components/PeriodPicker.svelte';
  import CategoryTransactionsModal from '$lib/components/CategoryTransactionsModal.svelte';
  import SavingsChart from '$lib/components/SavingsChart.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Money from '$lib/components/Money.svelte';
  let { data } = $props();

  let categoryModal = $state(null);
  function openCategoryModal(seg, ym, source = 'expense') {
    if (seg.id === 'other') {
      const excludeIds = (source === 'income' ? data.chart.income : data.chart.expense)
        .filter((c) => c.id !== 'other')
        .map((c) => c.id);
      categoryModal = { categoryId: 'other', categoryName: seg.name, color: seg.color, month: ym, kind: source, excludeIds };
      return;
    }
    categoryModal = { categoryId: seg.id, categoryName: seg.name, color: seg.color, month: ym };
  }

  /** Every saving-category transaction for one month, from a savings-chart bar. */
  function openSavingsCategoryModal(bar) {
    categoryModal = {
      categoryId: 'other',
      categoryName: 'Savings',
      color: 'var(--positive)',
      month: bar.ym,
      kind: 'saving',
      excludeIds: []
    };
  }

  let monthModal = $state(null);
  async function openMonthModal(ym) {
    monthModal = { month: ym, segments: null, loading: true };
    const params = new URLSearchParams({ month: ym });
    try {
      const res = await fetch(`/insights/month-breakdown?${params}`);
      const j = await res.json();
      monthModal = { month: ym, segments: j.segments || [], loading: false };
    } catch {
      monthModal = { month: ym, segments: [], loading: false };
    }
  }
  let savingsModal = $state(null);
  async function openSavingsModal() {
    const from = data.from, to = data.to;
    savingsModal = { series: null, total: 0, summary: null, summaryLoading: false, summaryError: null };
    const params = new URLSearchParams({ from, to });
    try {
      const res = await fetch(`/insights/savings-breakdown?${params}`);
      const j = await res.json();
      if (!savingsModal) return; // closed while loading
      savingsModal.series = j.series || [];
      savingsModal.total = j.total || 0;
    } catch {
      if (savingsModal) savingsModal.series = [];
    }
    if (data.aiSummary && !privacy.hideNumbers && savingsModal?.series?.length) {
      savingsModal.summaryLoading = true;
      try {
        const res = await fetch('/insights/savings-summary', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ from, to })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message || 'the request failed');
        if (savingsModal) {
          savingsModal.summary = body.summary;
          savingsModal.summaryLoading = false;
        }
      } catch (e) {
        if (savingsModal) {
          savingsModal.summaryError = e.message;
          savingsModal.summaryLoading = false;
        }
      }
    }
  }

  function onWindowKey(e) {
    if (e.key === 'Escape') {
      if (savingsModal) savingsModal = null;
      else if (monthModal) monthModal = null;
    }
  }

  let ins = $derived(data.insights);
  let singleMonth = $derived(data.from === data.to);
  let canGoNext = $derived(data.from < currentMonth());
  let showMovers = $derived(!!ins && ins.reason !== 'empty' && ins.movers.length > 0);
  // an "Other" entry stands in for its folded members' combined total,
  // which isn't a real key in data.chart.values — see StackedMonths' valueOf
  const categoryValue = (c, bucket) =>
    c.folded ? c.folded.reduce((s, f) => s + Math.abs(bucket?.[f.id] || 0), 0) : Math.abs(bucket?.[c.id] || 0);
  let spendingSegments = $derived(
    singleMonth
      ? data.chart.expense
          .map((c) => ({ id: c.id, name: c.name, color: c.color, value: categoryValue(c, data.chart.values[data.from]?.expense) }))
          .filter((s) => s.value > 0)
      : []
  );
  let incomeSegments = $derived(
    singleMonth
      ? data.chart.income
          .map((c) => ({ id: c.id, name: c.name, color: c.color, value: categoryValue(c, data.chart.values[data.from]?.income) }))
          .filter((s) => s.value > 0)
      : []
  );

  const money = (n) => formatMoney(n, data.currency);
  const shortMonth = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  };

  let periodLabel = $derived(
    data.from === data.to ? formatMonth(data.from) : `${shortMonth(data.from)} – ${shortMonth(data.to)}`
  );

  function applyRange(from, to) {
    const url = new URL($page.url);
    url.searchParams.set('from', from);
    url.searchParams.set('to', to);
    goto(url, { keepFocus: true, noScroll: true });
  }

  /** `n` months before `ym`, as YYYY-MM. */
  function shiftMonth(ym, n) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  const PERIOD_PRESETS = [
    { id: 'current-month', label: 'Current month' },
    { id: 'last-3-months', label: 'Last 3 months' },
    { id: 'last-12-months', label: 'Last 12 months' },
    { id: 'current-year', label: 'Current year' }
  ];

  function presetRange(id) {
    const cm = currentMonth();
    if (id === 'current-month') return { from: cm, to: cm };
    if (id === 'last-3-months') return { from: shiftMonth(cm, -2), to: cm };
    if (id === 'last-12-months') return { from: shiftMonth(cm, -11), to: cm };
    if (id === 'current-year') return { from: `${cm.slice(0, 4)}-01`, to: cm };
    return null;
  }

  function matchPreset(from, to) {
    for (const p of PERIOD_PRESETS) {
      const r = presetRange(p.id);
      if (r && r.from === from && r.to === to) return p.id;
    }
    return 'custom';
  }

  let activePreset = $derived(matchPreset(data.from, data.to));
  let pickerLabel = $derived(PERIOD_PRESETS.find((p) => p.id === activePreset)?.label ?? periodLabel);

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
  let showSummary = $derived(data.aiSummary && (summaryLoading || summary || summaryError || privacy.hideNumbers));

  $effect(() => {
    const ins = data.insights;
    // never fetched while numbers are hidden — the reply is free-form prose
    // with real figures baked into it, nothing here could mask it afterwards
    const key = data.aiSummary && !privacy.hideNumbers && ins && ins.reason !== 'empty' ? `${data.from}:${data.to}` : null;
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
    fetch('/insights/summary', {
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

<svelte:head><title>Insights · Tally</title></svelte:head>

<div class="mb-7 flex flex-wrap items-end justify-between gap-3">
  <div>
    <p class="kicker mb-2">Insights · {periodLabel}</p>
    <h1 class="text-3xl" style="font-family:var(--font-display)">Where your money went</h1>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <div class="flex shrink-0 items-center gap-1">
      {#if singleMonth}
        <button type="button" class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
          aria-label="Previous month" onclick={() => applyRange(shiftMonth(data.from, -1), shiftMonth(data.from, -1))}>
          <Icon name="arrowRight" size={16} class="rotate-180" />
        </button>
      {/if}
      <PeriodPicker
        presets={PERIOD_PRESETS}
        activePreset={activePreset}
        from={data.from}
        to={data.to}
        triggerLabel={pickerLabel}
        onPreset={(id) => applyRange(presetRange(id).from, presetRange(id).to)}
        onRange={(from, to) => applyRange(from, to)}
      />
      {#if singleMonth && canGoNext}
        <button type="button" class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
          aria-label="Next month" onclick={() => applyRange(shiftMonth(data.from, 1), shiftMonth(data.from, 1))}>
          <Icon name="arrowRight" size={16} />
        </button>
      {/if}
    </div>
  </div>
</div>

{#if ins && ins.reason !== 'empty'}
  <div class="mb-4 grid {data.savings.configured ? 'grid-cols-3' : 'grid-cols-2'} divide-x divide-[var(--border)] overflow-hidden rounded-[var(--radius)] border border-[var(--border)]"
    style="background:var(--surface);box-shadow:var(--shadow-sm)">
    <div class="min-w-0 px-2.5 py-3 sm:px-5 sm:py-4">
      <p class="kicker truncate">Came in{ins.single && ins.partial ? ' so far' : ''}</p>
      <span class="mt-1 block stat-value truncate text-[15px] sm:mt-2 sm:text-[24px]" style="color:var(--positive)">
        <Money value={ins.earned} currency={data.currency} colour="none" />
      </span>
      <p class="mt-1 hidden truncate text-xs text-[var(--ink-faint)] sm:block">{sub(ins, 'earned')}</p>
    </div>
    <div class="min-w-0 px-2.5 py-3 sm:px-5 sm:py-4">
      <p class="kicker truncate">Went out{ins.single && ins.partial ? ' so far' : ''}</p>
      <!-- deliberately not red: spending more than usual isn't automatically
           bad, so the number stays neutral and the breakdown explains what moved -->
      <span class="mt-1 block stat-value truncate text-[15px] sm:mt-2 sm:text-[24px]"><Money value={ins.spent} currency={data.currency} /></span>
      <p class="mt-1 hidden truncate text-xs text-[var(--ink-faint)] sm:block">{sub(ins, 'spent')}</p>
    </div>
    {#if data.savings.configured}
      <button type="button" class="min-w-0 px-2.5 py-3 text-left transition-colors hover:bg-[var(--paper-sunk)] sm:px-5 sm:py-4"
        onclick={openSavingsModal}>
        <p class="kicker truncate">Saved{ins.single && ins.partial ? ' so far' : ''}</p>
        <span class="mt-1 block stat-value truncate text-[15px] sm:mt-2 sm:text-[24px]"
          style="color:{ins.saved < 0 ? 'var(--ink)' : 'var(--positive)'}">
          <Money value={ins.saved} currency={data.currency} colour="none" />
        </span>
        <p class="mt-1 hidden truncate text-xs text-[var(--ink-faint)] sm:block">
          {#if ins.saved < 0}
            taken out of savings
          {:else if sub(ins, 'saved')}
            {sub(ins, 'saved')}
          {:else}
            {money(data.savings.total)} saved in total
          {/if}
        </p>
      </button>
    {/if}
  </div>
{/if}

{#snippet spendingChart()}
  {#if singleMonth}
    {#if spendingSegments.length || incomeSegments.length}
      <SpendingSankey title="Where your money went this month" income={incomeSegments} expense={spendingSegments} currency={data.currency}
        onNodeClick={(seg, source) => openCategoryModal(seg, data.from, source)} />
    {:else}
      <h2 class="mb-4 text-lg">Your spending for this month</h2>
      <EmptyState icon="reports" title="Nothing in this period yet"
        hint="Add a transaction or import a statement to see it here." cta={{ href: '/transactions', label: 'Go to transactions' }} />
    {/if}
  {:else if data.chart.income.length || data.chart.expense.length}
    <StackedMonths title="Your spending by month" months={data.chart.months} income={data.chart.income}
      expense={data.chart.expense} values={data.chart.values} currency={data.currency}
      onSegmentClick={openCategoryModal} onMonthClick={openMonthModal} />
  {:else}
    <h2 class="mb-4 text-lg">Your spending by month</h2>
    <EmptyState icon="reports" title="Nothing in this period yet"
      hint="Add a transaction or import a statement to see it here." cta={{ href: '/transactions', label: 'Go to transactions' }} />
  {/if}
{/snippet}

{#snippet whatChanged()}
  <div class="mb-1 flex items-baseline justify-between gap-3">
    <h2 class="text-lg">What changed</h2>
    <span class="text-xs text-[var(--ink-faint)]">biggest moves, not biggest totals</span>
  </div>
  <p class="mb-4 text-[13px] text-[var(--ink-faint)]">
    {#if ins.single}
      Against what's usual for you, based on the {ins.baseline.months} earlier month{ins.baseline.months === 1 ? '' : 's'}{ins.partial
        ? `, scaled to the ${Math.round(ins.share * 100)}% of ${formatMonth(ins.from)} gone so far`
        : ''}.
    {:else}
      Monthly averages for this period, against what's usual based on the {ins.baseline.months} month{ins.baseline.months === 1 ? '' : 's'} before it.
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
{/snippet}

<!-- "In a nutshell" always sits on the left, paired with "What changed" -->
{#if showSummary || showMovers}
<div class="mb-4 grid gap-4 {showSummary && showMovers ? 'lg:grid-cols-5' : ''}">
  {#if showSummary}
    <div class="card {showMovers ? 'lg:col-span-2' : ''}">
      <h2 class="mb-3 flex items-center gap-2 text-lg">
        <Icon name="sparkle" size={16} class="text-[var(--accent)]" />
        In a nutshell
      </h2>
      {#if privacy.hideNumbers}
        <p class="text-[14px] leading-relaxed text-[var(--ink-faint)]">•••• hidden</p>
      {:else if summaryLoading}
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
    <div class="card {showSummary ? 'lg:col-span-3' : ''}">
      {@render whatChanged()}
    </div>
  {/if}
</div>
{/if}

<div class="card mb-4 {singleMonth && (spendingSegments.length || incomeSegments.length) ? 'card-flush' : ''}">
  {@render spendingChart()}
</div>

{#if ins && ins.reason !== 'empty'}
  <!-- only worth saying for a single month; a range that covers all your data has nothing to compare to and that is obvious -->
  {#if ins.single && !showMovers && !ins.comparable}
    <div class="nudge mb-4">
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

{#if monthModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="overlay" role="dialog" aria-modal="true" aria-label="{shortMonth(monthModal.month)} spending breakdown"
    onclick={(e) => e.target === e.currentTarget && (monthModal = null)}>
    <div class="card w-full max-w-2xl rise max-h-[85vh] overflow-y-auto pb-6">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div>
          <p class="kicker mb-1">{shortMonth(monthModal.month)}</p>
          <h2 class="text-xl" style="font-family:var(--font-display)">Spending breakdown</h2>
        </div>
        <button
          class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
          onclick={() => (monthModal = null)}
          aria-label="Close"
        >
          <Icon name="x" size={16} />
        </button>
      </div>
      {#if monthModal.loading}
        <div class="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div class="flex justify-center sm:flex-1">
            <div class="ai-shimmer h-[220px] w-[220px] rounded-full sm:h-[260px] sm:w-[260px]"></div>
          </div>
          <div class="flex w-full flex-col gap-2 sm:w-[170px] sm:shrink-0">
            {#each ['100%', '85%', '70%', '55%'] as w}
              <div class="ai-shimmer h-3 rounded-full" style="width:{w}"></div>
            {/each}
          </div>
        </div>
      {:else if monthModal.segments.length}
        <SpendingDoughnut segments={monthModal.segments} currency={data.currency}
          onSegmentClick={(seg) => openCategoryModal(seg, monthModal.month, 'expense')} />
      {:else}
        <EmptyState icon="reports" title="Nothing spent in {shortMonth(monthModal.month)}" />
      {/if}
    </div>
  </div>
{/if}

{#if savingsModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Savings breakdown"
    onclick={(e) => e.target === e.currentTarget && (savingsModal = null)}>
    <div class="card w-full max-w-2xl rise max-h-[85vh] overflow-y-auto">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div>
          <p class="kicker mb-1">{periodLabel}</p>
          <h2 class="text-xl" style="font-family:var(--font-display)">Your savings by month</h2>
        </div>
        <button
          class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
          onclick={() => (savingsModal = null)}
          aria-label="Close"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {#if data.aiSummary && savingsModal.series?.length}
        <div class="mb-4 rounded-[var(--radius-sm)] border border-[var(--border)] p-3">
          {#if privacy.hideNumbers}
            <p class="text-[13px] text-[var(--ink-faint)]">•••• hidden</p>
          {:else if savingsModal.summaryLoading}
            <div class="space-y-2">
              <div class="ai-shimmer h-3 w-full rounded-full"></div>
              <div class="ai-shimmer h-3 w-[70%] rounded-full"></div>
            </div>
          {:else if savingsModal.summary}
            <p class="flex items-start gap-2 text-[13px] leading-relaxed text-[var(--ink-soft)]">
              <Icon name="sparkle" size={14} class="mt-0.5 shrink-0 text-[var(--accent)]" />
              {savingsModal.summary}
            </p>
          {:else if savingsModal.summaryError}
            <p class="text-[13px] text-[var(--ink-faint)]">No summary just now — {savingsModal.summaryError}</p>
          {/if}
        </div>
      {/if}

      {#if savingsModal.series === null}
        <div class="flex h-[220px] items-end gap-2 px-2">
          {#each [45, 70, 55, 85, 40, 65, 30, 75, 50, 60, 35, 80] as h}
            <div class="ai-shimmer flex-1 rounded-t-md" style="height:{h}%"></div>
          {/each}
        </div>
      {:else if savingsModal.series.length}
        <SavingsChart series={savingsModal.series} currency={data.currency} onBarClick={openSavingsCategoryModal} />
      {:else}
        <p class="py-8 text-center text-sm text-[var(--ink-faint)]">No savings-category transactions in this period.</p>
      {/if}
    </div>
  </div>
{/if}

{#if categoryModal}
  <CategoryTransactionsModal
    categoryId={categoryModal.categoryId}
    categoryName={categoryModal.categoryName}
    color={categoryModal.color}
    month={categoryModal.month}
    kind={categoryModal.kind}
    excludeIds={categoryModal.excludeIds}
    currency={data.currency}
    categories={data.categories}
    onClose={() => (categoryModal = null)}
    onChanged={() => invalidateAll()}
  />
{/if}

<svelte:window onkeydown={onWindowKey} />
