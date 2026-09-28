<script>
  import Icon from './Icon.svelte';
  import CategorySelect from './CategorySelect.svelte';
  import TransactionRow from './TransactionRow.svelte';
  import { formatMonth } from '$lib/currency.js';
  import { formatMoney } from '$lib/privacy.svelte.js';
  import { parseAmount } from '$lib/csv.js';

  /**
   * Every transaction in one category, for one month — or, when `toMonth` is
   * given and differs from `month`, for the whole run of months between them,
   * which is what the period flow chart needs. Opened by clicking a segment
   * on either spending chart on Insights. Rows are editable in place so a
   * mis-categorised or wrong-amount transaction can be fixed without leaving
   * the chart.
   * @type {{
   *   categoryId: number|'none'|'other',
   *   categoryName: string,
   *   color: string,
   *   month: string,
   *   toMonth?: string,
   *   kind?: 'income'|'expense',
   *   excludeIds?: number[],
   *   currency: string,
   *   categories: {id:number,name:string}[],
   *   onClose: () => void,
   *   onChanged?: () => void
   * }}
   */
  let { categoryId, categoryName, color, month, toMonth, kind, excludeIds = [], currency, categories, onClose, onChanged } = $props();

  let isRange = $derived(!!toMonth && toMonth !== month);
  let periodLabel = $derived(isRange ? `${formatMonth(month)} – ${formatMonth(toMonth)}` : formatMonth(month));
  // every row shares one category except in the mixed "Other"/"Uncategorised" buckets
  let showCategory = $derived(categoryId === 'other' || categoryId === 'none');

  let rows = $state([]);
  let loading = $state(true);
  let loadError = $state('');
  let expandedId = $state(null); // mobile row expansion — one open at a time

  async function load() {
    loading = true;
    loadError = '';
    try {
      const params = new URLSearchParams(
        isRange ? { category: String(categoryId), from: month, to: toMonth } : { category: String(categoryId), month }
      );
      if (categoryId === 'other') {
        params.set('kind', kind || 'expense');
        params.set('exclude', excludeIds.join(','));
      } else if (categoryId === -1 && kind) {
        params.set('kind', kind);
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
    body.set('notes', merged.notes || '');
    body.set('amount', String(merged.amount));
    await fetch('/transactions?/update', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
    onChanged?.();
  }

  // shared by the mobile row's onEdit and the desktop amount cell's onchange
  // below — same sign-preserving parse either way
  function commitAmount(row, raw) {
    const v = parseAmount(raw);
    if (v == null) return;
    const signed = /^\s*[-+]/.test(raw) ? v : Math.abs(v) * (row.amount >= 0 ? 1 : -1);
    updateRow(row, { amount: signed });
  }
  function commitRowField(row, key, value) {
    if (key === 'amount') commitAmount(row, value);
    else updateRow(row, { [key]: value });
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
          {periodLabel}
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
      <p class="py-8 text-center text-sm text-[var(--ink-faint)]">Nothing left in this category for {periodLabel}.</p>
    {:else}
      <div class="card card-flush">
        <div class="hidden overflow-x-auto sm:block">
          <table class="w-full text-[13px]">
            <thead>
              <tr class="border-b border-[var(--border)] text-left">
                <th class="th px-2 py-2 pl-4">Date</th>
                <th class="th px-2 py-2">Description</th>
                <th class="th px-2 py-2 text-right">Amount</th>
                <th class="th px-2 py-2">Category</th>
                <th class="th px-2 py-2 text-left">Notes</th>
                <th class="w-9"></th>
              </tr>
            </thead>
            <tbody>
              {#each rows as r (r.id)}
                <tr class="border-b border-[var(--border)] last:border-0">
                  <td class="py-1 pl-4 pr-2">
                    <input class="cell tnum w-[92px]" type="date" value={r.date}
                      onchange={(e) => updateRow(r, { date: e.currentTarget.value })} />
                  </td>
                  <td class="py-1 pr-2">
                    <input class="cell min-w-[85px] truncate" value={r.description}
                      onchange={(e) => updateRow(r, { description: e.currentTarget.value })} />
                  </td>
                  <td class="py-1 pr-2">
                    <input class="cell tnum w-[78px] text-right" inputmode="decimal"
                      style={r.amount > 0 ? 'color:var(--positive)' : ''}
                      value={r.amount}
                      onchange={(e) => commitAmount(r, e.currentTarget.value)} />
                  </td>
                  <td class="py-1 pr-2">
                    <CategorySelect {categories} value={String(r.category_id ?? '')}
                      triggerClass="cell min-w-[100px] max-w-[120px] text-[13px]"
                      onChange={(v) => setCategory(r, v)}
                      onCreated={() => onChanged?.()} />
                  </td>
                  <td class="py-1 pr-2">
                    <input class="cell min-w-[120px] truncate" value={r.notes || ''} placeholder="—" maxlength="280"
                      onchange={(e) => updateRow(r, { notes: e.currentTarget.value })} />
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

        <div class="sm:hidden">
          {#each rows as r (r.id)}
            <div class="border-b border-[var(--border)] last:border-0">
              <TransactionRow
                t={r}
                expanded={expandedId === r.id}
                onToggleExpand={() => (expandedId = expandedId === r.id ? null : r.id)}
                {showCategory}
                {categories}
                {currency}
                onEdit={(key, value) => commitRowField(r, key, value)}
                onCategoryChange={(v) => setCategory(r, v)}
                onDelete={() => removeRow(r.id)}
              />
            </div>
          {/each}
        </div>

        <div class="flex items-center justify-between border-t border-[var(--border)] px-4 py-2.5 text-[13px]">
          <span class="text-[var(--ink-faint)]">{rows.length} transaction{rows.length === 1 ? '' : 's'}</span>
          <span class="tnum font-medium">{formatMoney(total, currency)}</span>
        </div>
      </div>
    {/if}
  </div>
</div>
