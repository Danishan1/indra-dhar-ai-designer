'use client';

import { useState } from 'react';

import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';

import { useEditor } from '../store-context';

const label = (key: string) => (key.split('.')[1] ?? key).replaceAll('_', ' ');

/**
 * Developer-only panel (not in production builds): sends one `set_property` operation through the real
 * save pipeline until the properties panel arrives (I17).
 */
export function DebugPanel() {
  const components = useEditor((s) => s.display.components);
  const selected = useEditor((s) => s.selection.primary);
  const canEdit = useEditor((s) => s.meta.capabilities.canEdit);
  const apply = useEditor((s) => s.apply);
  const [picked, setPicked] = useState('');
  const componentId = picked || selected || components[0]?.componentId || '';
  const component = components.find((c) => c.componentId === componentId);
  const keys = Object.keys(component?.properties ?? {});
  const [chosenKey, setKey] = useState('');
  const key = keys.includes(chosenKey) ? chosenKey : (keys[0] ?? '');
  const [value, setValue] = useState('');

  const submit = () => {
    const isNumber = value.trim() !== '' && !Number.isNaN(Number(value));
    apply(
      {
        type: 'set_property',
        componentId,
        key,
        value: isNumber ? Number(value) : value,
        ...(key.startsWith('dimension.') ? { unit: 'mm' } : {}),
      },
      { label: `Set ${label(key)}` },
    );
  };

  return (
    <section
      aria-label="Debug operations"
      className="m-3 flex flex-col gap-2 rounded-md border border-dashed p-2"
    >
      <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Debug · set property
      </h2>
      <FormField label="Component">
        <SimpleSelect
          aria-label="Debug component"
          value={componentId}
          onValueChange={setPicked}
          options={components.map((c) => ({ value: c.componentId, label: c.displayName }))}
        />
      </FormField>
      <FormField label="Property">
        <SimpleSelect
          aria-label="Debug property"
          value={key}
          onValueChange={setKey}
          options={keys.map((k) => ({ value: k, label: label(k) }))}
        />
      </FormField>
      <FormField label={key.startsWith('dimension.') ? 'Value (mm)' : 'Value'}>
        <Input
          aria-label="Debug value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) submit();
          }}
        />
      </FormField>
      <Button size="sm" disabled={!canEdit || !key || !value.trim()} onClick={submit}>
        Apply operation
      </Button>
    </section>
  );
}
