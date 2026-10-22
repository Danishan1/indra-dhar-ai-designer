import {
  ActivityIcon,
  CreditCardIcon,
  FolderKanbanIcon,
  HomeIcon,
  LibraryIcon,
  type LucideIcon,
  SettingsIcon,
  ShieldIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Iteration that fills the page (shown on placeholders). */
  arrives?: string;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/projects', label: 'Projects', icon: FolderKanbanIcon, arrives: 'I10' },
  { href: '/library', label: 'Library', icon: LibraryIcon, arrives: 'I13' },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: '/billing', label: 'Billing', icon: CreditCardIcon, arrives: 'I30' },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, arrives: 'I05–I08' },
  { href: '/admin', label: 'Admin', icon: ShieldIcon, arrives: 'I45' },
  { href: '/system', label: 'System status', icon: ActivityIcon },
];

export const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV];

export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
