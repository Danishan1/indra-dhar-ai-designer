import { describe, expect, it } from 'vitest';

import { APP_NAME, apiBaseUrl } from './app-info';

describe('app-info', () => {
  it('has the product name', () => {
    expect(APP_NAME).toBe('AI Designer');
  });

  it('defaults and normalizes the API base URL', () => {
    expect(apiBaseUrl({})).toBe('http://localhost:4000');
    expect(apiBaseUrl({ NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com//' })).toBe(
      'https://api.example.com',
    );
  });
});
