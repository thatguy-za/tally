<script>
  import '../app.css';
  import { page } from '$app/stores';
  import { onNavigate } from '$app/navigation';
  import Icon from '$lib/components/Icon.svelte';
  import Toaster from '$lib/components/Toaster.svelte';
  import LoadingBar from '$lib/components/LoadingBar.svelte';
  import UserMenu from '$lib/components/UserMenu.svelte';
  import AccountSwitcher from '$lib/components/AccountSwitcher.svelte';
  import OnboardingOverlay from '$lib/components/OnboardingOverlay.svelte';
  import { initTheme } from '$lib/theme.svelte.js';
  import { initPrivacy } from '$lib/privacy.svelte.js';
  let { data, children } = $props();

  let nav = $derived([
    { href: '/insights', label: 'Insights', icon: 'reports' },
    { href: '/transactions', label: 'Transactions', icon: 'transactions' },
    { href: '/budgets', label: 'Budgets', icon: 'budgets' },
    { href: '/categories', label: 'Categories', icon: 'tag' },
    ...(data.aiAvailable ? [{ href: '/chat', label: 'Ask Tori', icon: 'sparkle' }] : [])
  ]);

  let current = $derived($page.url.pathname);

  // the full nav list only needs its own dropdown on mobile, where the
  // header row is too narrow for labelled links — see the hamburger below
  let mobileNavOpen = $state(false);

  $effect(() => {
    initTheme();
    initPrivacy();
  });

  onNavigate((navigation) => {
    mobileNavOpen = false;
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
{#if data.onboarding}
  <OnboardingOverlay onboarding={data.onboarding} />
{/if}

{#if data.user}
  <div class="shell flex min-h-full flex-col">
    <header class="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--paper)]/85 backdrop-blur-md">
      <div class="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <button
          type="button"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper-sunk)] sm:hidden"
          aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileNavOpen}
          onclick={() => (mobileNavOpen = !mobileNavOpen)}
        >
          <Icon name={mobileNavOpen ? 'x' : 'menu'} size={19} />
        </button>

        <a href="/insights" class="flex shrink-0 items-center gap-2.5">
          <span class="grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--accent-contrast)]">
            <Icon name="wallet" size={17} stroke={2} />
          </span>
          <span class="text-[17px] font-medium tracking-tight" style="font-family:var(--font-display)">Tally</span>
        </a>

        <nav class="ml-1 hidden flex-1 items-center gap-0.5 overflow-x-auto sm:ml-2 sm:flex">
          {#each nav as item}
            {@const active = current.startsWith(item.href)}
            <a
              href={item.href}
              aria-label={item.label}
              class="group flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] font-medium transition-colors sm:py-1.5
                {active ? 'text-[var(--ink)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink-soft)]'}"
              style={active ? 'background:var(--paper-sunk)' : ''}
            >
              <Icon name={item.icon} size={15} stroke={active ? 2 : 1.75} class={active ? 'text-[var(--accent)]' : ''} />
              <span class="hidden sm:inline">{item.label}</span>
            </a>
          {/each}
        </nav>

        <div class="flex-1 sm:hidden"></div>

        {#if data.accounts}
          <div class="hidden sm:block">
            <AccountSwitcher accounts={data.accounts} accountId={data.accountId} />
          </div>
        {/if}

        <UserMenu user={data.user} />
      </div>

      {#if mobileNavOpen}
        <nav class="border-t border-[var(--border)] px-4 py-2 sm:hidden">
          {#each nav as item}
            {@const active = current.startsWith(item.href)}
            <a
              href={item.href}
              class="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2.5 text-[14px] font-medium transition-colors
                {active ? 'text-[var(--ink)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink-soft)]'}"
              style={active ? 'background:var(--paper-sunk)' : ''}
            >
              <Icon name={item.icon} size={16} stroke={active ? 2 : 1.75} class={active ? 'text-[var(--accent)]' : ''} />
              {item.label}
            </a>
          {/each}
          {#if data.accounts}
            <div class="my-1 border-t border-[var(--border)]"></div>
            <AccountSwitcher
              accounts={data.accounts}
              accountId={data.accountId}
              variant="inline"
              onSwitched={() => (mobileNavOpen = false)}
            />
          {/if}
        </nav>
      {/if}
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-9">
      {@render children()}
    </main>

    <footer class="mx-auto w-full max-w-5xl px-4 py-6 text-[11px] text-[var(--ink-faint)]">
      Tally · self-hosted budgeting · v{__APP_VERSION__}
    </footer>
  </div>
{:else}
  <div class="shell flex min-h-full items-center justify-center p-4">
    {@render children()}
  </div>
{/if}
