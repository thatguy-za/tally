import { confirmDialog } from '$lib/confirm.svelte.js';

/**
 * Makes a form ask first. The submit is stopped before anything else sees it
 * — including SvelteKit's `use:enhance`, which does not look at whether a
 * submit was cancelled and would otherwise go ahead regardless of the answer —
 * and is sent again only if the user confirms.
 *
 * @param {HTMLFormElement} form
 * @param {{ message: string, title?: string, confirmLabel?: string, danger?: boolean, skip?: boolean }} options
 *   `skip` lets a form that only sometimes needs asking go straight through.
 */
export function confirmSubmit(form, options) {
  let current = options;
  let approved = false;

  /** @param {SubmitEvent} e */
  function onSubmit(e) {
    if (approved) {
      approved = false;
      return;
    }
    if (current.skip) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const submitter = e.submitter;
    confirmDialog(current).then((ok) => {
      if (!ok) return;
      approved = true;
      form.requestSubmit(submitter instanceof HTMLElement ? submitter : undefined);
    });
  }

  // capture phase, so it runs before the listeners enhance adds
  form.addEventListener('submit', onSubmit, true);
  return {
    update(next) {
      current = next;
    },
    destroy() {
      form.removeEventListener('submit', onSubmit, true);
    }
  };
}
