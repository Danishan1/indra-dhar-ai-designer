import { ConstructionIcon } from 'lucide-react';

import { EmptyState } from '@/components/states/states';

import { PageHeader } from './page-header';

/** Navigation target whose feature arrives in a later iteration. */
export function PlaceholderPage({
  title,
  description,
  arrives,
}: {
  title: string;
  description: string;
  arrives: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="p-6">
        <EmptyState
          icon={<ConstructionIcon />}
          title={`${title} is not available yet`}
          description={`This area is built in iteration ${arrives} (see docs/plan/04-roadmap.md).`}
        />
      </div>
    </>
  );
}
