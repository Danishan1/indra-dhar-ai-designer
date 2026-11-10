import type { TechPackDocument, TechPackImage } from './techpack.js';

/**
 * Printable HTML of a tech pack (A4) — rendered to PDF by the worker with headless Chromium, which
 * adds the running header and footer with page numbers. `imageSrc` turns stored images into data
 * URIs; inline SVGs are embedded.
 *
 * Layout (ADR-067): a cover page, then numbered sections — overview, views, specification, size
 * chart, bill of materials, measurements, patterns (sheet, pieces, cutting layouts), construction
 * and open items. Technical ids, source columns, the AI processing record and long per-component
 * attribute dumps are left out; statuses show only where they matter (estimates, missing).
 */

const esc = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmed',
  inferred: 'Estimate',
  proposed: 'Proposed',
  missing: 'Missing',
  needs_review: 'Review',
  not_applicable: 'N/A',
  estimate: 'Estimate',
  specified: 'Specified',
};

/** A small status mark — only for values that are not confirmed. */
const mark = (status: string) =>
  status === 'confirmed' || status === 'specified' || status === 'not_applicable'
    ? ''
    : `<span class="st st-${esc(status)}">${esc(STATUS_LABEL[status] ?? status)}</span>`;

const cm = (mm: number | null | undefined) =>
  mm === null || mm === undefined ? '—' : (mm / 10).toFixed(1);
const human = (s: string) => s.replaceAll('_', ' ');

function figure(img: TechPackImage, src: (img: TechPackImage) => string | null, cls = ''): string {
  const body = img.svg
    ? `<div class="svg">${img.svg}</div>`
    : src(img)
      ? `<img src="${esc(src(img))}" alt="${esc(img.title)}"/>`
      : '<div class="noimg">Image not available</div>';
  return `<figure class="${cls}">${body}<figcaption>${esc(img.title)}${img.kind === 'ai' ? '<span class="ai">AI illustration</span>' : ''}${img.note ? ` — ${esc(img.note)}` : ''}</figcaption></figure>`;
}

/** Open items grouped: one row per item with every place it applies to. */
function openItems(missing: { area: string; item: string }[]) {
  const groups = new Map<string, string[]>();
  for (const m of missing) {
    const where = /^Pattern: (.+)$/.exec(m.area)?.[1] ?? m.area;
    const list = groups.get(m.item) ?? [];
    if (!list.includes(where)) list.push(where);
    groups.set(m.item, list);
  }
  return [...groups.entries()].map(([item, places]) => ({ item, where: places.join(', ') }));
}

export function techPackHtml(
  doc: TechPackDocument,
  imageSrc: (img: TechPackImage) => string | null,
): string {
  const h = doc.header;
  const pt = doc.pattern ?? null;
  const sz = doc.sizing ?? null;
  const drawings = doc.views.filter((v) => v.kind === 'flat' || v.kind === 'reconstruction');
  const aiViews = doc.views.filter(
    (v) => v.kind === 'ai' && ['front', 'back', 'side'].some((k) => v.key.includes(k)),
  );
  const presentation = doc.views.filter((v) => !drawings.includes(v) && !aiViews.includes(v));
  const hero = drawings[0] ?? aiViews[0] ?? presentation[0] ?? doc.patterns.sheet ?? null;
  const garmentName =
    pt?.garments && pt.garments.length > 1
      ? pt.garments.map((g) => g.name).join(' + ')
      : (pt?.garments?.[0]?.name ?? h.garmentLabel);
  const sizeRange = sz
    ? sz.sizes.length > 1
      ? `${sz.standard} ${sz.sizes[0]}–${sz.sizes[sz.sizes.length - 1]}`
      : `${sz.standard} ${sz.baseSize}`
    : (pt?.size ?? '—');
  const generated = new Date(h.generatedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  let n = 0;
  const section = (title: string, body: string, cls = '') =>
    `<section class="${cls}"><header class="sec"><span class="num">${String(++n).padStart(2, '0')}</span><h2>${esc(title)}</h2></header>${body}</section>`;
  const sections: string[] = [];

  // ── cover ────────────────────────────────────────────────────────────────
  sections.push(`<section class="cover">
    <div class="band"><span>Technical package</span><span>${esc(h.projectName)}</span></div>
    <div class="cover-body">
      <div class="cover-text">
        <p class="eyebrow">${esc(h.designDisplayId)} · ${esc(h.revisionLabel)}</p>
        <h1>${esc(h.designName)}</h1>
        <p class="sub">${esc(garmentName)}${pt ? ` · ${esc(human(pt.audience))}` : ''}</p>
        <dl class="facts">
          <div><dt>Style no.</dt><dd>${esc(h.designDisplayId)}</dd></div>
          <div><dt>Revision</dt><dd>${esc(h.revisionLabel)}</dd></div>
          <div><dt>Sizes</dt><dd>${esc(sizeRange)}</dd></div>
          <div><dt>Base size</dt><dd>${esc(sz?.baseSize ?? pt?.size ?? '—')}</dd></div>
          <div><dt>Project</dt><dd>${esc(h.projectName)}</dd></div>
          <div><dt>Issued</dt><dd>${esc(generated)}</dd></div>
        </dl>
      </div>
      <div class="hero">${hero ? figure(hero, imageSrc, 'bare') : ''}</div>
    </div>
    <p class="fine">${esc(doc.disclaimer)}</p>
  </section>`);

  // ── 01 overview (short: the specification follows on the same page) ─────
  sections.push(
    section(
      'Overview',
      `<p class="lead">${esc(doc.description)}</p>${doc.descriptionSource === 'ai_draft' ? '<p class="fine">Description drafted with AI — review before release.</p>' : ''}
      ${
        pt
          ? `<table class="kv"><tbody>
        <tr><th>Garment</th><td>${esc(garmentName)}</td><th>For</th><td>${esc(human(pt.audience))}</td></tr>
        <tr><th>Size standard</th><td>${esc(sz?.standard ?? '—')}</td><th>Base size</th><td>${esc(sz?.baseSize ?? pt.size)}</td></tr>
        <tr><th>Size range</th><td>${esc(sz?.sizes.join(', ') ?? pt.size)}</td><th>Allowances</th><td>Seam ${pt.seamAllowanceMm} mm · hem ${pt.hemAllowanceMm} mm</td></tr>
      </tbody></table>`
          : ''
      }
      ${doc.references?.length ? `<h3>Reference</h3><div class="grid3">${doc.references.map((v) => figure(v, imageSrc, 'small')).join('')}</div><p class="fine">The starting point only — this specification follows the finalized patterns.</p>` : ''}`,
      pt && !drawings.length && !aiViews.length && !presentation.length ? 'flow' : '',
    ),
  );

  // ── 02 views ─────────────────────────────────────────────────────────────
  if (drawings.length || aiViews.length)
    sections.push(
      section(
        'Garment views',
        `${drawings.length ? `<div class="grid2">${drawings.map((v) => figure(v, imageSrc)).join('')}</div>` : ''}
        ${aiViews.length ? `<div class="grid${aiViews.length > 2 ? 3 : 2}">${aiViews.map((v) => figure(v, imageSrc)).join('')}</div>` : ''}`,
      ),
    );
  if (presentation.length)
    sections.push(
      section(
        'Presentation',
        `<div class="grid2">${presentation.map((v) => figure(v, imageSrc)).join('')}</div>`,
      ),
    );

  // ── 03 specification ─────────────────────────────────────────────────────
  if (pt)
    sections.push(
      section(
        'Specification',
        `<h3>Style</h3><dl class="spec">${pt.style.map((x) => `<div><dt>${esc(x.label)}</dt><dd>${esc(x.value)}</dd></div>`).join('')}</dl>
        ${pt.checks.length ? `<h3>Seam fit checks</h3><table class="data"><thead><tr><th>Seams</th><th class="r">Lengths (mm)</th><th class="r">Difference</th><th>Result</th></tr></thead><tbody>${pt.checks.map((c) => `<tr><td>${esc(c.label)}</td><td class="r">${c.a} ↔ ${c.b}</td><td class="r">${c.difference > 0 ? '+' : ''}${c.difference} mm</td><td>${c.status === 'ok' ? 'Fits' : `<span class="st st-${c.status === 'warning' ? 'estimate' : 'missing'}">${c.status === 'warning' ? 'Check' : 'Does not fit'}</span>`}</td></tr>`).join('')}</tbody></table>` : ''}`,
      ),
    );
  else
    sections.push(
      section(
        'Components',
        `<table class="data"><thead><tr><th>Component</th><th>Fabric</th><th>Key details</th></tr></thead><tbody>${doc.components
          .map(
            (c) =>
              `<tr><td><strong>${esc(c.name)}</strong>${c.side !== 'none' ? ` <span class="muted">${esc(c.side)}</span>` : ''}</td><td>${esc(c.fabric ?? '—')}</td><td>${esc(
                c.attributes
                  .filter((a) => a.value !== '—')
                  .slice(0, 4)
                  .map((a) => `${a.label}: ${a.value}`)
                  .join(' · ') || '—',
              )}</td></tr>`,
          )
          .join('')}</tbody></table>`,
      ),
    );

  // ── 04 size chart ────────────────────────────────────────────────────────
  if (sz) {
    const head = `<thead><tr><th>Point of measure (cm)</th>${sz.sizes.map((s) => `<th class="r${s === sz.baseSize ? ' base' : ''}">${esc(s)}</th>`).join('')}</tr></thead>`;
    const row = (label: string, values: (number | null)[]) =>
      `<tr><td>${esc(label)}</td>${values.map((v, i) => `<td class="r${sz.sizes[i] === sz.baseSize ? ' base' : ''}">${cm(v)}</td>`).join('')}</tr>`;
    sections.push(
      section(
        `Size chart — ${sz.standard}`,
        `<h3>Finished garment</h3><table class="data grade">${head}<tbody>${sz.pom.map((p) => row(p.label, p.values)).join('')}</tbody></table>
        <h3>Body measurements</h3><table class="data grade">${head.replace('Point of measure (cm)', 'Body (cm)')}<tbody>${sz.body.map((b) => row(b.label, b.values)).join('')}</tbody></table>
        <ul class="notes">${sz.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`,
      ),
    );
  }

  // ── bill of materials ────────────────────────────────────────────────────
  sections.push(
    section(
      'Bill of materials',
      `<table class="data"><thead><tr><th>Item</th><th>Type</th><th>Placement</th><th>Quantity</th><th>Notes</th></tr></thead><tbody>${doc.bom
        .map(
          (b) =>
            `<tr><td><strong>${esc(b.item)}</strong> ${mark(b.status)}</td><td>${esc(b.type)}</td><td>${esc(b.placement)}</td><td>${esc(b.quantity)}</td><td>${esc(b.notes)}</td></tr>`,
        )
        .join('')}</tbody></table>`,
    ),
  );

  // ── measurements (component designs; pattern designs use the size chart) ─
  if (!pt && doc.measurements.length)
    sections.push(
      section(
        'Measurement specification',
        `<table class="data"><thead><tr><th>Component</th><th>Point of measure</th><th class="r">Value</th></tr></thead><tbody>${doc.measurements
          .map(
            (m) =>
              `<tr><td>${esc(m.component)}</td><td>${esc(m.point)}</td><td class="r">${m.valueMm === null ? '—' : `${cm(m.valueMm)} cm`} ${mark(m.status)}</td></tr>`,
          )
          .join('')}</tbody></table>`,
      ),
    );

  // ── patterns ─────────────────────────────────────────────────────────────
  sections.push(
    section(
      'Flat patterns',
      `${doc.patterns.sheet ? figure(doc.patterns.sheet, imageSrc, 'wide') : '<p class="muted">No pattern pieces.</p>'}
      <table class="data"><thead><tr><th>Piece</th><th>Cut</th><th class="r">Size (cm)</th><th>Seam allowance</th><th>Fabric</th></tr></thead><tbody>${doc.patterns.pieces
        .map(
          (p) =>
            `<tr><td><strong>${esc(p.name)}</strong></td><td>${p.cutQuantity}${p.onFold ? ' on fold' : ''}${p.mirrored ? ' (pair)' : ''}</td><td class="r">${cm(p.widthMm)} × ${cm(p.heightMm)}</td><td>${p.seamAllowanceMm ?? '—'} mm${p.allowanceNotes?.length ? `<span class="muted"> · ${esc(p.allowanceNotes.join(' · '))}</span>` : ''}</td><td>${esc(human(p.fabricRole ?? 'main'))}</td></tr>`,
        )
        .join('')}</tbody></table>`,
    ),
  );
  for (const p of doc.patterns.pieces.filter((x) => x.svg))
    sections.push(
      `<section class="piece"><header class="sub-sec"><h2>${esc(p.name)}</h2><p>Cut ${p.cutQuantity}${p.onFold ? ' on fold' : ''}${p.mirrored ? ' (pair)' : ''} · seam allowance ${p.seamAllowanceMm ?? '—'} mm${p.allowanceNotes?.length ? ` (${esc(p.allowanceNotes.join(', '))})` : ''} · ${esc(human(p.fabricRole ?? 'main'))}</p></header><figure class="wide bare"><div class="svg">${p.svg}</div><figcaption>Solid: seam line · dashed: cutting line · arrows: grainline · dash-dot: fold · dots: notches · bar: 10 cm</figcaption></figure></section>`,
    );
  for (const m of doc.patterns.markers ?? [])
    sections.push(
      `<section class="piece"><header class="sub-sec"><h2>Cutting layout — ${esc(human(m.fabricRole))}</h2><p>${m.pieceCount} pieces on ${m.fabricWidthMm / 10} cm fabric · marker ${(m.lengthMm / 1000).toFixed(2)} m · ${Math.round(m.efficiency * 100)} % used · planning estimate</p></header><figure class="wide bare"><div class="svg">${m.svg}</div><figcaption>Grain along the length · fold pieces opened, pairs mirrored · bar: 10 cm</figcaption></figure></section>`,
    );

  // ── construction ─────────────────────────────────────────────────────────
  sections.push(
    section(
      'Construction',
      `${doc.construction.aiDrafted ? '<p class="fine">Construction notes drafted with AI — review before production.</p>' : ''}
      <ol class="steps">${doc.construction.steps.map((s) => `<li><strong>${esc(s.title)}</strong>${s.details ? `<span>${esc(s.details)}</span>` : ''}</li>`).join('')}</ol>
      ${doc.construction.stitching.length ? `<h3>Stitching</h3><table class="data"><thead><tr><th>Seam</th><th>Stitch</th><th>Notes</th></tr></thead><tbody>${doc.construction.stitching.map((s) => `<tr><td>${esc(s.seam)}</td><td>${esc(s.stitch)}</td><td>${esc(s.notes)}</td></tr>`).join('')}</tbody></table>` : ''}
      <div class="grid2 lists">
        ${doc.construction.finishing.length ? `<div><h3>Finishing</h3><ul>${doc.construction.finishing.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
        <div><h3>Quality checkpoints</h3><ul>${doc.quality.map((q) => `<li>${esc(q)}</li>`).join('')}</ul></div>
        ${doc.care.length ? `<div><h3>Care</h3><ul>${doc.care.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
      </div>`,
    ),
  );

  // ── open items ───────────────────────────────────────────────────────────
  if (doc.missing.length)
    sections.push(
      section(
        'Open items',
        `<p class="muted">Not specified yet — listed instead of invented. Complete before production.</p><table class="data"><thead><tr><th>Item</th><th>Where</th></tr></thead><tbody>${openItems(
          doc.missing,
        )
          .map((m) => `<tr><td><strong>${esc(m.item)}</strong></td><td>${esc(m.where)}</td></tr>`)
          .join('')}</tbody></table>`,
      ),
    );

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${esc(h.designName)} — tech pack</title><style>
  @page { size: A4; margin: 18mm 14mm 16mm; }
  :root { --ink: #0f172a; --muted: #64748b; --rule: #e2e8f0; --soft: #f8fafc; --accent: #1e3a5f; --accent-soft: #e8eef5; }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif; color: var(--ink); font-size: 9.5pt; line-height: 1.45; margin: 0; }
  section { page-break-after: always; }
  section.flow { page-break-after: auto; margin-bottom: 10mm; }
  section:last-child { page-break-after: auto; }
  h1 { font-size: 30pt; line-height: 1.1; margin: 2mm 0 3mm; font-weight: 700; letter-spacing: -0.02em; }
  h2 { font-size: 15pt; margin: 0; font-weight: 600; letter-spacing: -0.01em; }
  h3 { font-size: 8pt; text-transform: uppercase; letter-spacing: .12em; color: var(--accent); margin: 6mm 0 2mm; font-weight: 700; }
  p { margin: 0 0 2mm; }
  .muted { color: var(--muted); } .fine { color: var(--muted); font-size: 8pt; }
  .lead { font-size: 11pt; line-height: 1.55; max-width: 165mm; margin-bottom: 5mm; }

  /* cover */
  .cover { display: flex; flex-direction: column; min-height: 255mm; }
  .band { display: flex; justify-content: space-between; background: var(--accent); color: #fff; padding: 3mm 5mm; font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; }
  .cover-body { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; padding: 14mm 0 0; flex: 1; }
  .eyebrow { color: var(--accent); font-size: 8.5pt; letter-spacing: .12em; text-transform: uppercase; font-weight: 600; }
  .sub { font-size: 12pt; color: #334155; margin-bottom: 8mm; }
  .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin: 0; border-top: 1.5px solid var(--ink); }
  .facts div { padding: 2.5mm 0; border-bottom: 0.5px solid var(--rule); }
  .facts dt { font-size: 7pt; text-transform: uppercase; letter-spacing: .12em; color: var(--muted); }
  .facts dd { margin: 0.5mm 0 0; font-size: 10.5pt; font-weight: 600; }
  .hero { background: var(--soft); border-radius: 2mm; display: flex; align-items: center; justify-content: center; padding: 6mm; }
  .hero figure img, .hero figure .svg svg { max-height: 165mm; }
  .cover .fine { margin-top: auto; padding-top: 6mm; border-top: 0.5px solid var(--rule); }

  /* section headers */
  header.sec { display: flex; align-items: baseline; gap: 3mm; border-bottom: 1.5px solid var(--ink); padding-bottom: 2mm; margin-bottom: 5mm; }
  header.sec .num { color: var(--accent); font-weight: 700; font-size: 10pt; letter-spacing: .05em; }
  header.sub-sec { border-bottom: 0.5px solid var(--rule); padding-bottom: 2mm; margin-bottom: 4mm; }
  header.sub-sec p { color: var(--muted); font-size: 8.5pt; margin-top: 1mm; }

  /* tables */
  table { border-collapse: collapse; width: 100%; }
  table.data th { font-size: 7pt; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); font-weight: 600; text-align: left; padding: 1.8mm 2mm; border-bottom: 1.2px solid var(--ink); }
  table.data td { padding: 1.8mm 2mm; border-bottom: 0.5px solid var(--rule); vertical-align: top; }
  table.data tbody tr:nth-child(even) td { background: var(--soft); }
  .r { text-align: right !important; font-variant-numeric: tabular-nums; }
  table.grade td:first-child { font-weight: 500; }
  table.grade .base { background: var(--accent-soft) !important; font-weight: 700; }
  table.grade th.base { color: var(--accent); }
  table.kv th { width: 22%; font-size: 7pt; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); font-weight: 600; text-align: left; padding: 2mm; border-bottom: 0.5px solid var(--rule); }
  table.kv td { padding: 2mm; border-bottom: 0.5px solid var(--rule); font-weight: 500; }
  dl.spec { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 6mm; margin: 0; }
  dl.spec div { padding: 1.8mm 0; border-bottom: 0.5px solid var(--rule); break-inside: avoid; }
  dl.spec dt { font-size: 7pt; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); }
  dl.spec dd { margin: 0.3mm 0 0; font-weight: 500; text-transform: capitalize; }
  .st { display: inline-block; font-size: 6.5pt; text-transform: uppercase; letter-spacing: .08em; padding: 0.3mm 1.4mm; border-radius: 1mm; font-weight: 600; vertical-align: middle; }
  .st-inferred, .st-estimate, .st-proposed, .st-needs_review { background: #fef3c7; color: #92400e; }
  .st-missing { background: #fee2e2; color: #991b1b; }

  /* figures */
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-bottom: 5mm; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm; margin-bottom: 3mm; }
  figure { margin: 0; break-inside: avoid; background: var(--soft); border-radius: 1.5mm; padding: 3mm; }
  figure.bare { background: none; padding: 0; }
  figure img, figure .svg svg { width: 100%; height: auto; max-height: 120mm; object-fit: contain; display: block; }
  figure.small img, figure.small .svg svg { max-height: 45mm; }
  figure.wide .svg svg { max-height: 175mm; }
  section.piece figure.wide .svg svg { max-height: 225mm; }
  figcaption { font-size: 7.5pt; color: var(--muted); margin-top: 2mm; }
  figcaption .ai { margin-left: 2mm; font-size: 6.5pt; text-transform: uppercase; letter-spacing: .08em; color: var(--accent); }
  .noimg { height: 40mm; display: flex; align-items: center; justify-content: center; color: #94a3b8; }

  /* lists */
  ol.steps { padding-left: 6mm; margin: 0; } ol.steps li { padding: 1.5mm 0; border-bottom: 0.5px solid var(--rule); }
  ol.steps li span { display: block; color: #334155; }
  ul { padding-left: 5mm; margin: 0; } li { margin: 0.8mm 0; }
  ul.notes { color: var(--muted); font-size: 8pt; margin-top: 4mm; }
  .lists h3 { margin-top: 3mm; }
  table, tr, figure, dl.spec div { page-break-inside: avoid; } h2, h3, header.sec { page-break-after: avoid; }
  </style></head><body>${sections.join('\n')}</body></html>`;
}
