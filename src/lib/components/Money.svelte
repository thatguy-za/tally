<script>
  import { untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { formatMoney } from '$lib/currency.js';

  /**
   * @type {{
   *   value: number, currency: string, class?: string,
   *   countUp?: boolean, colour?: 'auto' | 'none' | 'positive' | 'muted' | 'ink',
   *   abs?: boolean, animate?: boolean
   * }}
   */
  let {
    value,
    currency,
    class: cls = '',
    countUp = false,
    colour = 'none',
    abs = false,
    animate = true
  } = $props();

  const reduce =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Seeded with the real figure, so server rendering, reduced motion and a
  // frame loop that never gets to run all show the correct number. The
  // animation only ever refines what is already right — it can't be the only
  // thing standing between the reader and the value.
  // svelte-ignore state_referenced_locally -- seeding only; the effect below owns every later change
  let shown = $state(value ?? 0);
  let mounted = false;

  $effect(() => {
    const target = value ?? 0;
    if (!animate || reduce) {
      shown = target;
      return;
    }
    // first paint counts up from zero when asked; later changes tween from
    // wherever the display had got to
    const from = mounted ? untrack(() => shown) : countUp ? 0 : target;
    mounted = true;
    if (from === target) {
      shown = target;
      return;
    }

    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - t0) / 600);
      shown = t < 1 ? from + (target - from) * cubicOut(t) : target;
      if (t < 1) raf = requestAnimationFrame(tick);
    });
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

<span class="tnum {cls}" style={colourStyle}>{formatMoney(display, currency)}</span>
