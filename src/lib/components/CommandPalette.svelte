<script>
  import { goto } from '$app/navigation';
  import { toggleTheme } from '$lib/theme.svelte.js';
  import { palette } from '$lib/palette.svelte.js';
  import Icon from './Icon.svelte';

  let open = $state(false);
  let query = $state('');
  let active = $state(0);
  let inputEl = $state(null);

  // allow other components to request the palette
  $effect(() => {
    if (palette.open && !open) openPalette();
    if (!palette.open && open) open = false;
  });

  const commands = [
    { label: 'Dashboard', hint: 'G D', icon: 'dashboard', run: () => goto('/dashboard') },
    { label: 'Transactions', hint: 'G T', icon: 'transactions', run: () => goto('/transactions') },
    { label: 'Recurring', hint: 'G R', icon: 'recurring', run: () => goto('/recurring') },
    { label: 'Budgets', hint: 'G B', icon: 'budgets', run: () => goto('/budgets') },
    { label: 'Reports', hint: 'G P', icon: 'reports', run: () => goto('/reports') },
    { label: 'Settings', hint: 'G S', icon: 'settings', run: () => goto('/settings') },
    { label: 'New transaction', hint: 'N', icon: 'plus', run: () => goto('/transactions?new=1') },
    { label: 'Import from CSV', icon: 'upload', run: () => goto('/transactions/import') },
    { label: 'Add a category rule', icon: 'sparkle', run: () => goto('/settings') },
    { label: 'Toggle light / dark', hint: 'T', icon: 'moon', run: () => toggleTheme(), keepOpen: true }
  ];

  let filtered = $derived(
    query.trim()
      ? commands.filter((c) => c.label.toLowerCase().includes(query.trim().toLowerCase()))
      : commands
  );

  $effect(() => {
    filtered;
    active = 0;
  });

  function openPalette() {
    open = true;
    palette.open = true;
    query = '';
    active = 0;
    queueMicrotask(() => inputEl?.focus());
  }
  function close() {
    open = false;
    palette.open = false;
  }
  function choose(cmd) {
    if (!cmd) return;
    cmd.run();
    if (!cmd.keepOpen) close();
  }

  let awaitingG = false;
  let gTimer;
  const gMap = { d: '/dashboard', t: '/transactions', r: '/recurring', b: '/budgets', p: '/reports', s: '/settings' };

  function onKeydown(e) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      open ? close() : openPalette();
      return;
    }
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if (!open) {
      if (typing || mod || e.altKey) return;
      if (awaitingG && gMap[e.key]) {
        e.preventDefault();
        awaitingG = false;
        clearTimeout(gTimer);
        goto(gMap[e.key]);
      } else if (e.key === 'g') {
        awaitingG = true;
        clearTimeout(gTimer);
        gTimer = setTimeout(() => (awaitingG = false), 800);
      } else if (e.key === 'n') {
        e.preventDefault();
        goto('/transactions?new=1');
      } else if (e.key === 't') {
        e.preventDefault();
        toggleTheme();
      }
      return;
    }

    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = (active + 1) % filtered.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active - 1 + filtered.length) % filtered.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(filtered[active]);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div
    class="overlay"
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && close()}
  >
    <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <input
        bind:this={inputEl}
        bind:value={query}
        class="palette-input"
        placeholder="Jump to…  ·  type to filter"
        autocomplete="off"
        spellcheck="false"
      />
      <div class="max-h-[19rem] overflow-y-auto py-1.5">
        {#each filtered as cmd, i}
          <button
            class="palette-item"
            data-active={i === active}
            onmouseenter={() => (active = i)}
            onclick={() => choose(cmd)}
          >
            <Icon name={cmd.icon} size={15} class={i === active ? 'text-[var(--accent)]' : 'text-[var(--ink-faint)]'} />
            {cmd.label}
            {#if cmd.hint}<span class="pi-hint kbd">{cmd.hint}</span>{/if}
          </button>
        {:else}
          <p class="px-4 py-6 text-center text-sm text-[var(--ink-faint)]">Nothing matches “{query}”.</p>
        {/each}
      </div>
      <div class="flex items-center gap-3 border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--ink-faint)]">
        <span><span class="kbd">↑</span> <span class="kbd">↓</span> move</span>
        <span><span class="kbd">↵</span> select</span>
        <span><span class="kbd">esc</span> close</span>
      </div>
    </div>
  </div>
{/if}
