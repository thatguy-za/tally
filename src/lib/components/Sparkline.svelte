<script>
  /** @type {{ values: number[], color?: string, width?: number, height?: number, fill?: boolean }} */
  let { values = [], color = 'var(--ink-faint)', width = 72, height = 22, fill = true } = $props();

  let pts = $derived.by(() => {
    if (!values.length) return '';
    const max = Math.max(1, ...values);
    const n = values.length;
    const dx = n > 1 ? width / (n - 1) : 0;
    return values.map((v, i) => {
      const x = i * dx;
      const y = height - 2 - (v / max) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
  });
  let line = $derived(pts.join(' '));
  let area = $derived(pts.length ? `0,${height} ${line} ${width},${height}` : '');
  let last = $derived(pts.length ? pts[pts.length - 1].split(',') : null);
</script>

{#if values.length > 1}
  <svg {width} {height} viewBox="0 0 {width} {height}" class="overflow-visible" aria-hidden="true">
    {#if fill}
      <polygon points={area} fill={color} opacity="0.12" />
    {/if}
    <polyline points={line} fill="none" stroke={color} stroke-width="1.5"
      stroke-linecap="round" stroke-linejoin="round" />
    {#if last}
      <circle cx={last[0]} cy={last[1]} r="1.9" fill={color} />
    {/if}
  </svg>
{/if}
