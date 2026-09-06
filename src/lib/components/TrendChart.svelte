<script>
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { formatMoney, formatMonth } from '$lib/currency.js';
  /** @type {{ data: {ym:string, incoming:number, outgoing:number}[], currency:string }} */
  let { data, currency } = $props();

  const W = 720;
  const H = 240;
  const PAD = { t: 14, r: 8, b: 26, l: 8 };

  let rows = $derived([...data].reverse());
  let max = $derived(Math.max(1, ...rows.flatMap((r) => [r.incoming, r.outgoing])));

  let ceil = $derived.by(() => {
    const mag = Math.pow(10, Math.floor(Math.log10(max)));
    const n = Math.ceil(max / mag);
    return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  });

  let plotW = $derived(W - PAD.l - PAD.r);
  let plotH = $derived(H - PAD.t - PAD.b);
  let step = $derived(plotW / Math.max(rows.length, 1));
  let barW = $derived(Math.min(13, step / 3.2));
  const baseY = $derived(PAD.t + plotH);

  const y = (v) => PAD.t + plotH - (v / ceil) * plotH;
  const gridVals = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => f * ceil));
  const fmtTick = (v) => (v >= 1000 ? +(v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : v);

  const reduce =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const grow = new Tween(0, { duration: 780, easing: cubicOut });
  $effect(() => {
    grow.set(reduce ? 1 : 0, { duration: 0 });
    if (!reduce) grow.target = 1;
  });

  let hover = $state(null);
  const barH = (v) => Math.max(0, (baseY - y(v)) * grow.current);
</script>

<div class="relative">
  <svg viewBox="0 0 {W} {H}" class="w-full" style="overflow:visible" role="img" aria-label="Monthly income and spending">
    <defs>
      <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.95" />
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.5" />
      </linearGradient>
    </defs>

    {#each gridVals as gv}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(gv)} y2={y(gv)}
        stroke="var(--border)" stroke-width="1" stroke-dasharray={gv === 0 ? '0' : '2 4'} />
      <text x={PAD.l} y={y(gv) - 4} font-size="10" fill="var(--ink-faint)" class="tnum">{fmtTick(gv)}</text>
    {/each}

    {#each rows as r, i}
      {@const cx = PAD.l + i * step + step / 2}
      {@const on = hover && hover.ym === r.ym}
      <g role="presentation"
        onpointerenter={() => (hover = { ...r, x: (cx / W) * 100, cx })}
        onpointerleave={() => (hover = null)}>
        <rect x={cx - step / 2} y={PAD.t} width={step} height={plotH} fill="transparent" />
        {#if on}
          <line x1={cx} x2={cx} y1={PAD.t - 4} y2={baseY} stroke="var(--border-strong)" stroke-width="1" />
        {/if}
        <rect x={cx - barW - 1.5} y={baseY - barH(r.incoming)} width={barW} height={barH(r.incoming)}
          rx="3" fill="url(#inGrad)" />
        <rect x={cx + 1.5} y={baseY - barH(r.outgoing)} width={barW} height={barH(r.outgoing)}
          rx="3" fill="var(--ink)" opacity={on ? '0.85' : '0.26'}
          class="transition-opacity duration-200" />
        <text x={cx} y={H - 8} font-size="10" text-anchor="middle"
          fill={on ? 'var(--ink)' : 'var(--ink-faint)'}>
          {r.ym.slice(5)}/{r.ym.slice(2, 4)}
        </text>
      </g>
    {/each}
  </svg>

  {#if hover}
    <div
      class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[11px] shadow-[var(--shadow-md)]"
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
