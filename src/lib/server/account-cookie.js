/** The cookie naming which of a user's own accounts every page is scoped to. */
export const ACCOUNT_COOKIE = 'account_id';

/**
 * Set to "household" when the household's combined view is showing instead of
 * one of the user's own accounts. The account cookie above is left as it was,
 * so switching back lands on the same account.
 */
export const VIEW_COOKIE = 'view';
