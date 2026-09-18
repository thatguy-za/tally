<script>
  import { enhance } from '$app/forms';
  import Icon from '$lib/components/Icon.svelte';
  import ColorPicker from '$lib/components/ColorPicker.svelte';
  import RulesSection from '$lib/components/RulesSection.svelte';
  import { PALETTE } from '$lib/palette.js';
  import { toast } from '$lib/toast.svelte.js';
  let { data, form } = $props();

  let newColor = $state('#7b8a5a');
  let editingId = $state(null);
  let editColor = $state('#64748b');
  const ok = (s) => form?.section === s && form?.ok;
  const err = (s) => (form?.section === s ? form?.error : null);

  function startEdit(c) {
    editingId = c.id;
    editColor = c.color;
  }

  const kindLabel = {
    expense: 'Spending',
    income: 'Income',
    saving: 'Savings',
    transfer: 'Transfer',
    opening_balance: 'Opening balance'
  };

  const messages = { category: 'Categories updated' };
  let seenForm;
  $effect(() => {
    if (form === seenForm) return;
    seenForm = form;
    if (form?.section === 'category') {
      if (form?.ok) {
        toast(form.msg || messages[form.section] || 'Saved');
        editingId = null;
      } else if (form?.error) toast(form.error, { type: 'info' });
    }
  });

  // ---- AI suggestions ---------------------------------------------------
  let showSuggest = $state(false);
  let suggesting = $state(false);
  let suggestions = $state(null); // [{name, kind, color, picked}]
  let suggestError = $state('');
  let addingPicks = $state(false);

  function suggestSubmit() {
    suggesting = true;
    suggestError = '';
    return async ({ result }) => {
      suggesting = false;
      if (result.type === 'success' && result.data?.ok) {
        const picks = result.data.suggestions || [];
        suggestions = picks.map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length], picked: true }));
        if (!suggestions.length) suggestError = "Nothing new to suggest — your categories already cover it.";
      } else {
        suggestError = result.data?.error || 'Could not generate suggestions.';
      }
    };
  }

  let pickedCount = $derived(suggestions ? suggestions.filter((s) => s.picked).length : 0);
  let picksPayload = $derived(
    JSON.stringify((suggestions || []).filter((s) => s.picked).map(({ name, kind, color }) => ({ name, kind, color })))
  );

  function addSuggestedSubmit() {
    addingPicks = true;
    return async ({ result }) => {
      addingPicks = false;
      if (result.type === 'success') {
        toast(result.data?.msg || 'Categories added');
        suggestions = null;
      } else {
        toast(result.data?.error || 'Could not add categories.', { type: 'info' });
      }
    };
  }
</script>

<svelte:head><title>Categories · Tally</title></svelte:head>

<div class="mb-7 rise">
  <p class="kicker mb-2">Categories</p>
  <h1 class="text-3xl" style="font-family:var(--font-display)">Sort your money</h1>
</div>

<div class="space-y-4">
  <div class="card rise rise-2">
    <div class="mb-1 flex flex-wrap items-start justify-between gap-3">
      <h2 class="text-lg">Categories</h2>
      {#if data.aiAvailable}
        <button type="button" class="flex items-center gap-1.5 text-[12px] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
          onclick={() => (showSuggest = !showSuggest)}>
          <Icon name="sparkle" size={12} class="text-[var(--accent)]" /> Generate with AI
        </button>
      {/if}
    </div>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">
      Money in a <b>Savings</b> category counts as money you kept, not money you spent — it stays
      out of your spending totals and is tracked separately. If you track more than one account,
      use <b>Transfer</b> for the receiving side of a move between them (e.g. money arriving in a
      savings account you also import) so it isn't counted as new income. Use <b>Opening balance</b>
      for the starting balance a bank statement often includes when you begin tracking an account —
      it's excluded from income and spending too.
    </p>

    {#if showSuggest}
      <div class="mb-4 rounded-[10px] border border-[var(--border)] p-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="max-w-lg text-[13px] text-[var(--ink-faint)]">
            Looks at your own transaction history and suggests categories your current list doesn't cover yet.
          </p>
          <form method="POST" action="?/suggest" use:enhance={suggestSubmit}>
            <button class="btn btn-ghost btn-sm" disabled={suggesting}>{suggesting ? 'Thinking…' : 'Generate categories'}</button>
          </form>
        </div>

        {#if suggestError}
          <p class="mt-3 text-sm" style="color:var(--negative)">{suggestError}</p>
        {/if}

        {#if suggestions?.length}
          <div class="mt-4 border-t border-[var(--border)] pt-4">
            <ul class="mb-3 divide-y divide-[var(--border)]">
              {#each suggestions as s}
                <li class="flex items-center gap-3 py-2 text-[13px]">
                  <label class="flex flex-1 items-center gap-2.5">
                    <input type="checkbox" bind:checked={s.picked} />
                    <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:{s.color}"></span>
                    <span>{s.name}</span>
                    <span class="text-xs text-[var(--ink-faint)]">{kindLabel[s.kind] || s.kind}</span>
                  </label>
                </li>
              {/each}
            </ul>
            <form method="POST" action="?/addSuggested" use:enhance={addSuggestedSubmit} class="flex items-center gap-3">
              <input type="hidden" name="picks" value={picksPayload} />
              <button class="btn btn-primary" disabled={!pickedCount || addingPicks}>
                {addingPicks ? 'Adding…' : `Add ${pickedCount} categor${pickedCount === 1 ? 'y' : 'ies'}`}
              </button>
              <button type="button" class="btn btn-ghost" onclick={() => (suggestions = null)}>Dismiss</button>
            </form>
          </div>
        {/if}
      </div>
    {/if}
    <div class="mb-4 overflow-x-auto rounded-[10px] border border-[var(--border)]">
      <table class="w-full text-[13px]">
        <thead>
          <tr class="border-b border-[var(--border)] text-left">
            <th class="th px-3 py-2">Name</th>
            <th class="th px-3 py-2">Type</th>
            <th class="th px-3 py-2 text-right">Transactions</th>
            <th class="w-16"></th>
          </tr>
        </thead>
        <tbody>
          {#each data.categories as c (c.id)}
            {#if editingId === c.id}
              <tr class="border-b border-[var(--border)] last:border-0">
                <td colspan="4" class="p-3" style="background:var(--paper-sunk)">
                  <form method="POST" action="?/updateCategory" use:enhance class="grid gap-2 sm:grid-cols-6">
                    <input type="hidden" name="id" value={c.id} />
                    <div class="flex items-center gap-2 sm:col-span-2">
                      <input type="hidden" name="color" value={editColor} />
                      <ColorPicker bind:value={editColor} size="h-[38px] w-10 shrink-0 rounded-[9px]" label="Colour for {c.name}" />
                      <input class="input min-w-0 flex-1" name="name" value={c.name} required />
                    </div>
                    <select class="input sm:col-span-2" name="kind" value={c.kind}>
                      <option value="expense">Spending</option>
                      <option value="income">Income</option>
                      <option value="saving">Savings</option>
                      <option value="transfer">Transfer</option>
                      <option value="opening_balance">Opening balance</option>
                    </select>
                    <div class="flex items-center gap-2 sm:col-span-2">
                      <button class="btn btn-primary btn-sm">Save</button>
                      <button type="button" class="btn btn-ghost btn-sm" onclick={() => (editingId = null)}>Cancel</button>
                    </div>
                  </form>
                </td>
              </tr>
            {:else}
              <tr class="group border-b border-[var(--border)] last:border-0 transition-colors hover:bg-[var(--paper-sunk)]/60">
                <td class="px-3 py-2.5">
                  <span class="flex min-w-0 items-center gap-2">
                    <span class="dot shrink-0" style="background:{c.color}"></span>
                    <span class="truncate font-medium">{c.name}</span>
                  </span>
                </td>
                <td class="px-3 py-2.5 text-[var(--ink-faint)]">{kindLabel[c.kind] || c.kind}</td>
                <td class="px-3 py-2.5 text-right tnum text-[var(--ink-faint)]">{c.count}</td>
                <td class="px-3 py-2.5">
                  <div class="flex justify-end gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <button type="button" class="tip rounded p-1 text-[var(--ink-faint)] hover:text-[var(--ink)]"
                      data-tip="Edit" aria-label="Edit {c.name}" onclick={() => startEdit(c)}>
                      <Icon name="edit" size={14} />
                    </button>
                    <form method="POST" action="?/deleteCategory" use:enhance
                      onsubmit={(e) => { if (c.count && !confirm(`${c.count} transactions will become uncategorised. Continue?`)) e.preventDefault(); }}>
                      <input type="hidden" name="id" value={c.id} />
                      <button class="tip rounded p-1 text-[var(--ink-faint)] hover:text-[var(--negative)]"
                        data-tip="Delete" aria-label="Delete {c.name}">
                        <Icon name="trash" size={14} />
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
    <form method="POST" action="?/addCategory" use:enhance class="flex flex-wrap items-end gap-3">
      <div>
        <label class="label" for="c-name">New category</label>
        <input class="input" id="c-name" name="name" placeholder="e.g. Childcare" required />
      </div>
      <div>
        <label class="label" for="c-kind">Type</label>
        <select class="input" id="c-kind" name="kind">
          <option value="expense">Spending</option>
          <option value="income">Income</option>
          <option value="saving">Savings</option>
          <option value="transfer">Transfer</option>
          <option value="opening_balance">Opening balance</option>
        </select>
      </div>
      <div>
        <span class="label">Colour</span>
        <input type="hidden" name="color" value={newColor} />
        <ColorPicker bind:value={newColor} size="h-[38px] w-14 rounded-[9px]" label="Colour for new category" />
      </div>
      <button class="btn btn-primary">Add</button>
      {#if err('category')}<span class="text-sm" style="color:var(--negative)">{err('category')}</span>{/if}
    </form>
  </div>

  <div class="rise rise-3">
    <RulesSection categories={data.categories} rules={data.rules} />
  </div>
</div>
