<script>
  import { confirmSubmit } from '$lib/actions/confirm-submit.js';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { formatMoney } from '$lib/currency.js';
  import Icon from '$lib/components/Icon.svelte';
  import ColorPicker from '$lib/components/ColorPicker.svelte';
  import RulesSection from '$lib/components/RulesSection.svelte';
  import AddAccountModal from '$lib/components/AddAccountModal.svelte';
  import { toast } from '$lib/toast.svelte.js';
  let { data, form } = $props();

  let showAddAccount = $state(false);
  const ok = (s) => form?.section === s && form?.ok;
  const err = (s) => (form?.section === s ? form?.error : null);

  const messages = {
    currency: 'Currency saved',
    dateFormat: 'Date format saved',
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
      {#if data.household}· Your household uses this currency, so it can’t be changed while you’re in it.{/if}
    </p>
    <form method="POST" action="?/currency" use:enhance class="flex flex-wrap items-center gap-3">
      <select class="input max-w-xs" name="currency" aria-label="Currency" value={data.currency} disabled={!!data.household}>
        {#each data.currencies as c}<option value={c.code}>{c.label}</option>{/each}
      </select>
      <button class="btn btn-primary" disabled={!!data.household}>Save</button>
      {#if ok('currency')}<span class="text-sm" style="color:var(--positive)">Saved</span>{/if}
      {#if err('currency')}<span class="text-sm" style="color:var(--negative)">{err('currency')}</span>{/if}
    </form>
  </div>

  <!-- Date format -->
  <div class="card">
    <h2 class="text-lg">Date format</h2>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">
      How ambiguous numeric dates (e.g. 03/04/2026) are read when importing a CSV or PDF statement, and the order short dates are shown in.
    </p>
    <form method="POST" action="?/dateFormat" use:enhance class="flex flex-wrap items-center gap-3">
      <select class="input max-w-xs" name="date_format" aria-label="Date format" value={data.dateFormat}>
        {#each data.dateFormats as d}<option value={d.value}>{d.label}</option>{/each}
      </select>
      <button class="btn btn-primary">Save</button>
      {#if ok('dateFormat')}<span class="text-sm" style="color:var(--positive)">Saved</span>{/if}
      {#if err('dateFormat')}<span class="text-sm" style="color:var(--negative)">{err('dateFormat')}</span>{/if}
    </form>
  </div>

  <!-- Accounts -->
  <div class="card">
    <div class="mb-1 flex flex-wrap items-start justify-between gap-3">
      <h2 class="text-lg">Accounts</h2>
      <button type="button" class="btn btn-ghost btn-sm flex items-center gap-1.5" onclick={() => (showAddAccount = true)}>
        <Icon name="plus" size={13} /> Add account
      </button>
    </div>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">
      Add another account to track it completely separately. Switch between them from the picker
      in the top bar; figures are never combined across accounts. On a <b>Savings</b> account, a
      <b>Savings</b>-category transaction counts as its own income, not a separate "saved" figure.
    </p>
    <ul class="divide-y divide-[var(--border)]">
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
              aria-label="Name for {a.name}"
              onchange={(e) => e.currentTarget.form.requestSubmit()} />
            <select name="kind" value={a.kind} class="input !w-auto shrink-0 !py-1 text-[13px]"
              aria-label="Type for {a.name}"
              onchange={(e) => e.currentTarget.form.requestSubmit()}>
              <option value="checking">Transactional</option>
              <option value="savings">Savings</option>
            </select>
          </form>
          <span class="flex items-center gap-3">
            <span class="text-xs text-[var(--ink-faint)]">
              {a.count} tx
            </span>
            {#if data.accounts.length > 1}
              <form method="POST" action="?/deleteAccount" use:enhance
                use:confirmSubmit={{ skip: !a.count, title: `Delete ${a.name}?`, message: `${a.count} transaction${a.count === 1 ? '' : 's'} will become unassigned.`, confirmLabel: 'Delete account', danger: true }}>
                <input type="hidden" name="id" value={a.id} />
                <button class="text-[var(--ink-faint)] hover:text-[var(--negative)]" title="Delete"><Icon name="trash" size={14} /></button>
              </form>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  </div>

  <!-- Household -->
  <div class="card">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="flex items-center gap-2 text-lg"><Icon name="users" size={17} class="text-[var(--accent)]" /> Household</h2>
        <p class="mb-4 mt-1 max-w-xl text-[13px] text-[var(--ink-faint)]">
          Link up with the people you share costs with. Nothing about your accounts is shared. You choose, category by category
          (on the Categories page), which spending to show the household — and only the transactions in those categories are ever visible to the others.
        </p>
      </div>
    </div>

    {#if data.household}
      <p class="text-[13px] text-[var(--ink-soft)]">
        <b>{data.household.name}</b> · shown in {data.household.currency}
      </p>
      <ul class="mt-3 divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-[var(--border)]">
        {#each data.household.members as m}
          <li class="flex items-center gap-3 px-3 py-2 text-[13px]">
            <span class="grid h-6 w-6 place-items-center rounded-full bg-[var(--paper-sunk)] text-[11px] font-semibold uppercase text-[var(--ink-soft)]">{m.username.slice(0, 1)}</span>
            <span class="min-w-0 flex-1 truncate">{m.username}{#if m.you}<span class="ml-1 text-[var(--ink-faint)]">(you)</span>{/if}</span>
            <span class="text-[11px] text-[var(--ink-faint)]">joined {m.joinedAt.slice(0, 10)}</span>
          </li>
        {/each}
      </ul>

      <div class="mt-4">
        <h3 class="mb-1 text-[13px] font-semibold">Invite someone</h3>
        <p class="mb-2 text-[12px] text-[var(--ink-faint)]">
          A code works once and lasts 7 days. They enter it under Household in their own Settings.
        </p>
        {#if form?.section === 'household' && form?.newCode}
          <p class="mb-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm" style="background:var(--accent-wash)">
            New code: <b class="tnum select-all tracking-wider">{form.newCode}</b>
          </p>
        {/if}
        <form method="POST" action="?/householdInvite" use:enhance class="inline">
          <button class="btn btn-ghost btn-sm">Create an invite code</button>
        </form>
        {#if data.invites.length}
          <ul class="mt-3 space-y-1.5">
            {#each data.invites as inv}
              <li class="flex items-center gap-3 text-[13px]">
                <b class="tnum select-all tracking-wider">{inv.code}</b>
                <span class="text-[11px] text-[var(--ink-faint)]">until {inv.expiresAt.slice(0, 10)}</span>
                <form method="POST" action="?/householdRevoke" use:enhance class="ml-auto">
                  <input type="hidden" name="code" value={inv.code} />
                  <button class="text-[12px] text-[var(--ink-faint)] hover:text-[var(--negative)] hover:underline">Cancel</button>
                </form>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="mt-5 border-t border-[var(--border)] pt-4">
        <form method="POST" action="?/householdLeave" use:enhance
          use:confirmSubmit={{ title: 'Leave the household?', message: 'What you shared stops being visible to the others straight away, and your sharing ticks are cleared. Your own accounts and transactions are not touched.', confirmLabel: 'Leave household', danger: true }}>
          <button class="btn" style="background:var(--negative-wash);color:var(--negative)">Leave household</button>
        </form>
      </div>
    {:else}
      <div class="grid gap-5 sm:grid-cols-2">
        <form method="POST" action="?/householdCreate" use:enhance class="space-y-2">
          <h3 class="text-[13px] font-semibold">Start a household</h3>
          <label class="label" for="hh-name">Name</label>
          <input class="input" id="hh-name" name="name" placeholder="Our household" maxlength="60" />
          <button class="btn btn-primary">Create household</button>
        </form>

        <form method="POST" action="?/householdJoin" use:enhance class="space-y-2">
          <h3 class="text-[13px] font-semibold">Join one</h3>
          <label class="label" for="hh-code">Invite code</label>
          <input class="input tnum uppercase tracking-wider" id="hh-code" name="code" placeholder="ABCD-EFGH" autocomplete="off" required
            value={form?.section === 'household' ? form?.code ?? '' : ''} />
          {#if form?.section === 'household' && form?.needsCurrency}
            <div class="rounded-[var(--radius-sm)] px-3 py-2 text-[13px]" style="background:var(--warning-wash)">
              This household uses <b>{form.needsCurrency.to}</b>; yours is <b>{form.needsCurrency.from}</b>.
              Joining switches how your amounts are shown to {form.needsCurrency.to} — the amounts themselves don’t change.
              <label class="mt-2 flex items-center gap-2">
                <input type="checkbox" name="switch_currency" /> Switch my currency to {form.needsCurrency.to} and join
              </label>
            </div>
          {/if}
          <button class="btn btn-primary">Join household</button>
        </form>
      </div>
    {/if}
    {#if err('household')}<p class="mt-3 text-sm" style="color:var(--negative)">{err('household')}</p>{/if}
  </div>

  <!-- Auto-categorisation rules -->
  <RulesSection categories={data.categories} rules={data.rules} currency={data.currency} />

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
      <input class="input flex-1" name="username" type="text" aria-label="Username" autocomplete="username"
        value={data.username} required />
      <button class="btn btn-primary">Save</button>
      {#if err('username')}<span class="text-sm" style="color:var(--negative)">{err('username')}</span>{/if}
    </form>
  </div>

  <!-- Password -->
  <div class="card">
    <h2 class="text-lg">Change password</h2>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">Signed in as {data.username}</p>
    <!-- a plain submit, not use:enhance: browsers only offer to update a saved
         password after a real form submission, and the hidden username tells
         the password manager which saved login this new password replaces -->
    <form method="POST" action="?/password" class="grid max-w-md gap-3">
      <input class="sr-only" type="text" name="username" value={data.username} autocomplete="username"
        readonly tabindex="-1" aria-hidden="true" />
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

  <!-- Backup & restore -->
  <div class="card">
    <h2 class="text-lg">Backup &amp; restore</h2>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">
      A backup is a zip of four CSVs — transactions, categories, rules and budgets — covering every
      account you have, not just the one you're currently viewing.
    </p>
    <div class="flex flex-wrap items-center gap-3">
      <a href="/settings/backup" class="btn btn-ghost">
        <Icon name="download" size={14} /> Download backup
      </a>
      <form method="POST" action="?/restoreBackup" enctype="multipart/form-data" use:enhance
        class="flex flex-wrap items-center gap-2"
        use:confirmSubmit={{ title: 'Restore from this backup?', message: 'This replaces every account’s categories, rules, budgets and transactions with what’s in the file. This cannot be undone.', confirmLabel: 'Restore', danger: true }}>
        <input class="input max-w-[260px] !py-1.5 text-[13px]" type="file" name="file" accept=".zip" aria-label="Backup file to restore" required />
        <button class="btn" style="background:var(--negative-wash);color:var(--negative)">Restore from backup</button>
      </form>
    </div>
  </div>

  <!-- Danger zone -->
  <div class="card" style="border-color:var(--negative)">
    <h2 class="text-lg" style="color:var(--negative)">Danger zone</h2>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">
      Permanently delete every transaction on this account. Categories, accounts and rules are kept.
    </p>
    <form method="POST" action="?/deleteAllTransactions" use:enhance
      use:confirmSubmit={{ title: 'Delete all transactions?', message: 'Every transaction on this account will be permanently deleted. Categories, accounts and rules are kept. This cannot be undone.', confirmLabel: 'Delete everything', danger: true }}>
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

{#if showAddAccount}
  <AddAccountModal
    onClose={() => (showAddAccount = false)}
    onCreated={async (created) => {
      showAddAccount = false;
      await fetch('/account-switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: created.id })
      });
      await invalidateAll();
      toast('Account added');
    }}
  />
{/if}
