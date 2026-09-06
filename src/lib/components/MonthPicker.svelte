<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatMonth } from '$lib/currency.js';
  /** @type {{ months: string[], selected: string, extra?: {value:string,label:string}[] }} */
  let { months, selected, extra = [] } = $props();

  let options = $derived([...new Set([selected, ...months])].filter(Boolean).sort().reverse());

  function change(e) {
    const url = new URL($page.url);
    url.searchParams.set('month', e.currentTarget.value);
    goto(url, { keepFocus: true, noScroll: true });
  }
</script>

<select class="input max-w-[220px]" value={selected} onchange={change}>
  {#each extra as o}<option value={o.value}>{o.label}</option>{/each}
  {#each options as m}<option value={m}>{formatMonth(m)}</option>{/each}
</select>
