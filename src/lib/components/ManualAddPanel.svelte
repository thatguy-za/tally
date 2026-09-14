<script>
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import Icon from './Icon.svelte';
  import { parseAmount } from '$lib/csv.js';

  /** @type {{ data: any, form: any, onClose: () => void }} */
  let { data, form, onClose } = $props();

  const today = new Date().toISOString().slice(0, 10);
  let nextId = 1;
  function blankRow() {
    return { id: nextId++, date: today, description: '', amount: '', direction: 'out', category_id: '' };
  }

  let rows = $state([blankRow()]);
  let accountId = $state(untrack(() => data.accounts[0]?.id ?? null));

  function addRow() {
    rows = [...rows, blankRow()];
  }
  function removeRow(id) {
    rows = rows.filter((r) => r.id !== id);
    if (!rows.length) rows = [blankRow()];
  }

  function computed(r) {
    const magnitude = r.amount === '' ? null : parseAmount(String(r.amount));
    return { magnitude, valid: !!r.date && magnitude != null };
  }

  let validCount = $derived(rows.filter((r) => computed(r).valid).length);

  let payload = $derived(
    JSON.stringify({
      accountId,
      rows: rows
        .map((r) => ({ ...r, ...computed(r) }))
        .filter((r) => r.valid)
        .map((r) => ({
          date: r.date,
          description: r.description.trim(),
          amount: r.magnitude * (r.direction === 'in' ? 1 : -1),
          category_id: r.category_id ? Number(r.category_id) : null
        }))
    })
  );
</script>

<form method="POST" action="?/addMany" use:enhance>
  <input type="hidden" name="payload" value={payload} />

  {#if form?.error}
    <p class="mb-3 rounded-[9px] px-3 py-2 text-sm" style="background:var(--negative-wash);color:var(--negative)">{form.error}</p>
  {/if}

  {#if data.accounts.length > 1}
    <div class="mb-3 flex items-center gap-2 text-[13px]">
      <span class="text-[var(--ink-faint)]">Into</span>
      <select class="input !py-1 text-xs" bind:value={accountId}>
        {#each data.accounts as a}<option value={a.id}>{a.name}</option>{/each}
      </select>
    </div>
  {/if}

  <div class="card card-flush">
    <div class="overflow-x-auto">
      <table class="w-full text-[13px]">
        <thead>
          <tr class="border-b border-[var(--border)] text-left">
            <th class="th px-2 py-2 pl-4">Date <span style="color:var(--negative)">*</span></th>
            <th class="th px-2 py-2">Description</th>
            <th class="th px-2 py-2">Amount <span style="color:var(--negative)">*</span></th>
            <th class="th px-2 py-2">Type</th>
            <th class="th px-2 py-2">Category</th>
            <th class="w-9"></th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.id)}
            {@const c = computed(r)}
            <tr class="border-b border-[var(--border)] last:border-0">
              <td class="py-1 pl-4 pr-2">
                <input class="cell tnum w-[128px] {!r.date ? 'bad' : ''}" type="date" bind:value={r.date} />
              </td>
              <td class="py-1 pr-2">
                <input class="cell min-w-[150px]" placeholder="e.g. Supermarket" bind:value={r.description} />
              </td>
              <td class="py-1 pr-2">
                <input class="cell tnum w-[92px] text-right {r.amount !== '' && c.magnitude == null ? 'bad' : ''}"
                  inputmode="decimal" placeholder="0.00" bind:value={r.amount} />
              </td>
              <td class="py-1 pr-2">
                <select class="cell" bind:value={r.direction}>
                  <option value="out">Out</option>
                  <option value="in">In</option>
                </select>
              </td>
              <td class="py-1 pr-2">
                <select class="cell min-w-[140px]" bind:value={r.category_id}>
                  <option value="">Uncategorised</option>
                  {#each data.categories as cat}<option value={String(cat.id)}>{cat.name}</option>{/each}
                </select>
              </td>
              <td class="py-1 pr-3 text-right">
                <button type="button" class="rounded p-1 text-[var(--ink-faint)] hover:text-[var(--negative)]"
                  aria-label="Remove row" onclick={() => removeRow(r.id)}>
                  <Icon name="trash" size={14} />
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="border-t border-[var(--border)] px-4 py-2">
      <button type="button" class="inline-flex items-center gap-1 text-[13px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
        onclick={addRow}>
        <Icon name="plus" size={12} /> Add row
      </button>
    </div>
  </div>

  <div class="mt-3 flex items-center gap-2">
    <button class="btn btn-primary" disabled={validCount === 0}>
      Save {validCount} transaction{validCount === 1 ? '' : 's'}
    </button>
    <button type="button" class="btn btn-ghost" onclick={onClose}>Cancel</button>
  </div>
</form>
