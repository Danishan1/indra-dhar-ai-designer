'use client';

import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { type ComponentProps, useState } from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Password field with an accessible show/hide toggle. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className={cn('pr-9', className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        {visible ? (
          <EyeOffIcon className="size-4" aria-hidden />
        ) : (
          <EyeIcon className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

/** Rough strength hint (not a policy — the API enforces 12–128 characters). */
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (password.length < 12) return { score: 0, label: 'Too short — use at least 12 characters' };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  const lengthBonus = password.length >= 16 ? 1 : 0;
  const score = Math.min(3, Math.max(1, classes - 1 + lengthBonus)) as 1 | 2 | 3;
  return {
    score,
    label: ['', 'Okay — longer passphrases are stronger', 'Good', 'Strong'][score] ?? '',
  };
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const { score, label } = passwordStrength(password);
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1 w-8 rounded-full bg-muted',
              score >= i && (score === 1 ? 'bg-status-needs-review' : 'bg-status-ok'),
            )}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
