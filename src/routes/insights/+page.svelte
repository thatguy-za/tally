<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatMoney, formatMonth, currentMonth } from '$lib/currency.js';
  import Icon from '$lib/components/Icon.svelte';
  import { invalidateAll } from '$app/navigation';
  import StackedMonths from '$lib/components/StackedMonths.svelte';
  import SpendingDoughnut from '$lib/components/SpendingDoughnut.svelte';
  import AccountPicker from '$lib/components/AccountPicker.svelte';
  import PeriodPicker from '$lib/components/PeriodPicker.svelte';
  import CategoryTransactionsModal from '$lib/components/CategoryTransactionsModal.svelte';
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

  let monthModal = $state(null);
  async function openMonthModal(ym) {
    monthModal = { month: ym, segments: null, loading: true };
    const params = new URLSearchParams({ month: ym });
    if (data.accountId) params.set('account', data.accountId);
    try {
      const res = await fetch(`/insights/month-breakdown?${params}`);
      const j = await res.json();
      monthModal = { month: ym, segments: j.segments || [], loading: false };
    } catch {
      monthModal = { month: ym, segments: [], loading: false };
    }
  }
  function onWindowKey(e) {
    if (e.key === 'Escape' && monthModal) monthModal = null;
  }

  let ins = $derived(data.insights);
  let singleMonth = $derived(data.from === data.to);
  let showMovers = $derived(!!ins && ins.reason !== 'empty' && ins.movers.length > 0);
  let spendingSegments = $derived(
    singleMonth
      ? data.chart.expense
          .map((c) => ({ id: c.id, name: c.name, color: c.color, value: Math.abs(data.chart.values[data.from]?.expense[c.id] || 0) }))
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
  let showSummary = $derived(data.aiSummary && (summaryLoading || summary || summaryError));

  $effect(() => {
    const ins = data.insights;
    const key = data.aiSummary && ins && ins.reason !== 'empty'
      ? `${data.from}:${data.to}:${data.accountId ?? ''}`
      : null;
    if (!key) {
      summary = null;
      summaryError = null;
      return;
    }
    const [from, to, accountId] = key.split(':');
    let cancelled = false;
    summary = null;
    summaryError = null;
    summaryLoading = true;
    fetch('/insights/summary', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from, to, accountId: accountId || undefined })
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

<div class="mb-7 flex flex-wrap items-end justify-between gap-3 rise">
  <div>
    <p class="kicker mb-2">Insights · {periodLabel}</p>
    <h1 class="text-3xl" style="font-family:var(--font-display)">Where your money went</h1>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    {#if data.accounts.length > 1}
      <AccountPicker accounts={data.accounts} selected={data.accountId ?? ''} />
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
  </div>
</div>

{#if ins && ins.reason !== 'empty'}
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
{/if}

{#snippet spendingChart()}
  {#if singleMonth}
    {#if spendingSegments.length}
      <SpendingDoughnut title="Your spending for this month" segments={spendingSegments} currency={data.currency}
        onSegmentClick={(seg) => openCategoryModal(seg, data.from)} />
    {:else}
      <h2 class="mb-4 text-lg">Your spending for this month</h2>
      <p class="py-12 text-center text-sm text-[var(--ink-faint)]">Nothing in this period yet.</p>
    {/if}
  {:else if data.chart.income.length || data.chart.expense.length}
    <StackedMonths title="Your spending by month" months={data.chart.months} income={data.chart.income}
      expense={data.chart.expense} values={data.chart.values} currency={data.currency}
      onSegmentClick={openCategoryModal} onMonthClick={openMonthModal} />
  {:else}
    <h2 class="mb-4 text-lg">Your spending by month</h2>
    <p class="py-12 text-center text-sm text-[var(--ink-faint)]">Nothing in this period yet.</p>
  {/if}
{/snippet}

{#snippet whatChanged()}
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
{/snippet}

<!-- "In a nutshell" always sits on the left, paired with "What changed" -->
{#if showSummary || showMovers}
<div class="mb-4 grid gap-4 rise rise-2 {showSummary && showMovers ? 'lg:grid-cols-5' : ''}">
  {#if showSummary}
    <div class="card {showMovers ? 'lg:col-span-2' : ''}">
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
    <div class="card {showSummary ? 'lg:col-span-3' : ''}">
      {@render whatChanged()}
    </div>
  {/if}
</div>
{/if}

<div class="card mb-4 rise rise-3">
  {@render spendingChart()}
</div>

{#if ins && ins.reason !== 'empty'}
  <!-- only worth saying for a single month; a range that covers all your data has nothing to compare to and that is obvious -->
  {#if ins.single && !showMovers && !ins.comparable}
    <div class="nudge mb-4 rise rise-4">
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
  <div class="overlay" role="dialog" aria-modal="true" aria-label="{shortMonth(monthModal.month)} spending breakdown">
    <div class="card w-full max-w-2xl self-start rise max-h-[85vh] overflow-y-auto pb-6">
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
        <p class="py-8 text-center text-sm text-[var(--ink-faint)]">Loading…</p>
      {:else if monthModal.segments.length}
        <SpendingDoughnut segments={monthModal.segments} currency={data.currency}
          onSegmentClick={(seg) => openCategoryModal(seg, monthModal.month, 'expense')} />
      {:else}
        <p class="py-8 text-center text-sm text-[var(--ink-faint)]">Nothing spent in {shortMonth(monthModal.month)}.</p>
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
