import { ActivityIcon, FolderKanbanIcon, PencilRulerIcon } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import { APP_TAGLINE } from '@/lib/app-info';

export default function HomePage() {
  return (
    <>
      <PageHeader title="Home" description={APP_TAGLINE} />
      <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            href: '/projects',
            icon: FolderKanbanIcon,
            title: 'Projects',
            text: 'Design projects, lifecycle and access.',
          },
          {
            href: '/editor/demo',
            icon: PencilRulerIcon,
            title: 'Editor layout',
            text: 'Workspace regions preview (dev only, filled from I15).',
          },
          {
            href: '/system',
            icon: ActivityIcon,
            title: 'System status',
            text: 'Live check of the API and its dependencies.',
          },
        ].map((card) => (
          <section key={card.href} className="flex flex-col gap-2 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <card.icon className="size-4 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold">{card.title}</h2>
            </div>
            <p className="flex-1 text-[13px] text-muted-foreground">{card.text}</p>
            <Button asChild variant="outline" size="sm" className="w-fit">
              <Link href={card.href}>Open</Link>
            </Button>
          </section>
        ))}
      </div>
    </>
  );
}
