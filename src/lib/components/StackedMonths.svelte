<script>
  import { formatMoney, privacy } from '$lib/privacy.svelte.js';
  import Icon from './Icon.svelte';

  /**
   * One pair of stacked bars per month — income on the left, spending on the
   * right — each split by category. Segment order is fixed for the whole period
   * (largest category at the bottom), so a category holds its place and colour
   * from month to month instead of reshuffling by size.
   *
   * Every category renders as its own segment in the bars. In the legend, an
   * ungrouped category always shows on its own, but a category carrying a
   * `group_name` (e.g. "Home" on both Mortgage and Utilities) starts
   * collapsed under a group heading — clicking that heading only reveals its
   * members there; clicking a category's own name is what isolates the bars
   * down to just that one category.
   * @type {{
   *   months: string[],
   *   income: { id: string|number, name: string, color: string|null, group_name?: string|null }[],
   *   expense: { id: string|number, name: string, color: string|null, group_name?: string|null }[],
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

  // with groups set up, the group names carry enough meaning on their own —
  // the generic "Income"/"Spending" section headings just add noise
  let hasGroups = $derived(income.some((c) => c.group_name) || expense.some((c) => c.group_name));

  /**
   * `series`, as {kind:'header', name, color} / {kind:'item', ...category}
   * entries for the legend — a group's members always sit together right
   * after its header, even when they're not adjacent in `series`' own rank
   * order (an ungrouped category ranked in between them would otherwise
   * split the group apart and look like one of its members).
   */
  function legendShape(series) {
    const groupItems = new Map(); // group name -> every one of its items, in rank order
    for (const it of series) {
      if (!it.group_name) continue;
      if (!groupItems.has(it.group_name)) groupItems.set(it.group_name, []);
      groupItems.get(it.group_name).push(it);
    }
    const seenGroups = new Set();
    const out = [];
    for (const it of series) {
      if (!it.group_name) { out.push({ kind: 'item', ...it }); continue; }
      if (seenGroups.has(it.group_name)) continue;
      seenGroups.add(it.group_name);
      out.push({ kind: 'header', name: it.group_name, color: it.color });
      for (const member of groupItems.get(it.group_name)) out.push({ kind: 'item', ...member });
    }
    return out;
  }
  let legendIncome = $derived(legendShape(income));
  let legendExpense = $derived(legendShape(expense));

  // ---- expanding a group in the legend is purely a display choice — it only
  // reveals that group's members there, it never touches the chart ----
  let expandedGroups = $state(new Set());
  function toggleExpand(name, source) {
    const key = `${source}:${name}`;
    const next = new Set(expandedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedGroups = next;
  }
  const isExpanded = (name, source) => expandedGroups.has(`${source}:${name}`);

  // ---- click a category's own name, or a group's own name, to isolate it
  // across every month — entirely separate from expanding that group above ----
  let focused = $state(null); // { type: 'category' | 'group', id?, name, color, source, group_name? }
  function toggleFocusCategory(seg, source) {
    focused = focused?.type === 'category' && focused.id === seg.id && focused.source === source
      ? null
      : { type: 'category', id: seg.id, name: seg.name, color: seg.color, source, group_name: seg.group_name || null };
  }
  function toggleFocusGroup(name, color, source) {
    focused = focused?.type === 'group' && focused.name === name && focused.source === source
      ? null
      : { type: 'group', name, color, source };
  }
  function headerDimmed(name, source) {
    if (!focused) return false;
    if (focused.source !== source) return true;
    return (focused.type === 'group' ? focused.name : focused.group_name) !== name;
  }
  function itemDimmed(entry, source) {
    if (!focused) return false;
    if (focused.source !== source) return true;
    if (focused.type === 'category') return focused.id !== entry.id;
    return entry.group_name !== focused.name;
  }
  function filterActive(series, source) {
    if (!focused) return series;
    if (focused.source !== source) return [];
    if (focused.type === 'category') return series.filter((s) => s.id === focused.id);
    return series.filter((s) => s.group_name === focused.name);
  }
  let activeIncome = $derived(filterActive(income, 'income'));
  let activeExpense = $derived(filterActive(expense, 'expense'));

  // ---- vertical zoom: a multiplier on top of the auto-fit ceiling ----
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 8;
  let zoom = $state(1);
  function zoomIn() { zoom = Math.min(ZOOM_MAX, zoom * 1.5); }
  function zoomOut() { zoom = Math.max(ZOOM_MIN, zoom / 1.5); }
  function zoomReset() { zoom = 1; }

  const sumSeries = (bucket, series) => series.reduce((s, c) => s + (bucket[c.id] || 0), 0);

  // auto-fit ceiling from the unzoomed data, so zoom scales smoothly instead
  // of jumping only when the shrunk max crosses into the next tidy bracket
  let autoMax = $derived(
    Math.max(
      1,
      ...months.flatMap((m) => [
        sumSeries(values[m].income, activeIncome),
        sumSeries(values[m].expense, activeExpense)
      ])
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
      .map((s) => ({ ...s, v: bucket[s.id] || 0 }))
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

<div class="flex items-start gap-5">
  <div class="min-w-0 flex-1">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      {#if title}<h2 class="text-lg">{title}</h2>{/if}
      <div class="ml-auto flex items-center gap-2">
        {#if focused}
          <button type="button" class="chip flex items-center gap-1.5 text-[12px]" onclick={() => (focused = null)}>
            <span class="h-2 w-2 rounded-full" style="background:{fill(focused.color)}"></span>
            {focused.name}
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
    {#if !showInOut}
      <p class="mb-2 text-[11px] text-[var(--ink-faint)]">Income left, spending right.</p>
    {/if}
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

  <div class="flex w-[150px] shrink-0 flex-col gap-4 text-[12px] text-[var(--ink-soft)] sm:w-[170px]">
    {#each [['Income', legendIncome, 'income'], ['Spending', legendExpense, 'expense']] as [groupTitle, entries, source]}
      {#if entries.length}
        <div>
          {#if !hasGroups}<p class="kicker mb-1.5">{groupTitle}</p>{/if}
          {#each entries as entry (entry.kind === 'header' ? `h:${entry.name}` : entry.id)}
            {#if entry.kind === 'header'}
              {@const dimmed = headerDimmed(entry.name, source)}
              {@const groupFocused = focused?.type === 'group' && focused.name === entry.name && focused.source === source}
              {@const expanded = isExpanded(entry.name, source)}
              <div class="flex w-full items-center gap-1 rounded py-[3px] transition-opacity hover:opacity-100 {dimmed ? 'opacity-40' : ''}">
                <button type="button" class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  onclick={() => toggleFocusGroup(entry.name, entry.color, source)}>
                  <span class="h-2.5 w-2.5 shrink-0 rounded-[3px]" style="background:{fill(entry.color)}"></span>
                  <span class="min-w-0 flex-1 truncate font-medium {groupFocused ? 'text-[var(--ink)]' : ''}">{entry.name}</span>
                </button>
                <button type="button" class="shrink-0 rounded p-0.5 text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  aria-label="{expanded ? 'Collapse' : 'Expand'} {entry.name}" aria-expanded={expanded}
                  onclick={() => toggleExpand(entry.name, source)}>
                  <Icon name="chevronDown" size={11} class="transition-transform {expanded ? 'rotate-180' : ''}" />
                </button>
              </div>
            {:else if !entry.group_name || isExpanded(entry.group_name, source)}
              {@const isFocused = focused?.type === 'category' && focused.id === entry.id && focused.source === source}
              {@const dimmed = itemDimmed(entry, source)}
              <button type="button"
                class="flex w-full items-center gap-2 rounded py-[3px] text-left transition-opacity hover:opacity-100 {dimmed ? 'opacity-40' : ''} {entry.group_name ? 'pl-4' : ''}"
                onclick={() => toggleFocusCategory(entry, source)}>
                <span class="h-2.5 w-2.5 shrink-0 rounded-[3px]" style="background:{fill(entry.color)}"></span>
                <span class="truncate {isFocused ? 'font-semibold text-[var(--ink)]' : ''}">{entry.name}</span>
              </button>
            {/if}
          {/each}
        </div>
      {/if}
    {/each}
  </div>
</div>
