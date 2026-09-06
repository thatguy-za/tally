<script>
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  /** @type {{ pct: number, color?: string, size?: number, stroke?: number, label?: string, sublabel?: string }} */
  let { pct, color = 'var(--accent)', size = 66, stroke = 6, label = '', sublabel = '' } = $props();

  const r = $derived((size - stroke) / 2);
  const C = $derived(2 * Math.PI * r);

  const over = $derived(pct > 100);
  const ringColor = $derived(over ? 'var(--negative)' : pct > 85 ? 'var(--gold)' : color);

  const reduce =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const grow = new Tween(0, { duration: 850, easing: cubicOut });
  $effect(() => {
    const target = Math.min(100, Math.max(0, pct)) / 100;
    if (reduce) grow.set(target, { duration: 0 });
    else grow.target = target;
  });
</script>

<div class="flex flex-col items-center gap-1.5">
  <div class="relative grid place-items-center" style="width:{size}px;height:{size}px">
    <svg width={size} height={size} class="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--paper-sunk)" stroke-width={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringColor} stroke-width={stroke}
        stroke-linecap="round"
        stroke-dasharray={C}
        stroke-dashoffset={C * (1 - grow.current)}
      />
    </svg>
    <span class="tnum absolute text-[12px] font-semibold" style={over ? 'color:var(--negative)' : ''}>
      {Math.round(pct)}%
    </span>
  </div>
  {#if label}<span class="max-w-[86px] truncate text-center text-[11px] font-medium">{label}</span>{/if}
  {#if sublabel}<span class="text-[10px] text-[var(--ink-faint)]">{sublabel}</span>{/if}
</div>
