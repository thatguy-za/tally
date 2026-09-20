import { error } from '@sveltejs/kit';
import { buildBackupZip } from '$lib/server/backup.js';

/** @type {import('./$types').RequestHandler} */
export function GET({ locals }) {
  if (!locals.user) throw error(401);

  const zip = buildBackupZip(locals.user.id);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(zip, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="tally-backup-${stamp}.zip"`,
      'content-length': String(zip.length)
    }
  });
}
