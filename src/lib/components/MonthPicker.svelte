<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatMonth } from '$lib/currency.js';
  /** @type {{ months: string[], selected: string }} */
  let { months, selected } = $props();

  // Always include the selected month even if it has no transactions yet.
  let options = $derived(
    [...new Set([selected, ...months])].filter(Boolean).sort().reverse()
  );

  function change(e) {
    const url = new URL($page.url);
    url.searchParams.set('month', e.currentTarget.value);
    goto(url, { keepFocus: true, noScroll: true });
  }
</script>

<select class="input max-w-[220px]" value={selected} onchange={change}>
  {#each options as m}
    <option value={m}>{formatMonth(m)}</option>
  {/each}
</select>
