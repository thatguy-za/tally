<script>
  import { formatMoney } from '$lib/currency.js';
  /** @type {{ data: {ym:string, incoming:number, outgoing:number}[], currency:string }} */
  let { data, currency } = $props();

  let rows = $derived([...data].reverse());
  let max = $derived(Math.max(1, ...rows.flatMap((r) => [r.incoming, r.outgoing])));
</script>

<div class="flex items-end gap-3 overflow-x-auto pb-2">
  {#each rows as r}
    <div class="flex min-w-[44px] flex-1 flex-col items-center gap-1.5">
      <div class="flex h-40 items-end gap-1" title={`In ${formatMoney(r.incoming, currency)} · Out ${formatMoney(r.outgoing, currency)}`}>
        <div class="w-3.5 rounded-t bg-emerald-400" style="height: {(r.incoming / max) * 100}%"></div>
        <div class="w-3.5 rounded-t bg-rose-400" style="height: {(r.outgoing / max) * 100}%"></div>
      </div>
      <span class="text-[11px] font-medium text-slate-500">{r.ym.slice(5)}/{r.ym.slice(2, 4)}</span>
    </div>
  {/each}
</div>
<div class="mt-3 flex gap-4 text-xs text-slate-500">
  <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded bg-emerald-400"></span> Incoming</span>
  <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded bg-rose-400"></span> Outgoing</span>
</div>
