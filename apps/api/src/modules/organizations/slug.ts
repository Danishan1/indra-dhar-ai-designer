import { randomBytes } from 'node:crypto';

/** URL-friendly slug: lowercase ASCII words joined by '-', max 48 chars. */
export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return base || 'org';
}

export function slugWithSuffix(name: string): string {
  return `${slugify(name).slice(0, 42)}-${randomBytes(3).toString('hex')}`;
}
