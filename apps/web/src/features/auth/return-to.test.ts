import { describe, expect, it } from 'vitest';

import { safeReturnTo, signInUrl } from './return-to';

describe('safeReturnTo', () => {
  it.each([
    ['/projects?x=1#a', '/projects?x=1#a'],
    ['/editor/demo', '/editor/demo'],
    [null, '/'],
    ['https://evil.example/x', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['javascript:alert(1)', '/'],
    ['/sign-in', '/'],
    ['projects', '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });

  it('builds sign-in URLs', () => {
    expect(signInUrl('/projects')).toBe('/sign-in?returnTo=%2Fprojects');
    expect(signInUrl('/')).toBe('/sign-in');
  });
});
