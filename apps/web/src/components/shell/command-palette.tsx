'use client';

import { useRouter } from 'next/navigation';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

import { ALL_NAV } from './nav-items';

/** Global search placeholder: navigation only for now (search lands with projects/library). */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Go to">
          {ALL_NAV.map((item) => (
            <CommandItem
              key={item.href}
              value={item.label}
              onSelect={() => {
                onOpenChange(false);
                router.push(item.href);
              }}
            >
              <item.icon aria-hidden /> {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
