/**
 * Tiny, safe SVG previews for the built-in library (generated, never user input). 96×96 viewBox,
 * neutral strokes so they read in light and dark themes.
 */
const STROKE = '#334155';
const wrap = (body: string, bg = 'none') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96"><rect width="96" height="96" fill="${bg}"/>${body}</svg>`;
const path = (d: string, fill = '#e2e8f0') =>
  `<path d="${d}" fill="${fill}" stroke="${STROKE}" stroke-width="2" stroke-linejoin="round"/>`;

export function sleeveSvg(lengthRatio: number, raglan: boolean): string {
  const bottom = 20 + Math.round(66 * lengthRatio);
  const cap = raglan ? 'M30 10 L66 10 L78 30' : 'M30 18 Q48 4 66 18 L74 30';
  const d = `${cap} L${66 - lengthRatio * 4} ${bottom} L${30 + lengthRatio * 4} ${bottom} L22 30 Z`;
  return wrap(path(raglan ? `M18 30 ${d.slice(1)}` : d));
}

export function collarSvg(style: 'point' | 'spread' | 'button_down' | 'mandarin' | 'camp'): string {
  if (style === 'mandarin') return wrap(path('M20 40 Q48 30 76 40 L76 52 Q48 44 20 52 Z'));
  const spread = style === 'spread' ? 30 : style === 'camp' ? 34 : 20;
  const tip = style === 'camp' ? 66 : 74;
  const left = path(`M48 36 L22 30 L${48 - spread} ${tip} Z`);
  const right = path(`M48 36 L74 30 L${48 + spread} ${tip} Z`);
  const band = path('M22 30 Q48 20 74 30 L74 36 Q48 28 22 36 Z', '#f1f5f9');
  const buttons =
    style === 'button_down'
      ? `<circle cx="${48 - spread + 6}" cy="${tip - 6}" r="2.5" fill="${STROKE}"/><circle cx="${48 + spread - 6}" cy="${tip - 6}" r="2.5" fill="${STROKE}"/>`
      : '';
  return wrap(band + left + right + buttons);
}

export function cuffSvg(buttons: number, rib = false, french = false): string {
  const body = path('M16 34 L80 34 L80 62 L16 62 Z', rib ? '#cbd5e1' : '#e2e8f0');
  const ribs = rib
    ? Array.from(
        { length: 15 },
        (_, i) =>
          `<line x1="${20 + i * 4}" y1="36" x2="${20 + i * 4}" y2="60" stroke="${STROKE}" stroke-width="1"/>`,
      ).join('')
    : '';
  const fold = french
    ? `<line x1="16" y1="48" x2="80" y2="48" stroke="${STROKE}" stroke-dasharray="3 2"/>`
    : '';
  const btns = Array.from(
    { length: buttons },
    (_, i) => `<circle cx="${70 - i * 8}" cy="48" r="3" fill="#fff" stroke="${STROKE}"/>`,
  ).join('');
  return wrap(body + ribs + fold + btns);
}

export function pocketSvg(shape: 'rounded' | 'pointed' | 'flap' | 'welt'): string {
  if (shape === 'welt') return wrap(path('M22 44 L74 44 L74 52 L22 52 Z'));
  const bottom =
    shape === 'pointed'
      ? 'L76 70 L48 80 L20 70'
      : shape === 'rounded'
        ? 'L76 70 Q76 80 66 80 L30 80 Q20 80 20 70'
        : 'L76 80 L20 80';
  const pocket = path(`M20 24 L76 24 ${bottom} Z`);
  const flap = shape === 'flap' ? path('M18 22 L78 22 L78 36 L48 44 L18 36 Z', '#cbd5e1') : '';
  return wrap(pocket + flap);
}

export function placketSvg(kind: 'standard' | 'concealed' | 'half'): string {
  const height = kind === 'half' ? 46 : 80;
  const strip = path(
    `M40 8 L56 8 L56 ${8 + height} L40 ${8 + height} Z`,
    kind === 'concealed' ? '#f1f5f9' : '#e2e8f0',
  );
  const count = kind === 'half' ? 3 : 5;
  const btns =
    kind === 'concealed'
      ? ''
      : Array.from(
          { length: count },
          (_, i) =>
            `<circle cx="48" cy="${18 + i * (height / count)}" r="3" fill="#fff" stroke="${STROKE}"/>`,
        ).join('');
  return wrap(strip + btns);
}

export function necklineSvg(kind: 'crew' | 'v_neck' | 'scoop'): string {
  const d =
    kind === 'v_neck'
      ? 'M16 20 L36 20 L48 54 L60 20 L80 20 L80 30 L62 30 L48 66 L34 30 L16 30 Z'
      : kind === 'scoop'
        ? 'M14 20 L30 20 Q48 66 66 20 L82 20 L82 30 L72 30 Q48 82 24 30 L14 30 Z'
        : 'M16 20 L32 20 Q48 44 64 20 L80 20 L80 30 L70 30 Q48 58 26 30 L16 30 Z';
  return wrap(path(d, '#cbd5e1'));
}

export function swatchSvg(
  base: string,
  pattern: 'solid' | 'chambray' | 'oxford' | 'twill' | 'jersey' | 'stripe' | 'check',
  accent = '#ffffff',
): string {
  let overlay = '';
  if (pattern === 'stripe')
    overlay = Array.from(
      { length: 8 },
      (_, i) => `<rect x="${i * 12}" y="0" width="5" height="96" fill="${accent}"/>`,
    ).join('');
  if (pattern === 'check')
    overlay =
      Array.from(
        { length: 6 },
        (_, i) =>
          `<rect x="${i * 16}" y="0" width="7" height="96" fill="${accent}" opacity="0.35"/>`,
      ).join('') +
      Array.from(
        { length: 6 },
        (_, i) =>
          `<rect x="0" y="${i * 16}" width="96" height="7" fill="${accent}" opacity="0.35"/>`,
      ).join('');
  if (pattern === 'twill')
    overlay = Array.from(
      { length: 16 },
      (_, i) =>
        `<line x1="${i * 8 - 48}" y1="96" x2="${i * 8 + 48}" y2="0" stroke="${accent}" stroke-opacity="0.25" stroke-width="2"/>`,
    ).join('');
  if (pattern === 'oxford' || pattern === 'chambray')
    overlay = Array.from(
      { length: 24 },
      (_, i) =>
        `<line x1="0" y1="${i * 4}" x2="96" y2="${i * 4}" stroke="${accent}" stroke-opacity="${pattern === 'oxford' ? 0.35 : 0.2}"/>`,
    ).join('');
  if (pattern === 'jersey')
    overlay = Array.from(
      { length: 12 },
      (_, i) =>
        `<path d="M${i * 8} 0 l4 6 l4 -6" stroke="${accent}" stroke-opacity="0.2" fill="none" transform="translate(0 ${0})"/>`,
    ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96"><rect width="96" height="96" fill="${base}"/>${overlay}</svg>`;
}

export function borderSvg(kind: 'scallop' | 'eyelet' | 'picot' | 'piping' | 'tape'): string {
  const base = `<rect x="4" y="36" width="88" height="14" fill="#f8fafc" stroke="${STROKE}" stroke-width="1.5"/>`;
  if (kind === 'scallop')
    return wrap(
      base +
        Array.from({ length: 8 }, (_, i) => path(`M${4 + i * 11} 50 q5.5 12 11 0`, '#f8fafc')).join(
          '',
        ),
    );
  if (kind === 'eyelet')
    return wrap(
      base +
        Array.from(
          { length: 7 },
          (_, i) => `<circle cx="${12 + i * 12}" cy="43" r="3" fill="none" stroke="${STROKE}"/>`,
        ).join(''),
    );
  if (kind === 'picot')
    return wrap(
      base +
        Array.from(
          { length: 22 },
          (_, i) => `<circle cx="${6 + i * 4}" cy="52" r="1.5" fill="${STROKE}"/>`,
        ).join(''),
    );
  if (kind === 'piping')
    return wrap(
      `<rect x="4" y="44" width="88" height="6" rx="3" fill="#94a3b8" stroke="${STROKE}"/>`,
    );
  return wrap(`<rect x="4" y="40" width="88" height="12" fill="#e7e5e4" stroke="${STROKE}"/>`);
}

export function motifSvg(kind: 'flower' | 'monogram' | 'leaf'): string {
  if (kind === 'monogram')
    return wrap(
      `<circle cx="48" cy="48" r="28" fill="none" stroke="${STROKE}" stroke-width="2"/><text x="48" y="56" text-anchor="middle" font-family="serif" font-size="24" fill="${STROKE}">AB</text>`,
    );
  if (kind === 'leaf')
    return wrap(
      path('M24 72 Q30 30 72 24 Q66 66 24 72 Z', '#bbf7d0') +
        `<path d="M24 72 L60 36" stroke="${STROKE}" stroke-width="1.5"/>`,
    );
  const petals = Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3;
    return `<ellipse cx="${48 + Math.cos(a) * 14}" cy="${48 + Math.sin(a) * 14}" rx="9" ry="6" transform="rotate(${(i * 60).toString()} ${48 + Math.cos(a) * 14} ${48 + Math.sin(a) * 14})" fill="#fbcfe8" stroke="${STROKE}"/>`;
  }).join('');
  return wrap(petals + `<circle cx="48" cy="48" r="7" fill="#fde68a" stroke="${STROKE}"/>`);
}

export function buttonSvg(kind: 'four_hole' | 'shank' | 'snap'): string {
  if (kind === 'snap')
    return wrap(
      `<circle cx="48" cy="48" r="22" fill="#e2e8f0" stroke="${STROKE}" stroke-width="2"/><circle cx="48" cy="48" r="8" fill="#94a3b8" stroke="${STROKE}"/>`,
    );
  if (kind === 'shank')
    return wrap(
      `<circle cx="48" cy="44" r="22" fill="#fde68a" stroke="${STROKE}" stroke-width="2"/><rect x="44" y="66" width="8" height="10" fill="${STROKE}"/>`,
    );
  return wrap(
    `<circle cx="48" cy="48" r="24" fill="#f8fafc" stroke="${STROKE}" stroke-width="2"/>` +
      [
        [42, 42],
        [54, 42],
        [42, 54],
        [54, 54],
      ]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.5" fill="${STROKE}"/>`)
        .join(''),
  );
}

export function artworkSvg(kind: 'chest' | 'back'): string {
  const box =
    kind === 'chest'
      ? '<rect x="54" y="26" width="22" height="16"'
      : '<rect x="24" y="22" width="48" height="52"';
  return wrap(
    path('M20 10 L76 10 L86 30 L76 34 L76 88 L20 88 L20 34 L10 30 Z', '#f1f5f9') +
      `${box} fill="none" stroke="#2563eb" stroke-width="2" stroke-dasharray="4 3"/>`,
  );
}
