<script>
  import { PALETTE } from '$lib/palette.js';
  import Icon from './Icon.svelte';

  /**
   * @type {{
   *   value: string,
   *   onchange?: (color: string) => void,
   *   size?: string,
   *   label?: string
   * }}
   */
  let { value = $bindable(), onchange, size = 'h-8 w-8', label = 'Colour' } = $props();

  let open = $state(false);
  let root = $state(null);
  let popoverEl = $state(null);
  let pos = $state({ top: 0, left: 0 });

  // Every `.card` on this app animates in with a persistent (fill-mode
  // "both") transform/opacity animation, which per spec makes it its own
  // stacking context for the rest of the page's life — trapping a normal
  // z-indexed popover inside it, so a later sibling card paints over it.
  // Portalling to <body> and positioning in document coordinates sidesteps
  // that entirely. Once at the body level, the popover's z-index (65) has
  // to clear every full-screen layer it might open on top of — notably the
  // onboarding overlay (z-index 60, see .overlay in app.css) — or it opens
  // "successfully" while rendering invisibly behind it.
  function toggle() {
    if (!open) {
      const r = root.getBoundingClientRect();
      pos = { top: r.bottom + window.scrollY + 6, left: r.left + window.scrollX };
    }
    open = !open;
  }

  function pick(color) {
    value = color;
    open = false;
    onchange?.(color);
  }

  function onCustomChange(e) {
    pick(e.currentTarget.value);
  }

  function onWindowClick(e) {
    if (open && !root?.contains(e.target) && !popoverEl?.contains(e.target)) open = false;
  }
  function onKey(e) {
    if (e.key === 'Escape') open = false;
  }

  function portal(node) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKey} />

<div class="relative inline-block" bind:this={root}>
  <button
    type="button"
    class="{size} shrink-0 cursor-pointer rounded border border-[var(--border-strong)]"
    style="background:{value}"
    aria-label={label}
    aria-haspopup="true"
    aria-expanded={open}
    onclick={toggle}
  ></button>
</div>

{#if open}
  <div
    bind:this={popoverEl}
    use:portal
    class="z-[65] grid w-[152px] grid-cols-4 gap-1.5 rounded-[11px] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-2.5 shadow-[var(--shadow-lg)]"
    style="position:absolute;top:{pos.top}px;left:{pos.left}px"
    role="menu"
  >
    {#each PALETTE as c}
      <button
        type="button"
        class="h-7 w-7 rounded-[6px] border transition-transform hover:scale-110"
        style="background:{c};border-color:{c === value ? 'var(--ink)' : 'transparent'}"
        aria-label={c}
        onclick={() => pick(c)}
      ></button>
    {/each}
    <label
      class="grid h-7 w-7 cursor-pointer place-items-center rounded-[6px] border border-dashed border-[var(--border-strong)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
      title="Custom colour"
    >
      <Icon name="plus" size={14} />
      <input type="color" class="sr-only" {value} onchange={onCustomChange} />
    </label>
  </div>
{/if}
