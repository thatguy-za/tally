<script>
  import Sparkline from './Sparkline.svelte';
  import { formatMoney } from '$lib/currency.js';

  /**
   * The dashboard's "This month's budget" card — top spending categories with
   * a sparkline and progress bar each, plus the budget target/actual total.
   * Shared with Reports so a single-month view can reuse it verbatim.
   * @type {{
   *   budgets: { target: number, actual: number, over: number, count: number },
   *   breakdown: { id: any, name: string, color: string, total: number }[],
   *   spark: Record<string, number[]>,
   *   outgoingTotal: number,
   *   currency: string
   * }}
   */
  let { budgets, breakdown, spark, outgoingTotal, currency } = $props();

  // totals are negative for spending, so ascending = biggest spend first
  let topSpend = $derived([...breakdown].sort((a, b) => a.total - b.total).slice(0, 6));
  let spendMax = $derived(Math.max(1, ...topSpend.map((c) => Math.abs(c.total))));
</script>

<div class="card">
  <div class="mb-4 flex items-baseline justify-between gap-3">
    <h2 class="text-lg">This month’s budget</h2>
    {#if budgets.count > 0}
      <a href="/budgets" class="tnum text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]">
        {formatMoney(budgets.actual, currency)}
        <span class="text-[var(--ink-faint)]">of {formatMoney(budgets.target, currency)}</span>
      </a>
    {/if}
  </div>
  {#if topSpend.length}
    <ul class="space-y-3">
      {#each topSpend as c}
        <li>
          <div class="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span class="flex min-w-0 items-center gap-2">
              <span class="dot" style="background:{c.color}"></span>
              <span class="truncate">{c.name}</span>
              <!-- share of the whole month's spending, not just the rows shown -->
              <span class="text-xs text-[var(--ink-faint)]">{Math.round((Math.abs(c.total) / (outgoingTotal || 1)) * 100)}%</span>
            </span>
            <span class="flex shrink-0 items-center gap-2.5">
              <Sparkline values={spark[c.id] ?? []} color={c.color} />
              <span class="tnum w-[74px] text-right font-medium">{formatMoney(Math.abs(c.total), currency)}</span>
            </span>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full" style="background:var(--paper-sunk)">
            <div class="h-full rounded-full transition-[width] duration-700"
              style="width:{(Math.abs(c.total) / spendMax) * 100}%;background:{c.color}"></div>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="py-12 text-center text-sm text-[var(--ink-faint)]">No spending this month.</p>
  {/if}
</div>
