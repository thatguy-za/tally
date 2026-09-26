<script>
  import { formatMoney } from '$lib/privacy.svelte.js';

  /**
   * One month's money flow: income sources on the left, a single "Income"
   * hub in the middle, expense categories on the right — so incoming and
   * outgoing money show in one picture instead of two separate charts.
   *
   * Whichever side is smaller gets a synthetic node making up the
   * difference, so the diagram always balances: income over spending shows
   * a "Saved" node on the right; spending over income shows a "From
   * savings" node on the left (the shortfall had to come from somewhere).
   *
   * @type {{
   *   income: { id: string|number, name: string, color: string|null, value: number }[],
   *   expense: { id: string|number, name: string, color: string|null, value: number }[],
   *   currency: string,
   *   title?: string,
   *   onNodeClick?: (node: object, source: 'income'|'expense') => void
   * }}
   */
  let { income, expense, currency, title = '', onNodeClick } = $props();

  // linear interpolation of x within [x0,x1] onto [y0,y1], clamped at the ends
  // — used everywhere below so every size scales smoothly with width instead
  // of snapping between two fixed states at one breakpoint
  const lerp = (x, x0, x1, y0, y1) => {
    if (x <= x0) return y0;
    if (x >= x1) return y1;
    return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  };

  let outerW = $state(0);
  let cw = $state(0);
  // never wider than the real container — a forced minimum here would
  // overflow it on a narrow phone instead of shrinking to fit
  let W = $derived(cw || 720);
  const H = 380;
  const PAD = { t: 16, r: 4, b: 16, l: 4 };
  // a narrow screen has no room for a fixed 132px of label text on each
  // side — shrink the gutter (and truncate names within it) so the bars and
  // ribbons still get most of the width, without losing the labels entirely.
  // Everything below ramps continuously across this width range rather than
  // jumping at a single breakpoint.
  const W0 = 320;
  const W1 = 640;
  let NODE_W = $derived(lerp(W, W0, W1, 10, 14));
  const GAP = 10;
  // below this the bar's too thin for even a single truncated line — hide the
  // label rather than crowd it against its neighbours
  const LABEL_MIN_H = 8;
  let LABEL_GUTTER = $derived(lerp(W, W0, W1, 40, 132));
  let nameFont = $derived(lerp(W, W0, W1, 10, 11.5));
  let amountFont = $derived(lerp(W, W0, W1, 9, 10.5));
  // characters that fit on one line within the gutter, at the current name
  // font size — used to wrap (not just truncate) long category names
  let maxLineChars = $derived(Math.max(6, Math.round((LABEL_GUTTER - 10) / (nameFont * 0.56))));
  let plotH = $derived(H - PAD.t - PAD.b);
  let labelGap = $derived(lerp(W, W0, W1, 5, 8));

  // the card's own side padding, scaled the same way — near-zero on a phone
  // so the chart bleeds to the card edge, full padding once there's room
  let titlePad = $derived(lerp(outerW || W1, W0, W1, 14, 24));
  let chartPad = $derived(lerp(outerW || W1, W0, W1, 2, 24));

  const money = (v) => formatMoney(v, currency);
  const fill = (c) => c || 'var(--border-strong)';

  let incomeTotal = $derived(income.reduce((s, c) => s + c.value, 0));
  let expenseTotal = $derived(expense.reduce((s, c) => s + c.value, 0));
  let saved = $derived(incomeTotal - expenseTotal);

  // both sides always sum to the same total once the balancing node is
  // added, so one scale (value → px) works for the whole diagram
  let leftRaw = $derived(
    saved < -0.5
      ? [...income, { id: '__from_savings', name: 'From savings', color: 'var(--negative)', value: -saved, synthetic: true }]
      : income
  );
  let rightRaw = $derived(
    saved > 0.5
      ? [...expense, { id: '__saved', name: 'Saved', color: 'var(--positive)', value: saved, synthetic: true }]
      : expense
  );
  let hubTotal = $derived(Math.max(incomeTotal, expenseTotal, 1));

  // compressed so the busier column's inter-node gaps still fit in plotH —
  // the hub (one node, no gaps) then falls a little short of the full
  // height, which reads fine since it's the plain pass-through bar
  let maxCount = $derived(Math.max(leftRaw.length, rightRaw.length, 1));
  let scale = $derived((plotH - GAP * (maxCount - 1)) / hubTotal);

  function place(nodes, x) {
    let y = PAD.t;
    return nodes.map((n) => {
      const h = Math.max(2, n.value * scale);
      const seg = { ...n, x, y, h };
      y += h + GAP;
      return seg;
    });
  }
  /** Tight-packed slice of `nodes` against one edge of the hub, in the same order as their own column. */
  function stackTight(nodes, top) {
    let y = top;
    return nodes.map((n) => {
      const hubY = y;
      y += n.h;
      return hubY;
    });
  }

  let xLeft = $derived(PAD.l + LABEL_GUTTER);
  let xHub = $derived(W / 2 - NODE_W / 2);
  let xRight = $derived(W - PAD.r - LABEL_GUTTER - NODE_W);

  let leftNodes = $derived(place(leftRaw, xLeft));
  let rightNodes = $derived(place(rightRaw, xRight));
  let hubTop = $derived(PAD.t);
  let hubH = $derived(hubTotal * scale);

  let leftHubY = $derived(stackTight(leftNodes, hubTop));
  let rightHubY = $derived(stackTight(rightNodes, hubTop));

  function ribbon(x0, y0, x1, y1, h) {
    const xm = (x0 + x1) / 2;
    return `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + h} C${xm},${y1 + h} ${xm},${y0 + h} ${x0},${y0 + h} Z`;
  }

  let leftLinks = $derived(
    leftNodes.map((n, i) => ({
      path: ribbon(n.x + NODE_W, n.y, xHub, leftHubY[i], n.h),
      color: n.color,
      node: n
    }))
  );
  let rightLinks = $derived(
    rightNodes.map((n, i) => ({
      path: ribbon(xHub + NODE_W, rightHubY[i], n.x, n.y, n.h),
      color: n.color,
      node: n
    }))
  );

  // SVG text never wraps on its own — a long category name would either
  // blow straight through the gutter (getting clipped at the SVG's edge) or
  // just look truncated, so wrap it onto up to `maxLines` lines ourselves,
  // word by word, ellipsizing only what still doesn't fit
  function wrapLines(name, maxLen, maxLines) {
    const words = name.split(' ');
    const lines = [];
    let cur = '';
    let i = 0;
    while (i < words.length && lines.length < maxLines) {
      const candidate = cur ? `${cur} ${words[i]}` : words[i];
      if (candidate.length <= maxLen || !cur) {
        cur = candidate;
        i++;
      } else {
        lines.push(cur);
        cur = '';
      }
    }
    if (cur) lines.push(cur);
    if (i < words.length) {
      let last = lines[lines.length - 1] || '';
      while (last.length > 1 && `${last}…`.length > maxLen) last = last.slice(0, -1);
      lines[lines.length - 1] = `${last.replace(/\s+$/, '')}…`;
    }
    return lines.length ? lines : [name];
  }

  let tip = $state(null);
  let wrap;
  function show(e, node) {
    const r = wrap.getBoundingClientRect();
    tip = { x: e.clientX - r.left + 12, y: e.clientY - r.top - 10, name: node.name, color: fill(node.color), amount: money(node.value) };
  }
  function click(node, source) {
    if (node.synthetic) return;
    onNodeClick?.(node, source);
  }
</script>

<div class="min-w-0 flex-1 py-5" bind:clientWidth={outerW}>
  <!-- the heading wants normal breathing room even on a phone; only the
       chart itself needs to shave its own padding down to almost nothing —
       both scale continuously with the measured card width above -->
  {#if title}<h2 class="mb-4 text-lg" style="padding-inline:{titlePad}px">{title}</h2>{/if}
  <div class="relative" style="padding-inline:{chartPad}px" bind:this={wrap} bind:clientWidth={cw}>
    <svg viewBox="0 0 {W} {H}" width={W} height={H} class="block max-w-full" role="img"
      aria-label="Money in and out this month">
      {#each leftLinks as l}
        <path d={l.path} fill={fill(l.color)} fill-opacity="0.32" class="transition-opacity hover:fill-opacity-50"
          style="cursor:{onNodeClick && !l.node.synthetic ? 'pointer' : 'default'}"
          role="presentation" onmousemove={(e) => show(e, l.node)} onmouseleave={() => (tip = null)}
          onclick={() => click(l.node, 'income')}></path>
      {/each}
      {#each rightLinks as l}
        <path d={l.path} fill={fill(l.color)} fill-opacity="0.32" class="transition-opacity hover:fill-opacity-50"
          style="cursor:{onNodeClick && !l.node.synthetic ? 'pointer' : 'default'}"
          role="presentation" onmousemove={(e) => show(e, l.node)} onmouseleave={() => (tip = null)}
          onclick={() => click(l.node, 'expense')}></path>
      {/each}

      <rect x={xHub} y={hubTop} width={NODE_W} height={hubH} rx="3" fill="var(--ink-faint)" />

      {#each leftNodes as n}
        <rect x={n.x} y={n.y} width={NODE_W} height={n.h} rx="3" fill={fill(n.color)}
          class="transition-[filter] hover:brightness-110"
          style="cursor:{onNodeClick && !n.synthetic ? 'pointer' : 'default'}"
          role="presentation" onmousemove={(e) => show(e, n)} onmouseleave={() => (tip = null)}
          onclick={() => click(n, 'income')} />
        {#if n.h >= LABEL_MIN_H}
          {@const lines = wrapLines(n.name, maxLineChars, n.h >= 30 ? 2 : 1)}
          <text x={n.x - labelGap} text-anchor="end" font-size={nameFont} font-weight="600" fill="var(--ink-soft)">
            {#each lines as line, i}
              <tspan x={n.x - labelGap} y={n.y + n.h / 2 - 3 - (lines.length - 1 - i) * (nameFont + 3)}>{line}</tspan>
            {/each}
          </text>
          <text x={n.x - labelGap} y={n.y + n.h / 2 + 10} text-anchor="end" font-size={amountFont} fill="var(--ink-faint)" class="tnum">{money(n.value)}</text>
        {/if}
      {/each}

      {#each rightNodes as n}
        <rect x={n.x} y={n.y} width={NODE_W} height={n.h} rx="3" fill={fill(n.color)}
          class="transition-[filter] hover:brightness-110"
          style="cursor:{onNodeClick && !n.synthetic ? 'pointer' : 'default'}"
          role="presentation" onmousemove={(e) => show(e, n)} onmouseleave={() => (tip = null)}
          onclick={() => click(n, 'expense')} />
        {#if n.h >= LABEL_MIN_H}
          {@const lines = wrapLines(n.name, maxLineChars, n.h >= 30 ? 2 : 1)}
          <text x={n.x + NODE_W + labelGap} text-anchor="start" font-size={nameFont} font-weight="600" fill="var(--ink-soft)">
            {#each lines as line, i}
              <tspan x={n.x + NODE_W + labelGap} y={n.y + n.h / 2 - 3 - (lines.length - 1 - i) * (nameFont + 3)}>{line}</tspan>
            {/each}
          </text>
          <text x={n.x + NODE_W + labelGap} y={n.y + n.h / 2 + 10} text-anchor="start" font-size={amountFont} fill="var(--ink-faint)" class="tnum">{money(n.value)}</text>
        {/if}
      {/each}
    </svg>

    {#if tip}
      <div class="pointer-events-none absolute z-10 whitespace-nowrap rounded-[var(--radius-xs)] border border-[var(--border-strong)] px-2.5 py-1.5 text-[12px] shadow-[var(--shadow-lg)]"
        style="left:{tip.x}px;top:{tip.y}px;background:var(--surface-raised);color:var(--ink)">
        <span class="mr-1.5 inline-block h-2 w-2 rounded-[2px] align-middle" style="background:{tip.color}"></span>
        {tip.name} · <b class="tnum">{tip.amount}</b>
      </div>
    {/if}
  </div>
</div>
