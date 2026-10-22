/** Shared, deliberately plain email layout (works in every client; no remote images). */
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

export function renderEmail(opts: {
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footer: string;
}): {
  html: string;
  text: string;
} {
  const p = opts.paragraphs.map((t) => `<p style="margin:0 0 16px">${escapeHtml(t)}</p>`).join('');
  const button = opts.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.action.url)}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(opts.action.label)}</a></p><p style="margin:0 0 16px;font-size:12px;color:#555">Or paste this link into your browser:<br>${escapeHtml(opts.action.url)}</p>`
    : '';
  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px"><h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(opts.heading)}</h1>${p}${button}<hr style="border:none;border-top:1px solid #ddd;margin:24px 0"><p style="font-size:12px;color:#666">${escapeHtml(opts.footer)}</p></body></html>`;
  const text = [
    opts.heading,
    '',
    ...opts.paragraphs,
    ...(opts.action ? ['', `${opts.action.label}: ${opts.action.url}`] : []),
    '',
    '—',
    opts.footer,
  ].join('\n');
  return { html, text };
}
