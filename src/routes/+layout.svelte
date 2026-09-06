<script>
  import '../app.css';
  import { page } from '$app/stores';
  let { data, children } = $props();

  const nav = [
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/transactions', label: 'Transactions', icon: '💳' },
    { href: '/recurring', label: 'Recurring', icon: '🔁' },
    { href: '/budgets', label: 'Budgets', icon: '🎯' },
    { href: '/reports', label: 'Reports', icon: '📈' },
    { href: '/settings', label: 'Settings', icon: '⚙️' }
  ];

  let current = $derived($page.url.pathname);
</script>

{#if data.user}
  <div class="min-h-full">
    <header class="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div class="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
        <a href="/dashboard" class="flex items-center gap-2 font-bold text-slate-900">
          <span class="text-xl">💰</span> Budget
        </a>
        <nav class="flex flex-1 items-center gap-1 overflow-x-auto">
          {#each nav as item}
            <a
              href={item.href}
              class="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition
                {current.startsWith(item.href)
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100'}"
            >
              <span class="mr-1">{item.icon}</span><span class="hidden sm:inline">{item.label}</span>
            </a>
          {/each}
        </nav>
        <div class="flex items-center gap-3">
          <span class="hidden text-sm text-slate-500 sm:inline">{data.user.email}</span>
          <form method="POST" action="/logout">
            <button class="btn-ghost !px-3 !py-1.5 text-xs">Sign out</button>
          </form>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-5xl px-4 py-8">
      {@render children()}
    </main>
  </div>
{:else}
  <div class="flex min-h-full items-center justify-center p-4">
    {@render children()}
  </div>
{/if}
