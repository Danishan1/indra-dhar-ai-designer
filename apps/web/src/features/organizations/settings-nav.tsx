'use client';

import type { PermissionKey } from '@ai-designer/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

import { useOrganization } from './organization-provider';

const ITEMS: { href: string; label: string; permission?: PermissionKey }[] = [
  { href: '/settings', label: 'General' },
  { href: '/settings/members', label: 'Members', permission: 'members.view' },
  {
    href: '/settings/security-policy',
    label: 'Security policy',
    permission: 'security_policy.manage',
  },
  { href: '/settings/audit', label: 'Audit log', permission: 'audit.view' },
  { href: '/settings/security', label: 'Your security' },
];

/** Sub-navigation for organization settings pages. */
export function SettingsNav() {
  const pathname = usePathname();
  const { can } = useOrganization();
  return (
    <nav aria-label="Settings" className="flex gap-1 border-b px-6">
      {ITEMS.filter((item) => !item.permission || can(item.permission)).map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-2 py-2 text-[13px] transition-colors',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
