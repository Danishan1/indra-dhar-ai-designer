import { ShirtIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { APP_NAME } from '@/lib/app-info';

/** Centered card used by every public auth page. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex items-center justify-center gap-2 text-sm font-semibold">
        <ShirtIcon className="size-5 text-primary" aria-hidden /> {APP_NAME}
      </div>
      <section className="flex flex-col gap-4 rounded-lg border bg-card p-6 shadow-xs">
        <header className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">{title}</h1>
          {description ? <p className="text-[13px] text-muted-foreground">{description}</p> : null}
        </header>
        {children}
      </section>
      {footer ? (
        <div className="text-center text-[13px] text-muted-foreground">{footer}</div>
      ) : null}
    </div>
  );
}

/** Inline status/notice inside auth forms (icon + text, not color only). */
export function FormNotice({
  tone,
  children,
}: {
  tone: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  const styles = {
    error: 'border-destructive/40 text-destructive',
    success: 'border-status-ok/40 text-status-ok',
    info: 'border-border text-muted-foreground',
  }[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-md border px-3 py-2 text-[13px] ${styles}`}
    >
      {children}
    </div>
  );
}
