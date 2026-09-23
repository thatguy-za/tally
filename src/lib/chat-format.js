const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * A tiny, safe subset of markdown for Tori's chat replies — bold, italic and
 * inline code. Everything else is HTML-escaped first, so a stray
 * "**Shopping**" renders as bold instead of showing the literal asterisks,
 * without ever trusting the model's output as raw HTML.
 */
export function renderChatMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<code>${code}</code>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  return html;
}
