<script>
  import Icon from './Icon.svelte';
  import ManualAddPanel from './ManualAddPanel.svelte';
  import TransactionImportPanel from './TransactionImportPanel.svelte';

  /** @type {{ data: any, form: any, onClose: () => void }} */
  let { data, form, onClose } = $props();

  let tab = $state('import');

  function onWindowKey(e) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="overlay" role="dialog" aria-modal="true" aria-label="Add or import transactions">
  <div class="card w-full max-w-4xl rise max-h-[90vh] overflow-y-auto">
    <div class="mb-4 flex items-start justify-between gap-3">
      <div class="inline-flex rounded-[9px] p-0.5" style="background:var(--paper-sunk)">
        <button
          type="button"
          class="rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-colors {tab === 'import' ? 'bg-[var(--paper)] shadow-sm' : 'text-[var(--ink-faint)]'}"
          onclick={() => (tab = 'import')}
        >
          Import CSV
        </button>
        <button
          type="button"
          class="rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-colors {tab === 'add' ? 'bg-[var(--paper)] shadow-sm' : 'text-[var(--ink-faint)]'}"
          onclick={() => (tab = 'add')}
        >
          Add
        </button>
      </div>
      <button
        class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
        onclick={onClose}
        aria-label="Close"
      >
        <Icon name="x" size={16} />
      </button>
    </div>

    {#if tab === 'add'}
      <ManualAddPanel {data} {form} {onClose} />
    {:else}
      <TransactionImportPanel {data} {onClose} />
    {/if}
  </div>
</div>
