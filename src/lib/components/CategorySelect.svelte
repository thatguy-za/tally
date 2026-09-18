<script>
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
  let pos = $state({ top: 0, left: 0 });

  let newName = $state('');
  let newKind = $state('expense');
  let newColor = $state('#7b8a5a');

  let current = $derived(categories.find((c) => String(c.id) === String(value)));

  function openPopover() {
    const r = anchor.getBoundingClientRect();
    pos = { top: r.bottom + window.scrollY + 6, left: r.left + window.scrollX };
    open = true;
    adding = false;
    error = '';
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
    newName = '';
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

  function onWindowClick(e) {
    if (open && !anchor.contains(e.target) && !popoverEl?.contains(e.target)) open = false;
  }

  // type-ahead: pressing a letter while the list is open jumps focus to (and
  // cycles through, on repeat presses) categories starting with that letter
  let typeahead = { query: '', ts: 0 };
  function onWindowKey(e) {
    if (e.key === 'Escape') {
      open = false;
      return;
    }
    if (!open || adding || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1 || !/[a-z0-9]/i.test(e.key)) return;
    e.preventDefault();

    const now = Date.now();
    const repeat = now - typeahead.ts < 800 && typeahead.query.length && e.key.toLowerCase() === typeahead.query[0];
    typeahead.query = repeat ? typeahead.query : '';
    typeahead.query += e.key.toLowerCase();
    typeahead.ts = now;

    const buttons = [...popoverEl.querySelectorAll('button[data-cat-name]')];
    if (!buttons.length) return;
    let matches = buttons.filter((b) => b.dataset.catName.toLowerCase().startsWith(typeahead.query));
    if (!matches.length && typeahead.query.length > 1) {
      typeahead.query = e.key.toLowerCase();
      matches = buttons.filter((b) => b.dataset.catName.toLowerCase().startsWith(typeahead.query));
    }
    if (!matches.length) return;

    let next = matches[0];
    if (repeat && matches.length > 1) {
      const currentIndex = buttons.indexOf(document.activeElement);
      next = matches.find((b) => buttons.indexOf(b) > currentIndex) ?? matches[0];
    }
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
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
    class="card"
    style="position:absolute;top:{pos.top}px;left:{pos.left}px;z-index:65;width:220px;padding:6px;max-height:320px;overflow-y:auto">
    {#if !adding}
      <button type="button" class="flex w-full items-center rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-[13px] hover:bg-[var(--paper-sunk)]"
        onclick={() => pick('')}>
        {placeholder}
      </button>
      {#each categories as c}
        <button type="button" class="flex w-full items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-[13px] hover:bg-[var(--paper-sunk)] focus:bg-[var(--paper-sunk)] focus:outline-none"
          data-cat-name={c.name}
          onclick={() => pick(c.id)}>
          <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:{c.color}"></span>
          <span class="truncate">{c.name}</span>
        </button>
      {/each}
      <div class="my-1 border-t border-[var(--border)]"></div>
      <button type="button" class="flex w-full items-center gap-1.5 rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-[13px] text-[var(--accent-strong)] hover:bg-[var(--paper-sunk)]"
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
