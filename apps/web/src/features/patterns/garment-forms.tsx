'use client';

import {
  garmentSpec,
  garmentsOf,
  type PatternFamily,
  type PatternSpec,
  patternSpecSchema,
  type SetGarment,
} from '@ai-designer/garment-model';
import { defaultStyle, garmentName } from '@ai-designer/pattern-model';
import { PlusIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/select';

import { FAMILY_LABEL } from './options';
import { StyleForm } from './pattern-forms';

/**
 * Style of every garment of the design (ADR-061): one section per garment of a co-ord set, each
 * with its own type and options; garments can be added to or removed from the set. The first
 * garment's type is chosen in "Garment basics".
 */
export function GarmentStyleForms({
  spec,
  onChange,
  disabled,
  highlight,
  unsure,
}: {
  spec: PatternSpec;
  onChange: (next: PatternSpec, label: string) => void;
  disabled?: boolean;
  /** Fields read from the sketch / guessed, per garment key. */
  highlight?: Readonly<Record<string, readonly string[]>>;
  unsure?: Readonly<Record<string, readonly string[]>>;
}) {
  const garments = garmentsOf(spec);
  const set = garments.length > 1;
  const update = (key: string, next: PatternSpec, label: string) => {
    if (key === 'main') onChange({ ...spec, family: next.family, style: next.style }, label);
    else
      onChange(
        {
          ...spec,
          garments: spec.garments.map((g) =>
            g.key === key ? { ...g, family: next.family, style: next.style } : g,
          ),
        },
        label,
      );
  };
  const addGarment = (family: PatternFamily) => {
    const used = new Set(garments.map((g) => g.key));
    let key: string = family === 'trousers' ? 'bottoms' : family;
    for (let i = 2; used.has(key); i++) key = `${family}_${i}`;
    const g: SetGarment = {
      key,
      family,
      style: patternSpecSchema.parse({
        family,
        audience: spec.audience,
        size: spec.size,
        style: defaultStyle(family, spec.audience),
      }).style,
    };
    onChange(
      { ...spec, garments: [...spec.garments, g] },
      `Add ${FAMILY_LABEL[family]} to the set`,
    );
  };
  return (
    <div className="flex flex-col gap-4" data-testid="garment-style-forms">
      {garments.map((g) => {
        const gs = garmentSpec(spec, g.key);
        const name = garmentName(gs);
        return (
          <section key={g.key} className="flex flex-col gap-2" data-testid={`garment-${g.key}`}>
            {set ? (
              <div className="flex items-center gap-2">
                <h3 className="text-[12px] font-semibold">{name}</h3>
                {g.key !== 'main' ? (
                  <>
                    <SimpleSelect
                      aria-label={`${name} type`}
                      value={g.family}
                      disabled={disabled}
                      onValueChange={(v) => {
                        const family = v as PatternFamily;
                        update(
                          g.key,
                          {
                            ...gs,
                            family,
                            style: {
                              ...gs.style,
                              ...defaultStyle(family, spec.audience),
                            } as PatternSpec['style'],
                          },
                          `${name}: ${FAMILY_LABEL[family]}`,
                        );
                      }}
                      options={Object.entries(FAMILY_LABEL).map(([value, label]) => ({
                        value,
                        label,
                      }))}
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${name} from the set`}
                      disabled={disabled}
                      onClick={() =>
                        onChange(
                          { ...spec, garments: spec.garments.filter((x) => x.key !== g.key) },
                          `Remove ${name}`,
                        )
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
            <StyleForm
              spec={gs}
              disabled={disabled}
              highlight={new Set(highlight?.[g.key] ?? [])}
              unsure={new Set(unsure?.[g.key] ?? [])}
              onChange={(next, label) => update(g.key, next, set ? `${name}: ${label}` : label)}
            />
          </section>
        );
      })}
      {garments.length < 4 ? (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>Add a garment to make a set:</span>
          {(['trousers', 'skirt', 'top', 'jacket'] as PatternFamily[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-2 text-xs"
              disabled={disabled}
              onClick={() => addGarment(f)}
              data-testid={`add-garment-${f}`}
            >
              <PlusIcon /> {FAMILY_LABEL[f]}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
