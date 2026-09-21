<script>
  import { formatMoney } from '$lib/privacy.svelte.js';
  import Icon from './Icon.svelte';

  /**
   * A single month's spending by category, as a doughnut with a legend and a
   * centred total. Used by Insights when the period picker is set to one month
   * (StackedMonths needs several months to be worth a bar chart).
   *
   * Ungrouped categories always render as their own slice. A category
   * carrying a `group_name` (e.g. "Home" on both Mortgage and Utilities)
   * starts collapsed under a group heading in the legend. Clicking a group's
   * expand button only reveals its members there; clicking its name (like
   * clicking any category's name) isolates the doughnut to just that group.
   * @type {{ segments: { id: any, name: string, color: string|null, value: number, group_name?: string|null }[], currency: string, title?: string, onSegmentClick?: (seg: object) => void }}
   */
  let { segments, currency, title = '', onSegmentClick } = $props();

  const fill = (c) => c || 'var(--border-strong)';
  const money = (v) => formatMoney(v, currency);

  // expanding a group in the legend is purely a display choice — it only
  // reveals that group's members there, entirely separate from clicking its
  // name to isolate the doughnut to that group
  let expandedGroups = $state(new Set());
  function toggleExpand(name) {
    const next = new Set(expandedGroups);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    expandedGroups = next;
  }

  let focusedGroup = $state(null);
  function toggleFocusGroup(name) {
    focusedGroup = focusedGroup === name ? null : name;
  }

  /** `segments`, filtered down to the focused group's categories, if any. */
  let displaySegments = $derived(focusedGroup ? segments.filter((s) => s.group_name === focusedGroup) : segments);

  /**
   * `segments`, as {kind:'header', name, color} / {kind:'item', ...category}
   * entries for the legend — a group's members always sit together right
   * after its header, even when they're not adjacent in `segments`' own rank
   * order (an ungrouped category ranked in between them would otherwise
   * split the group apart and look like one of its members).
   */
  let legendEntries = $derived.by(() => {
    const groupItems = new Map(); // group name -> every one of its items, in rank order
    for (const it of segments) {
      if (!it.group_name) continue;
      if (!groupItems.has(it.group_name)) groupItems.set(it.group_name, []);
      groupItems.get(it.group_name).push(it);
    }
    const seenGroups = new Set();
    const out = [];
    for (const it of segments) {
      if (!it.group_name) { out.push({ kind: 'item', ...it }); continue; }
      if (seenGroups.has(it.group_name)) continue;
      seenGroups.add(it.group_name);
      out.push({ kind: 'header', name: it.group_name, color: it.color });
      for (const member of groupItems.get(it.group_name)) out.push({ kind: 'item', ...member });
    }
    return out;
  });

  const R = 90; // outer radius
  const R_INNER = 55;
  const CX = 100;
  const CY = 100;
  const GAP_DEG = 1.4; // thin surface gap between segments, angle-equivalent of StackedMonths' 2px

  let total = $derived(displaySegments.reduce((s, d) => s + d.value, 0));

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
    return displaySegments.map((s) => {
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
          <path d={seg.path} fill={fill(seg.color)} class="transition-[filter] duration-150 hover:brightness-110"
            style="cursor:{onSegmentClick ? 'pointer' : 'default'}"
            role="presentation"
            onmousemove={(e) => show(e, seg)} onmouseleave={() => (tip = null)}
            onclick={() => onSegmentClick?.(seg)}></path>
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
    {#each legendEntries as entry (entry.kind === 'header' ? `h:${entry.name}` : entry.id)}
      {#if entry.kind === 'header'}
        {@const isFocused = focusedGroup === entry.name}
        {@const dimmed = focusedGroup && !isFocused}
        {@const expanded = expandedGroups.has(entry.name)}
        <div class="flex items-center gap-1 rounded py-[3px] transition-opacity hover:opacity-100 {dimmed ? 'opacity-40' : ''}">
          <button type="button" class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            onclick={() => toggleFocusGroup(entry.name)}>
            <span class="h-2.5 w-2.5 shrink-0 rounded-[3px]" style="background:{fill(entry.color)}"></span>
            <span class="min-w-0 flex-1 truncate font-medium {isFocused ? 'text-[var(--ink)]' : ''}">{entry.name}</span>
          </button>
          <button type="button" class="shrink-0 rounded p-0.5 text-[var(--ink-faint)] hover:text-[var(--ink)]"
            aria-label="{expanded ? 'Collapse' : 'Expand'} {entry.name}" aria-expanded={expanded}
            onclick={() => toggleExpand(entry.name)}>
            <Icon name="chevronDown" size={11} class="transition-transform {expanded ? 'rotate-180' : ''}" />
          </button>
        </div>
      {:else if !entry.group_name || expandedGroups.has(entry.group_name)}
        {@const dimmed = focusedGroup && entry.group_name !== focusedGroup}
        <button type="button" disabled={!onSegmentClick}
          class="flex items-center gap-2 rounded py-[3px] text-left transition-opacity hover:opacity-100 {onSegmentClick ? 'hover:text-[var(--ink)]' : ''} {entry.group_name ? 'pl-4' : ''} {dimmed ? 'opacity-40' : ''}"
          onclick={() => onSegmentClick?.(entry)}>
          <span class="h-2.5 w-2.5 shrink-0 rounded-[3px]" style="background:{fill(entry.color)}"></span>
          <span class="min-w-0 flex-1 truncate">{entry.name}</span>
        </button>
      {/if}
    {/each}
  </div>
</div>
