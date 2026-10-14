<script>
  import { modal } from '$lib/actions/modal.js';
  import { confirmState, answerConfirm } from '$lib/confirm.svelte.js';

  function onKey(e) {
    if (confirmState.open && e.key === 'Escape') {
      e.stopPropagation();
      answerConfirm(false);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if confirmState.open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="overlay" use:modal role="alertdialog" tabindex="-1" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message"
    onclick={(e) => { if (e.target === e.currentTarget) answerConfirm(false); }}>
    <div class="card rise w-full max-w-sm">
      <h2 id="confirm-title" class="text-lg" style="font-family:var(--font-display)">{confirmState.title}</h2>
      <p id="confirm-message" class="mt-2 text-[14px] leading-relaxed text-[var(--ink-soft)]">{confirmState.message}</p>
      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <!-- Cancel takes the focus, so Enter on a dangerous question never confirms it by accident -->
        <button type="button" class="btn btn-ghost" data-autofocus onclick={() => answerConfirm(false)}>Cancel</button>
        <button type="button" class="btn {confirmState.danger ? '' : 'btn-primary'}"
          style={confirmState.danger ? 'background:var(--negative);color:#fff' : ''}
          onclick={() => answerConfirm(true)}>{confirmState.confirmLabel}</button>
      </div>
    </div>
  </div>
{/if}
