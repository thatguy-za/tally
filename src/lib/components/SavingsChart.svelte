<script>
  import { formatMoney } from '$lib/currency.js';

  /**
   * One bar per month of net savings contributions — money put aside is a
   * positive bar, a withdrawal (more taken out than paid in that month) dips
   * below the zero line instead of being hidden.
   * @type {{ series: { ym: string, saved: number }[], currency: string }}
   */
  let { series, currency } = $props();

  let cw = $state(0);
  let W = $derived(Math.max(320, cw || 760));
  const H = 220;
  const PAD = { t: 20, r: 8, b: 30, l: 50 };
  let plotW = $derived(W - PAD.l - PAD.r);
  const plotH = H - PAD.t - PAD.b;

  const money = (v) => formatMoney(v, currency);
  const short = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)));

  function label(ym) {
    const [yy, mm] = ym.split('-').map(Number);
    return new Date(yy, mm - 1, 1).toLocaleDateString(undefined, { month: 'short' });
  }

  /** A tidy ceiling: 1, 2 or 5 × a power of ten (0 stays 0). */
  function tidyCeil(v) {
    if (v <= 0) return 0;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = Math.ceil(v / mag);
    return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  }

  let domainMax = $derived(tidyCeil(Math.max(0, ...series.map((p) => p.saved))) || 1);
  let domainMin = $derived(-tidyCeil(Math.max(0, ...series.map((p) => -p.saved))));
  let span = $derived(domainMax - domainMin || 1);
  const y = (v) => PAD.t + plotH - ((v - domainMin) / span) * plotH;
  let zeroY = $derived(y(0));

  let ticks = $derived.by(() => {
    const steps = 4;
    return Array.from({ length: steps + 1 }, (_, i) => domainMin + (span / steps) * i);
  });

  let groupW = $derived(plotW / Math.max(1, series.length));
  let barW = $derived(Math.max(10, Math.min(48, groupW - 16)));
  let showLabels = $derived(groupW >= 70);

  let bars = $derived(
    series.map((p, i) => {
      const cx = PAD.l + groupW * i + groupW / 2;
      const top = Math.min(y(p.saved), zeroY);
      const height = Math.max(1, Math.abs(y(p.saved) - zeroY));
      return { ...p, cx, x: cx - barW / 2, top, height, label: label(p.ym) };
    })
  );
</script>

<div class="relative" bind:clientWidth={cw}>
  <svg viewBox="0 0 {W} {H}" width={W} height={H} class="block max-w-full" role="img"
    aria-label="Savings put aside each month">
    {#each ticks as t}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" stroke-width="1" />
      <text x={PAD.l - 8} y={y(t) + 4} text-anchor="end" font-size="10" fill="var(--ink-faint)">{short(t)}</text>
    {/each}

    {#each bars as b (b.ym)}
      <rect x={b.x} y={b.top} width={barW} height={b.height} rx="3"
        fill={b.saved < 0 ? 'var(--negative)' : 'var(--positive)'}>
        <title>{b.label}: {money(b.saved)}</title>
      </rect>
      {#if showLabels}
        <text x={b.cx} y={b.saved < 0 ? b.top + b.height + 13 : b.top - 6} text-anchor="middle"
          font-size="10.5" font-weight="600" fill="var(--ink-soft)">{money(b.saved)}</text>
      {/if}
      <text x={b.cx} y={H - PAD.b + 16} text-anchor="middle" font-size="12" fill="var(--ink-soft)">{b.label}</text>
    {/each}

    <line x1={PAD.l} x2={W - PAD.r} y1={zeroY} y2={zeroY} stroke="var(--border-strong)" stroke-width="1" />
  </svg>
</div>
