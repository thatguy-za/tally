<script>
  import { deserialize } from '$app/forms';
  import Icon from './Icon.svelte';
  import ColorPicker from './ColorPicker.svelte';

  /**
   * The "+ Add account" journey — a proper overlay (not a cramped dropdown
   * form) so there's room for a colour picker alongside the name.
   * @type {{ onClose: () => void, onCreated: (account: {id:number,name:string,color:string}) => void }}
   */
  let { onClose, onCreated } = $props();

  let name = $state('');
  let color = $state('#7b8a5a');
  let saving = $state(false);
  let error = $state('');

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    saving = true;
    error = '';
    const body = new FormData();
    body.set('name', name.trim());
    body.set('color', color);
    try {
      const res = await fetch('/settings?/addAccount', {
        method: 'POST',
        body,
        headers: { 'x-sveltekit-action': 'true' }
      });
      const result = deserialize(await res.text());
      if (result.type === 'success' && result.data?.created) {
        onCreated(result.data.created);
      } else {
        error = result.data?.error || 'Could not add that account.';
      }
    } catch {
      error = 'Could not add that account.';
    } finally {
      saving = false;
    }
  }

  function onWindowKey(e) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<div class="overlay" role="dialog" aria-modal="true" aria-label="Add an account"
  onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="card w-full max-w-sm rise">
    <div class="mb-4 flex items-start justify-between gap-3">
      <h2 class="text-lg">Add an account</h2>
      <button
        class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
        onclick={onClose}
        aria-label="Close"
      >
        <Icon name="x" size={16} />
      </button>
    </div>

    <form onsubmit={submit} class="space-y-4">
      <div class="flex items-center gap-2">
        <ColorPicker bind:value={color} size="h-9 w-9" label="Colour for new account" />
        <div class="min-w-0 flex-1">
          <label class="label" for="new-acct-name">Name</label>
          <input class="input w-full" id="new-acct-name" placeholder="e.g. Emergency fund"
            bind:value={name} required />
        </div>
      </div>

      {#if error}<p class="text-sm" style="color:var(--negative)">{error}</p>{/if}

      <div class="flex items-center gap-2">
        <button class="btn btn-primary" disabled={!name.trim() || saving}>
          {saving ? 'Adding…' : 'Add account'}
        </button>
        <button type="button" class="btn btn-ghost" onclick={onClose}>Cancel</button>
      </div>
    </form>
  </div>
</div>
