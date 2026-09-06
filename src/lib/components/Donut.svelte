<script>
  /** @type {{ segments: {name:string,color:string,total:number}[] }} */
  let { segments } = $props();
  let total = $derived(Math.max(1, segments.reduce((s, x) => s + x.total, 0)));

  let arcs = $derived.by(() => {
    let acc = 0;
    return segments.map((s) => {
      const frac = s.total / total;
      const a = { ...s, offset: acc, frac };
      acc += frac;
      return a;
    });
  });
  const C = 2 * Math.PI * 42;
</script>

<svg viewBox="0 0 100 100" class="h-40 w-40 -rotate-90">
  <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" stroke-width="14" />
  {#each arcs as a}
    <circle
      cx="50" cy="50" r="42" fill="none" stroke={a.color} stroke-width="14"
      stroke-dasharray={`${a.frac * C} ${C}`}
      stroke-dashoffset={-a.offset * C}
    />
  {/each}
</svg>
