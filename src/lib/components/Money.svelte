<script>
  import { Tween } from 'svelte/motion';
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

  const tw = new Tween(0, { duration: 600, easing: cubicOut });
  let started = $state(false);

  $effect(() => {
    const v = value ?? 0;
    if (!animate || reduce) {
      tw.set(v, { duration: 0 });
    } else if (!started && !countUp) {
      tw.set(v, { duration: 0 });
    } else {
      tw.target = v;
    }
    started = true;
  });

  let display = $derived(abs ? Math.abs(tw.current) : tw.current);
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
