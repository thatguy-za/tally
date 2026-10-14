/**
 * One styled "are you sure?" dialog for the whole app, in place of the
 * browser's plain confirm() box. `confirmDialog()` returns a promise that is
 * true if the user went ahead and false if they cancelled; <ConfirmDialog />
 * (mounted once, in the root layout) is what shows it.
 */
export const confirmState = $state({
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Continue',
  danger: false,
  /** @type {((ok: boolean) => void) | null} */
  resolve: null
});

/**
 * @param {{ title?: string, message: string, confirmLabel?: string, danger?: boolean }} opts
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title = 'Are you sure?', message, confirmLabel = 'Continue', danger = false }) {
  // a second request while one is open cancels the first rather than stacking
  confirmState.resolve?.(false);
  return new Promise((resolve) => {
    Object.assign(confirmState, { open: true, title, message, confirmLabel, danger, resolve });
  });
}

/** @param {boolean} ok */
export function answerConfirm(ok) {
  const resolve = confirmState.resolve;
  confirmState.open = false;
  confirmState.resolve = null;
  resolve?.(ok);
}
