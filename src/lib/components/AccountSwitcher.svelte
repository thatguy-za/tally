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
   * @type {{ accounts: {id:number,name:string,color:string}[], accountId: number }}
   */
  let { accounts, accountId } = $props();

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
    if (a.id === current?.id) return;
    await switchTo(a.id);
  }

  function openAddModal() {
    open = false;
    showAddModal = true;
  }

  async function onAccountCreated(created) {
    showAddModal = false;
    await switchTo(created.id);
  }
</script>

<svelte:window onclick={onWindow} onkeydown={onKey} />

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
      {#each accounts as a}
        <button type="button" role="menuitem"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--paper-sunk)]
            {a.id === current?.id ? 'text-[var(--ink)]' : 'text-[var(--ink-soft)]'}"
          onclick={() => pick(a)}>
          <span class="dot shrink-0" style="background:{a.color}"></span>
          <span class="min-w-0 flex-1 truncate">{a.name}</span>
          {#if a.id === current?.id}<Icon name="check" size={13} class="shrink-0 text-[var(--accent)]" />{/if}
        </button>
      {/each}
      <div class="my-1 border-t border-[var(--border)]"></div>
      <button type="button" role="menuitem"
        class="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[13px] text-[var(--accent-strong)] hover:bg-[var(--paper-sunk)]"
        onclick={openAddModal}>
        <Icon name="plus" size={13} /> Add account
      </button>
    </div>
  {/if}
</div>

{#if showAddModal}
  <AddAccountModal onClose={() => (showAddModal = false)} onCreated={onAccountCreated} />
{/if}
