<script>
  import { enhance } from '$app/forms';
  import Icon from '$lib/components/Icon.svelte';
  import ColorPicker from '$lib/components/ColorPicker.svelte';
  import { PALETTE } from '$lib/palette.js';
  import { toast } from '$lib/toast.svelte.js';
  let { data, form } = $props();

  let newColor = $state('#7b8a5a');
  const ok = (s) => form?.section === s && form?.ok;
  const err = (s) => (form?.section === s ? form?.error : null);

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
      if (form?.ok) toast(form.msg || messages[form.section] || 'Saved');
      else if (form?.error) toast(form.error, { type: 'info' });
    }
  });

  // ---- AI suggestions ---------------------------------------------------
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
  {#if data.aiAvailable}
    <div class="card rise rise-1">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="flex items-center gap-2 text-lg">
            <Icon name="sparkle" size={16} class="text-[var(--accent)]" /> Generate with AI
          </h2>
          <p class="mt-1 max-w-lg text-[13px] text-[var(--ink-faint)]">
            Looks at your own transaction history and suggests categories your current list doesn't cover yet.
          </p>
        </div>
        <form method="POST" action="?/suggest" use:enhance={suggestSubmit}>
          <button class="btn btn-primary" disabled={suggesting}>{suggesting ? 'Thinking…' : 'Generate categories'}</button>
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

  <div class="card rise rise-2">
    <h2 class="text-lg">Categories</h2>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">
      Money in a <b>Savings</b> category counts as money you kept, not money you spent — it stays
      out of your spending totals and is tracked separately. If you track more than one account,
      use <b>Transfer</b> for the receiving side of a move between them (e.g. money arriving in a
      savings account you also import) so it isn't counted as new income. Use <b>Opening balance</b>
      for the starting balance a bank statement often includes when you begin tracking an account —
      it's excluded from income and spending too.
    </p>
    <ul class="mb-4 divide-y divide-[var(--border)]">
      {#each data.categories as c}
        <li class="flex items-center justify-between gap-3 py-2 text-[13px]">
          <span class="flex min-w-0 items-center gap-2">
            <form method="POST" action="?/categoryColor" use:enhance>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="color" id="cat-color-{c.id}" value={c.color} />
              <ColorPicker value={c.color} size="h-5 w-5" label="Colour for {c.name}"
                onchange={(col) => {
                  const input = document.getElementById(`cat-color-${c.id}`);
                  input.value = col;
                  input.form?.requestSubmit();
                }} />
            </form>
            <span class="truncate">{c.name}</span>
            <form method="POST" action="?/categoryKind" use:enhance>
              <input type="hidden" name="id" value={c.id} />
              <select name="kind" class="cell text-[12px]" value={c.kind}
                aria-label="What kind of category {c.name} is"
                onchange={(e) => e.currentTarget.form.requestSubmit()}>
                <option value="expense">Spending</option>
                <option value="income">Income</option>
                <option value="saving">Savings</option>
                <option value="transfer">Transfer</option>
                <option value="opening_balance">Opening balance</option>
              </select>
            </form>
          </span>
          <span class="flex items-center gap-3">
            <span class="text-xs text-[var(--ink-faint)]">{c.count} tx</span>
            <form method="POST" action="?/deleteCategory" use:enhance
              onsubmit={(e) => { if (c.count && !confirm(`${c.count} transactions will become uncategorised. Continue?`)) e.preventDefault(); }}>
              <input type="hidden" name="id" value={c.id} />
              <button class="text-[var(--ink-faint)] hover:text-[var(--negative)]" title="Delete"><Icon name="trash" size={14} /></button>
            </form>
          </span>
        </li>
      {/each}
    </ul>
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
</div>
