'use client';

import { useMutation } from '@tanstack/react-query';
import { LogOutIcon, UserCircle2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { authApi } from './api';
import { useSession } from './session-provider';

export function UserMenu() {
  const { user, clear } = useSession();
  const router = useRouter();
  const logout = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      clear();
      router.replace('/sign-in');
    },
    meta: { silent: true },
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" aria-label="Account menu">
          <UserCircle2Icon aria-hidden />
          <span className="hidden max-w-40 truncate text-[13px] sm:inline">
            {user?.displayName}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-[13px] font-medium text-foreground">
            {user?.displayName}
          </span>
          <span className="truncate text-xs font-normal">{user?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout.mutate()} disabled={logout.isPending}>
          <LogOutIcon aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
