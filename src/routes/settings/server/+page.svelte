<script>
  import { enhance } from '$app/forms';
  import Icon from '$lib/components/Icon.svelte';
  import { toast } from '$lib/toast.svelte.js';
  let { data, form } = $props();

  let resettingUser = $state(null);
  let testing = $state(false);
  const ok = (s) => form?.section === s && form?.ok;
  const err = (s) => (form?.section === s ? form?.error : null);

  let seenForm;
  $effect(() => {
    if (form === seenForm) return;
    seenForm = form;
    testing = false;
    if (form?.ok) toast(form.msg || 'Saved');
    else if (form?.error) toast(form.error, { type: 'info' });
  });
</script>

<svelte:head><title>Server settings · Tally</title></svelte:head>

<div class="mb-7 rise">
  <p class="kicker mb-2">Settings · Server</p>
  <h1 class="text-3xl" style="font-family:var(--font-display)">Server settings</h1>
  <p class="mt-1 text-[13px] text-[var(--ink-faint)]">Everyone signed into this instance. Admins only.</p>
</div>

<div class="space-y-4">
  <!-- AI assistant -->
  <div class="card rise rise-1">
    <h2 class="flex items-center gap-2 text-lg">
      <Icon name="sparkle" size={16} class="text-[var(--accent)]" /> AI assistant
    </h2>
    <p class="mb-4 mt-1 max-w-xl text-[13px] text-[var(--ink-faint)]">
      Add an Anthropic (Claude) API key so users can opt in to AI transaction
      categorisation. All usage is billed to this key by Anthropic. Create a key at
      <span class="text-[var(--ink-soft)]">console.anthropic.com</span>.
    </p>

    {#if data.ai.keyFromEnv}
      <p class="mb-3 rounded-[9px] px-3 py-2 text-[13px]"
        style="background:var(--accent-wash);color:var(--accent-strong)">
        Key supplied via the <code>ANTHROPIC_API_KEY</code> environment variable
        ({data.ai.keyMask}). Choose a model below.
      </p>
    {/if}

    <form method="POST" action="?/aiKey" use:enhance class="grid gap-3 sm:max-w-xl">
      {#if !data.ai.keyFromEnv}
        <div>
          <label class="label" for="ai-key">
            API key {#if data.ai.configured}<span class="text-[var(--ink-faint)]">· currently {data.ai.keyMask}</span>{/if}
          </label>
          <input class="input" id="ai-key" name="api_key" type="password" autocomplete="off"
            placeholder={data.ai.configured ? 'Enter a new key to replace it' : 'sk-ant-…'} />
          <p class="mt-1 text-xs text-[var(--ink-faint)]">Leave blank and save to remove the key and disable AI features.</p>
        </div>
      {/if}
      <div>
        <label class="label" for="ai-model">Model</label>
        <select class="input" id="ai-model" name="model" value={data.ai.model}>
          {#each data.ai.models as m}<option value={m.id}>{m.label}</option>{/each}
        </select>
        <p class="mt-1 text-xs text-[var(--ink-faint)]">
          Haiku is the cheapest and is usually plenty for categorisation.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button class="btn btn-primary">Save</button>
        {#if data.ai.configured}
          <button class="btn btn-ghost" formaction="?/aiTest" onclick={() => (testing = true)}>
            {testing ? 'Testing…' : 'Test connection'}
          </button>
        {/if}
        {#if err('ai')}<span class="text-sm" style="color:var(--negative)">{err('ai')}</span>{/if}
      </div>
    </form>
  </div>

  <!-- Users -->
  <div class="card rise rise-2">
    <h2 class="text-lg">Users</h2>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">Reset a password, grant admin, or remove an account and all its data.</p>
    {#if err('user')}<p class="mb-3 text-sm" style="color:var(--negative)">{err('user')}</p>{/if}
    <ul class="divide-y divide-[var(--border)]">
      {#each data.users as u}
        <li class="py-2.5 text-[13px]">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="flex items-center gap-2 font-medium">
              {u.email}
              {#if u.is_admin}<span class="chip chip-accent">admin</span>{/if}
              {#if u.ai_categorise}<span class="chip">AI on</span>{/if}
              <span class="text-xs font-normal text-[var(--ink-faint)]">{u.tx_count} tx</span>
            </span>
            <div class="flex items-center gap-3 text-xs">
              <button class="text-[var(--ink-soft)] hover:underline"
                onclick={() => (resettingUser = resettingUser === u.id ? null : u.id)}>Reset password</button>
              <form method="POST" action="?/setAdmin" use:enhance>
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="admin" value={u.is_admin ? '0' : '1'} />
                <button class="text-[var(--ink-soft)] hover:underline">{u.is_admin ? 'Revoke admin' : 'Make admin'}</button>
              </form>
              {#if u.id !== data.myId}
                <form method="POST" action="?/deleteUser" use:enhance
                  onsubmit={(e) => { if (!confirm(`Delete ${u.email} and all their data?`)) e.preventDefault(); }}>
                  <input type="hidden" name="id" value={u.id} />
                  <button style="color:var(--negative)" class="hover:underline">Delete</button>
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
              <button class="btn btn-primary btn-sm">Set</button>
            </form>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
</div>
