<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Icon from '$lib/components/Icon.svelte';
  import { peekStash, clearStash } from '$lib/share-stash.js';
  import { toast } from '$lib/toast.svelte.js';
  let { data } = $props();

  let files = $state(null); // null until the stash has been read
  let chosen = $state(null); // starts on the active account, set on mount
  let busy = $state(false);

  const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  // an import always lands in whichever account is active (see the import
  // action), so picking one here means making it the active one first
  async function proceed() {
    busy = true;
    try {
      if (Number(chosen) !== Number(data.accountId)) {
        const res = await fetch('/account-switch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accountId: chosen })
        });
        if (!res.ok) throw new Error('switch failed');
      }
      await goto('/transactions?new&shared=1', { invalidateAll: true });
    } catch {
      toast("Couldn't switch accounts — try again.", { type: 'info' });
      busy = false;
    }
  }

  async function cancel() {
    await clearStash();
    await goto('/insights');
  }

  onMount(async () => {
    chosen = data.accountId;
    files = await peekStash();
    // with a single account there is nothing to choose
    if (files.length && data.accounts.length === 1) proceed();
  });
</script>

<svelte:head><title>Import a statement · Tally</title></svelte:head>

<div class="mx-auto max-w-lg">
  <p class="kicker mb-2">Shared to Tally</p>
  <h1 class="mb-6 text-3xl" style="font-family:var(--font-display)">Import this statement</h1>

  {#if files === null}
    <div class="card">
      <div class="ai-shimmer h-3 w-2/3 rounded-full"></div>
    </div>
  {:else if !files.length}
    <div class="card text-center">
      <p class="font-medium">Nothing waiting to import</p>
      <p class="mt-1 text-[13px] text-[var(--ink-faint)]">
        The file may have expired — shared statements are only kept for a few minutes. Share it again, or pick it from your device here.
      </p>
      <a href="/transactions?new" class="btn btn-primary mt-4 inline-flex">Choose a file</a>
    </div>
  {:else}
    <div class="card space-y-5">
      <ul class="divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-[var(--border)]">
        {#each files as f}
          <li class="flex items-center gap-3 px-3 py-2.5 text-[13px]">
            <Icon name="upload" size={15} class="shrink-0 text-[var(--ink-faint)]" />
            <span class="min-w-0 flex-1 truncate">{f.name}</span>
            <span class="tnum shrink-0 text-xs text-[var(--ink-faint)]">{size(f.size)}</span>
          </li>
        {/each}
      </ul>

      {#if data.accounts.length > 1}
        <fieldset>
          <legend class="label">Import into</legend>
          <div class="mt-1.5 space-y-1.5">
            {#each data.accounts as a (a.id)}
              <label
                class="flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-3 text-[14px] transition-colors focus-within:ring-2 focus-within:ring-[var(--accent)]"
                style="border-color:{chosen === a.id ? 'var(--accent)' : 'var(--border)'};background:{chosen === a.id ? 'var(--accent-wash)' : 'transparent'}"
              >
                <input type="radio" name="account" value={a.id} bind:group={chosen} class="sr-only" />
                <span class="dot shrink-0" style="background:{a.color}"></span>
                <span class="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                {#if a.kind === 'savings'}<span class="shrink-0 text-xs text-[var(--ink-faint)]">Savings</span>{/if}
                {#if chosen === a.id}<Icon name="check" size={15} class="shrink-0 text-[var(--accent)]" />{/if}
              </label>
            {/each}
          </div>
        </fieldset>
      {/if}

      <p class="text-[13px] text-[var(--ink-faint)]">
        You'll review the transactions before anything is added.
      </p>

      <div class="flex gap-2">
        <button type="button" class="btn btn-primary" onclick={proceed} disabled={busy}>
          {busy ? 'Opening…' : 'Continue'}
        </button>
        <button type="button" class="btn btn-ghost" onclick={cancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  {/if}
</div>
