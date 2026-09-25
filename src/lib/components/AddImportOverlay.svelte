<script>
  import Icon from './Icon.svelte';
  import ManualAddPanel from './ManualAddPanel.svelte';
  import TransactionImportPanel from './TransactionImportPanel.svelte';

  /** @type {{ data: any, form: any, onClose: () => void }} */
  let { data, form, onClose } = $props();

  let tab = $state('import');
  // the CSV tab's own upload step (before a file's been analysed) is just a
  // small dropzone — a narrower, squarer card suits it better than the wide
  // card the review table (many columns) needs once a file's been read
  let compact = $state(true);

  function onWindowKey(e) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="overlay" role="dialog" aria-modal="true" aria-label="Add or import transactions"
  onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="card w-full rise max-h-[90vh] overflow-y-auto {tab === 'import' && compact ? 'max-w-lg' : 'max-w-4xl'}">
    <div class="mb-4 flex items-start justify-between gap-3">
      <div class="inline-flex rounded-[var(--radius-sm)] p-0.5" style="background:var(--paper-sunk)">
        <button
          type="button"
          class="rounded-[var(--radius-xs)] px-3 py-1.5 text-[13px] font-medium transition-colors {tab === 'import' ? 'bg-[var(--paper)] shadow-sm' : 'text-[var(--ink-faint)]'}"
          onclick={() => (tab = 'import')}
        >
          Import CSV
        </button>
        <button
          type="button"
          class="rounded-[var(--radius-xs)] px-3 py-1.5 text-[13px] font-medium transition-colors {tab === 'add' ? 'bg-[var(--paper)] shadow-sm' : 'text-[var(--ink-faint)]'}"
          onclick={() => (tab = 'add')}
        >
          Manual entry
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
      <TransactionImportPanel {data} {onClose} bind:compact />
    {/if}
  </div>
</div>
