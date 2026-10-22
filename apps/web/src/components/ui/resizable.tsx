'use client';

import type { ComponentProps } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';

import { cn } from '@/lib/utils';

export function ResizablePanelGroup({ className, ...props }: ComponentProps<typeof Group>) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn('flex h-full w-full', className)}
      {...props}
    />
  );
}

export function ResizablePanel(props: ComponentProps<typeof Panel>) {
  return <Panel data-slot="resizable-panel" {...props} />;
}

/** A thin, keyboard-accessible splitter (arrow keys resize; Enter toggles collapse on collapsible panels). */
export function ResizableHandle({ className, ...props }: ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        'relative flex items-center justify-center bg-border transition-colors outline-none hover:bg-primary/60 focus-visible:bg-primary data-[separator=active]:bg-primary aria-[orientation=vertical]:w-px aria-[orientation=horizontal]:h-px',
        "after:absolute after:content-[''] aria-[orientation=vertical]:after:inset-y-0 aria-[orientation=vertical]:after:-inset-x-1 aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:-inset-y-1",
        className,
      )}
      {...props}
    />
  );
}
