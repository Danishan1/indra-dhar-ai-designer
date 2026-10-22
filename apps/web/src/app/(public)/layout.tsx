import type { ReactNode } from 'react';

/** Public pages (sign-in, sign-up, invitations — I05/I06). Centered, no app chrome. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center p-6">{children}</main>;
}
