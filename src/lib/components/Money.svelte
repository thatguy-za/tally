<script>
  import { formatMoney } from '$lib/currency.js';
  /**
   * @type {{
   *   value: number, currency: string, class?: string,
   *   countUp?: boolean, colour?: 'auto' | 'none' | 'positive' | 'muted',
   *   abs?: boolean, size?: string
   * }}
   */
  let {
    value,
    currency,
    class: cls = '',
    countUp = false,
    colour = 'none',
    abs = false,
    size = ''
  } = $props();

  let shown = $state(0);

  $effect(() => {
    if (!countUp) {
      shown = value;
      return;
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      shown = value;
      return;
    }
    const from = 0;
    const to = value;
    const start = performance.now();
    const dur = 620;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      shown = from + (to - from) * eased;
      if (t < 1) raf = requestAnimationFrame(tick);
      else shown = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  let display = $derived(abs ? Math.abs(shown) : shown);
  let tone = $derived(
    colour === 'auto' ? (value > 0 ? 'positive' : value < 0 ? 'ink' : 'muted') : colour
  );
  let colourStyle = $derived(
    tone === 'positive'
      ? 'color:var(--positive)'
      : tone === 'muted'
        ? 'color:var(--ink-faint)'
        : tone === 'ink'
          ? 'color:var(--ink)'
          : ''
  );
</script>

<span class="tnum {size} {cls}" style={colourStyle}>{formatMoney(display, currency)}</span>
