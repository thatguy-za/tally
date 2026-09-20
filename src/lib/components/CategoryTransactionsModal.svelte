<script>
  import Icon from './Icon.svelte';
  import CategorySelect from './CategorySelect.svelte';
  import { formatMonth } from '$lib/currency.js';
  import { formatMoney } from '$lib/privacy.svelte.js';
  import { parseAmount } from '$lib/csv.js';

  /**
   * Every transaction in one category, for one month — opened by clicking a
   * segment on either spending chart on Insights. Rows are editable in place
   * so a mis-categorised or wrong-amount transaction can be fixed without
   * leaving the chart.
   * @type {{
   *   categoryId: number|'none'|'other',
   *   categoryName: string,
   *   color: string,
   *   month: string,
   *   kind?: 'income'|'expense',
   *   excludeIds?: number[],
   *   currency: string,
   *   categories: {id:number,name:string}[],
   *   onClose: () => void,
   *   onChanged?: () => void
   * }}
   */
  let { categoryId, categoryName, color, month, kind, excludeIds = [], currency, categories, onClose, onChanged } = $props();

  let rows = $state([]);
  let loading = $state(true);
  let loadError = $state('');

  async function load() {
    loading = true;
    loadError = '';
    try {
      const params = new URLSearchParams({ category: String(categoryId), month });
      if (categoryId === 'other') {
        params.set('kind', kind || 'expense');
        params.set('exclude', excludeIds.join(','));
      }
      const res = await fetch(`/insights/category-transactions?${params}`);
      if (!res.ok) throw new Error();
      const j = await res.json();
      rows = j.transactions;
    } catch {
      loadError = 'Could not load these transactions.';
    } finally {
      loading = false;
    }
  }
  load();

  let total = $derived(rows.reduce((s, r) => s + r.amount, 0));

  async function updateRow(row, patch) {
    const merged = { ...row, ...patch };
    rows = rows.map((r) => (r.id === row.id ? merged : r));
    const body = new FormData();
    body.set('id', String(row.id));
    body.set('date', merged.date);
    body.set('description', merged.description || '');
    body.set('amount', String(Math.abs(merged.amount)));
    body.set('direction', merged.amount >= 0 ? 'in' : 'out');
    await fetch('/transactions?/update', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
    onChanged?.();
  }

  async function setCategory(row, newCategoryId) {
    const body = new FormData();
    body.set('id', String(row.id));
    body.set('category_id', newCategoryId || '');
    await fetch('/transactions?/categorise', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
    // moved out of the bucket this popup is showing — drop it from the list
    const staysInOther = categoryId === 'other' && newCategoryId && !excludeIds.includes(Number(newCategoryId));
    const staysPut = categoryId !== 'other' && String(newCategoryId || '') === String(categoryId);
    if (!staysInOther && !staysPut) {
      rows = rows.filter((r) => r.id !== row.id);
    }
    onChanged?.();
  }

  async function removeRow(id) {
    rows = rows.filter((r) => r.id !== id);
    const body = new FormData();
    body.set('id', String(id));
    await fetch('/transactions?/delete', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
    onChanged?.();
  }

  function onWindowKey(e) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="overlay" role="dialog" aria-modal="true" aria-label="{categoryName} transactions"
  onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="card w-full max-w-2xl rise max-h-[85vh] overflow-y-auto">
    <div class="mb-4 flex items-start justify-between gap-3">
      <div>
        <p class="kicker mb-1 flex items-center gap-1.5">
          <span class="h-2.5 w-2.5 rounded-full" style="background:{color || 'var(--border-strong)'}"></span>
          {formatMonth(month)}
        </p>
        <h2 class="text-xl" style="font-family:var(--font-display)">{categoryName}</h2>
      </div>
      <button
        class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
        onclick={onClose}
        aria-label="Close"
      >
        <Icon name="x" size={16} />
      </button>
    </div>

    {#if loading}
      <div class="space-y-2">
        {#each [0, 1, 2, 3, 4] as i}
          <div class="ai-shimmer h-9 rounded-[var(--radius-xs)]" style="width:{95 - i * 6}%"></div>
        {/each}
      </div>
    {:else if loadError}
      <p class="py-8 text-center text-sm" style="color:var(--negative)">{loadError}</p>
    {:else if !rows.length}
      <p class="py-8 text-center text-sm text-[var(--ink-faint)]">Nothing left in this category for {formatMonth(month)}.</p>
    {:else}
      <div class="card card-flush">
        <div class="overflow-x-auto">
          <table class="w-full text-[13px]">
            <thead>
              <tr class="border-b border-[var(--border)] text-left">
                <th class="th px-2 py-2 pl-4">Date</th>
                <th class="th px-2 py-2">Description</th>
                <th class="th px-2 py-2 text-right">Amount</th>
                <th class="th px-2 py-2">Category</th>
                <th class="w-9"></th>
              </tr>
            </thead>
            <tbody>
              {#each rows as r (r.id)}
                <tr class="border-b border-[var(--border)] last:border-0">
                  <td class="py-1 pl-4 pr-2">
                    <input class="cell tnum w-[128px]" type="date" value={r.date}
                      onchange={(e) => updateRow(r, { date: e.currentTarget.value })} />
                  </td>
                  <td class="py-1 pr-2">
                    <input class="cell min-w-[150px]" value={r.description}
                      onchange={(e) => updateRow(r, { description: e.currentTarget.value })} />
                  </td>
                  <td class="py-1 pr-2">
                    <input class="cell tnum w-[92px] text-right" inputmode="decimal"
                      style={r.amount > 0 ? 'color:var(--positive)' : ''}
                      value={Math.abs(r.amount)}
                      onchange={(e) => {
                        const v = parseAmount(e.currentTarget.value);
                        if (v != null) updateRow(r, { amount: v * (r.amount >= 0 ? 1 : -1) });
                      }} />
                  </td>
                  <td class="py-1 pr-2">
                    <CategorySelect {categories} value={String(r.category_id ?? '')}
                      onChange={(v) => setCategory(r, v)}
                      onCreated={() => onChanged?.()} />
                  </td>
                  <td class="py-1 pr-3 text-right">
                    <button type="button" class="rounded p-1 text-[var(--ink-faint)] hover:text-[var(--negative)]"
                      aria-label="Delete transaction" onclick={() => removeRow(r.id)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between border-t border-[var(--border)] px-4 py-2.5 text-[13px]">
          <span class="text-[var(--ink-faint)]">{rows.length} transaction{rows.length === 1 ? '' : 's'}</span>
          <span class="tnum font-medium">{formatMoney(total, currency)}</span>
        </div>
      </div>
    {/if}
  </div>
</div>
