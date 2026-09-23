<script>
  import { invalidateAll } from '$app/navigation';
  import Icon from './Icon.svelte';
  import AddAccountModal from './AddAccountModal.svelte';
  import { toast } from '$lib/toast.svelte.js';

  /**
   * The global "which account" switcher — every page's figures are scoped to
   * exactly one of the user's own accounts at a time (never combined), so
   * this is the one place that changes it. Always visible (even with just
   * one account) since "+ Add account" lives at the bottom of its own list.
   *
   * `variant: 'dropdown'` (default) is the header's own floating popover.
   * `variant: 'inline'` renders as a single row that expands a second-level
   * list of accounts in place — used at the bottom of the mobile nav menu,
   * which is itself already a dropdown and can't nest another floating one.
   * @type {{ accounts: {id:number,name:string,color:string}[], accountId: number, variant?: 'dropdown'|'inline', onSwitched?: () => void }}
   */
  let { accounts, accountId, variant = 'dropdown', onSwitched } = $props();

  let open = $state(false);
  let root = $state(null);
  let switching = $state(false);
  let showAddModal = $state(false);

  let current = $derived(accounts.find((a) => a.id === accountId) ?? accounts[0]);

  // composedPath (not e.target): a click that changes state can synchronously
  // replace the clicked element before this handler runs, leaving e.target
  // detached and root.contains(e.target) false even though the click was
  // inside root — composedPath is a stable snapshot taken at dispatch time
  function onWindow(e) {
    if (open && root && !e.composedPath().includes(root)) open = false;
  }
  function onKey(e) {
    if (e.key === 'Escape') open = false;
  }

  function toggle() {
    open = !open;
  }

  async function switchTo(id) {
    switching = true;
    try {
      const res = await fetch('/account-switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: id })
      });
      if (!res.ok) {
        toast("Couldn't switch accounts — try again.", { type: 'info' });
        return;
      }
      await invalidateAll();
    } catch {
      toast("Couldn't switch accounts — try again.", { type: 'info' });
    } finally {
      switching = false;
    }
  }

  async function pick(a) {
    open = false;
    if (a.id === current?.id) {
      onSwitched?.();
      return;
    }
    await switchTo(a.id);
    onSwitched?.();
  }

  function openAddModal() {
    open = false;
    showAddModal = true;
  }

  async function onAccountCreated(created) {
    showAddModal = false;
    await switchTo(created.id);
    onSwitched?.();
  }
</script>

<svelte:window onclick={onWindow} onkeydown={onKey} />

{#snippet accountList(itemClass)}
  {#each accounts as a}
    <button type="button" role="menuitem"
      class="{itemClass} {a.id === current?.id ? 'text-[var(--ink)]' : 'text-[var(--ink-soft)]'}"
      onclick={() => pick(a)}>
      <span class="dot shrink-0" style="background:{a.color}"></span>
      <span class="min-w-0 flex-1 truncate">{a.name}</span>
      {#if a.id === current?.id}<Icon name="check" size={13} class="shrink-0 text-[var(--accent)]" />{/if}
    </button>
  {/each}
  <div class="my-1 border-t border-[var(--border)]"></div>
  <button type="button" role="menuitem"
    class="{itemClass} text-[var(--accent-strong)]"
    onclick={openAddModal}>
    <Icon name="plus" size={13} /> Add account
  </button>
{/snippet}

{#if variant === 'inline'}
  <div bind:this={root}>
    <button
      type="button"
      onclick={toggle}
      class="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2.5 text-left text-[14px] font-medium text-[var(--ink-faint)] transition-colors hover:text-[var(--ink-soft)] disabled:opacity-60"
      aria-haspopup="menu"
      aria-expanded={open}
      disabled={switching}
    >
      <Icon name="repeat" size={16} class="shrink-0 {switching ? 'animate-spin' : ''}" />
      <span class="flex-1">Switch account</span>
      <Icon name="arrowRight" size={13} class="shrink-0 text-[var(--ink-faint)] transition-transform {open ? 'rotate-90' : ''}" />
    </button>
    {#if open}
      <div class="ml-3 mt-0.5 space-y-0.5 border-l border-[var(--border)] py-1 pl-3" role="menu">
        {@render accountList('flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 text-left text-[13px] transition-colors hover:bg-[var(--paper-sunk)]')}
      </div>
    {/if}
  </div>
{:else}
  <div class="relative" bind:this={root}>
    <button
      onclick={toggle}
      class="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper-sunk)] disabled:opacity-60"
      aria-haspopup="menu"
      aria-expanded={open}
      disabled={switching}
    >
      <span class="dot shrink-0" style="background:{current?.color}"></span>
      <span class="hidden max-w-[140px] truncate sm:inline">{current?.name}</span>
      {#if switching}
        <Icon name="repeat" size={11} class="shrink-0 animate-spin text-[var(--ink-faint)]" />
      {:else}
        <Icon name="arrowRight" size={11} class="shrink-0 rotate-90 text-[var(--ink-faint)]" />
      {/if}
    </button>

    {#if open}
      <div
        class="menu-pop absolute right-0 z-40 mt-1.5 w-60 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-raised)] py-1 shadow-[var(--shadow-lg)]"
        role="menu"
      >
        {@render accountList('flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--paper-sunk)]')}
      </div>
    {/if}
  </div>
{/if}

{#if showAddModal}
  <AddAccountModal onClose={() => (showAddModal = false)} onCreated={onAccountCreated} />
{/if}
