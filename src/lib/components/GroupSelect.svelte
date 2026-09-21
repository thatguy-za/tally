<script>
  import { tick } from 'svelte';
  import { portal } from '$lib/actions/portal.js';
  import Icon from './Icon.svelte';

  /**
   * A category's optional group picker: a trigger button showing the current
   * group (or "No group"), opening a popover that lists every group already
   * in use, searchable, plus "+ Add group" at the bottom for a brand new one.
   * A group is nothing but a shared label on categories — there's no group
   * record to create server-side, so picking or typing a name is all this
   * does; saving the category (via the surrounding form) is what persists it.
   * @type {{
   *   groups: string[],
   *   value: string|null,
   *   onChange: (value: string|null) => void,
   *   placeholder?: string,
   *   triggerClass?: string
   * }}
   */
  let { groups, value, onChange, placeholder = 'No group', triggerClass = 'input' } = $props();

  let open = $state(false);
  let adding = $state(false);
  let anchor = $state();
  let popoverEl = $state();
  let searchEl = $state();
  let addEl = $state();
  let pos = $state({ top: 0, left: 0 });
  let search = $state('');
  let newName = $state('');

  let filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.toLowerCase().includes(q));
  });
  let showPlaceholder = $derived(!search.trim() || placeholder.toLowerCase().includes(search.trim().toLowerCase()));

  async function openPopover() {
    const r = anchor.getBoundingClientRect();
    pos = { top: r.bottom + window.scrollY + 6, left: r.left + window.scrollX };
    open = true;
    adding = false;
    search = '';
    await tick();
    searchEl?.focus();
  }
  function toggle() {
    if (open) open = false;
    else openPopover();
  }
  function pick(g) {
    onChange(g || null);
    open = false;
  }
  async function startAdding() {
    adding = true;
    newName = search.trim();
    await tick();
    addEl?.focus();
  }
  function confirmAdd() {
    const name = newName.trim();
    if (!name) return;
    pick(name);
  }

  // composedPath (not e.target): clicking "Add group" synchronously swaps the
  // list for the inline form, detaching the clicked button from the DOM
  // before this handler runs — e.target.contains() checks then see a
  // detached node and wrongly conclude the click was outside, closing the
  // popover before the form ever shows. Same fix as CategorySelect's onWindow.
  function onWindowClick(e) {
    const path = e.composedPath();
    if (open && anchor && !path.includes(anchor) && !(popoverEl && path.includes(popoverEl))) open = false;
  }

  function onWindowKey(e) {
    if (e.key === 'Escape') open = false;
  }

  function onSearchKeydown(e) {
    if (e.key === 'Enter' && filtered.length) {
      e.preventDefault();
      pick(filtered[0]);
    }
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

<button type="button" bind:this={anchor} aria-haspopup="listbox" aria-expanded={open}
  class="{triggerClass} flex items-center justify-between gap-1.5 text-left"
  onclick={toggle}>
  <span class="truncate {value ? '' : 'text-[var(--ink-faint)]'}">{value || placeholder}</span>
  <Icon name="arrowRight" size={12} class="shrink-0 rotate-90 text-[var(--ink-faint)]" />
</button>

{#if open}
  <div bind:this={popoverEl} use:portal role="listbox" aria-label="Choose a group"
    class="card flex flex-col"
    style="position:absolute;top:{pos.top}px;left:{pos.left}px;z-index:65;width:200px;padding:6px;max-height:280px">
    {#if !adding}
      <div class="relative shrink-0">
        <Icon name="search" size={13} class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]" />
        <input type="text" placeholder="Search groups…" bind:value={search} bind:this={searchEl}
          onkeydown={onSearchKeydown}
          class="input mb-1.5 w-full !py-1.5 pl-7 text-[13px]" />
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto">
        {#if showPlaceholder}
          <button type="button" class="flex w-full items-center rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-[13px] text-[var(--ink-faint)] hover:bg-[var(--paper-sunk)]"
            onclick={() => pick(null)}>
            {placeholder}
          </button>
        {/if}
        {#each filtered as g}
          <button type="button" class="flex w-full items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-[13px] hover:bg-[var(--paper-sunk)] focus:bg-[var(--paper-sunk)] focus:outline-none"
            onclick={() => pick(g)}>
            <span class="truncate">{g}</span>
          </button>
        {:else}
          {#if !showPlaceholder}
            <p class="px-2 py-3 text-center text-[12px] text-[var(--ink-faint)]">No matching groups.</p>
          {/if}
        {/each}
      </div>
      <div class="my-1 shrink-0 border-t border-[var(--border)]"></div>
      <button type="button" class="flex w-full shrink-0 items-center gap-1.5 rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-[13px] text-[var(--accent-strong)] hover:bg-[var(--paper-sunk)]"
        onclick={startAdding}>
        <Icon name="plus" size={13} /> Add group
      </button>
    {:else}
      <form class="space-y-2 p-1" onsubmit={(e) => { e.preventDefault(); confirmAdd(); }}>
        <input class="input w-full !py-1 text-[13px]" placeholder="Group name" bind:value={newName}
          bind:this={addEl} required />
        <div class="flex items-center gap-2">
          <button class="btn btn-primary btn-sm" disabled={!newName.trim()}>Use group</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => (adding = false)}>Cancel</button>
        </div>
      </form>
    {/if}
  </div>
{/if}
