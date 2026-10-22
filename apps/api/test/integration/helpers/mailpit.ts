/** Reads emails from the test-profile Mailpit (pnpm infra:test:up): http://localhost:58025. */
const MAILPIT = process.env.AID_IT_MAILPIT_URL ?? 'http://localhost:58025';

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

export async function findMessages(to: string): Promise<MailpitSummary[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  if (!res.ok) throw new Error(`Mailpit search failed: ${res.status}`);
  const body = (await res.json()) as { messages: MailpitSummary[] };
  return body.messages;
}

/** Waits for the newest email to `to` whose subject matches and returns its plain text. */
export async function waitForEmail(
  to: string,
  subject: RegExp,
  timeoutMs = 5_000,
): Promise<{ subject: string; text: string }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const match = (await findMessages(to)).find((m) => subject.test(m.Subject));
    if (match) {
      const res = await fetch(`${MAILPIT}/api/v1/message/${match.ID}`);
      const msg = (await res.json()) as { Subject: string; Text: string };
      return { subject: msg.Subject, text: msg.Text };
    }
    if (Date.now() > deadline) throw new Error(`No email to ${to} matching ${subject}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

export function tokenFromLink(text: string, path: string): string {
  const m = new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`).exec(text);
  if (!m?.[1]) throw new Error(`No ${path} link in email`);
  return m[1];
}
