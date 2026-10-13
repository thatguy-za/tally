<script>
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { isIOS, isStandalone, shouldOfferInstall } from '$lib/device.js';

  // iOS has no install button or prompt — the only way is Share, then Add to
  // Home Screen — so say so, once, and stay out of the way after it's dismissed
  const KEY = 'tally:install-hint-dismissed';
  let show = $state(false);

  onMount(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === '1';
    } catch {
      /* storage blocked — show it; dismissing then lasts until reload */
    }
    show = shouldOfferInstall({ ios: isIOS(navigator), standalone: isStandalone(window), dismissed });
  });

  function dismiss() {
    show = false;
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
  }
</script>

{#if show}
  <div class="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 pt-3 text-[13px]" role="note">
    <div class="card flex w-full items-center gap-3 !py-2.5">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-[var(--accent)]" aria-hidden="true">
        <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
      </svg>
      <p class="flex-1 text-[var(--ink-soft)]">
        Install Tally: tap <b>Share</b>, then <b>Add to Home Screen</b> — it opens full-screen like an app.
      </p>
      <button type="button" aria-label="Dismiss" class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-faint)] hover:text-[var(--ink)]" onclick={dismiss}>
        <Icon name="x" size={14} />
      </button>
    </div>
  </div>
{/if}
