<script>
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Icon from './Icon.svelte';
  import CategorySelect from './CategorySelect.svelte';
  import { parseAmount } from '$lib/csv.js';

  /** @type {{ data: any, form: any, onClose: () => void }} */
  let { data, form, onClose } = $props();

  const today = new Date().toISOString().slice(0, 10);
  let nextId = 1;
  function blankRow() {
    return { id: nextId++, date: today, description: '', amount: '', direction: 'out', category_id: '', notes: '' };
  }

  let rows = $state([blankRow()]);

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
      rows: rows
        .map((r) => ({ ...r, ...computed(r) }))
        .filter((r) => r.valid)
        .map((r) => ({
          date: r.date,
          description: r.description.trim(),
          amount: r.magnitude * (r.direction === 'in' ? 1 : -1),
          notes: r.notes.trim(),
          category_id: r.category_id ? Number(r.category_id) : null
        }))
    })
  );
</script>

<form method="POST" action="?/addMany" use:enhance>
  <input type="hidden" name="payload" value={payload} />

  {#if form?.error}
    <p class="mb-3 rounded-[var(--radius-sm)] px-3 py-2 text-sm" style="background:var(--negative-wash);color:var(--negative)">{form.error}</p>
  {/if}

  <div class="card card-flush">
    <div class="hidden overflow-x-auto sm:block">
      <table class="w-full text-[13px]">
        <thead>
          <tr class="border-b border-[var(--border)] text-left">
            <th class="th px-2 py-2 pl-4">Date <span style="color:var(--negative)">*</span></th>
            <th class="th px-2 py-2">Description</th>
            <th class="th px-2 py-2">Amount <span style="color:var(--negative)">*</span></th>
            <th class="th px-2 py-2">Type</th>
            <th class="th px-2 py-2">Category</th>
            <th class="th px-2 py-2">Notes</th>
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
                <CategorySelect categories={data.categories} value={r.category_id}
                  onChange={(v) => (r.category_id = v)}
                  onCreated={() => invalidateAll()} />
              </td>
              <td class="py-1 pr-2">
                <input class="cell min-w-[120px]" placeholder="—" bind:value={r.notes} maxlength="280" />
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

    <!-- mobile: a data-entry grid of blank rows, so each becomes a stacked
         card instead of a collapsible row — there's nothing to collapse -->
    <div class="sm:hidden">
      {#each rows as r (r.id)}
        {@const c = computed(r)}
        <div class="space-y-3 border-b border-[var(--border)] p-3 last:border-0">
          <div class="flex items-start justify-between gap-2">
            <span class="text-[12px] font-medium text-[var(--ink-faint)]">New transaction</span>
            <button type="button" class="rounded p-1 text-[var(--ink-faint)] hover:text-[var(--negative)]"
              aria-label="Remove row" onclick={() => removeRow(r.id)}>
              <Icon name="trash" size={14} />
            </button>
          </div>
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="label" for="mr-date-{r.id}">Date <span style="color:var(--negative)">*</span></label>
              <input class="input tnum {!r.date ? 'bad' : ''}" id="mr-date-{r.id}" type="date" bind:value={r.date} />
            </div>
            <div class="flex-1">
              <label class="label" for="mr-amt-{r.id}">Amount <span style="color:var(--negative)">*</span></label>
              <input class="input tnum text-right {r.amount !== '' && c.magnitude == null ? 'bad' : ''}"
                id="mr-amt-{r.id}" inputmode="decimal" placeholder="0.00" bind:value={r.amount} />
            </div>
          </div>
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="label" for="mr-type-{r.id}">Type</label>
              <select class="input" id="mr-type-{r.id}" bind:value={r.direction}>
                <option value="out">Out</option>
                <option value="in">In</option>
              </select>
            </div>
            <div class="flex-1">
              <span class="label">Category</span>
              <CategorySelect categories={data.categories} value={r.category_id}
                onChange={(v) => (r.category_id = v)}
                onCreated={() => invalidateAll()}
                triggerClass="input w-full" />
            </div>
          </div>
          <div>
            <label class="label" for="mr-desc-{r.id}">Description</label>
            <input class="input" id="mr-desc-{r.id}" placeholder="e.g. Supermarket" bind:value={r.description} />
          </div>
          <div>
            <label class="label" for="mr-notes-{r.id}">Notes</label>
            <input class="input" id="mr-notes-{r.id}" placeholder="—" bind:value={r.notes} maxlength="280" />
          </div>
        </div>
      {/each}
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
