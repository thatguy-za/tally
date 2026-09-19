<script>
  import { enhance } from '$app/forms';
  import { formatMoney } from '$lib/currency.js';
  import Icon from '$lib/components/Icon.svelte';
  import RulesSection from '$lib/components/RulesSection.svelte';
  import { toast } from '$lib/toast.svelte.js';
  let { data, form } = $props();

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
