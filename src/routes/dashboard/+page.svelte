<script>
  import { formatMoney, formatMonth } from '$lib/currency.js';
  import MonthPicker from '$lib/components/MonthPicker.svelte';
  import Money from '$lib/components/Money.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Sparkline from '$lib/components/Sparkline.svelte';
  let { data } = $props();

  let net = $derived(data.monthTotals.incoming - data.monthTotals.outgoing);
  let spentTotal = $derived(Math.max(1, data.spending.reduce((s, c) => s + c.actual, 0)));
  const barColour = (pct) =>
    pct > 100 ? 'var(--negative)' : pct > 85 ? 'var(--gold)' : 'var(--accent)';
  let monthName = $derived(formatMonth(data.month).split(' ')[0]);
  let savedRate = $derived(
    data.monthTotals.incoming > 0 ? Math.round((net / data.monthTotals.incoming) * 100) : null
  );
  // the running balance, so the sparkline shows savings building rather than
  // the sawtooth of individual monthly contributions
  let savingsCurve = $derived(data.savings.series.map((s) => s.total));
</script>

<svelte:head><title>Dashboard · Tally</title></svelte:head>

<div class="mb-8 flex flex-wrap items-end justify-between gap-4 rise">
  <div>
    <p class="kicker mb-2">Dashboard</p>
    <h1 class="text-3xl leading-tight" style="font-family:var(--font-display)">
      {#if net > 0}
        In {monthName} you kept
        <span class="tnum" style="color:var(--positive)">{formatMoney(net, data.currency)}</span>.
      {:else if net < 0}
        In {monthName} you spent
        <span class="tnum" style="color:var(--negative)">{formatMoney(-net, data.currency)}</span>
        more than you earned.
      {:else}
        {monthName} is a clean slate.
      {/if}
    </h1>
  </div>
  <MonthPicker months={data.months} selected={data.month} />
</div>

{#if data.uncategorised > 0 || data.budgets.over > 0}
  <div class="mb-6 grid gap-2 sm:grid-cols-2 rise rise-1">
    {#if data.uncategorised > 0}
      <a href="/transactions?category=none" class="nudge">
        <Icon name="sparkle" size={16} class="text-[var(--gold)]" />
        <span>{data.uncategorised} to categorise</span>
        <Icon name="arrowRight" size={14} class="ml-auto text-[var(--ink-faint)]" />
      </a>
    {/if}
    {#if data.budgets.over > 0}
      <a href="/budgets" class="nudge">
        <Icon name="alert" size={16} class="text-[var(--negative)]" />
        <span>{data.budgets.over} over budget</span>
        <Icon name="arrowRight" size={14} class="ml-auto text-[var(--ink-faint)]" />
      </a>
    {/if}
  </div>
{/if}

<div class="grid gap-4 rise rise-2 sm:grid-cols-2 {data.savings.configured ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}">
  <div class="card">
    <p class="kicker">Incoming</p>
    <Money value={data.monthTotals.incoming} currency={data.currency} countUp colour="positive"
      class="mt-2 block stat-value text-[26px]" />
  </div>
  <div class="card">
    <p class="kicker">Outgoing</p>
    <Money value={data.monthTotals.outgoing} currency={data.currency} countUp colour="ink"
      class="mt-2 block stat-value text-[26px]" />
  </div>
  {#if data.savings.configured}
    <div class="card">
      <p class="kicker">Saved</p>
      <Money value={data.monthTotals.saved} currency={data.currency} countUp
        colour={data.monthTotals.saved < 0 ? 'ink' : 'positive'}
        class="mt-2 block stat-value text-[26px]" />
      <div class="mt-1.5 flex items-center justify-between gap-2">
        <span class="text-xs text-[var(--ink-faint)]">
          {formatMoney(data.savings.total, data.currency)} saved in total
        </span>
        <Sparkline values={savingsCurve} color="var(--positive)" width={60} height={18} />
      </div>
    </div>
  {/if}
  <div class="card">
    <p class="kicker">Net {#if savedRate !== null}· {savedRate}% kept{/if}</p>
    <Money value={net} currency={data.currency} countUp colour={net < 0 ? 'ink' : 'positive'}
      class="mt-2 block stat-value text-[26px]" />
  </div>
</div>

<div class="card mt-4 rise rise-3">
  <div class="mb-4 flex flex-wrap items-baseline justify-between gap-3">
    <h2 class="text-lg">Where it went</h2>
    <a href="/budgets" class="link-accent text-[13px]">
      {#if data.budgets.count}
        <span class="tnum">{formatMoney(data.budgets.actual, data.currency)} of {formatMoney(data.budgets.target, data.currency)}</span> budgeted →
      {:else}
        Set targets →
      {/if}
    </a>
  </div>

  {#if data.spending.length}
    <!-- the month's spending as one bar, each category's share in its colour -->
    <div class="mb-5 flex h-2.5 gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Share of this month's spending by category">
      {#each data.spending as c (c.id)}
        {#if c.actual > 0}
          <div style="width:{(c.actual / spentTotal) * 100}%;background:{c.color}" title="{c.name} · {formatMoney(c.actual, data.currency)}"></div>
        {/if}
      {/each}
    </div>

    <ul class="divide-y divide-[var(--border)]">
      {#each data.spending as c (c.id)}
        <li class="flex items-center gap-4 py-2 text-[13px]">
          <span class="flex min-w-0 flex-1 items-center gap-2">
            <span class="dot shrink-0" style="background:{c.color}"></span>
            <span class="truncate">{c.name}</span>
            <span class="text-xs text-[var(--ink-faint)]">{Math.round((c.actual / spentTotal) * 100)}%</span>
          </span>
          <span class="tnum w-[84px] shrink-0 text-right font-medium">{formatMoney(c.actual, data.currency)}</span>
          <!-- against its target: a short track, filled to the share used -->
          <span class="flex w-[124px] shrink-0 items-center justify-end gap-2">
            {#if c.target != null}
              <span class="h-1.5 w-[72px] overflow-hidden rounded-full" style="background:var(--paper-sunk)">
                <span class="block h-full rounded-full transition-[width] duration-700"
                  style="width:{Math.min(100, c.pct)}%;background:{barColour(c.pct)}"></span>
              </span>
              <span class="tnum w-10 text-right text-xs {c.pct > 100 ? 'font-semibold' : 'text-[var(--ink-faint)]'}"
                style={c.pct > 100 ? 'color:var(--negative)' : ''}>{c.pct}%</span>
            {:else}
              <span class="text-xs text-[var(--ink-faint)]">no target</span>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="py-12 text-center text-sm text-[var(--ink-faint)]">No spending this month.</p>
  {/if}
</div>

<div class="card card-flush mt-4 rise rise-4">
  <div class="flex items-center justify-between px-5 py-4">
    <h2 class="text-lg">Latest activity</h2>
    <a href="/transactions" class="link-accent text-[13px]">View all</a>
  </div>
  {#if data.recent.length}
    <ul>
      {#each data.recent as t, i (t.id)}
        <li class="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3 text-sm">
          <div class="flex min-w-0 items-center gap-3">
            <span class="dot" style="background:{t.category_color || 'var(--ink-faint)'}"></span>
            <div class="min-w-0">
              <p class="truncate font-medium">{t.description || '—'}</p>
              <p class="text-xs text-[var(--ink-faint)]">
                {t.date}{#if t.category_name} · {t.category_name}{/if}
              </p>
            </div>
          </div>
          <Money value={t.amount} currency={data.currency} colour="auto" class="shrink-0 font-medium" />
        </li>
      {/each}
    </ul>
  {:else}
    <div class="border-t border-[var(--border)]">
      <EmptyState
        icon="wallet"
        title="No activity this month"
        hint="Once you add or import transactions they'll show up here."
        cta={{ href: '/transactions?new=1', label: 'Add a transaction' }}
      />
    </div>
  {/if}
</div>
