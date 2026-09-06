<script>
  import { enhance } from '$app/forms';
  import { formatMoney, formatMonth } from '$lib/currency.js';
  import MonthPicker from '$lib/components/MonthPicker.svelte';
  import { toast } from '$lib/toast.svelte.js';
  let { data, form } = $props();

  let seenForm;
  $effect(() => {
    if (form === seenForm) return;
    seenForm = form;
    if (form?.saved) toast('Targets saved');
    else if (form?.generated != null)
      toast(form.generated ? `${form.generated} target${form.generated === 1 ? '' : 's'} generated` : 'No spending history yet');
    else if (form?.error) toast(form.error, { type: 'info' });
  });

  const barColour = (pct) =>
    pct == null ? '' : pct > 100 ? 'var(--negative)' : pct > 85 ? 'var(--gold)' : 'var(--accent)';
</script>

<svelte:head><title>Budgets · Tally</title></svelte:head>

<div class="mb-7 flex flex-wrap items-end justify-between gap-3 rise">
  <div>
    <p class="kicker mb-2">Budgets · {formatMonth(data.month)}</p>
    <h1 class="text-3xl" style="font-family:var(--font-display)">Monthly targets</h1>
  </div>
  <div class="flex items-center gap-2">
    <form method="POST" action="?/generateTargets" use:enhance
      onsubmit={(e) => { if (!confirm('Set every expense target to its average monthly spend so far? This overwrites existing targets.')) e.preventDefault(); }}>
      <button class="btn btn-ghost whitespace-nowrap">Generate targets</button>
    </form>
    <MonthPicker months={data.months} selected={data.month} />
  </div>
</div>

{#if data.totals.count}
  {@const remaining = data.totals.target - data.totals.actual}
  <div class="mb-4 grid gap-4 sm:grid-cols-3 rise rise-1">
    <div class="card">
      <p class="kicker">Budgeted</p>
      <span class="mt-2 block stat-value tnum text-[24px]">{formatMoney(data.totals.target, data.currency)}</span>
    </div>
    <div class="card">
      <p class="kicker">Spent</p>
      <span class="mt-2 block stat-value tnum text-[24px]">{formatMoney(data.totals.actual, data.currency)}</span>
    </div>
    <div class="card">
      <p class="kicker">Remaining</p>
      <span class="mt-2 block stat-value tnum text-[24px]"
        style={remaining < 0 ? 'color:var(--ink)' : 'color:var(--positive)'}>
        {formatMoney(remaining, data.currency)}
      </span>
    </div>
  </div>
{/if}

<div class="card rise rise-2">
  <p class="mb-5 text-[13px] text-[var(--ink-faint)]">
    Set a monthly target per category. Clear a field to remove its target. Spending is matched to the selected month.
  </p>
  <form method="POST" action="?/save" use:enhance>
    <ul class="space-y-4">
      {#each data.expenses as c}
        <li>
          <div class="mb-2 flex flex-wrap items-center justify-between gap-3 text-[13px]">
            <span class="flex items-center gap-2 font-medium">
              <span class="dot" style="background:{c.color}"></span>{c.name}
            </span>
            <span class="flex items-center gap-3">
              <span class="tnum text-[var(--ink-faint)]">
                {formatMoney(c.actual, data.currency)}{#if c.target != null} / {formatMoney(c.target, data.currency)}{/if}
              </span>
              <input class="input tnum w-28 !py-1 text-right" name={`amount_${c.id}`} inputmode="decimal"
                placeholder="No target" value={c.target ?? ''} />
            </span>
          </div>
          {#if c.target != null}
            <div class="h-2 overflow-hidden rounded-full" style="background:var(--paper-sunk)">
              <div class="h-full rounded-full transition-[width] duration-700"
                style="width:{Math.min(100, c.pct)}%;background:{barColour(c.pct)}"></div>
            </div>
            <p class="mt-1 text-xs {c.remaining < 0 ? '' : 'text-[var(--ink-faint)]'}"
              style={c.remaining < 0 ? 'color:var(--negative)' : ''}>
              {c.remaining < 0
                ? `${formatMoney(-c.remaining, data.currency)} over budget`
                : `${formatMoney(c.remaining, data.currency)} left · ${c.pct}%`}
            </p>
          {/if}
        </li>
      {/each}
    </ul>
    <div class="mt-6 flex justify-end border-t border-[var(--border)] pt-4">
      <button class="btn btn-primary">Save targets</button>
    </div>
  </form>
</div>
