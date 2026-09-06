<script>
  import { formatMoney } from '$lib/currency.js';
  /** @type {{ segments: {name:string,color:string,total:number}[], currency:string, label?:string }} */
  let { segments, currency, label = 'Total' } = $props();

  let total = $derived(Math.max(1, segments.reduce((s, x) => s + x.total, 0)));
  const C = 2 * Math.PI * 42;

  let arcs = $derived.by(() => {
    let acc = 0;
    return segments.map((s) => {
      const frac = s.total / total;
      const a = { ...s, offset: acc, frac };
      acc += frac;
      return a;
    });
  });

  let hover = $state(null);
  let centreTop = $derived(hover ? hover.name : label);
  let centreVal = $derived(
    hover ? formatMoney(hover.total, currency) : formatMoney(segments.reduce((s, x) => s + x.total, 0), currency)
  );
</script>

<div class="relative grid place-items-center">
  <svg viewBox="0 0 100 100" class="h-40 w-40 -rotate-90">
    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" stroke-width="11" />
    {#each arcs as a (a.name)}
      <circle
        cx="50" cy="50" r="42" fill="none" stroke={a.color}
        stroke-width={hover && hover.name === a.name ? 14 : 11}
        stroke-linecap="butt"
        stroke-dasharray={`${Math.max(0, a.frac * C - 0.6)} ${C}`}
        stroke-dashoffset={-a.offset * C}
        class="cursor-pointer transition-[stroke-width] duration-200"
        opacity={hover && hover.name !== a.name ? 0.35 : 1}
        role="presentation"
        onpointerenter={() => (hover = a)}
        onpointerleave={() => (hover = null)}
      />
    {/each}
  </svg>
  <div class="pointer-events-none absolute text-center">
    <p class="max-w-[104px] truncate text-[10px] font-medium uppercase tracking-wide text-[var(--ink-faint)]">{centreTop}</p>
    <p class="tnum text-[15px] font-medium" style="font-family:var(--font-display)">{centreVal}</p>
  </div>
</div>
