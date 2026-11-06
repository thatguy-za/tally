<script>
  import { goto } from '$app/navigation';
  import { formatMoney } from '$lib/privacy.svelte.js';
  import StackedMonths from './StackedMonths.svelte';
  import EmptyState from './EmptyState.svelte';

  /**
   * The household's spending: what everyone has chosen to share, put together.
   * Spending only — a household has no income or savings of its own to show —
   * and read-only, so a click goes to the (also read-only) household list.
   * @type {{ data: any }}
   */
  let { data } = $props();

  const money = (v) => formatMoney(v, data.currency);
  let ins = $derived(data.insights);
  let members = $derived(data.household.memberTotals);
  let top = $derived(Math.max(1, ...members.map((m) => m.total)));
  let hasSpending = $derived(data.chart.expense.length > 0);
  let shared = $derived(data.categories.length);

  // from a category or a month in the chart to the matching transactions
  function toTransactions({ category, month } = {}) {
    const q = new URLSearchParams();
    if (category != null && category !== 'other') q.set('category', String(category));
    if (month) q.set('month', month);
    else {
      q.set('from', `${data.from}-01`);
      q.set('to', `${data.to}-31`);
    }
    goto(`/transactions?${q}`);
  }

  const delta = (m) => (m.delta >= 0 ? '↑ ' : '↓ ') + money(Math.abs(m.delta));
</script>

{#if hasSpending}
  <div class="mb-4 grid grid-cols-3 divide-x divide-[var(--border)] overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
    <div class="min-w-0 px-2.5 py-3 sm:px-5 sm:py-4">
      <p class="kicker">Spent</p>
      <p class="stat-value mt-1 text-[17px] sm:text-[24px]">{money(ins.spent)}</p>
      {#if ins.baseline}
        {@const diff = ins.spent - ins.baseline.spent}
        <p class="mt-1 hidden truncate text-xs text-[var(--ink-faint)] sm:block">
          {money(Math.abs(diff))} {diff >= 0 ? 'more' : 'less'} than usual
        </p>
      {/if}
    </div>
    <div class="min-w-0 px-2.5 py-3 sm:px-5 sm:py-4">
      <p class="kicker">A month</p>
      <p class="stat-value mt-1 text-[17px] sm:text-[24px]">{money(ins.avg.spent)}</p>
    </div>
    <div class="min-w-0 px-2.5 py-3 sm:px-5 sm:py-4">
      <p class="kicker">Shared categories</p>
      <p class="stat-value mt-1 text-[17px] sm:text-[24px]">{shared}</p>
    </div>
  </div>

  <div class="card mb-4">
    <h2 class="text-lg">Who paid</h2>
    <p class="mb-3 mt-1 text-[13px] text-[var(--ink-faint)]">
      Each person's spending in the categories they chose to share, over this period.
    </p>
    <ul class="space-y-3">
      {#each members as m}
        <li>
          <div class="flex items-baseline justify-between gap-3 text-[13px]">
            <span class="min-w-0 truncate font-medium">{m.username}{#if m.you}<span class="ml-1 font-normal text-[var(--ink-faint)]">(you)</span>{/if}</span>
            <span class="tnum shrink-0 font-semibold">{money(m.total)}</span>
          </div>
          <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--paper-sunk)]">
            <div class="h-full rounded-full bg-[var(--accent)]" style="width:{(m.total / top) * 100}%"></div>
          </div>
          <p class="mt-0.5 text-[11px] text-[var(--ink-faint)]">{m.count} transaction{m.count === 1 ? '' : 's'}</p>
        </li>
      {/each}
    </ul>
  </div>

  {#if ins.movers?.length}
    <div class="card mb-4">
      <h2 class="text-lg">What changed</h2>
      <p class="mb-3 mt-1 text-[13px] text-[var(--ink-faint)]">Against what is usual for the household, biggest moves first.</p>
      <ul class="divide-y divide-[var(--border)]">
        {#each ins.movers as m}
          <li>
            <button type="button" class="flex w-full items-center gap-2.5 py-2 text-left text-[13px] hover:bg-[var(--paper-sunk)]/50"
              onclick={() => toTransactions({ category: m.id })}>
              <span class="dot shrink-0" style="background:{m.color}"></span>
              <span class="min-w-0 flex-1 truncate">{m.name}</span>
              <span class="tnum text-[var(--ink-faint)]">usual {money(m.usual)}</span>
              <span class="tnum w-20 text-right font-semibold">{money(m.spent)}</span>
              <span class="tnum w-20 text-right text-[var(--ink-soft)]">{delta(m)}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <div class="card mb-4">
    <StackedMonths
      title="Household spending by month"
      months={data.chart.months}
      income={[]}
      expense={data.chart.expense}
      values={data.chart.values}
      currency={data.currency}
      onSegmentClick={(seg, ym) => toTransactions({ category: seg.id, month: ym })}
      onMonthClick={(ym) => toTransactions({ month: ym })}
    />
  </div>
{:else}
  <div class="card">
    <EmptyState icon="reports" title="Nothing shared in this period"
      hint="Spending shows up here once someone in the household ticks Household on a spending category: switch to one of your own accounts, open Categories, and tick it." />
  </div>
{/if}
