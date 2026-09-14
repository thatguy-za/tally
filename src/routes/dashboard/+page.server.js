import { redirect } from '@sveltejs/kit';

// Dashboard was folded into Insights, which is now the home page. Kept as a
// redirect so old bookmarks and links still land somewhere useful.
export function load() {
  throw redirect(303, '/insights');
}
