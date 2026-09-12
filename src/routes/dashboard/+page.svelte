<script>
  import { formatMoney, formatMonth } from '$lib/currency.js';
  import MonthPicker from '$lib/components/MonthPicker.svelte';
  import Money from '$lib/components/Money.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Sparkline from '$lib/components/Sparkline.svelte';
  let { data } = $props();

  let net = $derived(data.monthTotals.incoming - data.monthTotals.outgoing);
  // bars share one scale: the biggest amount spent or target this month
  let spendMax = $derived(Math.max(1, ...data.spending.flatMap((c) => [c.actual, c.target ?? 0])));
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
    {#if data.budgets.count}
      <a href="/budgets" class="link-accent tnum text-[13px]">
        {formatMoney(data.budgets.actual, data.currency)} of {formatMoney(data.budgets.target, data.currency)} budgeted
        · {Math.round((data.budgets.actual / (data.budgets.target || 1)) * 100)}%
      </a>
    {:else if data.spending.length}
      <a href="/budgets" class="link-accent text-[13px]">Set some targets</a>
    {/if}
  </div>
  {#if data.spending.length}
    <!-- one bar per category: length is what was spent, the tick is the target,
         anything past the tick turns red. Same scale for every row. -->
    <ul class="space-y-3.5">
      {#each data.spending as c (c.id)}
        {@const within = c.target != null ? Math.min(c.actual, c.target) : c.actual}
        {@const over = c.target != null ? Math.max(0, c.actual - c.target) : 0}
        <li>
          <div class="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span class="flex min-w-0 items-center gap-2">
              <span class="dot" style="background:{c.color}"></span>
              <span class="truncate">{c.name}</span>
            </span>
            <span class="tnum shrink-0">
              <span class="font-medium">{formatMoney(c.actual, data.currency)}</span>
              {#if c.target != null}
                <span class="text-xs {c.remaining < 0 ? '' : 'text-[var(--ink-faint)]'}"
                  style={c.remaining < 0 ? 'color:var(--negative)' : ''}>
                  {c.remaining < 0
                    ? `${formatMoney(-c.remaining, data.currency)} over`
                    : `of ${formatMoney(c.target, data.currency)}`}
                </span>
              {/if}
            </span>
          </div>
          <div class="relative h-1.5 rounded-full" style="background:var(--paper-sunk)">
            <div class="absolute inset-y-0 left-0 flex overflow-hidden rounded-full" style="width:{((within + over) / spendMax) * 100}%">
              <div class="h-full transition-[width] duration-700" style="width:{(within / (within + over || 1)) * 100}%;background:{c.color}"></div>
              {#if over}<div class="h-full flex-1" style="background:var(--negative)"></div>{/if}
            </div>
            {#if c.target != null}
              <div class="absolute -top-[3px] h-3 w-[2px] rounded-full" style="left:calc({(c.target / spendMax) * 100}% - 1px);background:var(--ink)"></div>
            {/if}
          </div>
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
