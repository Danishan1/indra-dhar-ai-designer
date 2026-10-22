'use client';

import { useEffect } from 'react';

import { reportClientError } from '@/lib/logging/report-client-error';

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    reportClientError(error, 'global-error');
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
        <title>Error — AI Designer</title>
        <h2>Something went wrong</h2>
        <p>The error has been logged.</p>
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
      </body>
    </html>
  );
}
