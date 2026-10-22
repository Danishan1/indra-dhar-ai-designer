import { reportClientError } from './lib/logging/report-client-error';

// Browser-side error capture → POST /api/client-logs → logs/web/client.*.log
try {
  window.addEventListener('error', (event) =>
    reportClientError(event.error ?? event.message, 'error'),
  );
  window.addEventListener('unhandledrejection', (event) =>
    reportClientError(event.reason, 'unhandledrejection'),
  );
} catch {
  // Never let instrumentation break the app.
}
