<script>
  import { page } from '$app/stores';
  import Icon from './Icon.svelte';
  /** @type {{ user: { email: string, is_admin: number } }} */
  let { user } = $props();

  let open = $state(false);
  let root = $state(null);

  function onWindow(e) {
    if (open && root && !root.contains(e.target)) open = false;
  }
  function onKey(e) {
    if (e.key === 'Escape') open = false;
  }

  let current = $derived($page.url.pathname);
</script>

<svelte:window onclick={onWindow} onkeydown={onKey} />

<div class="relative" bind:this={root}>
  <button
    onclick={() => (open = !open)}
    class="flex items-center gap-1.5 rounded-[9px] px-2 py-1.5 text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper-sunk)]"
    aria-haspopup="menu"
    aria-expanded={open}
  >
    <span class="grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold"
      style="background:var(--accent-wash);color:var(--accent-strong)">
      {user.email[0]?.toUpperCase() ?? '?'}
    </span>
    <span class="hidden max-w-[160px] truncate sm:inline">{user.email}</span>
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" class="text-[var(--ink-faint)] transition-transform {open ? 'rotate-180' : ''}">
      <path d="M4 6l4 4 4-4" />
    </svg>
  </button>

  {#if open}
    <div
      class="absolute right-0 z-40 mt-1.5 w-56 overflow-hidden rounded-[11px] border border-[var(--border-strong)] bg-[var(--surface-raised)] py-1 shadow-[var(--shadow-lg)]"
      role="menu"
    >
      <p class="truncate px-3 py-1.5 text-[11px] text-[var(--ink-faint)]">{user.email}</p>
      <a
        href="/settings"
        role="menuitem"
        onclick={() => (open = false)}
        class="flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors hover:bg-[var(--paper-sunk)]
          {current === '/settings' ? 'text-[var(--ink)]' : 'text-[var(--ink-soft)]'}"
      >
        <Icon name="settings" size={15} class="text-[var(--ink-faint)]" /> Settings
      </a>
      {#if user.is_admin}
        <a
          href="/settings/server"
          role="menuitem"
          onclick={() => (open = false)}
          class="flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors hover:bg-[var(--paper-sunk)]
            {current.startsWith('/settings/server') ? 'text-[var(--ink)]' : 'text-[var(--ink-soft)]'}"
        >
          <Icon name="sparkle" size={15} class="text-[var(--ink-faint)]" /> Server settings
        </a>
      {/if}
      <div class="my-1 border-t border-[var(--border)]"></div>
      <form method="POST" action="/logout">
        <button
          role="menuitem"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper-sunk)]"
        >
          <Icon name="logout" size={15} class="text-[var(--ink-faint)]" /> Sign out
        </button>
      </form>
    </div>
  {/if}
</div>
