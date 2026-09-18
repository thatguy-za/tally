<script>
  import { untrack } from 'svelte';
  import { portal } from '$lib/actions/portal.js';
  import Icon from './Icon.svelte';
  import { currentMonth, formatMonth } from '$lib/currency.js';

  /**
   * A single-month version of the Material-style calendar used on Insights'
   * custom-range picker: a trigger button showing the selected month, opening
   * a popover with year navigation and a 4×3 month grid.
   * @type {{ value: string, onChange: (value: string) => void }}
   */
  let { value, onChange } = $props();

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const thisMonth = currentMonth();

  let open = $state(false);
  let anchor = $state();
  let popoverEl = $state();
  let pos = $state({ top: 0, left: 0 });
  let viewYear = $state(untrack(() => Number(value.slice(0, 4))));

  function openPopover() {
    viewYear = Number(value.slice(0, 4));
    const r = anchor.getBoundingClientRect();
    pos = { top: r.bottom + window.scrollY + 6, left: r.left + window.scrollX };
    open = true;
  }
  function toggle() {
    if (open) open = false;
    else openPopover();
  }

  function pick(ym) {
    onChange(ym);
    open = false;
  }

  function onWindowClick(e) {
    if (open && !anchor.contains(e.target) && !popoverEl?.contains(e.target)) open = false;
  }
  function onWindowKey(e) {
    if (e.key === 'Escape') open = false;
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

<button type="button" bind:this={anchor} aria-haspopup="dialog" aria-expanded={open}
  class="input flex items-center justify-between gap-2 text-left"
  onclick={toggle}>
  <span class="truncate">{formatMonth(value)}</span>
  <Icon name="calendar" size={14} class="shrink-0 text-[var(--ink-faint)]" />
</button>

{#if open}
  <div bind:this={popoverEl} use:portal role="dialog" aria-modal="true" aria-label="Choose a month"
    class="card"
    style="position:absolute;top:{pos.top}px;left:{pos.left}px;z-index:65;width:232px;padding:10px;">
    <div class="mb-2 flex items-center justify-between">
      <button type="button" class="grid h-7 w-7 place-items-center rounded-full text-[var(--ink-faint)] hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
        aria-label="Previous year" onclick={() => (viewYear -= 1)}>
        <Icon name="arrowRight" size={14} class="rotate-180" />
      </button>
      <span class="text-[14px] font-medium tnum">{viewYear}</span>
      <button type="button" class="grid h-7 w-7 place-items-center rounded-full text-[var(--ink-faint)] hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
        aria-label="Next year" onclick={() => (viewYear += 1)}>
        <Icon name="arrowRight" size={14} />
      </button>
    </div>
    <div class="grid grid-cols-3 gap-1">
      {#each MONTHS as m, i}
        {@const ym = `${viewYear}-${String(i + 1).padStart(2, '0')}`}
        {@const isSelected = ym === value}
        {@const isCurrent = ym === thisMonth}
        <button type="button"
          class="rounded-full py-1.5 text-[13px] transition-colors {isSelected
            ? 'bg-[var(--accent)] font-medium text-[var(--accent-contrast)]'
            : isCurrent
              ? 'text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)] hover:bg-[var(--paper-sunk)]'
              : 'text-[var(--ink-soft)] hover:bg-[var(--paper-sunk)]'}"
          onclick={() => pick(ym)}>
          {m}
        </button>
      {/each}
    </div>
  </div>
{/if}
