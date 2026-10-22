import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="text-[13px] text-muted-foreground">
        It may have been moved, or you may not have access to it.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href="/">Go home</Link>
      </Button>
    </main>
  );
}
