'use client';

import type { ComponentProps } from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** 6-digit authenticator code field (numeric keyboard, OS one-time-code autofill). */
export function CodeInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9 ]*"
      maxLength={7}
      placeholder="123 456"
      className={cn('font-mono tracking-[0.3em]', className)}
      {...props}
    />
  );
}
