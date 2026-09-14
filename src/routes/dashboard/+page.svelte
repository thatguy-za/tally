<script>
  import { formatMoney, formatMonth } from '$lib/currency.js';
  import MonthPicker from '$lib/components/MonthPicker.svelte';
  import AccountPicker from '$lib/components/AccountPicker.svelte';
  import Money from '$lib/components/Money.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import MerchantLogo from '$lib/components/MerchantLogo.svelte';
  import MonthlyBudgetCard from '$lib/components/MonthlyBudgetCard.svelte';
  let { data } = $props();

  let net = $derived(data.monthTotals.incoming - data.monthTotals.outgoing);
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
  <div class="flex items-center gap-2">
    {#if data.accounts.length > 1}
      <AccountPicker accounts={data.accounts} selected={data.accountId ?? ''} />
    {/if}
    <MonthPicker months={data.months} selected={data.month} />
  </div>
</div>

{#if data.uncategorised > 0 || data.budgets.over > 0}
  <div class="mb-6 grid gap-2 sm:grid-cols-2 rise rise-1">
    {#if data.uncategorised > 0}
      <a href="/transactions?category=none{data.accountId ? `&account=${data.accountId}` : ''}" class="nudge">
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

<div class="mt-4 rise rise-3">
  <MonthlyBudgetCard budgets={data.budgets} breakdown={data.breakdown} spark={data.spark}
    outgoingTotal={data.monthTotals.outgoing} currency={data.currency} />
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
            <MerchantLogo domain={t.logo_domain} color={t.category_color || 'var(--ink-faint)'} />
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
