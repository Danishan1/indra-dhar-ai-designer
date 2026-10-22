import { APP_NAME, APP_TAGLINE } from '@/lib/app-info';

export default function HomePage() {
  return (
    <main className="placeholder">
      <h1>{APP_NAME}</h1>
      <p>{APP_TAGLINE}</p>
      <p className="muted">Walking skeleton — the application shell arrives in iteration I04.</p>
    </main>
  );
}
