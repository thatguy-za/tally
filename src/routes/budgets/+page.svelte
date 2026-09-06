<script>
  import { enhance } from '$app/forms';
  import { formatMoney, formatMonth } from '$lib/currency.js';
  import MonthPicker from '$lib/components/MonthPicker.svelte';
  import Money from '$lib/components/Money.svelte';
  import { toast } from '$lib/toast.svelte.js';
  let { data, form } = $props();

  let seenForm;
  $effect(() => {
    if (form === seenForm) return;
    seenForm = form;
    if (form?.saved) toast('Budget saved');
    else if (form?.generated != null)
      toast(form.generated ? `${form.generated} target${form.generated === 1 ? '' : 's'} generated` : 'No spending history yet');
    else if (form?.error) toast(form.error, { type: 'info' });
  });

  let budgeted = $derived(data.expenses.filter((e) => e.target != null));
  let totalTarget = $derived(budgeted.reduce((s, e) => s + e.target, 0));
  let totalActual = $derived(budgeted.reduce((s, e) => s + e.actual, 0));

  const barColour = (pct) =>
    pct == null ? '' : pct > 100 ? 'var(--negative)' : pct > 85 ? 'var(--gold)' : 'var(--accent)';
</script>

<svelte:head><title>Budgets · Tally</title></svelte:head>

<div class="mb-7 flex flex-wrap items-end justify-between gap-3 rise">
  <div>
    <p class="kicker mb-2">Budgets · {formatMonth(data.month)}</p>
    <h1 class="text-3xl" style="font-family:var(--font-display)">Monthly targets</h1>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    <form method="POST" action="?/generateTargets" use:enhance
      onsubmit={(e) => { if (!confirm('Set every expense target to its average monthly spend so far? This overwrites existing targets.')) e.preventDefault(); }}>
      <button class="btn btn-ghost">Generate targets</button>
    </form>
    <MonthPicker months={data.months} selected={data.month} />
  </div>
</div>

{#if budgeted.length}
  {@const remaining = totalTarget - totalActual}
  <div class="mb-4 grid gap-4 sm:grid-cols-3 rise rise-1">
    <div class="card">
      <p class="kicker">Budgeted</p>
      <Money value={totalTarget} currency={data.currency} class="mt-2 block stat-value text-[24px]" />
    </div>
    <div class="card">
      <p class="kicker">Spent</p>
      <Money value={totalActual} currency={data.currency} class="mt-2 block stat-value text-[24px]" />
    </div>
    <div class="card">
      <p class="kicker">Remaining</p>
      <Money value={remaining} currency={data.currency} colour={remaining < 0 ? 'ink' : 'positive'}
        class="mt-2 block stat-value text-[24px]" />
    </div>
  </div>
{/if}

<div class="card rise rise-2">
  <p class="mb-5 text-[13px] text-[var(--ink-faint)]">
    Set a target to start tracking it. Leave the field blank to remove. Spending is matched to the selected month.
  </p>
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
            <form method="POST" action="?/set" use:enhance class="flex items-center gap-1.5">
              <input type="hidden" name="category_id" value={c.id} />
              <input class="input tnum w-28 !py-1 text-right" name="amount" inputmode="decimal"
                placeholder="No target" value={c.target ?? ''} />
              <button class="btn btn-ghost btn-sm">Save</button>
            </form>
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
</div>
