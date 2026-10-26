import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window;
const purify = createDOMPurify(window as unknown as Parameters<typeof createDOMPurify>[0]);

const EXTERNAL_URL = /^\s*(?!#)(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const URL_IN_CSS = /url\(\s*(['"]?)(?!#)([^'")]+)\1\s*\)/gi;

export interface SanitizedSvg {
  svg: string;
  /** Number of elements/attributes removed (0 = file was already clean). */
  removed: number;
}

/**
 * Makes an uploaded SVG safe to render (FR-RV-035/036): DOMPurify's SVG profile removes scripts,
 * event handlers, `foreignObject`, and unknown elements; we additionally drop every reference that
 * points outside the document (`href`/`xlink:href` to http(s), data:, javascript:, `url(...)` in
 * styles), so rendering never fetches anything. Only same-document `#fragment` links remain.
 */
export function sanitizeSvg(input: string): SanitizedSvg {
  let removed = 0;
  purify.removeAllHooks();
  purify.addHook('afterSanitizeAttributes', (node) => {
    for (const attr of ['href', 'xlink:href', 'src']) {
      const value = node.getAttribute(attr);
      if (value !== null && EXTERNAL_URL.test(value)) {
        node.removeAttribute(attr);
        removed += 1;
      }
    }
    const style = node.getAttribute('style');
    if (style && URL_IN_CSS.test(style)) {
      node.setAttribute('style', style.replace(URL_IN_CSS, 'none'));
      removed += 1;
    }
    URL_IN_CSS.lastIndex = 0;
  });
  purify.addHook('uponSanitizeElement', (node, data) => {
    // <style> may import external sheets or fonts.
    if (data.tagName === 'style' && /@import|url\(/i.test(node.textContent ?? '')) {
      node.textContent = (node.textContent ?? '')
        .replace(/@import[^;]*;?/gi, '')
        .replace(URL_IN_CSS, 'none');
      removed += 1;
    }
  });
  const svg = purify.sanitize(input, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // <use> only references same-document fragments: external hrefs are removed by the hook above.
    ADD_TAGS: ['use'],
    FORBID_TAGS: ['foreignObject', 'script', 'iframe', 'object', 'embed', 'image', 'feImage'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover'],
    WHOLE_DOCUMENT: false,
  });
  // DOMPurify also reports the wrapper elements it parses into; count only real removals.
  removed += purify.removed.filter((r) => {
    if (!('element' in r)) return true;
    const name = (r.element as { nodeName?: string }).nodeName?.toUpperCase();
    return !['HTML', 'HEAD', 'BODY'].includes(name ?? '');
  }).length;
  purify.removeAllHooks();
  if (!/^\s*<svg[\s>]/i.test(svg)) throw new Error('not an SVG document after sanitizing');
  return { svg, removed };
}
