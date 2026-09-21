<script>
  import { tick } from 'svelte';
  import { deserialize } from '$app/forms';
  import { portal } from '$lib/actions/portal.js';
  import Icon from './Icon.svelte';
  import ColorPicker from './ColorPicker.svelte';

  /**
   * A category picker: a trigger button showing the current category, opening
   * a popover that lists every category plus "+ Add category" at the bottom.
   * Picking that reveals a small inline form (name, type, colour) which
   * creates the category via the categories page's `addCategory` action and
   * selects it immediately — used everywhere a transaction (or a rule) needs
   * a category, so a user never has to leave what they're doing to make one.
   * @type {{
   *   categories: {id:number,name:string}[],
   *   value: string,
   *   onChange: (value: string) => void,
   *   onCreated?: (cat: {id:number,name:string,kind:string,color:string}) => void,
   *   placeholder?: string,
   *   triggerClass?: string
   * }}
   */
  let {
    categories,
    value,
    onChange,
    onCreated,
    placeholder = 'Uncategorised',
    triggerClass = 'cell min-w-[140px]'
  } = $props();

  let open = $state(false);
  let adding = $state(false);
  let saving = $state(false);
  let error = $state('');
  let anchor = $state();
  let popoverEl = $state();
  let searchEl = $state();
  let pos = $state({ top: 0, left: 0 });
  let search = $state('');

  let newName = $state('');
  let newKind = $state('expense');
  let newColor = $state('#7b8a5a');

  let current = $derived(categories.find((c) => String(c.id) === String(value)));
  let filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  });
  // categories sharing a group_name are clustered under it (in the order the
  // group first appears); ungrouped ones just follow, unlabelled
  let groupedFiltered = $derived.by(() => {
    const byGroup = new Map();
    const ungrouped = [];
    for (const c of filtered) {
      if (!c.group_name) {
        ungrouped.push(c);
        continue;
      }
      if (!byGroup.has(c.group_name)) byGroup.set(c.group_name, []);
      byGroup.get(c.group_name).push(c);
    }
    return { groups: [...byGroup.entries()], ungrouped };
  });
  let showPlaceholder = $derived(!search.trim() || placeholder.toLowerCase().includes(search.trim().toLowerCase()));

  async function openPopover() {
    const r = anchor.getBoundingClientRect();
    pos = { top: r.bottom + window.scrollY + 6, left: r.left + window.scrollX };
    open = true;
    adding = false;
    error = '';
    search = '';
    // wait for the DOM update — including use:portal moving the popover
    // into <body> — to actually land before focusing; focusing a node that's
    // been created but not yet attached to the document is a silent no-op
    await tick();
    searchEl?.focus();
  }
  function toggle() {
    if (open) open = false;
    else openPopover();
  }
  function pick(id) {
    onChange(String(id));
    open = false;
  }
  function startAdding() {
    adding = true;
    newName = search.trim();
    newKind = 'expense';
    newColor = '#7b8a5a';
    error = '';
  }

  async function submitCreate(e) {
    e.preventDefault();
    if (!newName.trim() || saving) return;
    saving = true;
    error = '';
    const body = new FormData();
    body.set('name', newName.trim());
    body.set('kind', newKind);
    body.set('color', newColor);
    try {
      const res = await fetch('/categories?/addCategory', {
        method: 'POST',
        body,
        headers: { 'x-sveltekit-action': 'true' }
      });
      const result = deserialize(await res.text());
      if (result.type === 'success' && result.data?.created) {
        onCreated?.(result.data.created);
        onChange(String(result.data.created.id));
        open = false;
      } else {
        error = result.data?.error || 'Could not create that category.';
      }
    } catch {
      error = 'Could not create that category.';
    } finally {
      saving = false;
    }
  }

  // composedPath (not e.target): clicking "Add category" synchronously swaps
  // the list for the inline form, detaching the clicked button from the DOM
  // before this handler runs — e.target.contains() checks then see a
  // detached node and wrongly conclude the click was outside, closing the
  // popover before the form ever shows. composedPath() is a stable snapshot
  // of the propagation path taken at dispatch time, so it still includes the
  // button. Same fix as AccountSwitcher's onWindow.
  function onWindowClick(e) {
    const path = e.composedPath();
    if (open && anchor && !path.includes(anchor) && !(popoverEl && path.includes(popoverEl))) open = false;
  }

  function onWindowKey(e) {
    if (e.key === 'Escape') open = false;
  }

  function onSearchKeydown(e) {
    // Enter picks the top match — the common "type a few letters, hit
    // enter" flow — without requiring a mouse click on the result
    if (e.key === 'Enter' && filtered.length) {
      e.preventDefault();
      pick(filtered[0].id);
    }
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

<button type="button" bind:this={anchor} aria-haspopup="listbox" aria-expanded={open}
  class="{triggerClass} flex items-center justify-between gap-1.5 text-left"
  onclick={toggle}>
  <span class="truncate">{current ? current.name : placeholder}</span>
  <Icon name="arrowRight" size={12} class="shrink-0 rotate-90 text-[var(--ink-faint)]" />
</button>

{#if open}
  <div bind:this={popoverEl} use:portal role="listbox" aria-label="Choose a category"
    class="card flex flex-col"
    style="position:absolute;top:{pos.top}px;left:{pos.left}px;z-index:65;width:220px;padding:6px;max-height:320px">
    {#if !adding}
      <div class="relative shrink-0">
        <Icon name="search" size={13} class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]" />
        <input type="text" placeholder="Search categories…" bind:value={search} bind:this={searchEl}
          onkeydown={onSearchKeydown}
          class="input mb-1.5 w-full !py-1.5 pl-7 text-[13px]" />
      </div>
      <!-- "Add category" sits outside this scrollable area so it's always visible
           and clickable — with the default ~13 categories the list alone already
           fills the popover's max-height, and having it scroll off with the rest
           made it easy to miss-click just past the list's edge, which reads as a
           click outside the popover and silently closes it instead -->
      <div class="min-h-0 flex-1 overflow-y-auto">
        {#if showPlaceholder}
          <button type="button" class="flex w-full items-center rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-[13px] hover:bg-[var(--paper-sunk)]"
            onclick={() => pick('')}>
            {placeholder}
          </button>
        {/if}
        {#each groupedFiltered.groups as [groupName, items]}
          <p class="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-faint)]">{groupName}</p>
          {#each items as c}
            <button type="button" class="flex w-full items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-[13px] hover:bg-[var(--paper-sunk)] focus:bg-[var(--paper-sunk)] focus:outline-none"
              onclick={() => pick(c.id)}>
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:{c.color}"></span>
              <span class="truncate">{c.name}</span>
            </button>
          {/each}
        {/each}
        {#each groupedFiltered.ungrouped as c}
          <button type="button" class="flex w-full items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-[13px] hover:bg-[var(--paper-sunk)] focus:bg-[var(--paper-sunk)] focus:outline-none"
            onclick={() => pick(c.id)}>
            <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:{c.color}"></span>
            <span class="truncate">{c.name}</span>
          </button>
        {:else}
          {#if !showPlaceholder && !groupedFiltered.groups.length}
            <p class="px-2 py-3 text-center text-[12px] text-[var(--ink-faint)]">No matching categories.</p>
          {/if}
        {/each}
      </div>
      <div class="my-1 shrink-0 border-t border-[var(--border)]"></div>
      <button type="button" class="flex w-full shrink-0 items-center gap-1.5 rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-[13px] text-[var(--accent-strong)] hover:bg-[var(--paper-sunk)]"
        onclick={startAdding}>
        <Icon name="plus" size={13} /> Add category
      </button>
    {:else}
      <form class="space-y-2 p-1" onsubmit={submitCreate}>
        <div class="flex items-center gap-2">
          <ColorPicker bind:value={newColor} size="h-7 w-7" label="Colour for new category" />
          <input class="input min-w-0 flex-1 !py-1 text-[13px]" placeholder="Category name"
            bind:value={newName} required />
        </div>
        <select class="input w-full !py-1 text-[13px]" bind:value={newKind}>
          <option value="expense">Spending</option>
          <option value="income">Income</option>
          <option value="saving">Savings</option>
          <option value="transfer">Transfer</option>
          <option value="opening_balance">Opening balance</option>
        </select>
        {#if error}<p class="text-xs" style="color:var(--negative)">{error}</p>{/if}
        <div class="flex items-center gap-2">
          <button class="btn btn-primary btn-sm" disabled={!newName.trim() || saving}>
            {saving ? 'Adding…' : 'Add'}
          </button>
          <button type="button" class="btn btn-ghost btn-sm" onclick={() => (adding = false)}>Cancel</button>
        </div>
      </form>
    {/if}
  </div>
{/if}
