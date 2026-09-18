<script>
  import { formatMoney } from '$lib/currency.js';

  /**
   * A small horizontal bar chart the chat assistant can attach to a reply.
   * Bar colours always come from the server (a category's own colour, or the
   * app's palette) — never from the model directly.
   * @type {{ title?: string, bars: { label: string, value: number, color: string }[], currency: string }}
   */
  let { title = '', bars, currency } = $props();

  let max = $derived(Math.max(1, ...bars.map((b) => Math.abs(b.value))));
</script>

{#if bars.length}
  <div class="mt-2 rounded-[var(--radius-sm)] border border-[var(--border)] p-3">
    {#if title}<p class="mb-2.5 text-[12px] font-medium text-[var(--ink-soft)]">{title}</p>{/if}
    <div class="space-y-2">
      {#each bars as b}
        <div class="flex items-center gap-2 text-[12px]">
          <span class="w-20 shrink-0 truncate text-[var(--ink-faint)]" title={b.label}>{b.label}</span>
          <div class="h-3.5 min-w-0 flex-1 overflow-hidden rounded-[4px]" style="background:var(--paper-sunk)">
            <div class="h-full rounded-[4px]" style="width:{Math.max(2, (Math.abs(b.value) / max) * 100)}%;background:{b.color}"></div>
          </div>
          <span class="w-16 shrink-0 text-right tnum text-[var(--ink-soft)]">{formatMoney(b.value, currency)}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}
