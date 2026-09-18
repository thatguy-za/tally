<script>
  import { untrack } from 'svelte';
  import { portal } from '$lib/actions/portal.js';
  import Icon from './Icon.svelte';
  import { currentMonth } from '$lib/currency.js';

  /**
   * One combined control for the Insights period: a row of quick presets plus
   * a Material-style month/year range calendar, all inside a single popover
   * behind a single trigger button — replacing what used to be three separate
   * dropdowns (preset + from + to).
   * @type {{
   *   presets: { id: string, label: string }[],
   *   activePreset: string,
   *   from: string,
   *   to: string,
   *   triggerLabel: string,
   *   onPreset: (id: string) => void,
   *   onRange: (from: string, to: string) => void
   * }}
   */
  let { presets, activePreset, from, to, triggerLabel, onPreset, onRange } = $props();

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const thisMonth = currentMonth();

  let open = $state(false);
  let anchor = $state();
  let popoverEl = $state();
  let pos = $state({ top: 0, left: 0 });

  let viewYear = $state(untrack(() => Number(to.slice(0, 4))));
  // null = no range click started yet; once the first month is clicked this
  // holds it while we wait for the second click to complete the range
  let pendingStart = $state(null);
  let draftFrom = $state(untrack(() => from));
  let draftTo = $state(untrack(() => to));
  // the calendar stays hidden until "Custom range" is picked (or it's already
  // the active selection when the popover opens)
  let showCalendar = $state(untrack(() => activePreset === 'custom'));

  function openPopover() {
    viewYear = Number(to.slice(0, 4));
    pendingStart = null;
    draftFrom = from;
    draftTo = to;
    showCalendar = activePreset === 'custom';
    const r = anchor.getBoundingClientRect();
    pos = { top: r.bottom + window.scrollY + 6, left: r.left + window.scrollX };
    open = true;
  }
  function toggle() {
    if (open) open = false;
    else openPopover();
  }

  function pickPreset(id) {
    if (id === 'custom') {
      showCalendar = true;
      return;
    }
    onPreset(id);
    open = false;
  }

  function clickMonth(ym) {
    if (pendingStart == null) {
      pendingStart = ym;
      draftFrom = ym;
      draftTo = ym;
      return;
    }
    const a = pendingStart < ym ? pendingStart : ym;
    const b = pendingStart < ym ? ym : pendingStart;
    pendingStart = null;
    onRange(a, b);
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
  <span class="truncate">{triggerLabel}</span>
  <Icon name="calendar" size={14} class="shrink-0 text-[var(--ink-faint)]" />
</button>

{#if open}
  <div bind:this={popoverEl} use:portal role="dialog" aria-modal="true" aria-label="Choose a period"
    class="card"
    style="position:absolute;top:{pos.top}px;left:{pos.left}px;z-index:65;width:252px;padding:10px;">
    <div class="flex flex-col gap-0.5 {showCalendar ? 'mb-2' : ''}">
      {#each presets as p}
        <button type="button"
          class="rounded-[var(--radius-xs)] px-2.5 py-1.5 text-left text-[13px] transition-colors {activePreset === p.id
            ? 'bg-[var(--accent-wash)] font-medium text-[var(--accent-strong)]'
            : 'text-[var(--ink-soft)] hover:bg-[var(--paper-sunk)]'}"
          onclick={() => pickPreset(p.id)}>
          {p.label}
        </button>
      {/each}
      <button type="button"
        class="rounded-[var(--radius-xs)] px-2.5 py-1.5 text-left text-[13px] transition-colors {activePreset === 'custom'
          ? 'bg-[var(--accent-wash)] font-medium text-[var(--accent-strong)]'
          : 'text-[var(--ink-soft)] hover:bg-[var(--paper-sunk)]'}"
        onclick={() => pickPreset('custom')}>
        Custom date range
      </button>
    </div>

    {#if showCalendar}
      <div class="border-t border-[var(--border)] pt-2.5">
        <div class="mb-1.5 flex items-center justify-between">
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
            {@const isStart = ym === draftFrom}
            {@const isEnd = ym === draftTo}
            {@const inRange = ym > draftFrom && ym < draftTo}
            {@const isCurrent = ym === thisMonth}
            <button type="button"
              class="rounded-full py-1.5 text-[13px] transition-colors {isStart || isEnd
                ? 'bg-[var(--accent)] font-medium text-[var(--accent-contrast)]'
                : inRange
                  ? 'bg-[var(--accent-wash)] text-[var(--accent-strong)]'
                  : isCurrent
                    ? 'text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)] hover:bg-[var(--paper-sunk)]'
                    : 'text-[var(--ink-soft)] hover:bg-[var(--paper-sunk)]'}"
              onclick={() => clickMonth(ym)}>
              {m}
            </button>
          {/each}
        </div>
        <p class="mt-2 px-0.5 text-[11px] text-[var(--ink-faint)]">
          {pendingStart ? 'Pick the end month…' : 'Pick a start month, then an end month.'}
        </p>
      </div>
    {/if}
  </div>
{/if}
