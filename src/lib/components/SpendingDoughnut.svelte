<script>
  import { formatMoney } from '$lib/currency.js';

  /**
   * A single month's spending by category, as a doughnut with a legend and a
   * centred total. Used by Insights when the period picker is set to one month
   * (StackedMonths needs several months to be worth a bar chart).
   * @type {{ segments: { id: any, name: string, color: string|null, value: number }[], currency: string, title?: string, onSegmentClick?: (seg: object) => void }}
   */
  let { segments, currency, title = '', onSegmentClick } = $props();

  const fill = (c) => c || 'var(--border-strong)';
  const money = (v) => formatMoney(v, currency);

  const R = 90; // outer radius
  const R_INNER = 55;
  const CX = 100;
  const CY = 100;
  const GAP_DEG = 1.4; // thin surface gap between segments, angle-equivalent of StackedMonths' 2px

  let total = $derived(segments.reduce((s, d) => s + d.value, 0));

  function polar(r, angleDeg) {
    const a = ((angleDeg - 90) * Math.PI) / 180;
    return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
  }

  /** One annular sector, inset by half the gap on each edge. */
  function sectorPath(startDeg, endDeg) {
    const s = startDeg + GAP_DEG / 2;
    const e = endDeg - GAP_DEG / 2;
    const large = e - s <= 180 ? 0 : 1;
    const oStart = polar(R, e);
    const oEnd = polar(R, s);
    const iStart = polar(R_INNER, s);
    const iEnd = polar(R_INNER, e);
    return [
      'M', oStart.x, oStart.y,
      'A', R, R, 0, large, 0, oEnd.x, oEnd.y,
      'L', iStart.x, iStart.y,
      'A', R_INNER, R_INNER, 0, large, 1, iEnd.x, iEnd.y,
      'Z'
    ].join(' ');
  }

  let arcs = $derived.by(() => {
    let acc = 0;
    return segments.map((s) => {
      const startDeg = (acc / total) * 360;
      acc += s.value;
      const endDeg = (acc / total) * 360;
      return { ...s, path: total > 0 ? sectorPath(startDeg, endDeg) : '', pct: total > 0 ? s.value / total : 0 };
    });
  });

  let tip = $state(null);
  let wrap;
  function show(e, seg) {
    const r = wrap.getBoundingClientRect();
    tip = {
      x: e.clientX - r.left + 12,
      y: e.clientY - r.top - 10,
      name: seg.name,
      color: fill(seg.color),
      amount: money(seg.value),
      note: `${Math.round(seg.pct * 100)}% of ${money(total)}`
    };
  }
</script>

<div class="flex flex-col gap-5 sm:flex-row sm:items-start">
  <div class="min-w-0 flex-1">
    {#if title}<h2 class="mb-4 text-lg">{title}</h2>{/if}
    <div class="relative flex justify-center" bind:this={wrap}>
      <svg viewBox="0 0 200 200" class="block h-auto w-[220px] max-w-full sm:w-[260px]" role="img"
        aria-label="Spending by category this month">
        {#each arcs as seg (seg.id)}
          <path d={seg.path} fill={fill(seg.color)} style="cursor:{onSegmentClick ? 'pointer' : 'default'}"
            role="presentation"
            onmousemove={(e) => show(e, seg)} onmouseleave={() => (tip = null)}
            onclick={() => onSegmentClick?.(seg)}>
            <title>{seg.name}: {money(seg.value)} ({Math.round(seg.pct * 100)}%)</title>
          </path>
        {/each}
        <text x={CX} y={CY - 6} text-anchor="middle" font-size="11" fill="var(--ink-faint)">Spent</text>
        <text x={CX} y={CY + 14} text-anchor="middle" font-size="16" font-weight="600" fill="var(--ink)">
          {money(total)}
        </text>
      </svg>

      {#if tip}
        <div class="pointer-events-none absolute z-10 whitespace-nowrap rounded-[var(--radius-xs)] border border-[var(--border-strong)] px-2.5 py-1.5 text-[12px] shadow-[var(--shadow-lg)]"
          style="left:{tip.x}px;top:{tip.y}px;background:var(--surface-raised);color:var(--ink)">
          <span class="mr-1.5 inline-block h-2 w-2 rounded-[2px] align-middle" style="background:{tip.color}"></span>
          {tip.name} · <b class="tnum">{tip.amount}</b>
          <div class="mt-0.5 text-[var(--ink-faint)]">{tip.note}</div>
        </div>
      {/if}
    </div>
  </div>

  <div class="flex w-full flex-col gap-[3px] text-[12px] text-[var(--ink-soft)] sm:w-[170px] sm:shrink-0">
    <p class="kicker mb-1">Spending</p>
    {#each arcs as s (s.id)}
      <button type="button" disabled={!onSegmentClick}
        class="flex items-center gap-2 rounded py-[3px] text-left {onSegmentClick ? 'hover:text-[var(--ink)]' : ''}"
        onclick={() => onSegmentClick?.(s)}>
        <span class="h-2.5 w-2.5 shrink-0 rounded-[3px]" style="background:{fill(s.color)}"></span>
        <span class="min-w-0 flex-1 truncate">{s.name}</span>
        <span class="tnum shrink-0 text-[var(--ink-faint)]">{Math.round(s.pct * 100)}%</span>
      </button>
    {/each}
  </div>
</div>
