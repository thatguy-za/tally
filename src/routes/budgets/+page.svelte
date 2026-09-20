<script>
  import { enhance } from '$app/forms';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatMonth } from '$lib/currency.js';
  import { formatMoney } from '$lib/privacy.svelte.js';
  import MonthCalendarPicker from '$lib/components/MonthCalendarPicker.svelte';
  import CategoryTransactionsModal from '$lib/components/CategoryTransactionsModal.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Money from '$lib/components/Money.svelte';
  import { toast } from '$lib/toast.svelte.js';
  let { data, form } = $props();

  /** `n` months from `ym` (YYYY-MM), signed. */
  function shiftMonth(ym, n) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // every category, across kinds — the transaction-picker inside the modal
  // below needs the full list, not just whichever section was clicked
  let allCategories = $derived([...data.expenses, ...data.savings, ...data.income]);

  let txModal = $state(null);
  function openTxModal(c) {
    txModal = { categoryId: c.id, categoryName: c.name, color: c.color };
  }

  // the default use:enhance behaviour resets the form on success, which
  // blanks every target input (they're plain, unbound `value={...}`, so their
  // defaultValue is always "") — even ones whose target didn't change and so
  // never get a fresh value from the {#key c.target} block below
  function submitSave() {
    return async ({ update }) => {
      await update({ reset: false });
    };
  }

  function setMonth(month) {
    const url = new URL($page.url);
    url.searchParams.set('month', month);
    goto(url, { keepFocus: true, noScroll: true });
  }

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

<div class="mb-7 flex flex-wrap items-end justify-between gap-3">
  <div>
    <p class="kicker mb-2">Budgets · {formatMonth(data.month)}</p>
    <h1 class="text-3xl" style="font-family:var(--font-display)">Monthly targets</h1>
  </div>
  <div class="flex items-center gap-1">
    <button type="button" class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
      aria-label="Previous month" onclick={() => setMonth(shiftMonth(data.month, -1))}>
      <Icon name="arrowRight" size={16} class="rotate-180" />
    </button>
    <MonthCalendarPicker value={data.month} onChange={setMonth} />
    <button type="button" class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
      aria-label="Next month" onclick={() => setMonth(shiftMonth(data.month, 1))}>
      <Icon name="arrowRight" size={16} />
    </button>
  </div>
</div>

{#if data.totals.count}
  {@const remaining = data.totals.target - data.totals.actual}
  <div class="mb-4 grid gap-4 sm:grid-cols-3">
    <div class="card">
      <p class="kicker">Budgeted</p>
      <span class="mt-2 block stat-value text-[24px]"><Money value={data.totals.target} currency={data.currency} /></span>
    </div>
    <div class="card">
      <p class="kicker">Spent</p>
      <span class="mt-2 block stat-value text-[24px]"><Money value={data.totals.actual} currency={data.currency} /></span>
    </div>
    <div class="card">
      <p class="kicker">Remaining</p>
      <span class="mt-2 block stat-value text-[24px]"
        style={remaining < 0 ? 'color:var(--ink)' : 'color:var(--positive)'}>
        <Money value={remaining} currency={data.currency} colour="none" />
      </span>
    </div>
  </div>
{/if}

<div class="card">
  <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
    <p class="text-[13px] text-[var(--ink-faint)]">
      Set a monthly target per category. Clear a field to remove its target. Spending is matched to the selected month.
    </p>
    <form method="POST" action="?/generateTargets" use:enhance
      onsubmit={(e) => { if (!confirm('Set every expense target to its average monthly spend so far? This overwrites existing targets.')) e.preventDefault(); }}>
      <button class="btn btn-ghost btn-sm whitespace-nowrap">Calculate targets</button>
    </form>
  </div>
  <form method="POST" action="?/save" use:enhance={submitSave}>
    <ul class="space-y-4">
      {#each data.expenses as c (c.id)}
        <li>
          <div class="mb-2 flex flex-wrap items-center justify-between gap-3 text-[13px]">
            <button type="button" class="flex items-center gap-2 font-medium hover:underline" onclick={() => openTxModal(c)}>
              <span class="dot" style="background:{c.color}"></span>{c.name}
            </button>
            <span class="flex items-center gap-2">
              <span class="tnum text-[var(--ink-faint)]">{formatMoney(c.actual, data.currency)} /</span>
              <!-- keyed on the target so a server-generated value (e.g. from
                   "Generate targets") always shows, even if the user already
                   focused this field once this page load -->
              {#key c.target}
                <input class="input tnum w-28 !py-1 text-right" name={`amount_${c.id}`} inputmode="decimal"
                  placeholder="No target" value={c.target ?? ''} />
              {/key}
            </span>
          </div>
          <div class="h-2 overflow-hidden rounded-full" style="background:var(--paper-sunk)">
            {#if c.target != null}
              <div class="h-full rounded-full transition-[width] duration-700"
                style="width:{Math.min(100, c.pct)}%;background:{barColour(c.pct)}"></div>
            {/if}
          </div>
          {#if c.target != null}
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

    {#if data.savings.length}
      <div class="mt-7 border-t border-[var(--border)] pt-5">
        <h2 class="text-lg">Savings</h2>
        <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">
          A target here is an amount to <em>reach</em>, not to stay under — passing it is the win.
        </p>
        <ul class="space-y-4">
          {#each data.savings as c (c.id)}
            <li>
              <div class="mb-2 flex flex-wrap items-center justify-between gap-3 text-[13px]">
                <button type="button" class="flex items-center gap-2 font-medium hover:underline" onclick={() => openTxModal(c)}>
                  <span class="dot" style="background:{c.color}"></span>{c.name}
                </button>
                <span class="flex items-center gap-3">
                  <span class="tnum text-[var(--ink-faint)]">
                    {formatMoney(c.actual, data.currency)}{#if c.target != null} / {formatMoney(c.target, data.currency)}{/if}
                  </span>
                  {#key c.target}
                    <input class="input tnum w-28 !py-1 text-right" name={`amount_${c.id}`} inputmode="decimal"
                      placeholder="No target" value={c.target ?? ''} />
                  {/key}
                </span>
              </div>
              <div class="h-2 overflow-hidden rounded-full" style="background:var(--paper-sunk)">
                {#if c.target != null}
                  <div class="h-full rounded-full transition-[width] duration-700"
                    style="width:{Math.max(0, Math.min(100, c.pct))}%;background:var(--positive)"></div>
                {/if}
              </div>
              {#if c.target != null}
                <p class="mt-1 text-xs {c.remaining <= 0 ? '' : 'text-[var(--ink-faint)]'}"
                  style={c.remaining <= 0 ? 'color:var(--positive)' : ''}>
                  {#if c.actual < 0}
                    {formatMoney(-c.actual, data.currency)} taken out this month
                  {:else if c.remaining <= 0}
                    target met · {c.pct}%
                  {:else}
                    {formatMoney(c.remaining, data.currency)} to go · {c.pct}%
                  {/if}
                </p>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="mt-6 flex justify-end border-t border-[var(--border)] pt-4">
      <button class="btn btn-primary">Save targets</button>
    </div>
  </form>
</div>

{#if txModal}
  <CategoryTransactionsModal
    categoryId={txModal.categoryId}
    categoryName={txModal.categoryName}
    color={txModal.color}
    month={data.month}
    currency={data.currency}
    categories={allCategories}
    onClose={() => (txModal = null)}
    onChanged={() => invalidateAll()}
  />
{/if}
