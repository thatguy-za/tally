<script>
  import { formatMoney, privacy } from '$lib/privacy.svelte.js';
  import Icon from './Icon.svelte';

  /**
   * One pair of stacked bars per month — income on the left, spending on the
   * right — each split by category. Segment order is fixed for the whole period
   * (largest category at the bottom), so a category holds its place and colour
   * from month to month instead of reshuffling by size.
   *
   * Clicking a category in the legend shows just that one on the graph;
   * clicking it again (or the "×" on the chip above the chart) goes back to
   * every category. Only one category can be picked at a time — no
   * additive hide/show bookkeeping. The last entry in each list may be an
   * "Other (N)" bucket carrying its folded-away members in `.folded`; its
   * own chevron expands that list so any of them can be picked individually
   * too, same as any other category.
   *
   * @type {{
   *   months: string[],
   *   income: { id: string|number, name: string, color: string|null, folded?: {id:string|number,name:string,color:string|null}[] }[],
   *   expense: { id: string|number, name: string, color: string|null, folded?: {id:string|number,name:string,color:string|null}[] }[],
   *   values: Record<string, { income: Record<string, number>, expense: Record<string, number> }>,
   *   currency: string,
   *   title?: string,
   *   onSegmentClick?: (seg: object, ym: string, source: 'income'|'expense') => void,
   *   onMonthClick?: (ym: string) => void
   * }}
   */
  // the title renders inside the plot column so the legend can use the card's full height
  let { months, income, expense, values, currency, title = '', onSegmentClick, onMonthClick } = $props();

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
  // the axis gridlines' own shorthand, not routed through formatMoney — mask
  // it the same way under "hide numbers" instead of leaking the real scale
  const short = (v) =>
    privacy.hideNumbers ? '••' : v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v));
  const fill = (c) => c || 'var(--border-strong)';

  // an "Other" entry stands in for its folded members' combined total,
  // which isn't a real key in `values` — everything else reads its own id
  const valueOf = (item, bucket) =>
    item.folded ? item.folded.reduce((s, f) => s + (bucket[f.id] || 0), 0) : bucket[item.id] || 0;
  const sumSeries = (bucket, series) => series.reduce((s, c) => s + valueOf(c, bucket), 0);

  // ---- pick one category to show on the graph; picking another switches to
  // it, and picking the same one again (or the chip's "×") goes back to
  // every category. "Other"'s own chevron expands its folded members so any
  // of them can be picked individually too ----
  let selected = $state(null); // { source: 'income'|'expense', item: {id,name,color} } | null
  const isSelected = (item, source) => selected?.source === source && selected?.item.id === item.id;
  function pick(item, source) {
    selected = isSelected(item, source) ? null : { source, item };
  }
  let expandedOther = $state(new Set());
  function toggleOtherExpanded(source) {
    const next = new Set(expandedOther);
    if (next.has(source)) next.delete(source);
    else next.add(source);
    expandedOther = next;
  }

  let activeIncome = $derived(selected ? (selected.source === 'income' ? [selected.item] : []) : income);
  let activeExpense = $derived(selected ? (selected.source === 'expense' ? [selected.item] : []) : expense);

  // ---- vertical zoom: a multiplier on top of the auto-fit ceiling ----
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 8;
  let zoom = $state(1);
  function zoomIn() { zoom = Math.min(ZOOM_MAX, zoom * 1.5); }
  function zoomOut() { zoom = Math.max(ZOOM_MIN, zoom / 1.5); }
  function zoomReset() { zoom = 1; }

  // auto-fit ceiling from the unzoomed data, so zoom scales smoothly instead
  // of jumping only when the shrunk max crosses into the next tidy bracket
  let autoMax = $derived(
    Math.max(
      1,
      ...months.flatMap((m) => [sumSeries(values[m].income, activeIncome), sumSeries(values[m].expense, activeExpense)])
    )
  );
  // a tidy ceiling: 1, 2 or 5 × a power of ten
  let autoCeil = $derived.by(() => {
    const mag = Math.pow(10, Math.floor(Math.log10(autoMax)));
    const n = Math.ceil(autoMax / mag);
    return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  });
  let ceil = $derived(autoCeil / zoom);
  const y = (v) => PAD.t + plotH - (v / ceil) * plotH;
  // gridlines evenly spaced (step count fixed by the un-zoomed ceiling so it
  // doesn't flicker between 4 and 5 as zoom changes)
  let ticks = $derived.by(() => {
    const steps = String(autoCeil)[0] === '5' ? 5 : 4;
    return Array.from({ length: steps + 1 }, (_, i) => (ceil / steps) * i);
  });

  let groupW = $derived(plotW / months.length);
  let barW = $derived(Math.max(8, Math.min(30, (groupW - 10) / 2 - 2)) * 0.85);
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
      .map((s) => ({ ...s, v: valueOf(s, bucket) }))
      .filter((s) => s.v > 0);
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
        income: stack(xIn, activeIncome, values[ym].income),
        expense: stack(xOut, activeExpense, values[ym].expense)
      };
    })
  );

  // hover tooltip, positioned against the wrapper
  let tip = $state(null);
  let wrap;
  function show(e, seg, ym) {
    const r = wrap.getBoundingClientRect();
    tip = {
      x: e.clientX - r.left + 12,
      y: e.clientY - r.top - 10,
      name: seg.name,
      color: fill(seg.color),
      amount: money(seg.v),
      note: `${label(ym)} · ${Math.round((seg.v / seg.total) * 100)}% of ${money(seg.total)}`
    };
  }
</script>

<div class="flex flex-col gap-5 sm:flex-row sm:items-start">
  <div class="min-w-0 flex-1">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      {#if title}<h2 class="text-lg">{title}</h2>{/if}
      <div class="ml-auto flex items-center gap-2">
        {#if selected}
          <button type="button" class="chip flex items-center gap-1.5 text-[12px]" onclick={() => (selected = null)}>
            {selected.item.name}
            <Icon name="x" size={11} />
          </button>
        {/if}
        <div class="flex items-center gap-0.5 rounded-[var(--radius-xs)] border border-[var(--border)] p-0.5">
          <button type="button" class="grid h-6 w-6 place-items-center rounded-[6px] text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)] disabled:opacity-40"
            aria-label="Zoom out" onclick={zoomOut} disabled={zoom <= ZOOM_MIN}>
            <Icon name="minus" size={12} />
          </button>
          <button type="button" class="min-w-[36px] px-0.5 text-center text-[11px] tnum text-[var(--ink-faint)] hover:text-[var(--ink)]"
            onclick={zoomReset} title="Reset zoom">{Math.round(zoom * 100)}%</button>
          <button type="button" class="grid h-6 w-6 place-items-center rounded-[6px] text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)] disabled:opacity-40"
            aria-label="Zoom in" onclick={zoomIn} disabled={zoom >= ZOOM_MAX}>
            <Icon name="plus" size={12} />
          </button>
        </div>
      </div>
    </div>
    <div class="relative" bind:this={wrap} bind:clientWidth={cw}>
    <svg viewBox="0 0 {W} {H}" width={W} height={H} class="block max-w-full" role="img"
      aria-label="Monthly income and spending, each stacked by category">
      {#each ticks as t}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" stroke-width="1" />
        <text x={PAD.l - 8} y={y(t) + 4} text-anchor="end" font-size="10" fill="var(--ink-faint)">{short(t)}</text>
      {/each}

      {#each bars as b (b.ym)}
        {#each [[b.income, b.xIn, 'income'], [b.expense, b.xOut, 'expense']] as [st, x, source]}
          {#each st.segs as seg (seg.id)}
            <path d={seg.path} fill={fill(seg.color)} class="transition-[filter] duration-150 hover:brightness-110"
              style="cursor:{onSegmentClick ? 'pointer' : 'default'}"
              role="presentation"
              onmousemove={(e) => show(e, seg, b.ym)}
              onmouseleave={() => (tip = null)}
              onclick={() => onSegmentClick?.(seg, b.ym, source)}></path>
          {/each}
          {#if showTotals && st.total > 0}
            <text x={x + barW / 2} y={y(st.total) - 7} text-anchor="middle" font-size="10.5"
              font-weight="600" fill="var(--ink-soft)">{money(st.total)}</text>
          {/if}
          {#if showInOut}
            <text x={x + barW / 2} y={H - PAD.b + 14} text-anchor="middle" font-size="9.5"
              fill="var(--ink-faint)">{st === b.income ? 'in' : 'out'}</text>
          {/if}
        {/each}
        <text x={b.cx} y={H - PAD.b + (showInOut ? 30 : 18)} text-anchor="middle" font-size="12"
          font-weight="500" fill="var(--ink-soft)" style="cursor:{onMonthClick ? 'pointer' : 'default'}"
          role="presentation" onclick={() => onMonthClick?.(b.ym)}>{b.label}</text>
      {/each}

      <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" stroke-width="1" />
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

  <div class="flex w-full shrink-0 flex-col gap-4 text-[12px] text-[var(--ink-soft)] sm:w-[170px]">
    {#each [['Income', income, 'income'], ['Spending', expense, 'expense']] as [groupTitle, series, source]}
      {#if series.length}
        <div>
          <p class="kicker mb-1.5">{groupTitle}</p>
          {#each series as s (s.id)}
            {@const dimmed = selected && !isSelected(s, source)}
            {#if s.folded}
              <div class="flex items-center gap-0.5">
                <button type="button"
                  class="flex w-full min-w-0 flex-1 items-center gap-2 rounded py-[3px] text-left transition-opacity hover:opacity-100 {dimmed ? 'opacity-40' : ''}"
                  onclick={() => pick(s, source)}>
                  <span class="h-2.5 w-2.5 shrink-0 rounded-[3px]" style="background:{fill(s.color)}"></span>
                  <span class="truncate">{s.name}</span>
                </button>
                <button type="button" class="shrink-0 rounded p-1 text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  aria-label={expandedOther.has(source) ? `Collapse ${s.name}` : `Expand ${s.name}`}
                  onclick={() => toggleOtherExpanded(source)}>
                  <Icon name="arrowRight" size={11} class="transition-transform {expandedOther.has(source) ? 'rotate-90' : ''}" />
                </button>
              </div>
              {#if expandedOther.has(source)}
                <div class="ml-3 mt-0.5 space-y-0.5 border-l border-[var(--border)] py-0.5 pl-2.5">
                  {#each s.folded as f (f.id)}
                    {@const fDimmed = selected && !isSelected(f, source)}
                    <button type="button"
                      class="flex w-full items-center gap-2 rounded py-[3px] text-left text-[11.5px] transition-opacity hover:opacity-100 {fDimmed ? 'opacity-40' : ''}"
                      onclick={() => pick(f, source)}>
                      <span class="h-2 w-2 shrink-0 rounded-[3px]" style="background:{fill(f.color)}"></span>
                      <span class="truncate">{f.name}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            {:else}
              <button type="button"
                class="flex w-full items-center gap-2 rounded py-[3px] text-left transition-opacity hover:opacity-100 {dimmed ? 'opacity-40' : ''}"
                onclick={() => pick(s, source)}>
                <span class="h-2.5 w-2.5 shrink-0 rounded-[3px]" style="background:{fill(s.color)}"></span>
                <span class="truncate">{s.name}</span>
              </button>
            {/if}
          {/each}
        </div>
      {/if}
    {/each}
    {#if !showInOut}
      <p class="text-[11px] text-[var(--ink-faint)]">Income left, spending right.</p>
    {/if}
  </div>
</div>
