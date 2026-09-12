<script>
  import { formatMoney } from '$lib/currency.js';

  /**
   * One pair of stacked bars per month — income on the left, spending on the
   * right — each split by category. Segment order is fixed for the whole period
   * (largest category at the bottom), so a category holds its place and colour
   * from month to month instead of reshuffling by size.
   *
   * @type {{
   *   months: string[],
   *   income: { id: string|number, name: string, color: string|null }[],
   *   expense: { id: string|number, name: string, color: string|null }[],
   *   values: Record<string, { income: Record<string, number>, expense: Record<string, number> }>,
   *   currency: string,
   *   title?: string
   * }}
   */
  // the title renders inside the plot column so the legend can use the card's full height
  let { months, income, expense, values, currency, title = '' } = $props();

  // drawn at the wrapper's real width so text stays legible on a phone
  // instead of the whole picture scaling down
  let cw = $state(0);
  let W = $derived(Math.max(320, cw || 760));
  const H = 300;
  const PAD = { t: 26, r: 8, b: 40, l: 50 };
  let plotW = $derived(W - PAD.l - PAD.r);
  const plotH = H - PAD.t - PAD.b;
  const GAP = 2; // surface gap between stacked segments

  const money = (v) => formatMoney(v, currency);
  const short = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)));
  const fill = (c) => c || 'var(--border-strong)';

  const sumOf = (o) => Object.values(o).reduce((s, v) => s + v, 0);

  let max = $derived(
    Math.max(1, ...months.flatMap((m) => [sumOf(values[m].income), sumOf(values[m].expense)]))
  );
  // a tidy ceiling: 1, 2 or 5 × a power of ten
  let ceil = $derived.by(() => {
    const mag = Math.pow(10, Math.floor(Math.log10(max)));
    const n = Math.ceil(max / mag);
    return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  });
  const y = (v) => PAD.t + plotH - (v / ceil) * plotH;
  // gridlines at round numbers: 5 steps for a 5×, 4 for a 1× or 2× ceiling
  let ticks = $derived.by(() => {
    const steps = String(ceil)[0] === '5' ? 5 : 4;
    return Array.from({ length: steps + 1 }, (_, i) => (ceil / steps) * i);
  });

  let groupW = $derived(plotW / months.length);
  let barW = $derived(Math.max(8, Math.min(30, (groupW - 10) / 2 - 2)));
  let gapBars = $derived(barW >= 20 ? 8 : 4);
  // totals above bars only when they can't collide with the neighbour's
  let showTotals = $derived(groupW >= 110);
  let showInOut = $derived(groupW >= 80);

  // month only — the period picker above already states the years
  function label(ym) {
    const [yy, mm] = ym.split('-').map(Number);
    return new Date(yy, mm - 1, 1).toLocaleDateString(undefined, { month: 'short' });
  }

  /** Segment geometry for one bar, bottom-up. */
  function stack(x, series, bucket) {
    let acc = 0;
    const segs = series
      .filter((s) => bucket[s.id] > 0)
      .map((s) => ({ ...s, v: bucket[s.id] }));
    const total = segs.reduce((s, d) => s + d.v, 0);
    const out = segs.map((d, i) => {
      const top = y(acc + d.v);
      const h = Math.max(0, y(acc) - top - GAP);
      acc += d.v;
      const last = i === segs.length - 1;
      const path = last && h >= 4
        ? `M${x} ${top + 4}a4 4 0 0 1 4-4h${barW - 8}a4 4 0 0 1 4 4v${h - 4}h-${barW}z`
        : `M${x} ${top}h${barW}v${h}h-${barW}z`;
      return { ...d, path, total };
    });
    return { segs: out, total };
  }

  let bars = $derived(
    months.map((ym, i) => {
      const cx = PAD.l + groupW * i + groupW / 2;
      const xIn = cx - barW - gapBars / 2;
      const xOut = cx + gapBars / 2;
      return {
        ym,
        cx,
        xIn,
        xOut,
        label: label(ym),
        income: stack(xIn, income, values[ym].income),
        expense: stack(xOut, expense, values[ym].expense)
      };
    })
  );

  // hover tooltip, positioned against the wrapper
  let tip = $state(null);
  let wrap;
  function show(e, seg, kind, ym) {
    const r = wrap.getBoundingClientRect();
    tip = {
      x: e.clientX - r.left + 12,
      y: e.clientY - r.top - 10,
      name: seg.name,
      color: fill(seg.color),
      amount: money(seg.v),
      note: `${kind} · ${label(ym)} · ${Math.round((seg.v / seg.total) * 100)}% of ${money(seg.total)}`
    };
  }
</script>

<div class="flex items-start gap-5">
  <div class="min-w-0 flex-1">
    {#if title}<h2 class="mb-4 text-lg">{title}</h2>{/if}
    <div class="relative" bind:this={wrap} bind:clientWidth={cw}>
    <svg viewBox="0 0 {W} {H}" width={W} height={H} class="block max-w-full" role="img"
      aria-label="Monthly income and spending, each stacked by category">
      {#each ticks as t}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" stroke-width="1" />
        <text x={PAD.l - 8} y={y(t) + 4} text-anchor="end" font-size="10" fill="var(--ink-faint)">{short(t)}</text>
      {/each}

      {#each bars as b (b.ym)}
        {#each [['income', b.income, b.xIn], ['spending', b.expense, b.xOut]] as [kind, st, x]}
          {#each st.segs as seg (seg.id)}
            <path d={seg.path} fill={fill(seg.color)} style="cursor:default"
              role="presentation"
              onmousemove={(e) => show(e, seg, kind, b.ym)}
              onmouseleave={() => (tip = null)}>
              <title>{seg.name}: {money(seg.v)} ({kind}, {b.label})</title>
            </path>
          {/each}
          {#if showTotals && st.total > 0}
            <text x={x + barW / 2} y={y(st.total) - 7} text-anchor="middle" font-size="10.5"
              font-weight="600" fill="var(--ink-soft)">{money(st.total)}</text>
          {/if}
          {#if showInOut}
            <text x={x + barW / 2} y={H - PAD.b + 14} text-anchor="middle" font-size="9.5"
              fill="var(--ink-faint)">{kind === 'income' ? 'in' : 'out'}</text>
          {/if}
        {/each}
        <text x={b.cx} y={H - PAD.b + (showInOut ? 30 : 18)} text-anchor="middle" font-size="12"
          font-weight="500" fill="var(--ink-soft)">{b.label}</text>
      {/each}

      <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" stroke-width="1" />
    </svg>

    {#if tip}
      <div class="pointer-events-none absolute z-10 whitespace-nowrap rounded-[8px] border border-[var(--border-strong)] px-2.5 py-1.5 text-[12px] shadow-[var(--shadow-lg)]"
        style="left:{tip.x}px;top:{tip.y}px;background:var(--surface-raised);color:var(--ink)">
        <span class="mr-1.5 inline-block h-2 w-2 rounded-[2px] align-middle" style="background:{tip.color}"></span>
        {tip.name} · <b class="tnum">{tip.amount}</b>
        <div class="mt-0.5 text-[var(--ink-faint)]">{tip.note}</div>
      </div>
    {/if}
    </div>
  </div>

  <div class="flex w-[150px] shrink-0 flex-col gap-4 text-[12px] text-[var(--ink-soft)] sm:w-[170px]">
    {#each [['Income', income], ['Spending', expense]] as [title, series]}
      {#if series.length}
        <div>
          <p class="kicker mb-1.5">{title}</p>
          {#each series as s (s.id)}
            <div class="flex items-center gap-2 py-[3px]">
              <span class="h-2.5 w-2.5 shrink-0 rounded-[3px]" style="background:{fill(s.color)}"></span>
              <span class="truncate">{s.name}</span>
            </div>
          {/each}
        </div>
      {/if}
    {/each}
    {#if !showInOut}
      <p class="text-[11px] text-[var(--ink-faint)]">Income left, spending right.</p>
    {/if}
  </div>
</div>
