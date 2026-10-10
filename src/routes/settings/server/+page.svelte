<script>
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import Icon from '$lib/components/Icon.svelte';
  import { toast } from '$lib/toast.svelte.js';
  let { data, form } = $props();

  let resettingUser = $state(null);
  let testing = $state(false);
  let checkingModels = $state(false);
  // the latest "check for new models" answer; kept apart from `form`, which the
  // next action (adding one of the models, say) replaces
  let found = $state(null);
  const ok = (s) => form?.section === s && form?.ok;
  const err = (s) => (form?.section === s ? form?.error : null);

  let selectedProvider = $state(untrack(() => data.ai.provider));
  let selectedModel = $state(untrack(() => data.ai.model));
  let current = $derived(data.aiByProvider[selectedProvider]);
  let shown = $derived(found && found.provider === selectedProvider ? found : null);
  let providerLabel = $derived(data.ai.providers.find((p) => p.id === selectedProvider)?.label ?? selectedProvider);
  let addedModels = $derived(current.models.filter((m) => m.custom));
  $effect(() => {
    // switching provider resets the model picker to that provider's current/default model
    selectedModel = current.model;
  });

  let seenForm;
  $effect(() => {
    if (form === seenForm) return;
    seenForm = form;
    testing = false;
    checkingModels = false;
    if (form?.section === 'models' && form.ok)
      found = { provider: form.provider, fresh: form.fresh, freshTotal: form.freshTotal, missing: form.missing };
    if (form?.ok) toast(form.msg || 'Saved');
    else if (form?.error) toast(form.error, { type: 'info' });
  });
</script>

<svelte:head><title>Server settings · Tally</title></svelte:head>

<div class="mb-7">
  <p class="kicker mb-2">Settings · Server</p>
  <h1 class="text-3xl" style="font-family:var(--font-display)">Server settings</h1>
  <p class="mt-1 text-[13px] text-[var(--ink-faint)]">Everyone signed into this instance. Admins only.</p>
</div>

<div class="space-y-4">
  <!-- AI assistant -->
  <div class="card">
    <h2 class="flex items-center gap-2 text-lg">
      <Icon name="sparkle" size={16} class="text-[var(--accent)]" /> AI assistant
    </h2>
    <p class="mb-4 mt-1 max-w-xl text-[13px] text-[var(--ink-faint)]">
      Add an API key so users can opt in to AI transaction categorisation. All usage is
      billed to this key by the provider. Create one at
      <span class="text-[var(--ink-soft)]">{selectedProvider === 'openai' ? 'platform.openai.com' : 'console.anthropic.com'}</span>.
    </p>

    <form method="POST" action="?/aiKey"
      use:enhance={() => async ({ update }) => update({ reset: false })}
      class="grid gap-3 sm:max-w-xl">
      <div>
        <label class="label" for="ai-provider">Provider</label>
        <select class="input" id="ai-provider" name="provider" bind:value={selectedProvider}>
          {#each data.ai.providers as p}<option value={p.id}>{p.label}</option>{/each}
        </select>
      </div>

      {#if current.keyFromEnv}
        <p class="rounded-[var(--radius-sm)] px-3 py-2 text-[13px]"
          style="background:var(--accent-wash);color:var(--accent-strong)">
          Key supplied via the <code>{selectedProvider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'}</code>
          environment variable ({current.keyMask}). Choose a model below.
        </p>
      {:else}
        <div>
          <label class="label" for="ai-key">
            API key {#if current.configured}<span class="text-[var(--ink-faint)]">· currently {current.keyMask}</span>{/if}
          </label>
          <input class="input" id="ai-key" name="api_key" type="password" autocomplete="off"
          data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other"
            placeholder={current.configured ? 'Enter a new key to replace it' : (selectedProvider === 'openai' ? 'sk-…' : 'sk-ant-…')} />
          <p class="mt-1 text-xs text-[var(--ink-faint)]">Leave blank and save to remove the key and disable AI features.</p>
        </div>
      {/if}
      <div>
        <label class="label" for="ai-model">Model</label>
        <select class="input" id="ai-model" name="model" bind:value={selectedModel}>
          {#each current.models as m}<option value={m.id}>{m.label}{m.custom ? ' (added)' : ''}</option>{/each}
        </select>
        <p class="mt-1 text-xs text-[var(--ink-faint)]">
          The cheapest model is usually plenty for categorisation.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button class="btn btn-primary">Save</button>
        {#if current.configured}
          <button class="btn btn-ghost" formaction="?/aiTest" onclick={() => (testing = true)}>
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button class="btn btn-ghost" formaction="?/aiModels" formnovalidate onclick={() => (checkingModels = true)}>
            {checkingModels ? 'Checking…' : 'Check for new models'}
          </button>
        {/if}
        {#if err('ai')}<span class="text-sm" style="color:var(--negative)">{err('ai')}</span>{/if}
      </div>
    </form>

    {#if shown}
      <div class="mt-4 max-w-xl space-y-3 rounded-[var(--radius-sm)] border border-[var(--border)] p-3 text-[13px]">
        {#if shown.fresh.length}
          <p class="font-medium">Not in your list yet · {providerLabel}</p>
          <ul class="divide-y divide-[var(--border)]">
            {#each shown.fresh as m (m.id)}
              <li class="flex items-center gap-3 py-2">
                <span class="min-w-0 flex-1">
                  <span class="block truncate">{m.label}</span>
                  {#if m.label !== m.id}<span class="block truncate text-xs text-[var(--ink-faint)]">{m.id}</span>{/if}
                </span>
                <form method="POST" action="?/aiAddModel"
                  use:enhance={() => async ({ update }) => {
                    await update({ reset: false });
                    found = { ...found, fresh: found.fresh.filter((x) => x.id !== m.id) };
                  }}>
                  <input type="hidden" name="provider" value={shown.provider} />
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="label" value={m.label} />
                  <button class="btn btn-ghost btn-sm">Add</button>
                </form>
              </li>
            {/each}
          </ul>
          {#if shown.freshTotal > shown.fresh.length}
            <p class="text-xs text-[var(--ink-faint)]">Showing the newest {shown.fresh.length} of {shown.freshTotal}.</p>
          {/if}
          <p class="text-xs text-[var(--ink-faint)]">
            Added models have no known price, so no cost estimate is shown for them. Try one with “Test connection” before relying on it.
          </p>
        {:else}
          <p>Nothing new from {providerLabel} — your list is up to date.</p>
        {/if}
        {#if shown.missing.length}
          <p class="text-xs" style="color:var(--negative)">
            Your account no longer lists: {shown.missing.join(', ')}. They may have been retired.
          </p>
        {/if}
      </div>
    {/if}

    {#if addedModels.length}
      <div class="mt-4 max-w-xl text-[13px]">
        <p class="label">Added models</p>
        <ul class="divide-y divide-[var(--border)]">
          {#each addedModels as m (m.id)}
            <li class="flex items-center gap-3 py-1.5">
              <span class="min-w-0 flex-1 truncate">{m.label}</span>
              <form method="POST" action="?/aiRemoveModel" use:enhance={() => async ({ update }) => update({ reset: false })}>
                <input type="hidden" name="provider" value={selectedProvider} />
                <input type="hidden" name="id" value={m.id} />
                <button class="text-xs text-[var(--ink-faint)] underline decoration-dotted hover:text-[var(--negative)]"
                  aria-label="Remove {m.label}">Remove</button>
              </form>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>

  <!-- Users -->
  <div class="card">
    <h2 class="text-lg">Users</h2>
    <p class="mb-4 mt-1 text-[13px] text-[var(--ink-faint)]">Reset a password, grant admin, or remove an account and all its data.</p>
    {#if err('user')}<p class="mb-3 text-sm" style="color:var(--negative)">{err('user')}</p>{/if}
    <ul class="divide-y divide-[var(--border)]">
      {#each data.users as u}
        <li class="py-2.5 text-[13px]">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="flex items-center gap-2 font-medium">
              {u.username}
              {#if u.is_admin}<span class="chip chip-accent">admin</span>{/if}
              {#if data.ai.configured && u.ai_off}<span class="chip">AI off</span>{/if}
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
                  onsubmit={(e) => { if (!confirm(`Delete ${u.username} and all their data?`)) e.preventDefault(); }}>
                  <input type="hidden" name="id" value={u.id} />
                  <button style="color:var(--negative)" class="hover:underline">Delete</button>
                </form>
              {/if}
            </div>
          </div>
          {#if resettingUser === u.id}
            <!-- closed once the server has answered, not on submit: dropping the
                 form from the page in an onsubmit handler removes it before
                 use:enhance has sent it, so a real click did nothing at all -->
            <form method="POST" action="?/resetUserPassword" class="mt-2 flex gap-2"
              use:enhance={() => async ({ result, update }) => {
                await update();
                if (result.type === 'success') resettingUser = null;
              }}>
              <input type="hidden" name="id" value={u.id} />
              <input class="input max-w-xs" name="new_password" type="text"
                placeholder="New password (min 8 chars)" minlength="8" required
                autocomplete="off" data-1p-ignore data-lpignore="true" data-bwignore />
              <button class="btn btn-primary btn-sm">Set</button>
            </form>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
</div>
