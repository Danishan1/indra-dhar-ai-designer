/** Minimal browser-like HTTP client for API tests: keeps cookies, sends the web Origin on writes. */
export class TestClient {
  readonly cookies = new Map<string, string>();

  constructor(
    readonly baseUrl: string,
    readonly origin = 'http://localhost:3000',
  ) {}

  cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const h: Record<string, string> = { ...headers };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (method !== 'GET' && !('origin' in h) && !('Origin' in h)) h.origin = this.origin;
    if (this.cookies.size && !('cookie' in h)) h.cookie = this.cookieHeader();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: h,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(';');
      const eq = pair?.indexOf('=') ?? -1;
      if (!pair || eq < 0) continue;
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (!value || /max-age=0/i.test(sc)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return res;
  }

  get(path: string, headers?: Record<string, string>) {
    return this.request('GET', path, undefined, headers);
  }

  post(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request('POST', path, body, headers);
  }

  put(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request('PUT', path, body, headers);
  }

  patch(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request('PATCH', path, body, headers);
  }

  delete(path: string, headers?: Record<string, string>) {
    return this.request('DELETE', path, undefined, headers);
  }
}
