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
  let addingNew = $state(false);
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
        addingNew = false;
        newColor = '#7b8a5a';
      } else if (form?.error) toast(form.error, { type: 'info' });
    }
  });

  // ---- AI suggestions ---------------------------------------------------
  let suggesting = $state(false);
  let suggestions = $state(null); // [{name, kind, color, picked}]
  let addingPicks = $state(false);

  function suggestSubmit() {
    suggesting = true;
    return async ({ result }) => {
      suggesting = false;
      if (result.type === 'success' && result.data?.ok) {
        const picks = result.data.suggestions || [];
        if (!picks.length) {
          toast("Nothing new to suggest — your categories already cover it.", { type: 'info' });
          return;
        }
        suggestions = picks.map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length], picked: true }));
      } else {
        toast(result.data?.error || 'Could not generate suggestions.', { type: 'info' });
      }
    };
  }

  function onWindowKey(e) {
    if (e.key === 'Escape' && suggestions) suggestions = null;
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
        <form method="POST" action="?/suggest" use:enhance={suggestSubmit}>
          <button class="btn btn-ghost btn-sm flex items-center gap-1.5" disabled={suggesting}>
            <Icon name="sparkle" size={13} class="text-[var(--accent)]" />
            {suggesting ? 'Generating categories…' : 'Generate categories with AI'}
          </button>
        </form>
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
          {#if addingNew}
            <tr class="border-b border-[var(--border)] last:border-0">
              <td colspan="4" class="p-3" style="background:var(--paper-sunk)">
                <form method="POST" action="?/addCategory" use:enhance class="grid gap-2 sm:grid-cols-6">
                  <div class="flex items-center gap-2 sm:col-span-2">
                    <input type="hidden" name="color" value={newColor} />
                    <ColorPicker bind:value={newColor} size="h-[38px] w-10 shrink-0 rounded-[9px]" label="Colour for new category" />
                    <input class="input min-w-0 flex-1" name="name" placeholder="e.g. Childcare" required />
                  </div>
                  <select class="input sm:col-span-2" name="kind">
                    <option value="expense">Spending</option>
                    <option value="income">Income</option>
                    <option value="saving">Savings</option>
                    <option value="transfer">Transfer</option>
                    <option value="opening_balance">Opening balance</option>
                  </select>
                  <div class="flex items-center gap-2 sm:col-span-2">
                    <button class="btn btn-primary btn-sm">Add</button>
                    <button type="button" class="btn btn-ghost btn-sm" onclick={() => (addingNew = false)}>Cancel</button>
                    {#if err('category')}<span class="text-sm" style="color:var(--negative)">{err('category')}</span>{/if}
                  </div>
                </form>
              </td>
            </tr>
          {:else}
            <tr class="border-b border-[var(--border)] last:border-0">
              <td colspan="4" class="p-0">
                <button type="button" class="flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-[13px] text-[var(--accent-strong)] hover:bg-[var(--paper-sunk)]"
                  onclick={() => (addingNew = true)}>
                  <Icon name="plus" size={13} /> Add category
                </button>
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <div class="rise rise-3">
    <RulesSection categories={data.categories} rules={data.rules} />
  </div>
</div>

{#if suggestions}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="AI category suggestions">
    <div class="card w-full max-w-lg self-start rise max-h-[85vh] overflow-y-auto">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div>
          <p class="kicker mb-1 flex items-center gap-1.5">
            <Icon name="sparkle" size={12} class="text-[var(--accent)]" /> AI suggestions
          </p>
          <h2 class="text-xl" style="font-family:var(--font-display)">New categories</h2>
        </div>
        <button
          class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
          onclick={() => (suggestions = null)}
          aria-label="Close"
        >
          <Icon name="x" size={16} />
        </button>
      </div>
      <p class="mb-3 text-[13px] text-[var(--ink-faint)]">
        Based on your own transaction history — pick the ones worth keeping.
      </p>
      <ul class="mb-4 divide-y divide-[var(--border)]">
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
        <button type="button" class="btn btn-ghost" onclick={() => (suggestions = null)}>Cancel</button>
      </form>
    </div>
  </div>
{/if}

<svelte:window onkeydown={onWindowKey} />
