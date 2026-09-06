<script>
  import { enhance } from '$app/forms';
  import { formatMoney } from '$lib/currency.js';
  let { data, form } = $props();

  let newColor = $state('#64748b');
  let resettingUser = $state(null);
  const ok = (s) => form?.section === s && form?.ok;
  const err = (s) => (form?.section === s ? form?.error : null);
</script>

<svelte:head><title>Settings · Budget</title></svelte:head>

<h1 class="mb-6 text-2xl font-bold">Settings</h1>

<div class="space-y-4">
  <!-- Currency -->
  <div class="card">
    <h2 class="font-semibold">Currency</h2>
    <p class="mb-4 text-sm text-slate-500">
      Display formatting only (single currency per user). Preview: {formatMoney(1234.5, data.currency)}
    </p>
    <form method="POST" action="?/currency" use:enhance class="flex flex-wrap items-end gap-3">
      <select class="input max-w-xs" name="currency" value={data.currency}>
        {#each data.currencies as c}<option value={c.code}>{c.label}</option>{/each}
      </select>
      <button class="btn-primary">Save</button>
      {#if ok('currency')}<span class="text-sm text-emerald-600">Saved</span>{/if}
      {#if err('currency')}<span class="text-sm text-rose-600">{err('currency')}</span>{/if}
    </form>
  </div>

  <!-- Categories -->
  <div class="card">
    <h2 class="mb-4 font-semibold">Categories</h2>
    <ul class="mb-4 divide-y divide-slate-100">
      {#each data.categories as c}
        <li class="flex items-center justify-between py-2 text-sm">
          <span class="flex items-center gap-2">
            <span class="h-3 w-3 rounded-full" style="background:{c.color}"></span>
            {c.name}
            <span class="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{c.kind}</span>
          </span>
          <span class="flex items-center gap-3">
            <span class="text-xs text-slate-400">{c.count} tx</span>
            <form method="POST" action="?/deleteCategory" use:enhance
              onsubmit={(e) => { if (c.count && !confirm(`${c.count} transactions will become uncategorised. Continue?`)) e.preventDefault(); }}>
              <input type="hidden" name="id" value={c.id} />
              <button class="text-slate-400 hover:text-rose-600" title="Delete">🗑️</button>
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
        <input class="h-[38px] w-14 rounded-lg border border-slate-200 bg-white p-1"
          id="c-color" name="color" type="color" bind:value={newColor} />
      </div>
      <button class="btn-primary">Add</button>
      {#if err('category')}<span class="text-sm text-rose-600">{err('category')}</span>{/if}
    </form>
  </div>

  <!-- Auto-categorisation rules -->
  <div class="card">
    <div class="mb-1 flex items-center justify-between">
      <h2 class="font-semibold">Auto-categorisation rules</h2>
      <form method="POST" action="?/applyRules" use:enhance>
        <input type="hidden" name="scope" value="uncategorised" />
        <button class="btn-ghost !py-1.5 text-xs">Run on uncategorised</button>
      </form>
    </div>
    <p class="mb-4 text-sm text-slate-500">
      If a description contains the text, the transaction gets that category — applied on import,
      on manual entry, and whenever you run them. Higher priority wins.
    </p>
    {#if ok('rule')}
      <p class="mb-3 text-sm text-emerald-600">
        Saved{form?.applied ? ` · ${form.applied} transaction(s) categorised` : ''}
      </p>
    {/if}
    <ul class="mb-4 divide-y divide-slate-100">
      {#each data.rules as r}
        <li class="flex items-center justify-between py-2 text-sm">
          <span>
            “{r.match_text}” →
            <span class="font-medium" style="color:{r.category_color}">{r.category_name}</span>
            {#if r.priority}<span class="ml-1 text-xs text-slate-400">p{r.priority}</span>{/if}
          </span>
          <form method="POST" action="?/deleteRule" use:enhance>
            <input type="hidden" name="id" value={r.id} />
            <button class="text-slate-400 hover:text-rose-600">🗑️</button>
          </form>
        </li>
      {:else}
        <li class="py-2 text-sm text-slate-400">No rules yet.</li>
      {/each}
    </ul>
    <form method="POST" action="?/addRule" use:enhance class="flex flex-wrap items-end gap-3">
      <div class="flex-1 min-w-[160px]">
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
        <input class="input" id="r-pri" name="priority" type="number" value="0" />
      </div>
      <button class="btn-primary">Add rule</button>
      {#if err('rule')}<span class="text-sm text-rose-600">{err('rule')}</span>{/if}
    </form>
  </div>

  <!-- Password -->
  <div class="card">
    <h2 class="font-semibold">Change password</h2>
    <p class="mb-4 text-sm text-slate-500">Signed in as {data.email}</p>
    <form method="POST" action="?/password" use:enhance class="grid max-w-md gap-3">
      <input class="input" name="current" type="password" placeholder="Current password" autocomplete="current-password" required />
      <input class="input" name="next" type="password" placeholder="New password" autocomplete="new-password" minlength="8" required />
      <input class="input" name="confirm" type="password" placeholder="Confirm new password" autocomplete="new-password" minlength="8" required />
      <div class="flex items-center gap-3">
        <button class="btn-primary">Update password</button>
        {#if ok('password')}<span class="text-sm text-emerald-600">Password updated</span>{/if}
        {#if err('password')}<span class="text-sm text-rose-600">{err('password')}</span>{/if}
      </div>
    </form>
  </div>

  <!-- Admin -->
  {#if data.isAdmin}
    <div class="card">
      <h2 class="mb-1 font-semibold">Users <span class="text-xs font-normal text-slate-400">(admin)</span></h2>
      <p class="mb-4 text-sm text-slate-500">Reset a password, grant admin, or remove an account.</p>
      {#if form?.section === 'admin' && form?.msg}
        <p class="mb-3 text-sm text-emerald-600">{form.msg}</p>
      {/if}
      {#if err('admin')}<p class="mb-3 text-sm text-rose-600">{err('admin')}</p>{/if}
      <ul class="divide-y divide-slate-100">
        {#each data.users as u}
          <li class="py-2.5 text-sm">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-medium">
                {u.email}
                {#if u.is_admin}<span class="ml-1 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">admin</span>{/if}
              </span>
              <div class="flex items-center gap-3 text-xs">
                <button class="text-slate-500 hover:underline"
                  onclick={() => (resettingUser = resettingUser === u.id ? null : u.id)}>
                  Reset password
                </button>
                <form method="POST" action="?/setAdmin" use:enhance>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="admin" value={u.is_admin ? '0' : '1'} />
                  <button class="text-slate-500 hover:underline">{u.is_admin ? 'Revoke admin' : 'Make admin'}</button>
                </form>
                {#if u.id !== data.myId}
                  <form method="POST" action="?/deleteUser" use:enhance
                    onsubmit={(e) => { if (!confirm(`Delete ${u.email} and all their data?`)) e.preventDefault(); }}>
                    <input type="hidden" name="id" value={u.id} />
                    <button class="text-rose-600 hover:underline">Delete</button>
                  </form>
                {/if}
              </div>
            </div>
            {#if resettingUser === u.id}
              <form method="POST" action="?/resetUserPassword" use:enhance class="mt-2 flex gap-2"
                onsubmit={() => (resettingUser = null)}>
                <input type="hidden" name="id" value={u.id} />
                <input class="input max-w-xs" name="new_password" type="text"
                  placeholder="New password (min 8 chars)" minlength="8" required />
                <button class="btn-primary !py-1.5">Set</button>
              </form>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
