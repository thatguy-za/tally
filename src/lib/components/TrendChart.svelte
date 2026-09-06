<script>
  import { formatMoney, formatMonth } from '$lib/currency.js';
  /** @type {{ data: {ym:string, incoming:number, outgoing:number}[], currency:string }} */
  let { data, currency } = $props();

  const W = 720;
  const H = 240;
  const PAD = { t: 14, r: 8, b: 26, l: 8 };

  let rows = $derived([...data].reverse());
  let max = $derived(Math.max(1, ...rows.flatMap((r) => [r.incoming, r.outgoing])));

  // "nice" axis ceiling
  let ceil = $derived.by(() => {
    const mag = Math.pow(10, Math.floor(Math.log10(max)));
    const n = Math.ceil(max / mag);
    return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  });

  let plotW = $derived(W - PAD.l - PAD.r);
  let plotH = $derived(H - PAD.t - PAD.b);
  let step = $derived(plotW / Math.max(rows.length, 1));
  let barW = $derived(Math.min(13, step / 3.2));

  const y = (v) => PAD.t + plotH - (v / ceil) * plotH;
  const gridVals = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => f * ceil));

  let hover = $state(null);
</script>

<div class="relative">
  <svg viewBox="0 0 {W} {H}" class="w-full" style="overflow:visible" role="img" aria-label="Monthly income and spending">
    <defs>
      <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.95" />
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.55" />
      </linearGradient>
    </defs>

    {#each gridVals as gv}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(gv)} y2={y(gv)} stroke="var(--border)" stroke-width="1" />
      <text x={PAD.l} y={y(gv) - 4} font-size="10" fill="var(--ink-faint)" class="tnum">
        {gv >= 1000 ? (gv / 1000).toFixed(gv % 1000 ? 1 : 0) + 'k' : gv}
      </text>
    {/each}

    {#each rows as r, i}
      {@const cx = PAD.l + i * step + step / 2}
      <g
        role="presentation"
        onpointerenter={() => (hover = { ...r, x: (cx / W) * 100 })}
        onpointerleave={() => (hover = null)}
      >
        <rect x={cx - step / 2} y={PAD.t} width={step} height={plotH} fill="transparent" />
        <rect
          x={cx - barW - 1.5} y={y(r.incoming)} width={barW}
          height={Math.max(0, PAD.t + plotH - y(r.incoming))}
          rx="3" fill="url(#inGrad)"
          class="transition-[y,height] duration-500"
        />
        <rect
          x={cx + 1.5} y={y(r.outgoing)} width={barW}
          height={Math.max(0, PAD.t + plotH - y(r.outgoing))}
          rx="3" fill="var(--ink)" opacity={hover && hover.ym === r.ym ? '0.85' : '0.28'}
          class="transition-[y,height,opacity] duration-500"
        />
        <text x={cx} y={H - 8} font-size="10" text-anchor="middle" fill="var(--ink-faint)">
          {r.ym.slice(5)}/{r.ym.slice(2, 4)}
        </text>
      </g>
    {/each}
  </svg>

  {#if hover}
    <div
      class="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[11px] shadow-[var(--shadow-md)]"
      style="left:{hover.x}%; top:-2px"
    >
      <p class="mb-0.5 font-semibold">{formatMonth(hover.ym)}</p>
      <p class="tnum" style="color:var(--positive)">+ {formatMoney(hover.incoming, currency)}</p>
      <p class="tnum" style="color:var(--ink-soft)">− {formatMoney(hover.outgoing, currency)}</p>
    </div>
  {/if}
</div>

<div class="mt-3 flex gap-4 text-[11px] text-[var(--ink-faint)]">
  <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded" style="background:var(--accent)"></span> Incoming</span>
  <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded" style="background:var(--ink);opacity:.4"></span> Outgoing</span>
</div>
