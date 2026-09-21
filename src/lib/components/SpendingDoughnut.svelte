<script>
  import { formatMoney } from '$lib/privacy.svelte.js';
  import Icon from './Icon.svelte';

  /**
   * A single month's spending by category, as a doughnut with a legend and a
   * centred total. Used by Insights when the period picker is set to one month
   * (StackedMonths needs several months to be worth a bar chart).
   *
   * A segment carrying a `group_name` (e.g. "Home" on both Mortgage and
   * Utilities) is folded into one merged slice under that group until the
   * viewer expands it — categories with no group are unaffected.
   * @type {{ segments: { id: any, name: string, color: string|null, value: number, group_name?: string|null }[], currency: string, title?: string, onSegmentClick?: (seg: object) => void }}
   */
  let { segments, currency, title = '', onSegmentClick } = $props();

  const fill = (c) => c || 'var(--border-strong)';
  const money = (v) => formatMoney(v, currency);

  // groups a viewer hasn't expanded render as one merged slice — collapsing
  // is purely a display choice here, so it lives as local UI state rather
  // than anything persisted
  let expandedGroups = $state(new Set());
  function toggleGroup(id) {
    const next = new Set(expandedGroups);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedGroups = next;
  }

  /** `segments`, with grouped categories folded into one slice unless expanded. */
  let displaySegments = $derived.by(() => {
    const headers = new Map(); // group_name -> the merged slice pushed into `out`
    const out = [];
    for (const it of segments) {
      if (!it.group_name) {
        out.push(it);
        continue;
      }
      const gid = `group:${it.group_name}`;
      let header = headers.get(it.group_name);
      if (!header) {
        header = { id: gid, name: it.group_name, color: it.color, value: 0, isGroup: true, expanded: expandedGroups.has(gid) };
        headers.set(it.group_name, header);
        out.push(header);
      }
      if (header.expanded) out.push({ ...it, groupId: gid, groupName: it.group_name });
      else header.value += it.value;
    }
    return out;
  });

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
            style="cursor:{(onSegmentClick || seg.isGroup) ? 'pointer' : 'default'}"
            role="presentation"
            onmousemove={(e) => show(e, seg)} onmouseleave={() => (tip = null)}
            onclick={() => (seg.isGroup ? toggleGroup(seg.id) : onSegmentClick?.(seg))}></path>
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
      {#if s.isGroup}
        <button type="button" class="flex items-center gap-1.5 rounded py-[3px] text-left hover:text-[var(--ink)]"
          aria-label="{s.expanded ? 'Collapse' : 'Expand'} {s.name}" aria-expanded={s.expanded}
          onclick={() => toggleGroup(s.id)}>
          <span class="h-2.5 w-2.5 shrink-0 rounded-[3px]" style="background:{fill(s.color)}"></span>
          <span class="min-w-0 flex-1 truncate font-medium">{s.name}</span>
          <Icon name="chevronDown" size={11} class="shrink-0 text-[var(--ink-faint)] transition-transform {s.expanded ? 'rotate-180' : ''}" />
        </button>
      {:else}
      <button type="button" disabled={!onSegmentClick}
        class="flex items-center gap-2 rounded py-[3px] text-left {onSegmentClick ? 'hover:text-[var(--ink)]' : ''} {s.groupId ? 'pl-4' : ''}"
        onclick={() => onSegmentClick?.(s)}>
        <span class="h-2.5 w-2.5 shrink-0 rounded-[3px]" style="background:{fill(s.color)}"></span>
        <span class="min-w-0 flex-1 truncate">{s.name}</span>
      </button>
      {/if}
    {/each}
  </div>
</div>
