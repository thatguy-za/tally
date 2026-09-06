<script>
  import { enhance } from '$app/forms';
  import { formatMoney } from '$lib/currency.js';
  import Icon from '$lib/components/Icon.svelte';
  import { toast } from '$lib/toast.svelte.js';
  let { data, form } = $props();

  let newColor = $state('#7b8a5a');
  const ok = (s) => form?.section === s && form?.ok;
  const err = (s) => (form?.section === s ? form?.error : null);

  const messages = {
    currency: 'Currency saved',
    category: 'Categories updated',
    rule: 'Rules updated',
    password: 'Password updated',
    aiuser: 'Preference saved'
  };
  let seenForm;
  $effect(() => {
    if (form === seenForm) return;
    seenForm = form;
    if (form?.ok) toast(form.msg || messages[form.section] || 'Saved');
    else if (form?.error) toast(form.error, { type: 'info' });
  });
</script>

<svelte:head><title>Settings · Tally</title></svelte:head>

<div class="mb-7 rise">
  <p class="kicker mb-2">Settings</p>
  <h1 class="text-3xl" style="font-family:var(--font-display)">Make it yours</h1>
</div>

<div class="space-y-4">
  <!-- Currency -->
  <div class="card rise rise-1">
    <h2 class="text-lg">Currency</h2>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">
      Display formatting only (single currency per user). Preview: <span class="tnum">{formatMoney(1234.5, data.currency)}</span>
    </p>
    <form method="POST" action="?/currency" use:enhance class="flex flex-wrap items-center gap-3">
      <select class="input max-w-xs" name="currency" value={data.currency}>
        {#each data.currencies as c}<option value={c.code}>{c.label}</option>{/each}
      </select>
      <button class="btn btn-primary">Save</button>
      {#if ok('currency')}<span class="text-sm" style="color:var(--positive)">Saved</span>{/if}
      {#if err('currency')}<span class="text-sm" style="color:var(--negative)">{err('currency')}</span>{/if}
    </form>
  </div>

  <!-- Categories -->
  <div class="card rise rise-2">
    <h2 class="mb-4 text-lg">Categories</h2>
    <ul class="mb-4 divide-y divide-[var(--border)]">
      {#each data.categories as c}
        <li class="flex items-center justify-between py-2 text-[13px]">
          <span class="flex items-center gap-2">
            <span class="dot" style="background:{c.color}"></span>
            {c.name}
            <span class="chip">{c.kind}</span>
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
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
      </div>
      <div>
        <label class="label" for="c-color">Colour</label>
        <input class="h-[38px] w-14 rounded-[9px] border border-[var(--border-strong)] bg-[var(--surface)] p-1"
          id="c-color" name="color" type="color" bind:value={newColor} />
      </div>
      <button class="btn btn-primary">Add</button>
      {#if err('category')}<span class="text-sm" style="color:var(--negative)">{err('category')}</span>{/if}
    </form>
  </div>

  <!-- Auto-categorisation rules -->
  <div class="card rise rise-3">
    <div class="mb-1 flex items-center justify-between">
      <h2 class="text-lg">Auto-categorisation rules</h2>
      <form method="POST" action="?/applyRules" use:enhance>
        <input type="hidden" name="scope" value="uncategorised" />
        <button class="btn btn-ghost btn-sm">Run on uncategorised</button>
      </form>
    </div>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">
      If a description contains the text, the transaction gets that category — applied on import,
      on manual entry, and whenever you run them. Higher priority wins.
    </p>
    {#if ok('rule')}
      <p class="mb-3 text-sm" style="color:var(--positive)">
        Saved{form?.applied ? ` · ${form.applied} transaction(s) categorised` : ''}
      </p>
    {/if}
    <ul class="mb-4 divide-y divide-[var(--border)]">
      {#each data.rules as r}
        <li class="flex items-center justify-between py-2 text-[13px]">
          <span>
            “{r.match_text}” →
            <span class="font-medium" style="color:{r.category_color}">{r.category_name}</span>
            {#if r.priority}<span class="ml-1 text-xs text-[var(--ink-faint)]">p{r.priority}</span>{/if}
          </span>
          <form method="POST" action="?/deleteRule" use:enhance>
            <input type="hidden" name="id" value={r.id} />
            <button class="text-[var(--ink-faint)] hover:text-[var(--negative)]"><Icon name="trash" size={14} /></button>
          </form>
        </li>
      {:else}
        <li class="py-2 text-sm text-[var(--ink-faint)]">No rules yet.</li>
      {/each}
    </ul>
    <form method="POST" action="?/addRule" use:enhance class="flex flex-wrap items-end gap-3">
      <div class="min-w-[160px] flex-1">
        <label class="label" for="r-match">Description contains</label>
        <input class="input" id="r-match" name="match_text" placeholder="e.g. SPAR" required />
      </div>
      <div>
        <label class="label" for="r-cat">Category</label>
        <select class="input" id="r-cat" name="category_id" required>
          <option value="">Choose…</option>
          {#each data.categories as c}<option value={c.id}>{c.name}</option>{/each}
        </select>
      </div>
      <div class="w-20">
        <label class="label" for="r-pri">Priority</label>
        <input class="input tnum" id="r-pri" name="priority" type="number" value="0" />
      </div>
      <button class="btn btn-primary">Add rule</button>
      {#if err('rule')}<span class="text-sm" style="color:var(--negative)">{err('rule')}</span>{/if}
    </form>
  </div>

  <!-- AI categorisation opt-in (any user, when enabled) -->
  {#if data.aiAvailable}
    <div class="card rise rise-3">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="flex items-center gap-2 text-lg">
            <Icon name="sparkle" size={16} class="text-[var(--accent)]" /> AI categorisation
          </h2>
          <p class="mt-1 max-w-lg text-[13px] text-[var(--ink-faint)]">
            On by default. Claude sorts transactions into <em>your</em> categories when you
            import a CSV. Turn it off to keep your data away from the API entirely.
          </p>
        </div>
        <form method="POST" action="?/aiCategorise" use:enhance>
          <input type="hidden" name="on" value={data.aiCategorise ? '0' : '1'} />
          <button class="btn {data.aiCategorise ? 'btn-primary' : 'btn-ghost'}">
            {data.aiCategorise ? 'On' : 'Off'}
          </button>
        </form>
      </div>
    </div>
  {/if}

  <!-- Password -->
  <div class="card rise rise-4">
    <h2 class="text-lg">Change password</h2>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">Signed in as {data.email}</p>
    <form method="POST" action="?/password" use:enhance class="grid max-w-md gap-3">
      <input class="input" name="current" type="password" placeholder="Current password" autocomplete="current-password" required />
      <input class="input" name="next" type="password" placeholder="New password" autocomplete="new-password" minlength="8" required />
      <input class="input" name="confirm" type="password" placeholder="Confirm new password" autocomplete="new-password" minlength="8" required />
      <div class="flex items-center gap-3">
        <button class="btn btn-primary">Update password</button>
        {#if ok('password')}<span class="text-sm" style="color:var(--positive)">Password updated</span>{/if}
        {#if err('password')}<span class="text-sm" style="color:var(--negative)">{err('password')}</span>{/if}
      </div>
    </form>
  </div>

  {#if data.isAdmin}
    <a href="/settings/server" class="nudge rise rise-5">
      <Icon name="settings" size={16} class="text-[var(--accent)]" />
      <span>Server settings — users &amp; AI assistant</span>
      <Icon name="arrowRight" size={14} class="ml-auto text-[var(--ink-faint)]" />
    </a>
  {/if}
</div>
