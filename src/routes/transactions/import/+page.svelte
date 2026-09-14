<script>
  import { goto } from '$app/navigation';
  import Icon from '$lib/components/Icon.svelte';
  import TransactionImportPanel from '$lib/components/TransactionImportPanel.svelte';
  let { data } = $props();
</script>

<svelte:head><title>Import · Tally</title></svelte:head>

<div class="mb-6 flex items-center gap-3 rise">
  <a href="/transactions" class="text-[var(--ink-faint)] hover:text-[var(--ink)]">
    <Icon name="arrowRight" size={18} class="rotate-180" />
  </a>
  <div>
    <p class="kicker mb-1">Transactions</p>
    <h1 class="text-3xl" style="font-family:var(--font-display)">Import from CSV</h1>
  </div>
</div>

<TransactionImportPanel {data} onClose={() => goto('/transactions')} />
