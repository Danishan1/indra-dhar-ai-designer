'use client';

import { useEffect } from 'react';

import { reportClientError } from '@/lib/logging/report-client-error';

export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    reportClientError(error, 'error-boundary');
  }, [error]);

  return (
    <main className="placeholder">
      <h2>Something went wrong</h2>
      <p className="muted">The error has been logged.</p>
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
    </main>
  );
}
