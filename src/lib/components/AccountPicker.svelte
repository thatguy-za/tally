<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  /** @type {{ accounts: {id:number, name:string}[], selected: string }} */
  let { accounts, selected = '' } = $props();

  function change(e) {
    const url = new URL($page.url);
    const v = e.currentTarget.value;
    if (v) url.searchParams.set('account', v);
    else url.searchParams.delete('account');
    goto(url, { keepFocus: true, noScroll: true });
  }
</script>

<select class="input max-w-[180px]" value={selected} onchange={change}>
  <option value="">All accounts</option>
  {#each accounts as a}<option value={String(a.id)}>{a.name}</option>{/each}
  <option value="none">No account</option>
</select>
