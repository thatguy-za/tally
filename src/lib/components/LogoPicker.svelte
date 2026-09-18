<script>
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { guessDomain } from '$lib/logo.js';
  import Icon from './Icon.svelte';

  /** @type {{ description: string, currentDomain: string|null, onClose: () => void }} */
  let { description, currentDomain, onClose } = $props();

  // captured once at open — this popup is created fresh per-transaction, so
  // it never needs to react to `description` changing after the fact
  let query = $state(untrack(() => description || ''));
  let saving = $state(false);

  /** Turns whatever's typed into a domain to preview — a real domain if one
   * was typed, otherwise the same guessing heuristic used automatically. */
  function toDomain(input) {
    const v = input.trim();
    if (!v) return null;
    if (v.includes('.') && !v.includes(' ')) {
      return v.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    }
    return guessDomain(v) || v.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
  }

  let previewDomain = $derived(toDomain(query));

  function onWindowKey(e) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="overlay" role="dialog" aria-modal="true" aria-label="Change logo"
  onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="card w-full max-w-sm rise">
    <div class="mb-4 flex items-start justify-between gap-3">
      <h2 class="text-lg">Change logo</h2>
      <button
        class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
        onclick={onClose}
        aria-label="Close"
      >
        <Icon name="x" size={16} />
      </button>
    </div>

    <div class="mb-4 flex items-center gap-3">
      <span class="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)]" style="background:var(--paper-sunk)">
        {#if previewDomain}
          {#key previewDomain}
            <img
              src="https://www.google.com/s2/favicons?domain={previewDomain}&sz=128"
              alt=""
              class="h-full w-full object-contain"
            />
          {/key}
        {:else}
          <Icon name="wallet" size={20} class="text-[var(--ink-faint)]" />
        {/if}
      </span>
      <div class="min-w-0">
        <p class="truncate text-[13px] font-medium">{description || '—'}</p>
        <p class="truncate text-xs text-[var(--ink-faint)]">{previewDomain || 'No logo'}</p>
      </div>
    </div>

    <form
      method="POST"
      action="/transactions?/setLogo"
      use:enhance={() => {
        saving = true;
        return async ({ result }) => {
          saving = false;
          if (result.type === 'success') {
            await invalidateAll();
            onClose();
          }
        };
      }}
    >
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="domain" value={previewDomain || ''} />
      <label class="label" for="logo-query">Shop name or website</label>
      <input
        id="logo-query"
        class="input"
        placeholder="e.g. Boots Pharmacy, or boots.com"
        bind:value={query}
        autocomplete="off"
      />
      <div class="mt-4 flex items-center gap-2">
        <button class="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Use this logo'}</button>
        <button type="button" class="btn btn-ghost" onclick={onClose}>Cancel</button>
      </div>
    </form>

    {#if currentDomain !== undefined}
      <form
        method="POST"
        action="/transactions?/resetLogo"
        class="mt-3"
        use:enhance={() => async ({ result }) => {
          if (result.type === 'success') {
            await invalidateAll();
            onClose();
          }
        }}
      >
        <input type="hidden" name="description" value={description} />
        <button class="text-[12px] text-[var(--ink-faint)] underline decoration-dotted hover:text-[var(--ink)]">
          Reset to automatic guess
        </button>
      </form>
    {/if}
  </div>
</div>
