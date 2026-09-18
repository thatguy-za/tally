<script>
  import { enhance } from '$app/forms';
  import { formatMoney } from '$lib/currency.js';
  import Icon from '$lib/components/Icon.svelte';
  import ColorPicker from '$lib/components/ColorPicker.svelte';
  import RulesSection from '$lib/components/RulesSection.svelte';
  import { toast } from '$lib/toast.svelte.js';
  let { data, form } = $props();

  let newAccountColor = $state('#6366f1');
  const ok = (s) => form?.section === s && form?.ok;
  const err = (s) => (form?.section === s ? form?.error : null);

  const messages = {
    currency: 'Currency saved',
    dateFormat: 'Date format saved',
    account: 'Account saved',
    rule: 'Rules updated',
    username: 'Username updated',
    password: 'Password updated',
    danger: 'Done',
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

<div class="mb-7">
  <p class="kicker mb-2">Settings</p>
  <h1 class="text-3xl" style="font-family:var(--font-display)">Make it yours</h1>
</div>

<div class="space-y-4">
  <!-- Currency -->
  <div class="card">
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

  <!-- Date format -->
  <div class="card">
    <h2 class="text-lg">Date format</h2>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">
      How ambiguous numeric dates (e.g. 03/04/2026) are read when importing a CSV.
    </p>
    <form method="POST" action="?/dateFormat" use:enhance class="flex flex-wrap items-center gap-3">
      <select class="input max-w-xs" name="date_format" value={data.dateFormat}>
        {#each data.dateFormats as d}<option value={d.value}>{d.label}</option>{/each}
      </select>
      <button class="btn btn-primary">Save</button>
      {#if ok('dateFormat')}<span class="text-sm" style="color:var(--positive)">Saved</span>{/if}
      {#if err('dateFormat')}<span class="text-sm" style="color:var(--negative)">{err('dateFormat')}</span>{/if}
    </form>
  </div>

  <!-- Accounts -->
  <div class="card">
    <h2 class="text-lg">Accounts</h2>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">
      Track more than one bank account — a current account and a savings account, say. Choose
      which one a transaction belongs to when you add or import it.
    </p>
    <ul class="mb-4 divide-y divide-[var(--border)]">
      {#each data.accounts as a}
        <li class="flex items-center justify-between gap-3 py-2 text-[13px]">
          <form method="POST" action="?/renameAccount" use:enhance class="flex min-w-0 flex-1 items-center gap-2">
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="color" id="acct-color-{a.id}" value={a.color} />
            <ColorPicker
              value={a.color}
              size="h-6 w-6"
              label="Colour for {a.name}"
              onchange={(c) => {
                const input = document.getElementById(`acct-color-${a.id}`);
                input.value = c;
                input.form?.requestSubmit();
              }}
            />
            <input name="name" value={a.name} class="cell min-w-0 flex-1 text-[13px]"
              aria-label="Name for this account"
              onchange={(e) => e.currentTarget.form.requestSubmit()} />
          </form>
          <span class="flex items-center gap-3">
            <span class="text-xs text-[var(--ink-faint)]">{a.count} tx</span>
            <form method="POST" action="?/deleteAccount" use:enhance
              onsubmit={(e) => { if (a.count && !confirm(`${a.count} transactions will become unassigned. Continue?`)) e.preventDefault(); }}>
              <input type="hidden" name="id" value={a.id} />
              <button class="text-[var(--ink-faint)] hover:text-[var(--negative)]" title="Delete"><Icon name="trash" size={14} /></button>
            </form>
          </span>
        </li>
      {:else}
        <li class="py-2 text-sm text-[var(--ink-faint)]">No accounts yet.</li>
      {/each}
    </ul>
    <form method="POST" action="?/addAccount" use:enhance class="flex flex-wrap items-end gap-3">
      <div>
        <label class="label" for="acc-name">New account</label>
        <input class="input" id="acc-name" name="name" placeholder="e.g. Savings" required />
      </div>
      <div>
        <span class="label">Colour</span>
        <input type="hidden" name="color" value={newAccountColor} />
        <ColorPicker bind:value={newAccountColor} size="h-[38px] w-14 rounded-[var(--radius-sm)]" label="Colour for new account" />
      </div>
      <button class="btn btn-primary">Add</button>
      {#if err('account')}<span class="text-sm" style="color:var(--negative)">{err('account')}</span>{/if}
    </form>
  </div>

  <!-- Auto-categorisation rules -->
  <RulesSection categories={data.categories} rules={data.rules} />

  <!-- AI categorisation opt-in (any user, when enabled) -->
  {#if data.aiAvailable}
    <div class="card">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="flex items-center gap-2 text-lg">
            <Icon name="sparkle" size={16} class="text-[var(--accent)]" /> AI categorisation
          </h2>
          <p class="mt-1 max-w-lg text-[13px] text-[var(--ink-faint)]">
            On by default. AI sorts transactions into <em>your</em> categories when you
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

  <!-- Username -->
  <div class="card">
    <h2 class="text-lg">Username</h2>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">Used to sign in. Can be anything — even an email address.</p>
    <form method="POST" action="?/username" use:enhance class="flex max-w-md flex-wrap items-center gap-3">
      <input class="input flex-1" name="username" type="text" autocomplete="username"
        value={data.username} required />
      <button class="btn btn-primary">Save</button>
      {#if err('username')}<span class="text-sm" style="color:var(--negative)">{err('username')}</span>{/if}
    </form>
  </div>

  <!-- Password -->
  <div class="card">
    <h2 class="text-lg">Change password</h2>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">Signed in as {data.username}</p>
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

  <!-- Danger zone -->
  <div class="card" style="border-color:var(--negative)">
    <h2 class="text-lg" style="color:var(--negative)">Danger zone</h2>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">
      Permanently delete every transaction on this account. Categories, accounts and rules are kept.
    </p>
    <form method="POST" action="?/deleteAllTransactions" use:enhance
      onsubmit={(e) => {
        if (!confirm('Delete ALL of your transactions? This cannot be undone.')) e.preventDefault();
      }}>
      <button class="btn" style="background:var(--negative-wash);color:var(--negative)">Delete all transactions</button>
      {#if ok('danger')}<span class="ml-3 text-sm" style="color:var(--positive)">{form.msg}</span>{/if}
    </form>
  </div>

  {#if data.isAdmin}
    <a href="/settings/server" class="nudge">
      <Icon name="settings" size={16} class="text-[var(--accent)]" />
      <span>Server settings — users &amp; AI assistant</span>
      <Icon name="arrowRight" size={14} class="ml-auto text-[var(--ink-faint)]" />
    </a>
  {/if}
</div>
