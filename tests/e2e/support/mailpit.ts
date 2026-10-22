/** Dev Mailpit (pnpm infra:up): the API sends real emails there in development. */
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';

export async function waitForEmailText(
  to: string,
  subject: RegExp,
  timeoutMs = 10_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] };
    const match = messages.find((m) => subject.test(m.Subject));
    if (match) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${match.ID}`)).json()) as {
        Text: string;
      };
      return msg.Text;
    }
    if (Date.now() > deadline) throw new Error(`No email to ${to} matching ${subject}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

export function linkFrom(text: string, path: string): string {
  const m = new RegExp(`(https?://[^\\s]+${path}\\?token=[A-Za-z0-9_-]+)`).exec(text);
  if (!m?.[1]) throw new Error(`No ${path} link in email`);
  return m[1];
}
