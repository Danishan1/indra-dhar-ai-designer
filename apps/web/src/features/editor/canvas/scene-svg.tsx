import { type PatternDef, ROLE_STYLES, type SceneElement } from '@ai-designer/garment-render';
import { memo } from 'react';

/** Pattern definitions (stripes, checks, fabric textures) referenced by element fills. */
export function PatternDefs({ patterns }: { patterns: readonly PatternDef[] }) {
  if (!patterns.length) return null;
  return (
    <defs>
      {patterns.map((p) => (
        <pattern
          key={p.id}
          id={p.id}
          patternUnits="userSpaceOnUse"
          width={p.sizeMm}
          height={p.sizeMm}
          {...(p.kind === 'texture' && p.rotationDeg
            ? { patternTransform: `rotate(${p.rotationDeg})` }
            : {})}
        >
          <rect width={p.sizeMm} height={p.sizeMm} fill={p.base} />
          {p.kind === 'stripe' ? (
            <rect width={p.sizeMm / 3} height={p.sizeMm} fill={p.color} />
          ) : null}
          {p.kind === 'check' ? (
            <>
              <rect width={p.sizeMm / 2} height={p.sizeMm} fill={p.color} fillOpacity={0.35} />
              <rect width={p.sizeMm} height={p.sizeMm / 2} fill={p.color} fillOpacity={0.35} />
            </>
          ) : null}
          {p.kind === 'texture' ? (
            <image
              href={p.href}
              width={p.sizeMm}
              height={p.sizeMm}
              preserveAspectRatio="xMidYMid slice"
            />
          ) : null}
        </pattern>
      ))}
    </defs>
  );
}

/** One scene element as SVG (fills, line style by role, non-scaling strokes). */
export const SceneElementPath = memo(function SceneElementPath({ e }: { e: SceneElement }) {
  const st = ROLE_STYLES[e.role];
  return (
    <>
      <path
        d={e.d}
        fill={e.fill}
        stroke={st.stroke}
        strokeWidth={st.width}
        strokeDasharray={st.dash ?? undefined}
        strokeOpacity={st.opacity}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        data-component-id={e.componentId ?? undefined}
        data-element-id={e.id}
        data-role={e.role}
        data-layer={e.layer}
      >
        <title>{e.label}</title>
      </path>
      {e.text ? (
        <text
          x={e.text.x}
          y={e.text.y}
          fontSize={7}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={st.stroke}
          pointerEvents="none"
        >
          {e.text.value}
        </text>
      ) : null}
    </>
  );
});
