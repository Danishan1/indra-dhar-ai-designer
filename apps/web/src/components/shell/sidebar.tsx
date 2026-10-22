'use client';

import { PanelLeftCloseIcon, PanelLeftOpenIcon, ShirtIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { APP_NAME } from '@/lib/app-info';
import { formatCombo } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

import { isActive, type NavItem, PRIMARY_NAV, SECONDARY_NAV } from './nav-items';

function NavLink({
  item,
  collapsed,
  pathname,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
}) {
  const active = isActive(pathname, item.href);
  const link = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring',
        active && 'bg-sidebar-accent font-medium text-foreground',
        collapsed && 'justify-center px-0',
      )}
    >
      <item.icon className="size-4 shrink-0" aria-hidden />
      <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  return (
    <aside
      aria-label="Main navigation"
      data-collapsed={collapsed}
      className={cn(
        'flex h-full shrink-0 flex-col border-r bg-sidebar transition-[width] duration-150',
        collapsed ? 'w-12' : 'w-56',
      )}
    >
      <div
        className={cn(
          'flex h-11 items-center gap-2 border-b px-3',
          collapsed && 'justify-center px-0',
        )}
      >
        <ShirtIcon className="size-5 text-primary" aria-hidden />
        <span className={cn('truncate text-[13px] font-semibold', collapsed && 'sr-only')}>
          {APP_NAME}
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} collapsed={collapsed} pathname={pathname} />
        ))}
        <div className="mt-auto flex flex-col gap-0.5 border-t pt-2">
          {SECONDARY_NAV.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} pathname={pathname} />
          ))}
        </div>
      </nav>
      <div className={cn('border-t p-2', collapsed && 'flex justify-center')}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggle}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
            >
              {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? 'Expand' : 'Collapse'} sidebar ({formatCombo('mod+b')})
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
