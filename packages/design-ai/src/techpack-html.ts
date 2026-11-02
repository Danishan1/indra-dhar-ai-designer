import type { TechPackDocument, TechPackImage } from './techpack.js';

/**
 * Printable HTML of a tech pack (A4, one section per page) — rendered to PDF by the worker with
 * headless Chromium. `imageSrc` turns stored images into data URIs; inline SVGs are embedded.
 */

const esc = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmed',
  inferred: 'AI estimate',
  proposed: 'Proposed',
  missing: 'Missing',
  needs_review: 'Needs review',
  not_applicable: 'N/A',
  estimate: 'Estimate',
  specified: 'Specified',
  provisional: 'Provisional',
};

const badge = (status: string) =>
  `<span class="badge s-${esc(status)}">${esc(STATUS_LABEL[status] ?? status)}</span>`;

function figure(img: TechPackImage, src: (img: TechPackImage) => string | null, cls = ''): string {
  const body = img.svg
    ? `<div class="svg">${img.svg}</div>`
    : src(img)
      ? `<img src="${esc(src(img))}" alt="${esc(img.title)}"/>`
      : '<div class="noimg">Image not available</div>';
  return `<figure class="${cls}">${body}<figcaption>${esc(img.title)}${img.kind === 'ai' ? ' <em>(AI-generated)</em>' : ''}${img.note ? ` — ${esc(img.note)}` : ''}</figcaption></figure>`;
}

export function techPackHtml(
  doc: TechPackDocument,
  imageSrc: (img: TechPackImage) => string | null,
): string {
  const h = doc.header;
  const views = doc.views.filter(
    (v) =>
      v.kind === 'flat' ||
      v.kind === 'reconstruction' ||
      ['front', 'back', 'side'].some((k) => v.key.includes(k)),
  );
  const styled = doc.views.filter((v) => !views.includes(v));
  const sections: string[] = [];

  sections.push(`<section class="cover">
    <div class="brand">AI Designer · Tech pack</div>
    <h1>${esc(h.designName)}</h1>
    <p class="sub">${esc(h.garmentLabel)} · ${esc(h.category)} · ${esc(h.audience)}</p>
    <table class="meta">
      <tr><th>Design</th><td>${esc(h.designDisplayId)}</td><th>Revision</th><td>${esc(h.revisionLabel)}</td></tr>
      <tr><th>Project</th><td>${esc(h.projectName)}</td><th>Generated</th><td>${esc(new Date(h.generatedAt).toLocaleString('en-GB'))}</td></tr>
      <tr><th>AI provider</th><td colspan="3">${esc(h.provider)}</td></tr>
    </table>
    <p class="desc">${esc(doc.description)}${doc.descriptionSource === 'ai_draft' ? ' <em>(AI draft)</em>' : ''}</p>
    <p class="disclaimer">${esc(doc.disclaimer)}</p>
    <div class="grid2">${(styled.length ? styled : views)
      .slice(0, 2)
      .map((v) => figure(v, imageSrc))
      .join('')}</div>
  </section>`);

  if (doc.references?.length)
    sections.push(
      `<section><h2>Original reference</h2><p class="muted">As uploaded — the starting point only. The specification below follows the finalized design.</p><div class="grid2">${doc.references.map((v) => figure(v, imageSrc)).join('')}</div></section>`,
    );
  if (views.length)
    sections.push(
      `<section><h2>Garment views</h2><div class="grid2">${views.map((v) => figure(v, imageSrc)).join('')}</div></section>`,
    );
  if (styled.length)
    sections.push(
      `<section><h2>On mannequin and model</h2><div class="grid2">${styled.map((v) => figure(v, imageSrc)).join('')}</div></section>`,
    );

  sections.push(
    `<section><h2>Components</h2><div class="components">${doc.components
      .map(
        (
          c,
        ) => `<div class="comp">${c.image ? figure(c.image, imageSrc, 'small') : ''}<div><h3>${esc(c.name)} <small>${esc(c.type)}${c.side !== 'none' ? ` · ${esc(c.side)}` : ''}</small></h3>
      ${c.fabric ? `<p>Fabric: ${esc(c.fabric)}</p>` : ''}
      <table>${c.attributes.map((a) => `<tr><td>${esc(a.label)}</td><td>${esc(a.value)}</td><td>${badge(a.status)}</td></tr>`).join('')}
      ${c.measurements.map((m) => `<tr><td>${esc(m.label)}</td><td>${m.valueMm === null ? '—' : `${m.valueMm} mm`}</td><td>${badge(m.status)}</td></tr>`).join('')}</table>
      <p class="muted">${c.patternPieces} pattern piece(s)</p></div></div>`,
      )
      .join('')}</div></section>`,
  );

  sections.push(
    `<section><h2>Bill of materials</h2><table class="full"><thead><tr><th>Item</th><th>Type</th><th>Placement</th><th>Quantity</th><th>Status</th><th>Notes</th></tr></thead><tbody>${doc.bom
      .map(
        (b) =>
          `<tr><td>${esc(b.item)}</td><td>${esc(b.type)}</td><td>${esc(b.placement)}</td><td>${esc(b.quantity)}</td><td>${badge(b.status)}</td><td>${esc(b.notes)}</td></tr>`,
      )
      .join('')}</tbody></table></section>`,
  );

  sections.push(
    `<section><h2>Measurement specification</h2><table class="full"><thead><tr><th>Component</th><th>Point of measure</th><th>Value</th><th>Status</th><th>Source</th></tr></thead><tbody>${doc.measurements
      .map(
        (m) =>
          `<tr><td>${esc(m.component)}</td><td>${esc(m.point)}</td><td>${m.valueMm === null ? '—' : `${m.valueMm} mm`}</td><td>${badge(m.status)}</td><td>${esc(m.source)}</td></tr>`,
      )
      .join(
        '',
      )}</tbody></table><p class="muted">Single base size; grading is not included.</p></section>`,
  );

  sections.push(`<section><h2>Flat patterns</h2>${doc.patterns.sheet ? figure(doc.patterns.sheet, imageSrc, 'wide') : '<p>No pattern pieces.</p>'}
    <table class="full"><thead><tr><th>Piece</th><th>Component</th><th>Cut</th><th>Size (mm)</th><th>Seam allowance</th><th>Source</th><th>Status</th></tr></thead><tbody>${doc.patterns.pieces
      .map(
        (p) =>
          `<tr><td>${esc(p.name)}</td><td>${esc(p.component)}</td><td>${p.cutQuantity}${p.onFold ? ' on fold' : ''}${p.mirrored ? ' (pair)' : ''}</td><td>${p.widthMm} × ${p.heightMm}</td><td>${p.seamAllowanceMm ?? '—'} mm</td><td>${esc(p.source)}</td><td>${badge(p.status)}</td></tr>`,
      )
      .join('')}</tbody></table></section>`);

  for (const p of doc.patterns.pieces.filter((x) => x.svg))
    sections.push(
      `<section class="piece"><h2>Pattern piece — ${esc(p.name)}</h2><p class="muted">${esc(p.component)} · cut ${p.cutQuantity}${p.onFold ? ' on fold' : ''}${p.mirrored ? ' (pair)' : ''} · seam allowance ${p.seamAllowanceMm ?? '—'} mm · ${esc(p.source)} · ${badge(p.status)} · ${esc(p.pieceId ?? '')}</p><figure class="wide"><div class="svg">${p.svg}</div><figcaption>Solid: seam line · dashed: cutting line (seam allowance) · arrows: grainline · blue dash-dot: fold · dots: notches · bar: 100 mm</figcaption></figure></section>`,
    );

  sections.push(`<section><h2>Construction</h2>${doc.construction.aiDrafted ? '<p class="note">AI-drafted construction notes — review before production.</p>' : '<p class="note">Generic sewing order (no AI draft).</p>'}
    <ol>${doc.construction.steps.map((s) => `<li><strong>${esc(s.title)}</strong>${s.details ? ` — ${esc(s.details)}` : ''}</li>`).join('')}</ol>
    ${doc.construction.stitching.length ? `<h3>Stitching</h3><table class="full"><thead><tr><th>Seam</th><th>Stitch</th><th>Notes</th></tr></thead><tbody>${doc.construction.stitching.map((s) => `<tr><td>${esc(s.seam)}</td><td>${esc(s.stitch)}</td><td>${esc(s.notes)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${doc.construction.finishing.length ? `<h3>Finishing</h3><ul>${doc.construction.finishing.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    <h3>Quality checkpoints</h3><ul>${doc.quality.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>
    ${doc.care.length ? `<h3>Care</h3><ul>${doc.care.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}</section>`);

  sections.push(
    `<section><h2>Missing or unconfirmed information</h2><p class="muted">Listed instead of invented — complete these before production.</p><table class="full"><thead><tr><th>Area</th><th>Item</th></tr></thead><tbody>${doc.missing
      .map((m) => `<tr><td>${esc(m.area)}</td><td>${esc(m.item)}</td></tr>`)
      .join('')}</tbody></table></section>`,
  );

  const processing = (
    doc as {
      processing?: {
        history?: {
          task: string;
          provider: string;
          model: string;
          outcome: string;
          errorKind: string | null;
        }[];
      };
    }
  ).processing;
  if (processing?.history?.length)
    sections.push(
      `<section><h2>AI processing record</h2><p class="muted">Which models produced the AI parts of this document (retries and fallbacks included).</p><table class="full"><thead><tr><th>Task</th><th>Provider</th><th>Model</th><th>Outcome</th></tr></thead><tbody>${processing.history
        .map(
          (h) =>
            `<tr><td>${esc(h.task.replaceAll('_', ' '))}</td><td>${esc(h.provider)}</td><td>${esc(h.model)}</td><td>${esc(h.outcome)}${h.errorKind ? ` (${esc(h.errorKind)})` : ''}</td></tr>`,
        )
        .join('')}</tbody></table></section>`,
    );

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${esc(h.designName)} — tech pack</title><style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #111827; font-size: 10.5pt; margin: 0; }
  section { page-break-after: always; padding: 4mm 0; }
  section:last-child { page-break-after: auto; }
  h1 { font-size: 26pt; margin: 6mm 0 2mm; } h2 { font-size: 15pt; border-bottom: 2px solid #111827; padding-bottom: 2mm; }
  h3 { font-size: 11.5pt; margin: 2mm 0; } h3 small { color: #6b7280; font-weight: normal; }
  .brand { color: #6b7280; letter-spacing: .08em; text-transform: uppercase; font-size: 9pt; }
  .sub { color: #374151; font-size: 12pt; } .desc { margin: 4mm 0; } .muted { color: #6b7280; font-size: 9pt; }
  .disclaimer, .note { background: #fef3c7; border: 1px solid #f59e0b; padding: 2mm 3mm; font-size: 9pt; }
  table { border-collapse: collapse; } td, th { border: 1px solid #d1d5db; padding: 1.2mm 2mm; text-align: left; vertical-align: top; font-size: 9pt; }
  th { background: #f3f4f6; } table.full { width: 100%; } table.meta { margin: 3mm 0; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  figure { margin: 0; border: 1px solid #e5e7eb; padding: 2mm; break-inside: avoid; }
  figure img, figure .svg svg { width: 100%; height: auto; max-height: 120mm; object-fit: contain; display: block; }
  figure.small img, figure.small .svg svg { max-height: 40mm; } figure.wide .svg svg { max-height: 175mm; }
  section.piece figure.wide .svg svg { max-height: 220mm; }
  table, tr, figure, .comp { page-break-inside: avoid; } h2, h3 { page-break-after: avoid; }
  figcaption { font-size: 8.5pt; color: #4b5563; margin-top: 1mm; }
  .noimg { height: 40mm; display: flex; align-items: center; justify-content: center; color: #9ca3af; }
  .components { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  .comp { display: grid; grid-template-columns: 32mm 1fr; gap: 3mm; border: 1px solid #e5e7eb; padding: 2mm; break-inside: avoid; }
  .badge { display: inline-block; border-radius: 3px; padding: 0 1.5mm; font-size: 8pt; border: 1px solid #9ca3af; }
  .s-confirmed, .s-specified { border-color: #16a34a; color: #166534; } .s-missing { border-color: #dc2626; color: #991b1b; }
  .s-inferred, .s-proposed, .s-estimate, .s-provisional, .s-needs_review { border-color: #d97706; color: #92400e; }
  </style></head><body>${sections.join('\n')}</body></html>`;
}
