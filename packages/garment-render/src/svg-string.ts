/**
 * Scene → standalone SVG string (server-side export in I35, golden tests). Deterministic: the same
 * scene gives byte-identical output. Only elements and attributes the renderer produces are written,
 * every attribute is escaped, and texture URLs are limited to http(s), root-relative and image data
 * URLs — no scripts, no event handlers.
 */
import { fmt } from './geometry.js';
import { elementsOn, layoutViews, type ViewMode, viewBoxOf } from './layout.js';
import { ROLE_STYLES } from './styles.js';
import type { Layer, PatternDef, Scene, SceneElement } from './types.js';

export const escapeXml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const isSafeHref = (href: string): boolean =>
  /^https?:\/\//i.test(href) ||
  /^\/(?!\/)/.test(href) ||
  /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(href);

const attrs = (pairs: [string, string | number | null | undefined][]): string =>
  pairs
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}="${escapeXml(typeof v === 'number' ? fmt(v) : String(v))}"`)
    .join(' ');

export function patternMarkup(p: PatternDef): string {
  const s = p.sizeMm;
  const head = `<pattern ${attrs([
    ['id', p.id],
    ['patternUnits', 'userSpaceOnUse'],
    ['width', s],
    ['height', s],
    [
      'patternTransform',
      p.kind === 'texture' && p.rotationDeg ? `rotate(${fmt(p.rotationDeg)})` : null,
    ],
  ])}>`;
  const base = `<rect ${attrs([
    ['width', s],
    ['height', s],
    ['fill', p.base],
  ])}/>`;
  if (p.kind === 'stripe')
    return `${head}${base}<rect ${attrs([
      ['width', s / 3],
      ['height', s],
      ['fill', p.color],
    ])}/></pattern>`;
  if (p.kind !== 'texture')
    return `${head}${base}<rect ${attrs([
      ['width', s / 2],
      ['height', s],
      ['fill', p.color],
      ['fill-opacity', 0.35],
    ])}/><rect ${attrs([
      ['width', s],
      ['height', s / 2],
      ['fill', p.color],
      ['fill-opacity', 0.35],
    ])}/></pattern>`;
  const image = isSafeHref(p.href)
    ? `<image ${attrs([
        ['href', p.href],
        ['width', s],
        ['height', s],
        ['preserveAspectRatio', 'xMidYMid slice'],
      ])}/>`
    : '';
  return `${head}${base}${image}</pattern>`;
}

export function elementMarkup(e: SceneElement): string {
  const st = ROLE_STYLES[e.role];
  const path = `<path ${attrs([
    ['id', e.id],
    ['data-component-id', e.componentId],
    ['data-relationship-id', e.relationshipId],
    ['data-role', e.role],
    ['d', e.d],
    ['fill', e.fill],
    ['stroke', st.stroke],
    ['stroke-width', st.width],
    ['stroke-dasharray', st.dash],
    ['stroke-opacity', st.opacity === 1 ? null : st.opacity],
    ['vector-effect', 'non-scaling-stroke'],
  ])}><title>${escapeXml(e.label)}</title></path>`;
  if (!e.text) return path;
  const text = `<text ${attrs([
    ['x', e.text.x],
    ['y', e.text.y],
    ['font-size', 7],
    ['font-family', 'sans-serif'],
    ['text-anchor', 'middle'],
    ['dominant-baseline', 'middle'],
    ['fill', st.stroke],
  ])}>${escapeXml(e.text.value)}</text>`;
  return path + text;
}

export interface SvgOptions {
  view?: ViewMode;
  layers?: readonly Layer[];
  /** Title for assistive technology. */
  title?: string;
  /** Background colour (none by default). */
  background?: string;
}

export function sceneToSvg(scene: Scene, options: SvgOptions = {}): string {
  const mode = options.view ?? 'split';
  const { placements, bounds } = layoutViews(scene, mode);
  const layers = options.layers ? new Set(options.layers) : null;
  const title = options.title ?? `Technical flat (${mode})`;
  const out: string[] = [
    `<svg ${attrs([
      ['xmlns', 'http://www.w3.org/2000/svg'],
      ['viewBox', viewBoxOf(bounds)],
      ['width', `${fmt(bounds.width)}mm`],
      ['height', `${fmt(bounds.height)}mm`],
      ['role', 'img'],
      ['data-capability', scene.capability],
      ['data-coordinate-space', scene.coordinateSpace],
    ])}>`,
    `<title>${escapeXml(title)}</title>`,
  ];
  if (scene.patterns.length) out.push(`<defs>${scene.patterns.map(patternMarkup).join('')}</defs>`);
  if (options.background)
    out.push(
      `<rect ${attrs([
        ['x', bounds.x],
        ['y', bounds.y],
        ['width', bounds.width],
        ['height', bounds.height],
        ['fill', options.background],
      ])}/>`,
    );
  for (const p of placements) {
    out.push(
      `<g ${attrs([
        ['data-view', p.view],
        ['transform', p.dx ? `translate(${fmt(p.dx)} 0)` : null],
      ])}>`,
    );
    for (const e of elementsOn(scene, p.view, layers)) out.push(elementMarkup(e));
    out.push('</g>');
  }
  out.push('</svg>');
  return out.join('\n');
}
