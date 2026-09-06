<script>
  import '../app.css';
  import { page } from '$app/stores';
  import { onNavigate } from '$app/navigation';
  import Icon from '$lib/components/Icon.svelte';
  import Toaster from '$lib/components/Toaster.svelte';
  import LoadingBar from '$lib/components/LoadingBar.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import UserMenu from '$lib/components/UserMenu.svelte';
  import { theme, initTheme, toggleTheme } from '$lib/theme.svelte.js';
  import { openPalette } from '$lib/palette.svelte.js';
  let { data, children } = $props();

  const nav = [
    { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { href: '/transactions', label: 'Transactions', icon: 'transactions' },
    { href: '/budgets', label: 'Budgets', icon: 'budgets' },
    { href: '/reports', label: 'Reports', icon: 'reports' }
  ];

  let current = $derived($page.url.pathname);
  let isMac = $state(true);

  $effect(() => {
    initTheme();
    isMac = /mac/i.test(navigator.platform || navigator.userAgent);
  });

  let effectiveDark = $derived(
    theme.value === 'dark' ||
      (theme.value === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  );

  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

<LoadingBar />
<Toaster />

{#if data.user}
  <CommandPalette />
  <div class="shell flex min-h-full flex-col">
    <header class="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--paper)]/85 backdrop-blur-md">
      <div class="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <a href="/dashboard" class="flex items-center gap-2.5">
          <span class="grid h-8 w-8 place-items-center rounded-[9px] bg-[var(--accent)] text-[var(--accent-contrast)]">
            <Icon name="wallet" size={17} stroke={2} />
          </span>
          <span class="text-[17px] font-medium tracking-tight" style="font-family:var(--font-display)">Tally</span>
        </a>

        <nav class="ml-2 flex flex-1 items-center gap-0.5 overflow-x-auto">
          {#each nav as item}
            {@const active = current.startsWith(item.href)}
            <a
              href={item.href}
              class="group flex items-center gap-1.5 whitespace-nowrap rounded-[9px] px-2.5 py-1.5 text-[13px] font-medium transition-colors
                {active ? 'text-[var(--ink)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink-soft)]'}"
              style={active ? 'background:var(--paper-sunk)' : ''}
            >
              <Icon name={item.icon} size={15} stroke={active ? 2 : 1.75} class={active ? 'text-[var(--accent)]' : ''} />
              <span class="hidden sm:inline">{item.label}</span>
            </a>
          {/each}
        </nav>

        <button
          onclick={openPalette}
          class="hidden items-center gap-1.5 rounded-[9px] border border-[var(--border-strong)] px-2 py-1 text-[11px] text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)] md:flex"
          title="Command palette"
        >
          <span class="kbd">{isMac ? '⌘' : 'Ctrl'}</span><span class="kbd">K</span>
        </button>

        <button
          onclick={toggleTheme}
          class="grid h-8 w-8 place-items-center rounded-[9px] text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
          title="Toggle theme"
          aria-label="Toggle theme"
        >
          <Icon name={effectiveDark ? 'sun' : 'moon'} size={16} />
        </button>

        <UserMenu user={data.user} />
      </div>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-9">
      {@render children()}
    </main>

    <footer class="mx-auto w-full max-w-5xl px-4 py-6 text-[11px] text-[var(--ink-faint)]">
      Tally · self-hosted budgeting · <span class="kbd">{isMac ? '⌘' : 'Ctrl'}</span> <span class="kbd">K</span> for commands
    </footer>
  </div>
{:else}
  <div class="shell flex min-h-full items-center justify-center p-4">
    {@render children()}
  </div>
{/if}
